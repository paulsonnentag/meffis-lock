import { render, h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { classNames } from './helpers.js'

const LOADING_STATE = 'LOADING'
const LOGGED_IN_STATE = 'LOGGED_IN'
const LOGGED_OUT_STATE = 'LOGGED_OUT'

function App () {
  const [appState, setAppState] = useState({ type: LOADING_STATE, data: {} })
  const [isUpdatePending, setIsUpdatePending] = useState(false)

  useEffect(() => {
    getLockStatus()
      .then((data) => {

        setAppState({ type: LOGGED_IN_STATE, data })
      })
      .catch(() => {

        setAppState({ type: LOGGED_OUT_STATE, data: {} })
      })
  }, [])

  function onOpenLock () {
    setIsUpdatePending(true)

    openLock()
      .then((newLockStatus) => {
        setAppState({ data: newLockStatus })
        setIsUpdatePending(false)
      })
  }

  function onCloseLock () {
    setIsUpdatePending(true)

    closeLock()
      .then((newLockStatus) => {
        setAppState({ data: newLockStatus })
        setIsUpdatePending(false)
      })
  }

  function onSubmitLogin (evt) {
    evt.preventDefault()

    const formData = new FormData(evt.target)

    loginUser(
      formData.get('username'),
      formData.get('password')
    )
      .then((data) => {
        setAppState({ type: LOGGED_IN_STATE, data })
      })
      .catch((err) => {
        setAppState({ type: LOGGED_OUT_STATE, data: { error: err } })
      })
  }

  function onLogout () {
    logoutUser()
      .then((data) => {
        setAppState({ type: LOGGED_OUT_STATE, data: {}})
      })
  }

  if (appState.type === LOADING_STATE) {
    return
  }

  if (appState.type === LOGGED_OUT_STATE) {
    const { error } = appState.data

    return (
      h('div', { class: 'App' }, [
        h('div', { class: 'Header' }, [
          h('img', { alt: 'meffis logo', src: 'assets/logo.png', height: 30 }),
        ]),
        h('div', { class: 'App_Content' }, [
          h('div', { class: 'Content' }, [

            error && h('div', { class: 'Form_Error' }, error),

            h('form', { class: 'Form', onSubmit: onSubmitLogin }, [
              h('label', { class: 'Field' }, [
                h('div', { class: 'Field_Label' }, 'Name'),
                h('input', { type: 'text', name: 'username', required: true })
              ]),

              h('label', { class: 'Field' }, [
                h('div', { class: 'Field_Label' }, 'Passwort'),
                h('input', { type: 'password', name: 'password', required: true })
              ]),

              h('br'),

              h('button', { class: 'Button' }, 'Anmelden')
            ])
          ])
        ])
      ])
    )
  }

  const { isOpen, owner } = appState.data

  return (
    h('div', { class: 'App' }, [
      h('div', { class: 'Header' }, [
        h('img', { alt: 'meffis logo', src: 'assets/logo.png', height: 30 }),

        h('button', { onClick: onLogout}, 'Abmelden')

      ]),
      h('div', { class: 'App_Content' }, [
        h('div', { class: 'Content' }, [

          h('div', {}, [
            isOpen
              ? `Tür wurde aufgeschlossen von ${owner}`
              : 'Tür ist abgeschlossen'
          ]),

          h('button', {
            class: classNames('Lock', { isOpen }),
            disabled: isUpdatePending,
            onClick: isOpen ? onCloseLock : onOpenLock
          }, [
            isUpdatePending && h(Spinner),
          ]),

          isOpen && (h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onCloseLock
            }, 'Schließen')
          ),

          !isOpen && h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onOpenLock
            }, 'Öffnen')
        ])
      ])
    ])
  )
}

function Spinner () {
  return (
    h('div', { class: 'Spinner' }, [
      h('div', { class: 'Spinner_Circle1' }),
      h('div', { class: 'Spinner_Circle2' })
    ])
  )
}

const API = 'http://localhost:3000/api'

function loginUser (username, password) {
  return (
    fetchJSON(`${API}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    })
  )
}

function logoutUser () {
  return (
    fetchJSON(`${API}/logout`, {
      method: 'POST'
    })
  )
}

function getLockStatus () {
  return fetchJSON(`${API}/status`)
}

function openLock () {
  return fetchJSON(`${API}/open`, { method: 'POST' })
}

function closeLock () {
  return fetchJSON(`${API}/close`, { method: 'POST' })
}

function fetchJSON (url, params) {
  return (
    fetch(url, params)
      .then((r) => {
        if (r.status === 200) {
          return r.json()
        }

        return (
          r.text()
            .catch(() => 'Netzwerkfehler')
            .then((message) => {
              return Promise.reject(message)
            })
        )
      })
  )
}

const root = document.getElementById('root')

render(h(App, {}), root)


