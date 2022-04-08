import express from 'express'
import path from 'path'
import fs from 'fs'
import { isPasswordCorrect } from './password.mjs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { createLock } from './lock.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const api = express.Router()

let owner = null

const USERS_FILE_PATH = path.join(__dirname, '../users.json')
const LOG_FILE_PATH = path.join(__dirname, '../log.txt')

const lock = createLock()

const users = (
  fs.existsSync(USERS_FILE_PATH)
    ? JSON.parse(fs.readFileSync(USERS_FILE_PATH, 'utf8'))
    : []
)

const usersByName = users
  .reduce((users, user) => {
    users[user.name.toLowerCase()] = { ...user, retries: 0 }
    return users
  }, {})

const MAX_RETRIES = 3

'#b62c26'

api.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(403)
    res.send('Das Passwort oder der Name ist falsch.')
    return
  }

  const user = usersByName[username.toLowerCase()]

  if (!user) {
    res.status(403)
    res.send('Das Passwort oder der Name ist falsch.')
    return
  }

  if (user.retries > MAX_RETRIES) {
    res.status(403)
    res.send('Der User wurde wegen zu vielen Anmeldeversuchen gesperrt.')
    return
  }

  if (!isPasswordCorrect(user.hash, user.salt, password)) {
    user.retries += 1
    res.status(403)
    res.send('Das Passwort oder der Name ist falsch.')
    return
  }

  // reset retries
  user.retries = 0

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
  lock.unlock()
    .then(() => {
      owner = req.session.user

      addLogEntry(`opened by ${owner}`)

      res.json({
        state: lock.state,
        owner
      })
    })
})

api.post('/close', (req, res) => {
  lock.lock()
    .then(() => {
      owner = null

      addLogEntry(`closed by ${owner}`)

      res.json({ state: lock.state, owner })
    })
})

function addLogEntry (message) {
  const date = new Date()

  fs.appendFileSync(LOG_FILE_PATH, `${date.toLocaleDateString()} ${date.toLocaleTimeString()}: ${message}\n`, { flag: 'as' })
}

export default api
