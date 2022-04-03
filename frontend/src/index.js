import { render, h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { classNames } from './helpers.js'
import * as api from './api.js'

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
      return h(LoginScreen, { onLogin })

    case LOGGED_IN_STATE:
      const { user, initialLockState } = state
      return h(LockStatusScreen, { user, initialLockState, onLogout })
  }
}

function LoginScreen ({
  onLogin
}) {

  const [error, setError] = useState(null)

  function onSubmitLogin (evt) {
    evt.preventDefault()

    const formData = new FormData(evt.target)

    api.loginUser(
      formData.get('username'),
      formData.get('password')
    )
      .then(({ user, lockState }) => onLogin({ user, lockState }))
      .catch((err) => setError(err))
  }

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

function LockStatusScreen ({
  user, initialLockState,
  onLogout
}) {
  const [{ owner, isOpen }, setLockState] = useState(initialLockState)
  const [isUpdatePending, setIsUpdatePending] = useState(false)

  function onOpenLock () {
    setIsUpdatePending(true)

    api.openLock()
      .then((newLockState) => {
        setLockState(newLockState)
        setIsUpdatePending(false)
      })
  }

  function onCloseLock () {
    setIsUpdatePending(true)

    api.closeLock()
      .then((newLockState) => {
        setLockState(newLockState)
        setIsUpdatePending(false)
      })
  }

  function onClickLogout () {
    api.logoutUser()
      .then(() => onLogout())
  }

  const isForeignOwner = owner && owner !== user

  return (
    h('div', { class: 'App' }, [
      h('div', { class: 'Header' }, [
        h('img', { alt: 'meffis logo', src: 'assets/logo.png', height: 30 }),

        h('button', { onClick: onClickLogout }, 'Abmelden')

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

          isOpen
            ? (h('button', {
                class: 'Button',
                disabled: isUpdatePending,
                onClick: onCloseLock
              }, 'Schließen')
            )
            : h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onOpenLock
            }, 'Öffnen'),

          isForeignOwner && (
            h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onOpenLock
            }, 'Schlüssel übernehmen')
          )
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

const root = document.getElementById('root')

render(h(App, {}), root)


