import { render, h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { LoginScreen } from './login-screen.js'
import { LockStatusScreen} from './lock-status-screen.js'
import * as api from './api.js'
import { signal } from "@preact/signals"

const LOADING_STATE = 'LOADING'
const LOGGED_IN_STATE = 'LOGGED_IN'
const LOGGED_OUT_STATE = 'LOGGED_OUT'

function Loading () {
  return { type: LOADING_STATE }
}

function LoggedIn (user, initialLockState) {
  return { type: LOGGED_IN_STATE, user, initialLockState }
}

function LoggedOut () {
  return { type: LOGGED_OUT_STATE }
}

function App () {
  const [state, setState] = useState(Loading())

  useEffect(() => {
    api.getStatus()
      .then(({ user, lockState }) => setState(LoggedIn(user, lockState)))
      .catch(() => setState(LoggedOut()))
  }, [])

  let location = signal("")
  api.getLocation()
    .then((api_location) => location.value = api_location)

  function onLogout () {
    setState(LoggedOut())
  }

  function onLogin ({ user, lockState }) {
    setState(LoggedIn(user, lockState))
  }

  switch (state.type) {
    case LOADING_STATE:
      return

    case LOGGED_OUT_STATE:
      return h(LoginScreen, { onLogin, location })

    case LOGGED_IN_STATE:
      const { user, initialLockState } = state

      return h(LockStatusScreen, { user, initialLockState, onLogout, location })
  }
}

const root = document.getElementById('root')

render(h(App, {}), root)
