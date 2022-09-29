import express from 'express'
import path from 'path'
import fs from 'fs'
import { isPasswordCorrect } from './password.mjs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
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

export function getApi (io) {

  const lock = createLock()
  const bot = createBot()
  const api = express.Router()

  lock.on('changeState', (newState) => {
    addLogEntry(`${newState} by ${owner}`)

    switch (newState) {
      case 'UNLOCKED':
        bot.postOpen(owner)
        break;

      case 'LOCKED':
        bot.postClose(owner)
        break
    }

    io.emit('changeState', { state: newState, owner })
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
        var msg = `User '${user.name}' has hit login rate limiting`
        addLogEntry(msg)
        console.log(msg)
      }
      return
    }

    // reset tries
    triesInfoByName[user.name] = [0, new Date()]

    req.session.user = user.name
    res.json({
      user: user.name,
      lockState: { state: lock.state, owner }
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
        state: lock.state,
        owner
      },
      user: req.session.user
    })
  })

  api.post('/open', (req, res) => {
    owner = req.session.user

    lock.unlock()
      .then(() => {
        res.json({
            state: lock.state,
            owner
          })
      })
      .catch(() => {
        res.status(500)
        res.end()
      })
  })

  api.post('/close', (req, res) => {
    owner = req.session.user

    lock.lock()
      .then(() => {
        res.json({
          state: lock.state,
          owner
        })
      })
      .catch(() => {
        res.status(500)
        res.end()
      })
  })

  api.post('/take', (req, res) => {
    owner = req.session.user
    var msg = `'${owner}' took over the lock`
    addLogEntry(msg)
    console.log(msg)

    res.json({
        state: lock.state,
        owner
      })
  })

  api.post('/restart', (req, res) => {
    process.exitCode = 1;
    process.exit();
  })

  return api
}

function addLogEntry (message) {
  const date = new Date()

  fs.appendFileSync(LOG_FILE_PATH, `${date.toLocaleDateString()} ${date.toLocaleTimeString()}: ${message}\n`, { flag: 'as' })
}
