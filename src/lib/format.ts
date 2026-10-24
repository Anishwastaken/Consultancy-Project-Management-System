const inrFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

export const inr = (n: number) => inrFormatter.format(n)

/** Indian short form: ₹6.00 L, ₹1.25 Cr */
export function inrShort(n: number) {
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`
  return inr(n)
}

export function fmtDate(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return `${fmtDate(iso)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function todayISO() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function nowISO() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${todayISO()}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Whole days from today to the given date (negative = past). */
export function daysFromToday(iso: string) {
  const a = new Date(todayISO() + 'T00:00:00').getTime()
  const b = new Date(iso.slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  const days = Math.floor(diff / 86400)
  if (days < 7) return `${days} d ago`
  return fmtDate(iso)
}

export function dueLabel(iso: string) {
  const d = daysFromToday(iso)
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  if (d > 1) return `Due in ${d} days`
  return `${-d} day${d === -1 ? '' : 's'} overdue`
}

export function initials(name: string) {
  return name
    .replace(/^(Dr\.|Prof\.)\s+/, '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Next sequential id for a prefix, e.g. nextId(['P049','P050'], 'P') → 'P051' */
export function nextId(ids: string[], prefix: string, width = 3) {
  const max = ids.reduce((m, id) => {
    if (!id.startsWith(prefix)) return m
    const n = parseInt(id.slice(prefix.length), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return prefix + String(max + 1).padStart(width, '0')
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
