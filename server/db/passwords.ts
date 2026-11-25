// Password hashing with scrypt (Node's built-in, memory-hard KDF).
// Stored format: scrypt$<N>$<salt>$<hash>  (base64url salt and hash)

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const N = 16384
const KEYLEN = 32

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, { N })
  return `scrypt$${N}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export function checkPassword(password: string, stored: string): boolean {
  const [scheme, n, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = scryptSync(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(n) })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
