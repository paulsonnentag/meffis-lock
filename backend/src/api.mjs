import config from '../config.mjs'
import express from 'express'
import path from 'path'
import fs from 'fs'
import { isPasswordCorrect } from './password.mjs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { timeout } from 'promise-timeout'
import { createLock } from './lock.mjs'
import { createBot } from './bot.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

let owner = null

const USERS_FILE_PATH = path.join(__dirname, '../users.json')
const LOG_FILE_PATH = path.join(__dirname, '../log.txt')

const triesInfoByName = {}

function userByName (name) {
  const users = JSON.parse(fs.readFileSync(USERS_FILE_PATH, 'utf8'))
  const user = users.find(user => user.name.toLowerCase() == name)

  if (!user) {
    return undefined
  }

  user.name = user.name.toLowerCase()
  triesInfoByName[name] = triesInfoByName[name] || [0, new Date()]

  return user
}

const TRIES_WITHOUT_DELAY = 3
const INITIAL_RETRY_DELAY_SEC = 60

// longest observed runtime is a bit over 10 sec (two turns and a long open)
const LOCK_ACTION_TIMEOUT_MS = 14000

export function getApi (io) {

  const lock = createLock()
  const bot = createBot()
  const api = express.Router()

  let state = {
    lock_status: 'DISCONNECTED',
    battery_low: false,
    needs_open: false,
  }

  function handleStateChange(newState) {
    if (newState.lock_status ===  'MOVING') {
      return
    }

    state = newState

    addLogEntry(`${newState.lock_status}, current owner: ${owner}` +
      (newState.battery_low ? ', battery low' : '') +
      (newState.needs_open ? ', needs open' : ''))

    switch (newState.lock_status) {
      case 'UNLOCKED':
        bot.postOpen(owner)
        break;

      case 'LOCKED':
        bot.postClose(owner)
        break
    }

    io.emit('changeState', { state: newState, owner })
  }

  lock.on('status_change', (newState) => {
    handleStateChange(newState)
  })

  lock.on('disconnected', () => {
    handleStateChange({
      lock_status: 'DISCONNECTED',
      battery_low: false,
      needs_open: false,
    })
  })

  api.post('/login', (req, res) => {
    const { username, password } = req.body

    if (!username || !password) {
      res.status(403)
      res.send('Das Passwort oder der Name ist falsch.')
      return
    }
    const user = userByName(username.toLowerCase())

    if (!user) {
      res.status(403)
      res.send('Das Passwort oder der Name ist falsch.')
      return
    }


    function calcRemainingDelaySec() {
      var [tries, lastDate] = triesInfoByName[user.name]
      if (tries < TRIES_WITHOUT_DELAY) {
        return 0
      }

      // double delay with each failed retry
      var delayExp = tries - TRIES_WITHOUT_DELAY
      var delayMs = Math.pow(2, delayExp) * INITIAL_RETRY_DELAY_SEC * 1000
      return Math.ceil((delayMs - (new Date() - lastDate)) / 1000)

    }

    // per user login rate limiting
    var remainingDelaySec = calcRemainingDelaySec()
    if (remainingDelaySec > 0) {
      res.status(403)
      res.send(`Eingabe ignoriert. Nächster Loginversuch möglich
        in ${remainingDelaySec} Sekunden.`)
      return
    }

    if (!isPasswordCorrect(user.hash, user.salt, password)) {
      var [tries, _] = triesInfoByName[user.name]
      triesInfoByName[user.name] = [tries + 1, new Date()]
      res.status(403)

      var remainingDelaySec = calcRemainingDelaySec()
      if (remainingDelaySec == 0) {
        res.send('Das Passwort oder der Name ist falsch.')
      } else {
        res.send(`Das Passwort ist falsch. Nächster
        Loginversuch möglich in ${remainingDelaySec} Sekunden.`)
        var msg = `login rate limiting for user ${user.name}`
        addLogEntry(msg)
      }
      return
    }

    // reset tries
    triesInfoByName[user.name] = [0, new Date()]

    req.session.user = user.name
    res.json({
      user: user.name,
      lockState: { state, owner }
    })
  })

  api.use((req, res, next) => {
    if (!req.session.user) {
      res.status(401)
      res.end()
    } else {
      next()
    }
  })

  api.post('/logout', (req, res) => {
    req.session.destroy()
    res.json({})
  })

  api.get('/status', (req, res) => {
    res.json({
      lockState: {
        state,
        owner
      },
      user: req.session.user
    })
  })

  api.post('/open', (req, res) => {
    var action, actionName
    if (config.pullLatch || state.needs_open) {
      action = lock.open
      // just pulling the latch should not change owner
      if (state.lock_status === 'UNLOCKED') {
        actionName = 'latch pull'
      } else {
        actionName = 'open'
        owner = req.session.user
      }
    } else {
      action = lock.unlock
      actionName = 'unlock'
      owner = req.session.user
    }
    addLogEntry(`${actionName} request by ${req.session.user}`)

    timeout(action.call(lock), LOCK_ACTION_TIMEOUT_MS)
      .then(() => {
        res.json({
            state,
            owner
          })
      })
      .catch(() => {
        addLogEntry(`${actionName} request by ${req.session.user} failed`)
        res.status(500)
        res.end()
      })
  })

  api.post('/close', (req, res) => {
    addLogEntry(`close request by ${req.session.user}`)
    owner = req.session.user

    timeout(lock.lock(), LOCK_ACTION_TIMEOUT_MS)
      .then(() => {
        res.json({
          state,
          owner
        })
      })
      .catch(() => {
        addLogEntry(`close request by ${req.session.user} failed`)
        res.status(500)
        res.end()
      })
  })

  api.post('/take', (req, res) => {
    addLogEntry(`takeover by ${req.session.user}`)
    owner = req.session.user

    res.json({
        state,
        owner
      })
  })

  api.post('/restart', (req, res) => {
    addLogEntry(`restart by ${req.session.user}`)

    process.exitCode = 1;
    process.exit();
  })

  return api
}

function addLogEntry (message) {
  console.log(message)

  const date = new Date()
  fs.appendFileSync(LOG_FILE_PATH, `${date.toLocaleDateString()} ${date.toLocaleTimeString()}: ${message}\n`, { flag: 'as' })
}
