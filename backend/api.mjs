import express from 'express'

const api = express.Router()

let isOpen = false

api.get('/status', () => {
  res.json({ isOpen })
})

api.post('/open', (req, res) => {
  isOpen = false
  res.status(200)
})

api.post('/close', (req, res) => {
  isOpen = false
  res.status(200)
})

export default api