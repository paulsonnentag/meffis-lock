import fs from 'fs'
import readline from 'readline-sync'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import path from 'path'
import { hashPassword } from './password.mjs'
import { moduser } from './mod-user.mjs'

if (process.argv.length == 2) {
  console.log(`usage:
add-user LOCATION...

where LOCATION is:
1: einheit 1
2: einheit 2
w: werkstatt

example:
add-user 1 2 w
`)
  process.exit(1)
}

let name, password1, password2

name = readline.question('Name: ').toLowerCase()

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

for (const location of process.argv.slice(2)) {
  moduser(location, name, hash, salt, false)
}
