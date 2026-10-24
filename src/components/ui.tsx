import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, Info, Search, X, type LucideIcon } from 'lucide-react'
import { cx, initials } from '../lib/format'
import { Link } from '../lib/router'

/* ---------------------------------------------------------------- Button -- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)]',
  secondary: 'bg-surface text-ink border border-line-2 hover:bg-sunken hover:border-ink-3/40',
  ghost: 'text-ink-2 hover:bg-ink/5 hover:text-ink',
  danger: 'bg-bad text-white hover:bg-[#962019]',
  success: 'bg-ok text-white hover:bg-[#19663b]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-9 px-3.5 text-sm' : 'h-8 px-2.5 text-[13px]',
        variants[variant],
        className,
      )}
    >
      {Icon && <Icon size={size === 'md' ? 16 : 15} strokeWidth={2} aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink({ to, variant = 'secondary', icon: Icon, children, className }: { to: string; variant?: Variant; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={cx('inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors', variants[variant], className)}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </Link>
  )
}

/* ---------------------------------------------------------------- Status -- */

const tone = {
  neutral: 'bg-ink/[0.06] text-ink-2',
  info: 'bg-info-soft text-info',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  bad: 'bg-bad-soft text-bad',
  teal: 'bg-teal-soft text-teal',
  brand: 'bg-brand-soft text-brand',
}
export type Tone = keyof typeof tone

const statusTone: Record<string, Tone> = {
  Draft: 'neutral',
  Submitted: 'info',
  'Under Review': 'warn',
  Approved: 'ok',
  Rejected: 'bad',
  Withdrawn: 'neutral',
  Active: 'teal',
  Completed: 'brand',
  Cancelled: 'bad',
  Finalized: 'ok',
  Pending: 'neutral',
  Accepted: 'ok',
  'Revision requested': 'bad',
  Inactive: 'neutral',
  Budget: 'brand',
  Invoice: 'warn',
  Payment: 'ok',
  Overdue: 'bad',
  Upcoming: 'neutral',
  Done: 'ok',
  Unread: 'info',
  Read: 'neutral',
}

export function Badge({ children, tone: t = 'neutral', dot = true, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap', tone[t], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={statusTone[status] ?? 'neutral'} className={className}>
      {status}
    </Badge>
  )
}

/* ----------------------------------------------------------------- Panel -- */

export function Panel({ title, description, action, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('rounded-lg border border-line bg-surface', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cx(bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  )
}

export function PageHeader({ title, description, actions, back, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { to: string; label: string }; meta?: ReactNode }) {
  return (
    <div className="mb-6">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-3 hover:text-ink">
          <ChevronLeft size={15} aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h1>
          {description && <p className="mt-1.5 max-w-[68ch] text-[14px] text-ink-2">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Forms -- */

const control =
  'w-full rounded-md border border-line-2 bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-ink-3/50 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 disabled:bg-sunken disabled:text-ink-3 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-bad/15'

export function Field({ label, hint, error, required, children, className, htmlFor }: { label: string; hint?: ReactNode; error?: string; required?: boolean; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-1 text-[13px] font-semibold text-ink">
        {label}
        {required && <span className="text-bad" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-[12.5px] font-medium text-bad" role="alert">
          <AlertCircle size={13} aria-hidden /> {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[12.5px] text-ink-3">{hint}</p>
      )}
    </div>
  )
}

export function Input({ className, invalid, ...p }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input {...p} aria-invalid={invalid || undefined} className={cx(control, 'h-9', className)} />
}
export function Textarea({ className, invalid, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea {...p} aria-invalid={invalid || undefined} className={cx(control, 'min-h-[84px] py-2 leading-relaxed', className)} />
}
export function Select({ className, invalid, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select {...p} aria-invalid={invalid || undefined} className={cx(control, 'h-9 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2716%27%20height=%2716%27%20fill=%27none%27%20stroke=%27%23737d8c%27%20stroke-width=%272%27%3E%3Cpath%20d=%27m4%206%204%204%204-4%27/%3E%3C/svg%3E")] bg-[position:right_10px_center] bg-no-repeat pr-9', className)}>
      {children}
    </select>
  )
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cx(control, 'h-9 pl-9')} />
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-3 hover:text-ink" aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/** Segmented filter */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-ink/[0.05] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(23_32_48/0.12)]' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cx('num text-[11.5px]', value === o.value ? 'text-ink-3' : 'text-ink-3/80')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            '-mb-px inline-flex items-center gap-2 border-b-2 pt-1 pb-3 text-sm font-medium whitespace-nowrap transition-colors',
            value === t.value ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="num rounded-full bg-ink/[0.06] px-1.5 text-[11.5px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Dialog -- */

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])')?.focus(), 30)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'dialog-in flex max-h-[92vh] w-full flex-col rounded-t-xl bg-surface shadow-pop sm:rounded-xl',
          size === 'sm' ? 'sm:max-w-md' : size === 'md' ? 'sm:max-w-xl' : 'sm:max-w-3xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 id={titleId} className="text-[17px] font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-[13px] text-ink-2">{description}</p>}
          </div>
          <button type="button" data-close onClick={onClose} className="-mr-2 rounded-md p-1.5 text-ink-3 hover:bg-ink/5 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken px-6 py-3.5 sm:rounded-b-xl">{footer}</div>}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- Toast -- */

type ToastT = { id: number; tone: 'ok' | 'bad' | 'info'; title: string; body?: string }
const ToastCtx = createContext<(t: Omit<ToastT, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([])
  const push = useCallback((t: Omit<ToastT, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s.slice(-2), { ...t, id }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 5200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto" aria-live="polite">
        {items.map((t) => {
          const Icon = t.tone === 'ok' ? CheckCircle2 : t.tone === 'bad' ? AlertCircle : Info
          return (
            <div key={t.id} className="toast-in pointer-events-auto flex w-full max-w-sm gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-pop">
              <Icon size={18} className={cx('mt-0.5 shrink-0', t.tone === 'ok' ? 'text-ok' : t.tone === 'bad' ? 'text-bad' : 'text-info')} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>}
              </div>
              <button type="button" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="self-start rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Dismiss">
                <X size={15} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

/* ------------------------------------------------------------------ Misc -- */

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-ink/[0.05] text-ink-3">
        <Icon size={20} aria-hidden />
      </div>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const avatarHues = ['#23408e', '#0f6b63', '#7a4b9a', '#9a5b13', '#2f6d9e', '#8a3f3a', '#4b6a2b']
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const hue = avatarHues[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % avatarHues.length]
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: hue }} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function Dl({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-4', cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3')}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[12.5px] text-ink-3">{i.label}</dt>
          <dd className="mt-0.5 text-sm text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export const th = 'px-4 py-2.5 text-left text-[12.5px] font-semibold text-ink-3 whitespace-nowrap'
export const td = 'px-4 py-3 text-sm text-ink align-middle'
export const trHover = 'border-t border-line transition-colors hover:bg-sunken'

export function Notice({ tone: t = 'info', icon: Icon = Info, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; icon?: LucideIcon; children: ReactNode }) {
  const styles = { info: 'bg-info-soft text-info', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', ok: 'bg-ok-soft text-ok' }
  return (
    <div className={cx('flex gap-2.5 rounded-md px-3.5 py-3 text-[13px] leading-relaxed', styles[t])}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 text-ink-2 [&_strong]:text-ink">{children}</div>
    </div>
  )
}
