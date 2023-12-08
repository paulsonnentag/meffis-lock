import fs from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

let filemap = {
  "1": "users.json",
  "2": "users-einheit2.json",
  "w": "users-werkstatt.json",
}

export function moduser(location, name, hash, salt, remove) {
  const filename = filemap[location]
  if (filename === undefined) {
    console.log(`ignoring unknown location: ${location}`)
    return
  }

  const userfilepath = path.join(__dirname, '..', filename)

  const users = (
    fs.existsSync(userfilepath)
      ? JSON.parse(fs.readFileSync(userfilepath, 'utf8'))
      : []
  )

  const existing = users.findIndex((elem) => elem.name === name)
  if (remove) {
    if (existing === -1) {
      console.log(`${location}: user not present`)
    } else {
      console.log(`${location}: removing user`)
      users.splice(existing, 1)
    }
  } else {
    if (existing != -1) {
      console.log(`${location}: overwriting already existing user`)
      users.splice(existing, 1)
    } else {
      console.log(`${location}: adding user`)
    }
    users.push({ name, hash, salt, 'modified':Date.now() })
  }

  fs.writeFileSync(userfilepath, JSON.stringify(users, null, 2), { flag: 'w+' })
}
