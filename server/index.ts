// CPTS API server.
//
// Holds the authoritative copy of the data, authenticates users and runs every
// use-case through the shared engine (src/store/engine.ts), so the business
// rules (BR-001 … BR-010) are enforced here and not just in the browser.
//
//   POST /api/login         { email, password }    -> { challengeId, sentTo, delivery, ... }
//   POST /api/login/verify  { challengeId, code }  -> { token, user, db, rev }
//   POST /api/login/resend  { challengeId }        -> { sentTo, delivery, ... }
//   GET  /api/state      (?rev=N)             -> { rev, db } | { rev, unchanged }
//   POST /api/actions    { name, args }       -> { result, db, rev }
//   POST /api/reset                           -> { db, rev }     (demo only)
//   GET  /api/health                          -> { ok, rev, store }
//
// Storage goes through IDataAccess (server/db): MySQL by default, configured
// in .env. The server keeps an in-memory copy for fast reads; every change is
// written to the database in one transaction before the copy is updated, and
// changes are applied one at a time so two requests can't interleave.

import './env'
import express, { type NextFunction, type Request, type Response } from 'express'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createSeed } from '../src/data/seed'
import type { User } from '../src/data/types'
import { DOMAIN_ERROR, isInstituteEmail } from '../src/lib/auth'
import { didFail, isActionName, runAction } from '../src/store/engine'
import { describeMailSetup, destinationFor, mailConfigured, sendOtp } from './mailer'
import { createChallenge, OTP_TTL_MS, RESEND_AFTER_MS, resend, verify } from './otp'
import { createDataAccess, explainStoreError } from './db'
import type { Snapshot } from './db/IDataAccess'
import { checkPassword, hashPassword } from './db/passwords'

const PORT = Number(process.env.PORT ?? 3001)
const ROOT = path.resolve(import.meta.dirname, '..')
// CPTS_DATA_DIR lets a second instance (e.g. for tests) keep its own data.
const DATA_DIR = process.env.CPTS_DATA_DIR ? path.resolve(process.env.CPTS_DATA_DIR) : path.join(import.meta.dirname, 'data')
const SECRET_FILE = path.join(DATA_DIR, '.secret')
const DIST = path.join(ROOT, 'dist')
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000

mkdirSync(DATA_DIR, { recursive: true })

/* ------------------------------------------------------------ storage -- */

const store = (() => {
  try {
    return createDataAccess(DATA_DIR)
  } catch (e) {
    console.error(`[db] ${(e as Error).message}`)
    process.exit(1)
  }
})()

try {
  await store.init()
} catch (e) {
  console.error(`[db] ${store.description}: ${explainStoreError(e)}`)
  process.exit(1)
}

let state: Snapshot = await store.load()

/** Run changes one at a time, so each sees the result of the previous one. */
let queue: Promise<unknown> = Promise.resolve()
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => undefined)
  return run
}

/* ----------------------------------------------------------- sessions -- */
// Stateless signed tokens: "<userId>.<expiry>.<hmac>". They survive a server
// restart and are checked against the live user record on every request, so a
// deactivated account loses access immediately.

function secret(): Buffer {
  if (existsSync(SECRET_FILE)) return Buffer.from(readFileSync(SECRET_FILE, 'utf8'), 'hex')
  const s = randomBytes(32)
  writeFileSync(SECRET_FILE, s.toString('hex'))
  return s
}
const KEY = secret()

const sign = (payload: string) => createHmac('sha256', KEY).update(payload).digest('base64url')

function issueToken(userId: string) {
  const payload = `${userId}.${Date.now() + TOKEN_TTL_MS}`
  return `${payload}.${sign(payload)}`
}

function verifyToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, exp, sig] = parts
  const expected = Buffer.from(sign(`${userId}.${exp}`))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  return Number(exp) > Date.now() ? userId : null
}

// Checked when the email is unknown, so a failed login takes the same time
// whether or not the account exists.
const DUMMY_HASH = hashPassword(randomBytes(12).toString('hex'))

/* --------------------------------------------------------------- app -- */

const app = express()
app.use(express.json({ limit: '1mb' }))

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error })

function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? ''
  const userId = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null
  const user = userId ? state.db.users.find((u) => u.id === userId && u.status === 'Active') : undefined
  if (!user) return fail(res, 401, 'Your session has expired or the account is inactive. Sign in again.')
  res.locals.user = user
  next()
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rev: state.rev, store: store.description.split(' ')[0] })
})

// FR-001 / FR-002 — sign-in is two steps: password, then a one-time code sent
// to the account's e-mail. Step 1 gives the same message for an unknown email,
// a wrong password and an inactive account, so it reveals nothing about which.
const GENERIC_LOGIN_ERROR = 'The email or password is incorrect, or the account is inactive.'

const mask = (email: string) => {
  const [local, domain] = email.split('@')
  return `${local[0]}${'•'.repeat(Math.max(2, Math.min(6, local.length - 2)))}${local.length > 1 ? local[local.length - 1] : ''}@${domain}`
}

function otpResponse(challengeId: string, email: string, delivery: 'email' | 'console') {
  const to = destinationFor(email)
  return {
    challengeId,
    sentTo: mask(to),
    redirected: to !== email,
    delivery,
    expiresInSec: OTP_TTL_MS / 1000,
    resendInSec: RESEND_AFTER_MS / 1000,
  }
}

