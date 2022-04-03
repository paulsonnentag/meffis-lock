import express from 'express'
import session from 'express-session'
import bodyParser from 'body-parser'
import api from './api.mjs'

import config from '../config.mjs'

const app = express()
const port = 3000

app.use(bodyParser.json())

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 317098000000 // 1 year
  }
}))

app.use('/api', api)

app.use(express.static('public'))

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
