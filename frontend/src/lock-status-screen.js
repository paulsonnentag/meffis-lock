import { useCallback, useEffect, useState } from 'preact/hooks'
import * as api from './api.js'
import { h } from 'preact'
import { classNames } from './helpers.js'
import { io } from 'socket.io-client'

const socket = io()

socket.on('connect', () => {
  console.log('connected')
})

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

  function onClickLogout () {
    api.logoutUser()
      .then(() => onLogout())
  }

  const isForeignOwner = owner && owner !== user

  const isUnlocked = state === 'UNLOCKED'
  const isLocked = state === 'LOCKED'
  const isUnknown = state === 'UNKNOWN'
  const isDisconnected = state === 'DISCONNECTED'

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
          (isLocked || isUnknown) && h('button', {
            class: 'Button',
            disabled: isUpdatePending,
            onClick: onOpenLock
          }, 'Öffnen'),

          (isForeignOwner && isUnlocked) && (
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