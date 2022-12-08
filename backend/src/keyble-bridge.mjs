import { EventEmitter } from 'events'
import { SerialPort, ReadlineParser } from 'serialport'
import { createServer } from 'https'
import { WebSocketServer } from 'ws'
import { readFileSync } from 'fs'

class LockBridge extends EventEmitter {
  state = 'DISCONNECTED'

  constructor ({ address, user_id, user_key }) {
    super()
    this.address = address
    this.key = user_key
    this.id = user_id
  }

  receive (line) {
    if (line === 'ignoreme') {
      return
    }

    if (line === 'needinit') {
      const epoch = Math.floor(new Date().getTime() / 1000)
      this.send(`init ${epoch} ${this.address} ${this.key} ${this.id}`)
      return
    }

    let translatedState
    if (line === 'locked') {
      translatedState = 'LOCKED'
    } else if (line === 'unlocked') {
      translatedState = 'UNLOCKED'
    } else if (line === 'unknownpos') {
      translatedState = 'UNKNOWN'
    } else if (line === 'disconnected') {
      translatedState = 'DISCONNECTED'
    } else if (line === 'opened') {
      translatedState = 'OPENED'
    } else if (line === 'moving') {
      translatedState = 'MOVING'
    } else if (line === 'ignoreme') {
      // silently ignore
      return
    } else if (line.startsWith('error ')) {
      console.log(`Received error from bridge: ${line.substr(6)}`)
      return
    } else {
      console.log(`Error: LockBridge received unknown command '${line}'`)
      return
    }
    this.state = translatedState
    this.emitState()
  }

  emitState () {
    this.emit('changeState', this.state)
    this.emit(`status:${this.state}`, this.state)
  }

  restartBridge () {
    this.send('ignoreme')
    this.send('restart')
  }

  sendCommandWaitEvent (command, event) {
    return new Promise((resolve, reject) => {
      this.send(command)
      this.once(event, () => {
        resolve()
      })
    })
  }

  lock () {
    return this.sendCommandWaitEvent('lock', 'status:LOCKED')
  }

  unlock () {
    return this.sendCommandWaitEvent('unlock', 'status:UNLOCKED')
  }

  open () {
    return this.sendCommandWaitEvent('open', 'status:OPENED')
  }
}

export class SerialLock extends LockBridge {
  prefix = 'MESSAGE '

  constructor ({ address, user_id, user_key, path, baudRate, hasPrefix }) {
    super({ address, user_id, user_key })

    this.port = new SerialPort({
      path,
      baudRate
    })

    this.port.on('error', (err) => {
      console.log('Error: SerialPort:', err.message)
    })

    const parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))
    parser.on('data', (line) => {
      if (hasPrefix && !line.startsWith(this.prefix)) {
        return
      }
      line = line.slice(this.prefix.length)
      this.receive(line)
    })

    // bring the keyble-serial bridge into known state that triggers initialization
    this.restartBridge()
  }

  send (message) {
    this.port.write(`${message}\r\n`, (err) => {
      if (err) {
        return console.log(`Error: Failed to send message '${message}':`, err.message)
      }
    })
  }
}

export class WebsocketLock extends LockBridge {
  lockConnection = null
  bridgeAuthenticated = false

  constructor ({ address, user_id, user_key, port, secret }) {
    super({ address, user_id, user_key })

    // self-signed key that is trusted by its fingerprint by bridge
    const server = createServer({
      cert: readFileSync('websocket.crt'),
      key: readFileSync('websocket.key')
    })

    const wss = new WebSocketServer({ server })

    wss.on('connection', (ws, req) => {
      if (this.lockConnection != null) {
        console.log(`Already connected, ignoring connection request from ${req.socket.remoteAddress}`)
        ws.close()
        return
      }

      console.log(`Connected to bridge ${req.socket.remoteAddress}`)

      this.lockConnection = ws

      ws.missedHeartbeats = 0
      ws.on('pong', () => {
        ws.missedHeartbeats = 0
      })

      ws.on('error', (error) => {
        console.log(`Error on connection to bridge ${ws._socket.remoteAddress} with code ${error.code}`)
      })

      ws.on('close', (code) => {
        console.log(`Closed connection to bridge ${ws._socket.remoteAddress} with code ${code}`)
        this.lockConnection = null
        this.bridgeAuthenticated = false
        this.state = 'DISCONNECTED'
        this.emitState()
      })

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          console.log(`Ignoring binary websocket message from ${ws._socket.remoteAddress}`)
          return
        }

        const text = data.toString()
        // handle websocket-specific message
        if (text.startsWith('secret ') && text.substr(7) === secret) {
          console.log('Websocket bridge successfully authenticated')
          this.bridgeAuthenticated = true
          return
        }

        // ensure malicious actors cannot get lock credentials with 'needinit' command
        if (!this.bridgeAuthenticated) {
          console.log(`Ignoring unauthenticated websocket message '${text}'`)
          return
        }

        // handle all other messages
        this.receive(text)
      })

      // bring the keyble-serial bridge into known state that triggers initialization
      this.restartBridge()
    })

    const interval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.missedHeartbeats > 1) {
          console.log(`Heartbeat timeout, terminating connection to bridge ${ws._socket.remoteAddress}`)
          // no need to null lockConnection, as terminate causes close event
          return ws.terminate()
        }

        ws.missedHeartbeats++
        ws.ping()
      })
    }, 10000)

    wss.on('close', () => {
      clearInterval(interval)
    })

    server.listen(port)

    console.log(`Websocket listening on port ${port}`)
  }

  send (message) {
    if (this.lockConnection != null) {
      this.lockConnection.send(message)
    } else {
      console.log(`Error: Failed to send websocket message '${message}'`)
    }
  }
}
