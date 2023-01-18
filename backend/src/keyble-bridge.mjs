/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { EventEmitter } from 'events'
import { SerialPort, ReadlineParser } from 'serialport'
import { createServer } from 'https'
import { WebSocketServer } from 'ws'
import { readFileSync } from 'fs'

const statusCmd = 'status'
const secretCmd = 'secret'

class LockBridge extends EventEmitter {
  constructor ({ address, user_id, user_key }) {
    super()
    this.address = address
    this.key = user_key
    this.id = user_id
  }

  receive (line) {
    if (line === 'ignoreme') {
      // silently ignore
      return
    }

    if (line.startsWith('error ')) {
      console.log(`Received error from bridge: ${line.substr(6)}`)
      return
    }

    if (!line.startsWith(statusCmd)) {
      console.log(`Error: LockBridge received unknown command '${line}'`)
      return
    }

    const [status, ...flags] = line.slice(statusCmd.length + 1).split(' ')

    if (status === 'needinit') {
      const epoch = Math.floor(new Date().getTime() / 1000)
      this.send(`init ${epoch} ${this.address} ${this.key} ${this.id}`)
      return
    }

    let lock_status
    if (status === 'locked' ||
      status === 'unlocked' ||
      status === 'unknown' ||
      status === 'disconnected' ||
      status === 'opened' ||
      status === 'moving') {
      lock_status = status.toUpperCase()
    } else {
      console.log(`Error: LockBridge received unknown lock status '${status}'`)
      return
    }

    if (status === 'disconnected') {
      this.emit('disconnected')
      return
    }

    const [batterylow, needsopen] = flags
    let battery_low, needs_open

    if (batterylow === 'ok') {
      battery_low = false
    } else if (batterylow === 'batterylow') {
      battery_low = true
    } else {
      console.log(`Error: LockBridge received unknown batterylow status '${batterylow}'`)
      return
    }

    if (needsopen === 'ok') {
      needs_open = false
    } else if (needsopen === 'needsopen') {
      needs_open = true
    } else {
      console.log(`Error: LockBridge received unknown needsopen status '${needsopen}'`)
      return
    }

    this.emitState({ lock_status, battery_low, needs_open })
  }

  emitState (state) {
    this.emit('status_change', state)
    this.emit(`status:${state.lock_status}`, state)
  }

  restartBridge () {
    this.send('ignoreme')
    this.send('restart')
  }

  sendCommandWaitEvent (command, event) {
    return new Promise((resolve, reject) => {
      this.send(command)
      this.once(event, (state) => {
        resolve(state)
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

  constructor ({ address, user_id, user_key, port, secret }) {
    super({ address, user_id, user_key })

    // self-signed key that is trusted by its fingerprint by bridge
    const server = createServer({
      cert: readFileSync('websocket.crt'),
      key: readFileSync('websocket.key')
    })

    const wss = new WebSocketServer({ server })

    wss.on('connection', (ws, req) => {
      ws.authenticationTimeout = setTimeout(() => {
        ws.terminate()
      }, 3000)

      ws.missedHeartbeats = 0
      ws.on('pong', () => {
        ws.missedHeartbeats = 0
      })

      ws.on('error', (error) => {
        console.log(`Error on connection to bridge ${ws._socket.remoteAddress} with code ${error.code}`)
      })

      ws.on('close', (code) => {
        clearTimeout(ws.authenticationTimeout)

        if (ws === this.lockConnection) {
          console.log(`Closed connection to bridge ${ws._socket.remoteAddress} with code ${code}`)
          this.lockConnection = null
          this.emit('disconnected')
        }
      })

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          console.log(`Ignoring binary websocket message from ${ws._socket.remoteAddress}`)
          return
        }

        const text = data.toString()
        // handle websocket-specific message
        if (text.startsWith(secretCmd)) {
          clearTimeout(ws.authenticationTimeout)
          if (text.slice(secretCmd.length + 1) === secret) {
            if (this.lockConnection !== null) {
              console.log(`Already connected, ignoring connection request from ${req.socket.remoteAddress}`)
              ws.close()
              return
            }
            console.log(`Websocket bridge ${req.socket.remoteAddress} successfully authenticated`)
            this.lockConnection = ws

            // bring the keyble-serial bridge into known state that triggers initialization
            this.restartBridge()
          } else {
            console.log('Websocket bridge authentication failed, secrets do not match')
            ws.terminate()
          }
          return
        }

        // ensure malicious actors cannot get lock credentials with 'status needinit' command
        if (ws !== this.lockConnection) {
          console.log(`Ignoring unauthenticated websocket message '${text}' from ${ws._socket.remoteAddress}`)
          return
        }

        // handle all other messages
        this.receive(text)
      })
    })

    const interval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.missedHeartbeats > 2) {
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
    if (this.lockConnection !== null) {
      this.lockConnection.send(message)
    } else {
      console.log(`Error: Failed to send websocket message '${message}'`)
    }
  }
}
