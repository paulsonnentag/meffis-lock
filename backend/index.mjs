import express from 'express'
import api from './api.mjs'

const app = express()
const port = 3000

app.use('/api', api)
app.use(express.static('public'))

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
