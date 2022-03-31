import express from 'express'

const api = express.Router()

let isOpen = false
let owner = null;

const USERS = {
  'paul': { name: 'Paul', password: 'anotherday', retries: 0 },
  'erwin': { name: 'Erwin', password: 'foobar', retries: 0 }
}

const MAX_RETRIES = 3

api.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    res.status(403)
    res.send('Das Passwort oder der Name ist falsch.')
    return
  }

  const user = USERS[username.toLowerCase()]

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

  if (user.password !== password) {
    user.retries += 1
    res.status(403)
    res.send('Das Passwort oder der Name ist falsch.')
    return
  }

  // reset retries
  user.retries = 0;

  req.session.user = user.name
  res.json({
    user: user.name,
    lockState: { isOpen, owner}
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
  req.session.destroy();
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
  setTimeout(() => {
    isOpen = true
    owner = req.session.user;

    res.json({ isOpen, owner })
  }, 1000)
})

api.post('/close', (req, res) => {
  setTimeout(() => {
    isOpen = false

    res.json({ isOpen, owner })
  }, 1000)
})

export default api