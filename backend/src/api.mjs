import express from 'express'
import path from 'path'
import fs from 'fs'
import { isPasswordCorrect } from './password.mjs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const api = express.Router()

let isOpen = false
let owner = null

const USERS_FILE_PATH = path.join(__dirname, '../users.json')
const LOG_FILE_PATH = path.join(__dirname, '../log.txt')

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
    lockState: { isOpen, owner }
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
      isOpen,
      owner
    },
    user: req.session.user
  })
})

api.post('/open', (req, res) => {

  // TODO: Replace timeout with actual unlock command

  setTimeout(() => {
    isOpen = true
    owner = req.session.user

    addLogEntry(`opened by ${owner}`)

    res.json({ isOpen, owner })
  }, 1000)
})

api.post('/close', (req, res) => {

  // TODO: Replace timeout with actual lock command

  setTimeout(() => {
    isOpen = false
    owner = null

    addLogEntry(`closed by ${owner}`)

    res.json({ isOpen, owner })
  }, 1000)
})

function addLogEntry (message) {
  const date = new Date()

  fs.appendFileSync(LOG_FILE_PATH, `${date.toLocaleDateString()} ${date.toLocaleTimeString()}: ${message}\n`, {flag: 'as'})
}

export default api