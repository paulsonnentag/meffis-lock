import fs from 'fs'
import readline from 'readline-sync'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import path from 'path'
import { hashPassword, isPasswordCorrect } from '../password.mjs'

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

let name, password1, password2

while (true) {
  name = readline.question('Name: ')

  if (usersByName[name.toLowerCase()]) {
    console.warn('Username ist schon vergeben')

  } else {
    break
  }
}

while (true) {
  password1 = readline.question('Passwort: ', { hideEchoBack: true })
  password2 = readline.question('Passwort: ', { hideEchoBack: true })

  if (password1 !== password2) {
    console.warn('Passwörter stimmen nicht überein')
  } else {
    break
  }
}

const { hash, salt } = hashPassword(password1)

console.log('check', isPasswordCorrect(hash, salt, password1))

users.push({ name, hash, salt })

fs.writeFileSync(USERS_FILE_PATH, JSON.stringify(users, null, 2), { flag: 'w+' })
