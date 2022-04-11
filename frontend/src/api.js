const API = '/api'

export function loginUser (username, password) {
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

export function logoutUser () {
  return (
    fetchJSON(`${API}/logout`, {
      method: 'POST'
    })
  )
}

export function getStatus () {
  return fetchJSON(`${API}/status`)
}

export function openLock () {
  return (
    fetchJSON(`${API}/open`, { method: 'POST' })
  )
}

export function closeLock () {
  return (
    fetchJSON(`${API}/close`, { method: 'POST' })
  )
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