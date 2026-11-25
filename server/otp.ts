// One-time sign-in codes (second step of login).
//
// A code is issued only after the password is correct. It is stored hashed,
// expires after 5 minutes, allows 5 wrong attempts and can be re-sent after
// 30 seconds (at most 3 times). Pending codes live in memory, so restarting
// the server cancels them and the user simply signs in again.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { OTP_LENGTH } from '../src/lib/auth'

export const OTP_TTL_MS = 5 * 60 * 1000
export const RESEND_AFTER_MS = 30 * 1000
const MAX_ATTEMPTS = 5
const MAX_SENDS = 4

interface Challenge {
  userId: string
  hash: Buffer
  expires: number
  attemptsLeft: number
  sends: number
  lastSent: number
}

const challenges = new Map<string, Challenge>()

const hashOf = (id: string, code: string) => createHash('sha256').update(`${id}:${code}`).digest()
const newCode = () => String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0')

function sweep() {
  const now = Date.now()
  for (const [id, c] of challenges) if (c.expires < now) challenges.delete(id)
}

/** Start a challenge for a user whose password was correct. Returns the id and the plain code to send. */
export function createChallenge(userId: string) {
  sweep()
  // One pending code per user: a new sign-in replaces the old one.
  for (const [id, c] of challenges) if (c.userId === userId) challenges.delete(id)
  const id = randomBytes(18).toString('base64url')
  const code = newCode()
  challenges.set(id, { userId, hash: hashOf(id, code), expires: Date.now() + OTP_TTL_MS, attemptsLeft: MAX_ATTEMPTS, sends: 1, lastSent: Date.now() })
  return { id, code }
}

export type ResendResult = { ok: true; userId: string; code: string } | { ok: false; error: string; retryInMs?: number }

export function resend(id: string): ResendResult {
  const c = challenges.get(id)
  if (!c || c.expires < Date.now()) return { ok: false, error: 'This sign-in has expired. Enter your email and password again.' }
  const wait = c.lastSent + RESEND_AFTER_MS - Date.now()
  if (wait > 0) return { ok: false, error: `You can request a new code in ${Math.ceil(wait / 1000)} seconds.`, retryInMs: wait }
  if (c.sends >= MAX_SENDS) {
    challenges.delete(id)
    return { ok: false, error: 'Too many codes requested. Enter your email and password again.' }
  }
  const code = newCode()
  c.hash = hashOf(id, code)
  c.expires = Date.now() + OTP_TTL_MS
  c.attemptsLeft = MAX_ATTEMPTS
  c.sends++
  c.lastSent = Date.now()
  return { ok: true, userId: c.userId, code }
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; error: string; restart: boolean }

/** `accepts` limits which subjects this caller may verify, so a sign-up code
 *  can't be spent at the sign-in endpoint and the other way round. */
export function verify(id: string, code: string, accepts: (subject: string) => boolean): VerifyResult {
  const c = challenges.get(id)
  if (!c || !accepts(c.userId)) return { ok: false, error: 'This sign-in has expired. Enter your email and password again.', restart: true }
  if (c.expires < Date.now()) {
    challenges.delete(id)
    return { ok: false, error: 'The code has expired. Enter your email and password to get a new one.', restart: true }
  }
  const given = hashOf(id, code.trim())
  if (timingSafeEqual(given, c.hash)) {
    challenges.delete(id) // single use
    return { ok: true, userId: c.userId }
  }
  c.attemptsLeft--
  if (c.attemptsLeft <= 0) {
    challenges.delete(id)
    return { ok: false, error: 'Too many incorrect codes. Enter your email and password again.', restart: true }
  }
  return { ok: false, error: `That code is incorrect. ${c.attemptsLeft} attempt${c.attemptsLeft === 1 ? '' : 's'} left.`, restart: false }
}
