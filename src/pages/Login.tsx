import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, MailCheck } from 'lucide-react'
import { DEMO_PASSWORD } from '../data/seed'
import { DOMAIN_ERROR, INSTITUTE_DOMAIN, isInstituteEmail, OTP_LENGTH, PASSWORD_MIN, SIGNUP_ROLES, signupErrors, type SignupInput } from '../lib/auth'
import { navigate } from '../lib/router'
import { useLookup, useStore, type OtpChallenge } from '../store/store'
import { Avatar, Button, Field, Input, Select } from '../components/ui'

const DEMO = ['U101', 'U103', 'U104', 'U105', 'U106']

export default function Login() {
  const { db, actions, notice, loginHint } = useStore()
  const L = useLookup()
  const [email, setEmail] = useState(loginHint?.email ?? '')
  const [password, setPassword] = useState(loginHint ? DEMO_PASSWORD : '')
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)
  const [signingUp, setSigningUp] = useState(false)
  const [registered, setRegistered] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!isInstituteEmail(email)) return setEmailError(DOMAIN_ERROR)
    setRegistered(false)
    setBusy(true)
    const r = await actions.requestCode(email, password)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setChallenge(r.value)
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
      {/* my-auto rather than items-center: a tall form (sign-up) then scrolls instead of being clipped at the top */}
      <div className="flex justify-center bg-surface px-5 py-10 sm:px-10">
        <div className="my-auto w-full max-w-[400px]">
          <img src="/lnmiit-logo.png" alt="The LNM Institute of Information Technology" className="mb-8 h-16 w-auto" />

          {signingUp ? (
            <SignUp
              onCancel={() => setSigningUp(false)}
              onDone={(registeredEmail) => {
                setSigningUp(false)
                setRegistered(true)
                setEmail(registeredEmail)
                setPassword('')
                setError('')
                setEmailError('')
              }}
            />
          ) : challenge ? (
            <CodeStep
              challenge={challenge}
              email={email}
              backLabel="Use a different account"
              submitLabel="Verify and sign in"
              verifyWith={actions.verifyCode}
              onVerified={() => navigate('/dashboard')}
              onBack={(reason) => {
                setChallenge(null)
                setError(reason ?? '')
              }}
              onChallenge={setChallenge}
            />
          ) : (
            <>
              <h2 className="text-[24px] font-bold tracking-[-0.02em]">Sign in</h2>
              <p className="mt-1 text-sm text-ink-2">Use your LNMIIT account. We’ll e-mail you a one-time code.</p>

              <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
                <Field label="LNMIIT email" htmlFor="email" error={emailError}>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    invalid={!!emailError}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setEmailError('')
                    }}
                    onBlur={() => email && !isInstituteEmail(email) && setEmailError(DOMAIN_ERROR)}
                    placeholder={`name@${INSTITUTE_DOMAIN}`}
                  />
                </Field>
                <Field label="Password" htmlFor="password">
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                {!error && registered && (
                  <p className="flex items-start gap-2 rounded-md bg-ok-soft px-3 py-2.5 text-[13px] text-ok" role="status">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> Account requested. An administrator will review it; once it’s activated, sign in here with your email and password.
                  </p>
                )}
                {!error && notice && (
                  <p className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2.5 text-[13px] text-warn" role="status">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" /> {notice}
                  </p>
                )}
                {!error && loginHint && (
                  <p className="rounded-md bg-info-soft px-3 py-2.5 text-[13px] text-info" role="status">
                    Signing in as {loginHint.name}. Continue to get a verification code.
                  </p>
                )}
                {error && (
                  <p className="flex items-start gap-2 rounded-md bg-bad-soft px-3 py-2.5 text-[13px] text-bad" role="alert">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
                  </p>
                )}
                <Button type="submit" variant="primary" className="mt-1 h-10" disabled={busy}>
                  {busy ? 'Sending code' : 'Continue'}
                </Button>
              </form>

              <p className="mt-5 text-center text-[13px] text-ink-3">
                New to CPTS?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSigningUp(true)
                    setRegistered(false)
                    setError('')
                  }}
                  className="font-semibold text-brand hover:underline"
                >
                  Create an account
                </button>
              </p>

              <div className="mt-9 border-t border-line pt-6">
                <ul className="flex flex-col gap-1">
                  {DEMO.map((id) => {
                    const u = db.users.find((x) => x.id === id)
                    if (!u) return null
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => {
                            setEmail(u.email)
                            setPassword(DEMO_PASSWORD)
                            setError('')
                            setEmailError('')
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type VerifyResult = { ok: true } | { ok: false; error: string; restart: boolean }

function CodeStep({
  challenge,
  email,
  backLabel,
  submitLabel,
  verifyWith,
  onVerified,
  onBack,
  onChallenge,
}: {
  challenge: OtpChallenge
  email: string
  backLabel: string
  submitLabel: string
  verifyWith: (challengeId: string, code: string) => Promise<VerifyResult>
  onVerified: () => void
  onBack: (reason?: string) => void
  onChallenge: (c: OtpChallenge) => void
}) {
  const { actions } = useStore()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(challenge.resendInSec)
  const [resent, setResent] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [challenge])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const verify = async (value = code) => {
    if (value.length !== OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code.`)
    setBusy(true)
    setError('')
    const r = await verifyWith(challenge.challengeId, value)
    setBusy(false)
    if (!r.ok) {
      if (r.restart) {
        onBack(r.error)
        return
      }
      setCode('')
      input.current?.focus()
      return setError(r.error)
    }
    onVerified()
  }

  const resend = async () => {
    setError('')
    const r = await actions.resendCode(challenge.challengeId)
    if (!r.ok) {
      if (r.restart) return onBack(r.error)
      if (r.retryInSec) setWait(r.retryInSec)
      return setError(r.error)
    }
    onChallenge(r.value)
    setWait(r.value.resendInSec)
    setCode('')
    setResent(true)
  }

  return (
    <>
      <button type="button" onClick={() => onBack()} className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> {backLabel}
      </button>
      <h2 className="text-[24px] font-bold tracking-[-0.02em]">Check your e-mail</h2>
      <p className="mt-1 text-sm text-ink-2">
        {challenge.delivery === 'email' ? (
          <>
            We sent a {OTP_LENGTH}-digit code to <span className="font-semibold text-ink">{challenge.sentTo}</span>
            {challenge.redirected && <> (demo inbox for {email})</>}. It expires in {Math.round(challenge.expiresInSec / 60)} minutes.
          </>
        ) : (
          <>
            Enter the {OTP_LENGTH}-digit code for <span className="font-semibold text-ink">{email}</span>. It expires in {Math.round(challenge.expiresInSec / 60)} minutes.
          </>
        )}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void verify()
        }}
        className="mt-6 flex flex-col gap-4"
        noValidate
      >
        <Field label="Verification code" htmlFor="otp" error={error}>
          <Input
            ref={input}
            id="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={OTP_LENGTH}
            value={code}
            invalid={!!error}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH)
              setCode(v)
              setError('')
              if (v.length === OTP_LENGTH) void verify(v)
            }}
            placeholder="000000"
            className="num h-12 text-center text-[22px] font-semibold tracking-[0.5em]"
          />
        </Field>
        {resent && !error && (
          <p className="flex items-center gap-2 text-[13px] text-ok" role="status">
            <MailCheck size={15} aria-hidden /> A new code was sent. Earlier codes no longer work.
          </p>
        )}
        <Button type="submit" variant="primary" className="h-10" disabled={busy || code.length !== OTP_LENGTH}>
          {busy ? 'Verifying' : submitLabel}
        </Button>
      </form>

      <p className="mt-4 text-[13px] text-ink-3">
        Didn’t get it?{' '}
        {wait > 0 ? (
          <span className="num">Send a new code in {wait}s</span>
        ) : (
          <button type="button" onClick={resend} className="font-medium text-brand hover:underline">
            Send a new code
          </button>
        )}
      </p>
    </>
  )
}

function SignUp({ onCancel, onDone }: { onCancel: () => void; onDone: (email: string) => void }) {
  const { actions } = useStore()
  const L = useLookup()
  const [form, setForm] = useState<SignupInput>({ name: '', email: '', department: '', title: '', roleId: 'faculty', password: '' })
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Partial<Record<keyof SignupInput | 'confirm', string>>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null)

  const set = (k: keyof SignupInput) => (e: { target: { value: string } }) => {
    setForm({ ...form, [k]: e.target.value })
    setErrors({ ...errors, [k]: undefined })
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const found = { ...signupErrors(form), ...(confirm !== form.password ? { confirm: 'The passwords don’t match.' } : {}) }
    if (Object.keys(found).length) return setErrors(found)
    setBusy(true)
    const r = await actions.signUp(form)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setChallenge(r.value)
  }

  if (challenge)
    return (
      <CodeStep
        challenge={challenge}
        email={form.email.trim()}
        backLabel="Back to the form"
        submitLabel="Verify and create account"
        verifyWith={actions.verifySignup}
        onVerified={() => onDone(form.email.trim().toLowerCase())}
        onBack={(reason) => {
          setChallenge(null)
          setError(reason ?? '')
        }}
        onChallenge={setChallenge}
      />
    )

  return (
    <>
      <button type="button" onClick={onCancel} className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft size={15} aria-hidden /> Back to sign in
      </button>
      <h2 className="text-[24px] font-bold tracking-[-0.02em]">Create an account</h2>
      <p className="mt-1 text-sm text-ink-2">For LNMIIT staff. We’ll e-mail you a code to confirm your address, then an administrator activates the account.</p>

      <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
        <Field label="Full name" htmlFor="su-name" error={errors.name} required>
          <Input id="su-name" autoComplete="name" value={form.name} invalid={!!errors.name} onChange={set('name')} />
        </Field>
        <Field label="LNMIIT email" htmlFor="su-email" error={errors.email} required>
          <Input id="su-email" type="email" autoComplete="email" value={form.email} invalid={!!errors.email} onChange={set('email')} placeholder={`name@${INSTITUTE_DOMAIN}`} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department" htmlFor="su-dept" error={errors.department} required>
            <Input id="su-dept" value={form.department} invalid={!!errors.department} onChange={set('department')} />
          </Field>
          <Field label="Designation" htmlFor="su-title" error={errors.title}>
            <Input id="su-title" value={form.title} invalid={!!errors.title} onChange={set('title')} placeholder="e.g. Assistant Professor" />
          </Field>
        </div>
        <Field label="Role" htmlFor="su-role" error={errors.roleId} hint="An administrator confirms the role before activating the account." required>
          <Select id="su-role" value={form.roleId} invalid={!!errors.roleId} onChange={set('roleId')}>
            {SIGNUP_ROLES.map((r) => (
              <option key={r} value={r}>
                {L.role(r)?.name ?? r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Password" htmlFor="su-password" error={errors.password} hint={`At least ${PASSWORD_MIN} characters.`} required>
          <Input id="su-password" type="password" autoComplete="new-password" value={form.password} invalid={!!errors.password} onChange={set('password')} />
        </Field>
        <Field label="Confirm password" htmlFor="su-confirm" error={errors.confirm} required>
          <Input
            id="su-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            invalid={!!errors.confirm}
            onChange={(e) => {
              setConfirm(e.target.value)
              setErrors({ ...errors, confirm: undefined })
            }}
          />
        </Field>
        {error && (
          <p className="flex items-start gap-2 rounded-md bg-bad-soft px-3 py-2.5 text-[13px] text-bad" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
          </p>
        )}
        <Button type="submit" variant="primary" className="mt-1 h-10" disabled={busy}>
          {busy ? 'Sending code' : 'Continue'}
        </Button>
      </form>
    </>
  )
}
