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

  state = 'DISCONNECTED'

  constructor (config) {
    super()

    this.key_ble = new keyble.Key_Ble(config)

    this.requestStatus()

    this.key_ble.on('status_change', (status) => {
      const statusName = status.lock_status
      this.emit('changeState', statusName)
      this.state = statusName
    })

    this.key_ble.on('disconnected', () => {
      this.emit('changeState', 'DISCONNECTED')
      this.state = 'DISCONNECTED'
    })
  }

  requestStatus () {
    return (
      this.key_ble.request_status()
        .then((status) => {
          const statusName = status[0].lock_status
          this.state = statusName
          return statusName
        }) // pick status string
    )
  }

  lock () {
    return this.key_ble.lock()
  }

  open () {
    return this.key_ble.open()
  }
}

class MockLock extends EventEmitter {

  state = 'UNKNOWN'

  requestStatus () {
    return timeout(this.state)
  }

  lock () {
    return timeout()
      .then(() => {
        this.state = 'LOCKED'
        this.emit('changeState', this.state)
      })
  }

  open () {
    return timeout()
      .then(() => {
        this.state = 'UNLOCKED'
        this.emit('changeState', this.state)
      })
  }
}

class MockFaultyLock extends EventEmitter {

  state = 'UNKNOWN'

  requestStatus () {
    return timeout()
      .then(() => Promise.reject())
  }

  lock () {
    return timeout()
      .then(() => Promise.reject())
  }

  open () {
    return timeout()
      .then(() => Promise.reject())
  }
}

class MockDisconnectedLock extends EventEmitter {

  state = 'DISCONNECTED'

  constructor () {
    super()
  }

  requestStatus () {
    return timeout(this.state)
  }

  lock () {
  }

  open () {
  }
}


function timeout (value, duration = 1000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(value)
    }, duration)
  })
}
