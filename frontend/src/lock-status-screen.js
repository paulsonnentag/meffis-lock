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

  const isUnlocked = state === 'UNLOCKED'
  const isLocked = state === 'LOCKED'
  const isUnknown = state === 'UNKNOWN'

  return (
    h('div', { class: 'App' }, [
      h('div', { class: 'Header' }, [
        h('img', { alt: 'meffis logo', src: 'assets/logo.png', height: 30 }),

        h('button', { onClick: onClickLogout }, 'Abmelden')

      ]),
      h('div', { class: 'App_Content' }, [
        h('div', { class: 'Content' }, [

          h('div', {}, [
            isUnlocked && `Tür wurde aufgeschlossen von ${owner}`,
            isLocked && 'Tür ist abgeschlossen',
            isUnknown && 'Schlüssel wurde manuell gedreht'
          ]),

          h('button', {
            class: classNames('Lock', { isUnlocked, isLocked, isUnknown }),
            disabled: isUpdatePending,
            onClick: isUnlocked ? onCloseLock : onOpenLock
          }, [
            isUpdatePending && h(Spinner),
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