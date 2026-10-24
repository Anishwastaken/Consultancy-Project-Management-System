import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { DB, Proposal } from '../data/types'
import { cx, fmtDate, inr, inrShort } from '../lib/format'
import { LIFECYCLE, lifecycleIndex } from '../store/rules'

/* ------------------------------------------------- Proposal lifecycle -- */
// Lab 2, Section 17: Draft → Submitted → Under Review → Approved/Rejected →
// Agreement → Active → Completed. A genuine sequence, so it is numbered.

export function LifecycleRail({ db, proposal }: { db: DB; proposal: Proposal }) {
  const idx = lifecycleIndex(db, proposal)
  const rejected = proposal.status === 'Rejected'
  const withdrawn = proposal.status === 'Withdrawn'
  const labels: Record<string, string> = { Decision: rejected ? 'Rejected' : 'Approved', 'Under Review': 'Under review' }
  return (
    <ol className="flex w-full items-start overflow-x-auto pb-1" aria-label="Proposal lifecycle">
      {LIFECYCLE.map((stage, i) => {
        const done = !withdrawn && i < idx
        const current = !withdrawn && i === idx
        const failed = rejected && stage === 'Decision'
        const state = failed ? 'failed' : done ? 'done' : current ? 'current' : 'todo'
        return (
          <li key={stage} className="flex min-w-[92px] flex-1 flex-col items-start" aria-current={current ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <span
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full border-2 text-[12px] font-bold',
                  state === 'done' && 'border-brand bg-brand text-white',
                  state === 'current' && 'border-brand bg-surface text-brand ring-4 ring-brand/12',
                  state === 'failed' && 'border-bad bg-bad text-white',
                  state === 'todo' && 'border-line-2 bg-surface text-ink-3',
                )}
              >
                {state === 'done' ? <Check size={14} strokeWidth={3} /> : state === 'failed' ? <X size={14} strokeWidth={3} /> : i + 1}
              </span>
              {i < LIFECYCLE.length - 1 && <span className={cx('mx-1.5 h-0.5 flex-1 rounded', done && !failed ? 'bg-brand' : 'bg-line-2')} />}
            </div>
            <span className={cx('mt-2 pr-2 text-[12.5px] font-semibold', state === 'todo' ? 'text-ink-3' : state === 'failed' ? 'text-bad' : 'text-ink')}>{labels[stage] ?? stage}</span>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------------------------------------------------------- The stamp -- */

export function Stamp({ decision, date, by, animate }: { decision: 'Approved' | 'Rejected'; date: string; by: string; animate?: boolean }) {
  return (
    <div className={cx('stamp select-none', animate && 'stamp-in', decision === 'Approved' ? 'text-ok' : 'text-bad')} aria-label={`${decision} on ${fmtDate(date)} by ${by}`}>
      <span className="text-[19px] leading-none">{decision}</span>
      <span className="num text-[10px] leading-none tracking-[0.08em]">
        {fmtDate(date)} · {by.replace(/^(Dr\.|Prof\.)\s+/, '').split(' ').map((w) => w[0]).join('')}
      </span>
    </div>
  )
}

/* -------------------------------------------------------- Bar chart ----- */
// Single series → one hue, no legend; values on hover; a hidden table for
// screen readers.

export function MonthlyBars({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)
  const nice = Math.ceil(max / 100000) * 100000 || 100000
  const ticks = [0, nice / 2, nice]
  const W = 560
  const H = 200
  const padL = 44
  const padB = 26
  const innerH = H - padB - 8
  const bw = (W - padL) / data.length
  const barW = Math.min(36, bw * 0.5)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((t) => {
          const y = 8 + innerH - (t / nice) * innerH
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="var(--color-line)" strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="num fill-ink-3 text-[11px]">
                {t === 0 ? '0' : `${(t / 100000).toFixed(t % 100000 ? 1 : 0)} L`}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = (d.value / nice) * innerH
          const x = padL + i * bw + (bw - barW) / 2
          const y = 8 + innerH - h
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={8} width={bw} height={innerH} fill="transparent" />
              {d.value > 0 && <path d={`M${x},${8 + innerH} V${y + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${8 + innerH} Z`} fill={hover === null || hover === i ? 'var(--color-brand)' : '#9fb0db'} className="transition-colors" />}
              <text x={padL + i * bw + bw / 2} y={H - 8} textAnchor="middle" className={cx('text-[11.5px]', hover === i ? 'fill-ink font-semibold' : 'fill-ink-3')}>
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] shadow-pop"
          style={{ left: `${((padL + hover * bw + bw / 2) / W) * 100}%`, top: 0 }}
        >
          <span className="text-ink-3">{data[hover].label}</span> <span className="num font-semibold text-ink">{inr(data[hover].value)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th>{d.label}</th>
              <td>{inr(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------- Budget utilisation -- */
// Track = approved budget; light fill = invoiced; dark fill = received.

export function BudgetBar({ budget, invoiced, received, compact }: { budget: number | null; invoiced: number; received: number; compact?: boolean }) {
  if (!budget) return <span className="text-[12.5px] text-ink-3">Budget not recorded</span>
  const pi = Math.min(100, (invoiced / budget) * 100)
  const pr = Math.min(100, (received / budget) * 100)
  return (
    <div className="min-w-[140px]" title={`Received ${inr(received)} · Invoiced ${inr(invoiced)} · Budget ${inr(budget)}`}>
      <div className={cx('relative overflow-hidden rounded-full bg-ink/[0.07]', compact ? 'h-1.5' : 'h-2.5')}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-[#a9b8e0]" style={{ width: `${pi}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${pr}%` }} />
      </div>
      {!compact && (
        <div className="num mt-1.5 flex justify-between text-[12px] text-ink-3">
          <span>
            <span className="font-semibold text-ink">{inrShort(received)}</span> received
          </span>
          <span>of {inrShort(budget)}</span>
        </div>
      )}
    </div>
  )
}

export function BudgetLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-brand" /> Received
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-[#a9b8e0]" /> Invoiced
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-ink/[0.07]" /> Approved budget
      </span>
    </div>
  )
}

/* ------------------------------------------------- Horizontal bars ------ */

export function HBars({ data, format = inrShort }: { data: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink-2">{d.label}</span>
            <span className="num shrink-0 font-semibold text-ink">{format(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-ink/[0.06]">
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
