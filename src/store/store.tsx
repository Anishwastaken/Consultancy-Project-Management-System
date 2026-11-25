import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createSeed } from '../data/seed'
import type { DB, User } from '../data/types'
import { api, NetworkError, TOKEN_KEY } from '../lib/api'
import { DOMAIN_ERROR, isInstituteEmail } from '../lib/auth'
import { didFail, handlers, runAction, type ActionArgs, type ActionName, type ActionResult, type Result } from './engine'

export type { Result } from './engine'

// Data flow
//   - The server (server/index.ts) holds the authoritative data.
//   - Each action runs through the shared engine here first, so the screen
//     updates instantly, and is then sent to the server. When the server
//     answers, its copy replaces ours.
//   - Signing in needs the server (password + e-mailed one-time code). If the
//     server drops during a session, the app keeps working on browser-local
//     data ("offline" mode) so a demo never dead-ends.

const DB_KEY = 'cpts.db.v4'
const SESSION_KEY = 'cpts.session'
const POLL_MS = 4000

export type Mode = 'server' | 'offline'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

function loadDB(): DB {
  try {
    const raw = read(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed.version === createSeed().version) return parsed
    }
  } catch {
    /* fall through to seed */
  }
  return createSeed()
}

interface LoginResponse {
  token: string
  user: User
  db: DB
  rev: number
  error?: string
}
export interface OtpChallenge {
  challengeId: string
  sentTo: string
  redirected: boolean
  delivery: 'email' | 'console'
  expiresInSec: number
  resendInSec: number
}

const SERVER_DOWN = 'The CPTS server can’t be reached. Start it with “npm run dev” and try again.'

interface ActionResponse {
  result: unknown
  db: DB
  rev: number
}

