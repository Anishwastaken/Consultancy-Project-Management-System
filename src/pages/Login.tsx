import { useState, type FormEvent } from 'react'
import { AlertCircle, ClipboardCheck } from 'lucide-react'
import { DEMO_PASSWORD } from '../data/seed'
import { navigate } from '../lib/router'
import { useLookup, useStore } from '../store/store'
import { Avatar, Button, Field, Input } from '../components/ui'

const DEMO = ['U101', 'U103', 'U104', 'U105', 'U106']

export default function Login() {
  const { db, actions } = useStore()
  const L = useLookup()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = actions.login(email, password)
    if (!r.ok) return setError(r.error)
    navigate('/dashboard')
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      {/* Left: what the system is for */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand px-12 py-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-white/12">
            <ClipboardCheck size={19} />
          </span>
          <span className="text-[17px] font-extrabold tracking-[-0.01em]">CPTS</span>
        </div>
        <div className="max-w-[30rem]">
          <h1 className="text-[40px] leading-[1.08] font-bold tracking-[-0.03em]">Every consultancy engagement, from first proposal to final payment.</h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/75">
            Faculty submit proposals, the consultancy office approves them, agreements are recorded, and accounts track every invoice and payment against the approved budget.
          </p>
        </div>
        <ol className="grid grid-cols-4 gap-3 text-[13px]" aria-label="Lifecycle">
          {['Propose', 'Approve', 'Agree', 'Deliver & bill'].map((s, i) => (
            <li key={s} className="border-t-2 border-white/30 pt-3 first:border-white">
              <span className="num block text-white/55">{i + 1}</span>
              <span className="font-semibold">{s}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Right: sign in */}
      <div className="flex items-center justify-center bg-surface px-5 py-10 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-lg bg-brand text-white">
              <ClipboardCheck size={19} />
            </span>
            <span className="text-[17px] font-extrabold">CPTS</span>
          </div>
          <h2 className="text-[24px] font-bold tracking-[-0.02em]">Sign in</h2>
          <p className="mt-1 text-sm text-ink-2">Use your institutional account.</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@cpts.demo" />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && (
              <p className="flex items-start gap-2 rounded-md bg-bad-soft px-3 py-2.5 text-[13px] text-bad" role="alert">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}
            <Button type="submit" variant="primary" className="mt-1 h-10">
              Sign in
            </Button>
          </form>

          <div className="mt-9 border-t border-line pt-6">
            <p className="text-[13px] font-semibold text-ink">Demo accounts</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              Prototype only — authentication is simulated. Password for every account: <span className="num font-semibold text-ink-2">{DEMO_PASSWORD}</span>
            </p>
            <ul className="mt-3 flex flex-col gap-1">
              {DEMO.map((id) => {
                const u = db.users.find((x) => x.id === id)!
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(u.email)
                        setPassword(DEMO_PASSWORD)
                        setError('')
                      }}
                      className="flex w-full items-center gap-3 rounded-md border border-transparent px-2.5 py-2 text-left hover:border-line hover:bg-sunken"
                    >
                      <Avatar name={u.name} size={30} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{u.name}</span>
                        <span className="block truncate text-[12px] text-ink-3">{L.role(u.roleId)?.name}</span>
                      </span>
                      <span className="text-[12px] font-medium text-brand">Use</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
