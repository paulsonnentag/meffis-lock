import express from 'express'
import session from 'express-session'
import bodyParser from 'body-parser'
import {getApi} from './api.mjs'
import http from 'http';
import config from '../config.mjs'
import { Server } from 'socket.io'

const app = express()
const server = http.createServer(app);
const port = config.httpPort
const io = new Server(server);

app.use(bodyParser.json())

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 317098000000 // 1 year
  }
}))

app.use('/api', getApi(io))

app.use(express.static('public'))

server.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});

