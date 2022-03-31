import express from 'express'

const api = express.Router()

let isOpen = false
let owner = 'paul'

api.get('/status', (req, res) => {
  res.json({ isOpen, owner })
})

api.post('/open', (req, res) => {
  setTimeout(() => {
    isOpen = true

    res.json({isOpen, owner})
  }, 1000)
})

api.post('/close', (req, res) => {
  setTimeout(() => {
    isOpen = false

    res.json({isOpen, owner})
  }, 1000)
})

export default api