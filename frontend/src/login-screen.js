import { useState } from 'preact/hooks'
import * as api from './api.js'
import { h } from 'preact'

export function LoginScreen ({
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
          h('form', { class: 'Form', onSubmit: onSubmitLogin }, [
            h('h1', {class: 'Form_Title'}, 'Anmeldung'),

            error && h('div', { class: 'Form_Error' }, error),

            h('div', {class: 'Form_Fields'}, [

              h('label', { class: 'Field' }, [
                h('div', { class: 'Field_Label' }, 'Name'),
                h('input', { type: 'text', name: 'username', required: true })
              ]),

              h('label', { class: 'Field' }, [
                h('div', { class: 'Field_Label' }, 'Passwort'),
                h('input', { type: 'password', name: 'password', required: true })
              ])
            ]),

            h('button', { class: 'Button' }, 'Anmelden')
          ])
        ])
      ])
    ])
  )

}