function useStoreValue() {
  const [db, setDb] = useState<DB>(loadDB)
  const [sessionId, setSessionId] = useState<string | null>(() => read(SESSION_KEY))
  const [mode, setMode] = useState<Mode>(() => (read(TOKEN_KEY) ? 'server' : 'offline'))
  const [notice, setNotice] = useState('')
  const [loginHint, setLoginHint] = useState<{ email: string; name: string } | null>(null)
  const [syncError, setSyncError] = useState<{ message: string; at: number } | null>(null)

  const ref = useRef(db)
  const sessionIdRef = useRef(sessionId)
  const tokenRef = useRef<string | null>(read(TOKEN_KEY))
  const modeRef = useRef<Mode>(mode)
  const revRef = useRef(0)
  const pending = useRef(0)
  const chain = useRef<Promise<void>>(Promise.resolve())
  sessionIdRef.current = sessionId
  modeRef.current = mode

  useEffect(() => write(DB_KEY, JSON.stringify(db)), [db])
  useEffect(() => write(SESSION_KEY, sessionId), [sessionId])

  const user = db.users.find((u) => u.id === sessionId && u.status === 'Active')

  const actions = useMemo(() => {
    const apply = (next: DB, rev: number) => {
      ref.current = next
      revRef.current = rev
      setDb(next)
    }
    const endSession = (message = '') => {
      tokenRef.current = null
      write(TOKEN_KEY, null)
      sessionIdRef.current = null
      setSessionId(null)
      setMode('offline')
      setNotice(message)
    }
    const goOffline = () => {
      modeRef.current = 'offline'
      setMode('offline')
    }

    /** Send one action to the server, in order; adopt the server's data when the queue drains. */
    const enqueue = (name: ActionName, args: unknown[]) => {
      pending.current++
      chain.current = chain.current.then(async () => {
        let latest: ActionResponse | null = null
        try {
          const { status, data } = await api<ActionResponse & { error?: string }>('/api/actions', { method: 'POST', token: tokenRef.current, body: { name, args } })
          if (status === 401) endSession('Your session expired. Sign in again.')
          else if (status === 200) latest = data
          else if (data.db) {
            // The server couldn't save it: drop the local preview and say so.
            latest = data
            setSyncError({ message: data.error ?? 'The change could not be saved.', at: Date.now() })
          }
        } catch (e) {
          if (e instanceof NetworkError) goOffline()
        } finally {
          pending.current--
        }
        if (latest && pending.current === 0 && modeRef.current === 'server') apply(latest.db, latest.rev)
      })
    }

    /** Run an action locally for instant feedback, then sync it to the server. */
    const act = <K extends ActionName>(name: K, ...args: ActionArgs<K>): ActionResult<K> => {
      const draft = structuredClone(ref.current)
      const result = runAction(draft, sessionIdRef.current ?? undefined, name, args as unknown[]) as ActionResult<K>
      if (didFail(result)) return result
      ref.current = draft
      setDb(draft)
      if (tokenRef.current && modeRef.current === 'server') enqueue(name, args as unknown[])
      return result
    }

    const bound = Object.fromEntries(Object.keys(handlers).map((name) => [name, (...args: unknown[]) => (act as (n: ActionName, ...a: unknown[]) => unknown)(name as ActionName, ...args)])) as {
      [K in ActionName]: (...args: ActionArgs<K>) => ActionResult<K>
    }

    /* FR-001 / FR-002, step 1: password. The server e-mails a one-time code. */
    const requestCode = async (email: string, password: string): Promise<Result<OtpChallenge>> => {
      if (!isInstituteEmail(email)) return { ok: false, error: DOMAIN_ERROR }
      try {
        const { status, data } = await api<OtpChallenge & { error?: string }>('/api/login', { method: 'POST', body: { email: email.trim(), password } })
        if (status !== 200) return { ok: false, error: data.error ?? 'Sign in failed.' }
        setNotice('')
        return { ok: true, value: data }
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e
        return { ok: false, error: SERVER_DOWN }
      }
    }

    const resendCode = async (challengeId: string): Promise<{ ok: true; value: OtpChallenge } | { ok: false; error: string; restart: boolean; retryInSec?: number }> => {
      try {
        const { status, data } = await api<OtpChallenge & { error?: string; restart?: boolean; retryInSec?: number }>('/api/login/resend', { method: 'POST', body: { challengeId } })
        if (status !== 200) return { ok: false, error: data.error ?? 'Could not send a new code.', restart: !!data.restart, retryInSec: data.retryInSec }
        return { ok: true, value: data }
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e
        return { ok: false, error: SERVER_DOWN, restart: false }
      }
    }

    /* Step 2: the code. Only now is a session token issued. */
    const verifyCode = async (challengeId: string, code: string): Promise<{ ok: true; value: User } | { ok: false; error: string; restart: boolean }> => {
      try {
        const { status, data } = await api<LoginResponse & { restart?: boolean }>('/api/login/verify', { method: 'POST', body: { challengeId, code } })
        if (status !== 200) return { ok: false, error: data.error ?? 'Verification failed.', restart: !!data.restart }
        tokenRef.current = data.token
        write(TOKEN_KEY, data.token)
        apply(data.db, data.rev)
        sessionIdRef.current = data.user.id
        modeRef.current = 'server'
        setSessionId(data.user.id)
        setMode('server')
        setNotice('')
        setLoginHint(null)
        return { ok: true, value: data.user }
      } catch (e) {
        if (!(e instanceof NetworkError)) throw e
        return { ok: false, error: SERVER_DOWN, restart: false }
      }
    }

    return {
      ...bound,
      requestCode,
      resendCode,
      verifyCode,
      /* FR-003 */
      logout: () => endSession(),
      /** Demo helper: sign out and pre-fill the sign-in form for another demo account.
       *  The e-mail code is still required, so switching can't bypass verification. */
      switchUser: (id: string) => {
        const target = ref.current.users.find((u) => u.id === id)
        endSession()
        if (target) setLoginHint({ email: target.email, name: target.name })
      },
      resetDemo: async (): Promise<void> => {
        if (tokenRef.current && modeRef.current === 'server') {
          try {
            const { status, data } = await api<{ db: DB; rev: number }>('/api/reset', { method: 'POST', token: tokenRef.current })
            if (status === 200) return apply(data.db, data.rev)
            if (status === 401) return endSession('Your session expired. Sign in again.')
          } catch (e) {
            if (!(e instanceof NetworkError)) throw e
            goOffline()
          }
        }
        apply(createSeed(), revRef.current)
      },
      /** Pull the latest data from the server (used on start-up and by the poller). */
      refresh: async () => {
        if (!tokenRef.current || modeRef.current !== 'server' || pending.current > 0) return
        try {
          const { status, data } = await api<{ rev: number; db?: DB; unchanged?: boolean }>(`/api/state?rev=${revRef.current}`, { token: tokenRef.current })
          if (pending.current > 0) return
          if (status === 401) return endSession('Your session expired. Sign in again.')
          if (status === 200 && data.db && !data.unchanged) apply(data.db, data.rev)
        } catch (e) {
          if (e instanceof NetworkError) goOffline()
        }
      },
    }
  }, [])

  // Pick up the server's data when reopening a restored session, then keep it
  // fresh so two windows (e.g. faculty and approver) see each other's changes.
  useEffect(() => {
    if (mode !== 'server' || !sessionId) return
    void actions.refresh()
    const t = setInterval(() => void actions.refresh(), POLL_MS)
    return () => clearInterval(t)
  }, [mode, sessionId, actions])

  return { db, user, actions, mode, notice, loginHint, syncError }
}

type Store = ReturnType<typeof useStoreValue>
const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue()
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore outside provider')
  return s
}

/** Convenience lookups */
export function useLookup() {
  const { db } = useStore()
  return useMemo(
    () => ({
      user: (id?: string) => db.users.find((u) => u.id === id),
      client: (id?: string) => db.clients.find((c) => c.id === id),
      project: (id?: string) => db.projects.find((p) => p.id === id),
      proposal: (id?: string) => db.proposals.find((p) => p.id === id),
      agreement: (id?: string) => db.agreements.find((a) => a.id === id),
      role: (id?: string) => db.roles.find((r) => r.id === id),
    }),
    [db],
  )
}
