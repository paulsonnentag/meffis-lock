import fs from 'fs'
import readline from 'readline-sync'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const USERS_FILE_PATH = path.join(__dirname, '../users.json')

const users = (
  fs.existsSync(USERS_FILE_PATH)
    ? JSON.parse(fs.readFileSync(USERS_FILE_PATH, 'utf8'))
    : []
)

const usersByName = users.reduce((usersByName, user) => {
  usersByName[user.name.toLowerCase()] = user
  return usersByName
}, {})

let name

while (true) {
  name = readline.question('Name: ')

  if (!usersByName[name.toLowerCase()]) {
    console.warn('Username ist nicht vergeben')

  } else {
    break
  }
}

const uidx = users.findIndex(user => user.name.toLowerCase() == name)
users.splice(uidx, 1)

fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), { flag: 'w+' })
