import { pbkdf2Sync, randomBytes } from 'crypto'

const ITERATIONS = 10000

export function hashPassword (password) {
  var salt = randomBytes(128).toString('base64')
  var hash = pbkdf2Sync(password, salt, ITERATIONS,  128, 'sha512').toString('base64')

  return {
    salt: salt,
    hash: hash,
  }
}

export function isPasswordCorrect (savedHash, savedSalt, passwordAttempt) {
  return savedHash === pbkdf2Sync(passwordAttempt, savedSalt, ITERATIONS,  128, 'sha512').toString('base64')
}