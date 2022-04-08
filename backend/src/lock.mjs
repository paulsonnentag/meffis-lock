import config from '../config.mjs'
import keyble from 'keyble'
import EventEmitter from 'events'

export function createLock () {
  return (
    config.useFakeBluetooth
      ? new MockKeyble()
      : new BluetoothKeyble()
  )
}

class BluetoothKeyble extends EventEmitter {

  state = 'UNKNOWN'

  key_ble = new keyble.Key_Ble({
    address: '00:1a:22:17:66:68',
    user_id: 1,
    user_key: 'xxxxx',
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

class MockKeyble extends EventEmitter {

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

function timeout (value, duration = 1000) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(value)
    }, duration)
  })
}
