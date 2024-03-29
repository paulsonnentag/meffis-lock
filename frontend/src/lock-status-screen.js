import { useCallback, useEffect, useState } from 'preact/hooks'
import * as api from './api.js'
import { h } from 'preact'
import { classNames } from './helpers.js'
import { io } from 'socket.io-client'

const socket = io()

socket.on('connect', () => {
  console.log('connected')
})

function Sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export function LockStatusScreen ({
  user, initialLockState,
  onLogout
}) {
  const [{ owner, state }, setLockState] = useState(initialLockState)
  const [isUpdatePending, setIsUpdatePending] = useState(false)

  const onChangeState = useCallback((newState) => {
    console.log('changeState', newState)
    setLockState(newState)

  }, [setLockState])

  useEffect(() => {
    socket.on('changeState', onChangeState)

    return () => {
      socket.off('changeState', onChangeState)
    }
  }, [setLockState])

  function onOpenLock () {
    setIsUpdatePending(true)

    api.openLock()
      .then((newLockState) => {
        setLockState(newLockState)
        setIsUpdatePending(false)
      })
      .catch(() => {
        alert('Technischer Fehler: Die Tür konnte nicht geöffnet werden')
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
      .catch(() => {
        alert('Technischer Fehler: Die Tür konnte nicht geschlossen werden')
        setIsUpdatePending(false)
      })
  }

  function onTakeOwnership () {
    setIsUpdatePending(true)

    api.takeOwnership()
      .then((newLockState) => {
        setLockState(newLockState)
        setIsUpdatePending(false)
      })
      .catch(() => {
        alert('Technischer Fehler: Der Schlüssel konnte nicht übernommen werden')
        setIsUpdatePending(false)
      })
  }

  function onClickLogout () {
    api.logoutUser()
      .then(() => onLogout())
  }

  function onRestart () {
    setIsUpdatePending(true)
    api.restart()
    // usually it takes keyble 10s to get to a known lock state
    Sleep(15000).then(() => location.reload())
  }

  const isForeignOwner = owner && owner !== user

  // OPENED is equivalent to UNLOCKED
  if (state.lock_status === 'OPENED') {
    state.lock_status = 'UNLOCKED'
  }

  const isUnlocked = state.lock_status === 'UNLOCKED'
  const isLocked = state.lock_status === 'LOCKED'
  const isUnknown = state.lock_status === 'UNKNOWN'
  const isDisconnected = state.lock_status === 'DISCONNECTED'

  return (
    h('div', { class: 'App' }, [
      h('div', { class: 'Header' }, [
        h('img', { alt: 'meffis logo', src: 'assets/logo.png', height: 30 }),

        h('button', { onClick: onClickLogout }, 'Abmelden')

      ]),
      h('div', { class: 'App_Content' }, [
        h('div', { class: 'Content' }, [

          h('button', {
            class: classNames('Lock', { isUnlocked, isLocked, isUnknown, isDisconnected }),
            disabled: isUpdatePending || isDisconnected,
            onClick: isUnlocked ? onCloseLock : onOpenLock
          }, [
            isUpdatePending && h(Spinner),
          ]),

          (state.battery_low) && (h('div', { style: { width: '100%', textAlign: 'center', color: 'red' } },
            'Batteriestand niedrig'
          )),

          h('div', { style: { width: '100%', textAlign: 'center' } }, [
            isUnlocked && `Tür wurde aufgeschlossen von ${owner}`,
            isLocked && 'Tür ist abgeschlossen',
            isUnknown && 'Schlüssel wurde manuell gedreht',
            isDisconnected && 'Das Schloss ist aktuell nicht verbunden'
          ]),

          (isUnlocked || isUnknown) && (h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onCloseLock
            }, 'Schließen')
          ),
          (isUnlocked || isLocked || isUnknown) && h('button', {
            class: 'Button',
            disabled: isUpdatePending,
            onClick: onOpenLock
          }, 'Öffnen'),

          (isForeignOwner && isUnlocked) && (
            h('button', {
              class: 'Button',
              disabled: isUpdatePending,
              onClick: onTakeOwnership
            }, 'Schlüssel übernehmen')
          ),
          // brute-force workaround for getting out of very rarely occuring case
          (isDisconnected) && (
            h('button', {
              class: 'Button',
              onClick: onRestart
            }, 'Applikation neustarten')
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
