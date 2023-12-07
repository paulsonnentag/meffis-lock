import readline from 'readline-sync'
import { moduser } from './mod-user.mjs'

if (process.argv.length == 2) {
  console.log(`usage:
remove-user LOCATION...

where LOCATION is:
1: einheit 1
2: einheit 2
w: werkstatt

example:
remove-user 1 2 w
`)
  process.exit(1)
}

let name = readline.question('Name: ').toLowerCase()

for (const loc of process.argv.slice(2)) {
  moduser(loc, name, null, null, true)
}
