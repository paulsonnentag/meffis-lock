import config from '../config.mjs'
import keyble from 'keyble'
import EventEmitter from 'events'

export function createLock () {
  console.log(`Using lock implementation: ${config.bluetoothImplementation}`)

  switch (config.bluetoothImplementation) {
    case 'MOCK':
      return new MockLock()
    case 'MOCK_FAULTY':
      return new MockFaultyLock()
    case 'KEYBLE':
      return new KeybleLock()
    default:
      throw new Error(`Not implemented ${config.bluetoothImplementation}`)
  }
}

class KeybleLock extends EventEmitter {

  state = 'UNKNOWN'

  key_ble = new keyble.Key_Ble({
    address: config.keyble.address  ,
    user_id: 1,
    user_key: config.keyble.key,
    auto_disconnect_time: 0,
    status_update_time: 60
  })

  constructor () {
    super()

    this.requestStatus()

    this.key_ble.on('status_change', (statusId, statusName) => {
      if (statusName === 'MOVING' || statusName === 'OPENED') {
        return
      }

      this.emit('changeState', statusName)
      this.state = statusName
    })
  }

  requestStatus () {
    return (
      keyble.utils.time_limit(this.key_ble.request_status())
        .then((status) => {
          const statusName = status[1]
          this.state = statusName
          return statusName
        }) // pick status string
    )
  }

  lock () {
    return keyble.utils.time_limit(this.key_ble.lock(), 10000)
  }

  unlock () {
    return keyble.utils.time_limit(this.key_ble.unlock(), 10000)
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

  unlock () {
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

  unlock () {
    return timeout()
      .then(() => Promise.reject())
  }
}


function timeout (value, duration = 1000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(value)
    }, duration)
  })
}
