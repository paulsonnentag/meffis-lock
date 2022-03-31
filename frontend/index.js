import { render, h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { classNames } from './helpers.js'

function App () {
  const [lockStatus, setLockStatus] = useState(undefined)
  const [isUpdatePending, setIsUpdatePending] = useState(false)

  useEffect(() => {
    getLockStatus()
      .then(setLockStatus)
  }, [])

  function onOpenLock () {
    setIsUpdatePending(true)

    console.log('open')

    openLock()
      .then((newLockStatus) => {
        setLockStatus(newLockStatus)
        setIsUpdatePending(false)
      })
  }

  function onCloseLock () {
    setIsUpdatePending(true)

    closeLock()
      .then((newLockStatus) => {
        setLockStatus(newLockStatus)
        setIsUpdatePending(false)
      })
  }

  if (!lockStatus) {
    return
  }

  const { isOpen, owner } = lockStatus

  return (
    h('div', { class: 'App' }, [
      h('div', { class: 'Header' }, [
        h('img', { alt: 'meffis logo', src: 'assets/logo.png', height: 30 }),

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
            ? h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onCloseLock
            }, 'schließen')
            : h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onOpenLock
            }, 'öffnen')
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

function getLockStatus () {
  return (
    fetch(`${API}/status`)
      .then((r) => r.json())
  )
}

function openLock () {
  return (
    fetch(`${API}/open`, { method: 'POST' })
      .then((r) => r.json())
  )
}

function closeLock () {
  return (
    fetch(`${API}/close`, { method: 'POST' })
      .then((r) => r.json())
  )
}

const root = document.getElementById('root')

render(h(App, {}), root)


