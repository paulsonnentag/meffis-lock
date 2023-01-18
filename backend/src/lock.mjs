import config from '../config.mjs'
import keyble from 'keyble'
import EventEmitter from 'events'
import { SerialLock, WebsocketLock } from './keyble-bridge.mjs';

export function createLock () {
  console.log(`Using lock implementation: ${config.bluetoothImplementation}`)

  config.keyble.user_id = 1

  switch (config.bluetoothImplementation) {
    case 'MOCK':
      return new MockLock()
    case 'MOCK_FAULTY':
      return new MockFaultyLock()
    case 'MOCK_DISCONNECTED':
      return new MockDisconnectedLock()
    case 'HCI':
      if (config.pullLatch === false) {
        throw new Error(`HCI does not support detecting 'need_open' condition`)
      }
      return new KeybleLock({
        ...config.keyble,
        auto_disconnect_time: 0,
        status_update_time: 60,
      })
    case 'SERIAL':
      return new SerialLock({...config.keyble, ...config.serial})
    case 'WEBSOCKET':
      return new WebsocketLock({...config.keyble, ...config.websocket})
    default:
      throw new Error(`Not implemented ${config.bluetoothImplementation}`)
  }
}

class KeybleLock extends EventEmitter {

  constructor (config) {
    super()

    this.key_ble = new keyble.Key_Ble(config)

    this.key_ble.on('status_change', (status) => {
      status.needs_open = false
      this.emit('status_change', status)
    })

    this.key_ble.on('disconnected', () => {
      this.emit('disconnected')
    })

    this.key_ble.request_status()
      .then((status) => {
        this.state = status[0]
      }) // pick status string
  }

  lock () {
    return this.key_ble.lock()
  }

  open () {
    return this.key_ble.open()
  }

  unlock () {
    return this.key_ble.unlock()
  }
}

class MockLock extends EventEmitter {

  _state = {
    lock_status: 'UNKNOWN',
    battery_low: false,
    needs_open: true,
  }
  _lockcount = 0

  constructor() {
    super()
    timeout().then(() => this.emitStateClone())
  }

  lock () {
    return timeout()
      .then(() => {
        this._state.lock_status = 'LOCKED'
        this._lockcount++
        if (this._lockcount > 1) {
          this._state.battery_low = true
        }
        this.emitStateClone()
        return this._state
      })
  }

  open () {
    return timeout()
      .then(() => {
        this._state.lock_status = 'OPENED'
        this._state.needs_open = false
        this.emitStateClone()
        timeout().then(() => this.unlock())
        return this._state
    })
  }

  unlock () {
    return timeout()
    .then(() => {
      this._state.lock_status = 'UNLOCKED'
      this.emitStateClone()
      return this._state
    })
  }

  emitStateClone(state) {
    this.emit('status_change', structuredClone(this._state))
  }
}

class MockFaultyLock extends EventEmitter {

  constructor() {
    super()
    timeout().then(() => this.emit('status_change', {
      lock_status: 'UNKNOWN',
      battery_low: false,
      needs_open: false,
    }))
  }

  lock () {
    return timeout()
      .then(() => Promise.reject())
  }

  open () {
    return timeout()
      .then(() => Promise.reject())
  }

  unlock () {
    return timeout()
      .then(() => Promise.reject())
  }
}

class MockDisconnectedLock extends EventEmitter {

  lock () {
  }

  open () {
  }

  unlock () {
  }
}


function timeout (value, duration = 1000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(value)
    }, duration)
  })
}