app.post('/api/login', async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || !isInstituteEmail(email)) return fail(res, 400, DOMAIN_ERROR)
  const user: User | undefined = state.db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
  const pw = typeof password === 'string' ? password : ''
  const valid = user ? user.status === 'Active' && (await store.verifyPassword(user.id, pw)) : (checkPassword(pw, DUMMY_HASH), false)
  if (!valid) {
    console.log(`[api] login failed for ${email.slice(0, 60)}`)
    return fail(res, 401, GENERIC_LOGIN_ERROR)
  }
  const { id, code } = createChallenge(user!.id)
  try {
    const delivery = await sendOtp(user!.email, user!.name, code, OTP_TTL_MS / 60000)
    res.json(otpResponse(id, user!.email, delivery))
  } catch (e) {
    console.log(`[otp] could not e-mail ${user!.email}: ${(e as Error).message}`)
    fail(res, 502, 'The verification e-mail could not be sent. Try again in a moment.')
  }
})

app.post('/api/login/resend', async (req, res) => {
  const { challengeId } = (req.body ?? {}) as { challengeId?: unknown }
  if (typeof challengeId !== 'string') return fail(res, 400, 'This sign-in has expired. Enter your email and password again.')
  const r = resend(challengeId)
  if (!r.ok) return res.status(r.retryInMs ? 429 : 400).json({ error: r.error, retryInSec: r.retryInMs ? Math.ceil(r.retryInMs / 1000) : undefined, restart: !r.retryInMs })
  const user = state.db.users.find((u) => u.id === r.userId)!
  try {
    const delivery = await sendOtp(user.email, user.name, r.code, OTP_TTL_MS / 60000)
    res.json(otpResponse(challengeId, user.email, delivery))
  } catch (e) {
    console.log(`[otp] could not e-mail ${user.email}: ${(e as Error).message}`)
    fail(res, 502, 'The verification e-mail could not be sent. Try again in a moment.')
  }
})

app.post('/api/login/verify', (req, res) => {
  const { challengeId, code } = (req.body ?? {}) as { challengeId?: unknown; code?: unknown }
  if (typeof challengeId !== 'string' || typeof code !== 'string') return res.status(400).json({ error: 'Enter the 6-digit code.', restart: false })
  const r = verify(challengeId, code)
  if (!r.ok) return res.status(401).json({ error: r.error, restart: r.restart })
  const user = state.db.users.find((u) => u.id === r.userId && u.status === 'Active')
  if (!user) return res.status(401).json({ error: GENERIC_LOGIN_ERROR, restart: true })
  console.log(`[api] ${user.id} signed in with e-mail code (${user.roleId})`)
  res.json({ token: issueToken(user.id), user, db: state.db, rev: state.rev })
})

app.get('/api/state', auth, (req, res) => {
  if (String(req.query.rev) === String(state.rev)) return res.json({ rev: state.rev, unchanged: true })
  res.json({ rev: state.rev, db: state.db })
})

app.post('/api/actions', auth, (req, res) =>
  serialized(async () => {
    const { name, args } = (req.body ?? {}) as { name?: unknown; args?: unknown }
    if (!isActionName(name) || !Array.isArray(args)) return fail(res, 400, 'Unknown action.')
    const user = res.locals.user as User

    // Run against a copy: if a handler throws on malformed input, nothing changes.
    const draft = structuredClone(state.db)
    let result: unknown
    try {
      result = runAction(draft, user.id, name, args)
    } catch (e) {
      console.log(`[api] ${user.id} ${name} -> error: ${(e as Error).message}`)
      return fail(res, 400, 'The request could not be processed.')
    }

    const failed = didFail(result)
    if (!failed) {
      // Database first; only a successful commit updates the in-memory copy.
      try {
        await store.commit(state.db, draft, state.rev + 1)
      } catch (e) {
        console.log(`[db] ${user.id} ${name} -> not saved: ${(e as Error).message}`)
        return res.status(500).json({ error: 'The change could not be saved to the database. Nothing was changed.', result: null, db: state.db, rev: state.rev })
      }
      state = { rev: state.rev + 1, db: draft }
    }
    console.log(`[api] ${user.id} ${name} -> ${failed ? 'rejected' : 'ok'} (rev ${state.rev})`)
    res.json({ result: result ?? null, db: state.db, rev: state.rev })
  }),
)

// Demo convenience: restore the sample data before a presentation.
app.post('/api/reset', auth, (_req, res) =>
  serialized(async () => {
    const seed = createSeed()
    await store.reset(seed, state.rev + 1)
    // Reload so the copy matches exactly what the database holds.
    state = await store.load()
    console.log(`[api] sample data restored (rev ${state.rev})`)
    res.json({ db: state.db, rev: state.rev })
  }),
)

app.use('/api', (_req, res) => fail(res, 404, 'Not found.'))

// After `npm run build`, the same server also serves the front end.
if (existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST))
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.log(`[api] error: ${err.message}`)
  fail(res, 400, 'The request could not be processed.')
})

app.listen(PORT, () => {
  console.log(`[api] CPTS API listening on http://localhost:${PORT}  (data: ${store.description}, rev ${state.rev})`)
  console.log(`[api] ${describeMailSetup()}`)
  if (mailConfigured && !process.env.OTP_REDIRECT_TO)
    console.log('[api] warning: the demo accounts use made-up @lnmiit.ac.in addresses. Set OTP_REDIRECT_TO in .env so codes are not e-mailed to real people with the same address.')
})

