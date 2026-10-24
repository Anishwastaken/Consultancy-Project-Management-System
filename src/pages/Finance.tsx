import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleDashed, Download, Plus, Receipt, ShieldCheck, XCircle } from 'lucide-react'
import type { FinanceTransaction, TransactionType } from '../data/types'
import { BudgetBar } from '../components/domain'
import { Badge, Button, Dialog, Field, Input, Notice, PageHeader, Panel, SearchInput, Segmented, Select, Textarea, td, th, trHover, useToast } from '../components/ui'
import { cx, fmtDate, inr, inrShort, nextId, todayISO } from '../lib/format'
import { Link, navigate, useRoute } from '../lib/router'
import { can, financeChecks, projectFinance, type Check, type TxnInput } from '../store/rules'
import { useLookup, useStore } from '../store/store'
import { LedgerTable } from './Projects'

export function downloadCSV(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function Finance() {
  const { db, user } = useStore()
  const L = useLookup()
  const { query } = useRoute()
  const [recordOpen, setRecordOpen] = useState(false)
  const [type, setType] = useState<'All' | TransactionType>('All')
  const [q, setQ] = useState('')
  const recorder = can(db, user, 'finance.record')

  useEffect(() => {
    if (query.get('record') && recorder) setRecordOpen(true)
  }, [query, recorder])

  const rows = db.projects.map((p) => ({ p, f: projectFinance(db, p.id) }))
  const live = rows.filter((r) => r.p.status !== 'Cancelled')
  const totals = {
    budget: live.reduce((s, r) => s + (r.f.budget ?? 0), 0),
    invoiced: live.reduce((s, r) => s + r.f.invoiced, 0),
    received: live.reduce((s, r) => s + r.f.received, 0),
    outstanding: live.reduce((s, r) => s + r.f.outstanding, 0),
  }

  const ledger = useMemo(() => {
    const n = q.trim().toLowerCase()
    return [...db.transactions]
      .filter((t) => type === 'All' || t.type === type)
      .filter((t) => !n || [t.id, t.reference, t.projectId, L.project(t.projectId)?.title ?? ''].some((s) => s.toLowerCase().includes(n)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  }, [db.transactions, type, q, L])

  const close = () => {
    setRecordOpen(false)
    if (query.get('record')) navigate('/finance')
  }

  return (
    <>
      <PageHeader
        title="Finance"
        description="Budgets, invoices and payments for every project. Transactions are accepted only for projects with a finalized agreement and an approved budget."
        actions={
          <>
            <Button
              icon={Download}
              onClick={() =>
                downloadCSV(
                  'cpts-finance-ledger.csv',
                  [['Transaction', 'Type', 'Project', 'Reference', 'Date', 'Amount (INR)', 'Recorded by']].concat(
                    ledger.map((t) => [t.id, t.type, t.projectId, t.reference, t.date, String(t.amount), L.user(t.recordedBy)?.name ?? '']),
                  ),
                )
              }
            >
              Export CSV
            </Button>
            {recorder && (
              <Button variant="primary" icon={Plus} onClick={() => setRecordOpen(true)}>
                Record transaction
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Totals" className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {[
          ['Approved budget', totals.budget, 'Active and completed projects'],
          ['Invoiced', totals.invoiced, `${Math.round((totals.invoiced / (totals.budget || 1)) * 100)}% of budget`],
          ['Received', totals.received, `${Math.round((totals.received / (totals.invoiced || 1)) * 100)}% of invoiced`],
          ['Awaiting payment', totals.outstanding, `${live.reduce((s, r) => s + r.f.invoices.filter((i) => i.outstanding > 0).length, 0)} open invoices`],
        ].map(([label, value, note]) => (
          <div key={label as string} className="bg-surface px-5 py-4">
            <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
            <p className="num mt-2 text-[24px] leading-none font-bold tracking-[-0.02em]">{inrShort(value as number)}</p>
            <p className="mt-1.5 text-[12.5px] text-ink-3">{note}</p>
          </div>
        ))}
      </section>

      <Panel title="Project finances" description="FR-027 finance status per project" className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-sunken">
              <tr>
                <th className={th}>Project</th>
                <th className={cx(th, 'text-right')}>Budget</th>
                <th className={cx(th, 'text-right')}>Invoiced</th>
                <th className={cx(th, 'text-right')}>Received</th>
                <th className={th}>Utilisation</th>
                <th className={th}>Can record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, f }) => (
                <tr key={p.id} className={cx(trHover, 'cursor-pointer')} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td className={td}>
                    <span className="block max-w-[280px] truncate font-semibold">{p.title}</span>
                    <span className="text-[12.5px] text-ink-3">
                      <span className="num">{p.id}</span> · {L.client(p.clientId)?.name}
                    </span>
                  </td>
                  <td className={cx(td, 'num text-right')}>{f.budget !== null ? inr(f.budget) : '—'}</td>
                  <td className={cx(td, 'num text-right text-ink-2')}>{inr(f.invoiced)}</td>
                  <td className={cx(td, 'num text-right text-ink-2')}>{inr(f.received)}</td>
                  <td className={cx(td, 'w-[180px]')}>
                    <BudgetBar budget={f.budget} invoiced={f.invoiced} received={f.received} compact />
                  </td>
                  <td className={td}>
                    {p.status === 'Cancelled' ? (
                      <Badge tone="bad">Cancelled</Badge>
                    ) : p.status === 'Completed' ? (
                      <Badge tone="brand">Completed</Badge>
                    ) : f.budget === null ? (
                      <Badge tone="warn">Budget needed</Badge>
                    ) : (
                      <Badge tone="ok">Ready</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Ledger" description="All finance records (FR-028)" bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            label="Transaction type"
            value={type}
            onChange={setType}
            options={(['All', 'Budget', 'Invoice', 'Payment'] as const).map((t) => ({ value: t, label: t === 'All' ? 'All' : `${t}s`, count: t === 'All' ? db.transactions.length : db.transactions.filter((x) => x.type === t).length }))}
          />
          <SearchInput value={q} onChange={setQ} placeholder="Search ID, reference or project" className="sm:w-72" />
        </div>
        <LedgerTable txns={ledger} showProject />
      </Panel>

      {recorder && <RecordTransactionDialog open={recordOpen} onClose={close} initialProject={query.get('project') ?? ''} />}
    </>
  )
}

/* ================================================== UC-010 dialog === */

function RecordTransactionDialog({ open, onClose, initialProject }: { open: boolean; onClose: () => void; initialProject: string }) {
  const { db, user, actions } = useStore()
  const L = useLookup()
  const toast = useToast()
  const blank: TxnInput = { projectId: '', type: 'Payment', amount: 0, date: todayISO(), reference: '', invoiceId: '', note: '' }
  const [input, setInput] = useState<TxnInput>(blank)
  const [amountText, setAmountText] = useState('')
  const [done, setDone] = useState<FinanceTransaction | null>(null)
  const [attempted, setAttempted] = useState(false)

  useEffect(() => {
    if (open) {
      setInput({ ...blank, projectId: initialProject })
      setAmountText('')
      setDone(null)
      setAttempted(false)
    }
  }, [open, initialProject])

  const project = L.project(input.projectId)
  const fin = project ? projectFinance(db, project.id) : null
  const checks = financeChecks(db, user, input)
  const openInvoices = fin?.invoices.filter((i) => i.outstanding > 0) ?? []
  const detailsMissing = !input.projectId || !input.amount || !input.reference.trim() || !input.date || (input.type === 'Payment' && !input.invoiceId)

  const set = (patch: Partial<TxnInput>) => setInput((s) => ({ ...s, ...patch }))

  const changeType = (t: TransactionType) => {
    const patch: Partial<TxnInput> = { type: t, invoiceId: '', reference: '' }
    if (t === 'Invoice') patch.reference = suggestInvoiceRef()
    if (t === 'Budget' && project) {
      patch.reference = `BUD/${todayISO().slice(0, 4)}/${project.id.slice(2)}`
      const v = L.agreement(project.agreementId)?.value ?? 0
      patch.amount = v
      setAmountText(String(v))
    }
    set(patch)
  }

  const suggestInvoiceRef = () => {
    const nums = db.transactions.filter((t) => t.type === 'Invoice').map((t) => 'I' + t.reference.split('/').pop())
    return `INV/${todayISO().slice(0, 4)}/${nextId(nums, 'I').slice(1)}`
  }

  const submit = () => {
    setAttempted(true)
    if (detailsMissing) return
    const r = actions.recordTransaction(input)
    if (!r.ok) return toast({ tone: 'bad', title: 'Transaction rejected', body: r.error })
    setDone(r.txn)
    toast({ tone: 'ok', title: `${r.txn.type} recorded`, body: `${r.txn.id} · ${inr(r.txn.amount)}` })
  }

  const verb = input.type === 'Budget' ? 'Record budget' : input.type === 'Invoice' ? 'Record invoice' : 'Record payment'

  if (done) {
    const f = projectFinance(db, done.projectId)
    const inv = done.invoiceId ? db.transactions.find((t) => t.id === done.invoiceId) : undefined
    return (
      <Dialog
        open={open}
        onClose={onClose}
        size="sm"
        title={`${done.type} recorded`}
        footer={
          <>
            <Button
              onClick={() => {
                setDone(null)
                setAttempted(false)
                setInput({ ...blank, projectId: done.projectId })
                setAmountText('')
              }}
            >
              Record another
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
            <CheckCircle2 size={24} />
          </span>
          <p className="num mt-3 text-[28px] font-bold tracking-[-0.02em]">{inr(done.amount)}</p>
          <p className="text-sm text-ink-2">
            <span className="num font-semibold">{done.id}</span> · {done.reference}
          </p>
        </div>
        <dl className="mt-5 divide-y divide-line rounded-md border border-line text-[13px]">
          {[
            ['Project', `${done.projectId} · ${L.project(done.projectId)?.title}`],
            ...(inv ? [['Settles invoice', inv.reference]] : []),
            ['Date', fmtDate(done.date)],
            ['Project received to date', `${inr(f.received)} of ${inr(f.budget ?? 0)}`],
            ['Available balance', inr(f.available)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-3.5 py-2.5">
              <dt className="text-ink-3">{k}</dt>
              <dd className="num text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12.5px] text-ink-3">Logged to the audit trail and confirmed by in-app notification. No money moves in CPTS; payments are recorded after they are received.</p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Record transaction"
      description="UC-010. Each check must pass before the record is created."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Receipt} onClick={submit}>
            {verb}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex flex-col gap-4">
          <Field label="Project" required htmlFor="tx-project" error={attempted && !input.projectId ? 'Select a project.' : undefined}>
            <Select id="tx-project" value={input.projectId} invalid={attempted && !input.projectId} onChange={(e) => set({ projectId: e.target.value, invoiceId: '' })}>
              <option value="">Select a project</option>
              {db.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} · {p.title}
                  {p.status !== 'Active' ? ` (${p.status})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          {fin && project && (
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-[12.5px]">
              {[
                ['Budget', fin.budget !== null ? inrShort(fin.budget) : 'Not set'],
                ['Invoiced', inrShort(fin.invoiced)],
                ['Received', inrShort(fin.received)],
              ].map(([k, v]) => (
                <div key={k} className="bg-sunken px-3 py-2">
                  <p className="text-ink-3">{k}</p>
                  <p className="num font-semibold text-ink">{v}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Transaction type</p>
            <Segmented
              label="Transaction type"
              value={input.type}
              onChange={changeType}
              options={[
                { value: 'Budget', label: 'Budget' },
                { value: 'Invoice', label: 'Invoice' },
                { value: 'Payment', label: 'Payment' },
              ]}
            />
          </div>

          {input.type === 'Payment' && (
            <Field label="Invoice being paid" required htmlFor="tx-invoice" error={attempted && !input.invoiceId ? 'Select the invoice this payment settles.' : undefined} hint={project && openInvoices.length === 0 ? 'This project has no unpaid invoices.' : undefined}>
              <Select
                id="tx-invoice"
                value={input.invoiceId}
                invalid={attempted && !input.invoiceId}
                onChange={(e) => {
                  const inv = openInvoices.find((i) => i.txn.id === e.target.value)
                  set({ invoiceId: e.target.value, amount: inv?.outstanding ?? input.amount })
                  if (inv) setAmountText(String(inv.outstanding))
                }}
              >
                <option value="">{project ? 'Select an invoice' : 'Select a project first'}</option>
                {fin?.invoices.map((i) => (
                  <option key={i.txn.id} value={i.txn.id}>
                    {i.txn.reference} · {inr(i.txn.amount)} · {i.outstanding > 0 ? `${inr(i.outstanding)} outstanding` : 'paid'}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)" required htmlFor="tx-amount" error={attempted && !input.amount ? 'Enter an amount greater than zero.' : undefined} hint={input.amount ? inr(input.amount) : undefined}>
              <Input
                id="tx-amount"
                type="number"
                inputMode="numeric"
                min={0}
                className="num"
                value={amountText}
                invalid={attempted && !input.amount}
                onChange={(e) => {
                  setAmountText(e.target.value)
                  set({ amount: Number(e.target.value) || 0 })
                }}
              />
            </Field>
            <Field label="Date" required htmlFor="tx-date">
              <Input id="tx-date" type="date" value={input.date} onChange={(e) => set({ date: e.target.value })} />
            </Field>
          </div>
          <Field
            label={input.type === 'Payment' ? 'Payment reference (UTR / cheque no.)' : input.type === 'Invoice' ? 'Invoice number' : 'Budget reference'}
            required
            htmlFor="tx-ref"
            error={attempted && !input.reference.trim() ? 'Enter a reference so the record can be traced.' : undefined}
          >
            <Input id="tx-ref" className="num" value={input.reference} invalid={attempted && !input.reference.trim()} onChange={(e) => set({ reference: e.target.value })} placeholder={input.type === 'Payment' ? 'UTR HDFC26102412345' : input.type === 'Invoice' ? 'INV/2026/019' : 'BUD/2026/032'} />
          </Field>
          <Field label="Note" htmlFor="tx-note">
            <Textarea id="tx-note" className="min-h-[60px]" value={input.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" />
          </Field>
        </div>

        {/* State Diagram 02 — Validating: four sequential checks */}
        <aside aria-live="polite">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
            <ShieldCheck size={15} className="text-brand" aria-hidden /> Validation
          </p>
          <ol className="flex flex-col gap-2">
            {checks.map((c, i) => (
              <CheckRow key={c.id} check={c} index={i} />
            ))}
          </ol>
          {checks.every((c) => c.state === 'pass') && (
            <div className="mt-3">
              <Notice tone="ok" icon={CheckCircle2}>
                Ready to record.
              </Notice>
            </div>
          )}
          {project?.status === 'Cancelled' && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              Try another project, or see{' '}
              <Link to={`/projects/${project.id}`} className="text-brand underline" onClick={onClose}>
                why {project.id} was cancelled
              </Link>
              .
            </p>
          )}
        </aside>
      </div>
    </Dialog>
  )
}

function CheckRow({ check, index }: { check: Check; index: number }) {
  const Icon = check.state === 'pass' ? CheckCircle2 : check.state === 'fail' ? XCircle : CircleDashed
  return (
    <li className={cx('rounded-md border px-3 py-2.5', check.state === 'fail' ? 'border-bad/30 bg-bad-soft' : check.state === 'pass' ? 'border-ok/25 bg-ok-soft/60' : 'border-line bg-sunken')}>
      <div className="flex items-start gap-2">
        <Icon size={16} className={cx('mt-0.5 shrink-0', check.state === 'pass' ? 'text-ok' : check.state === 'fail' ? 'text-bad' : 'text-ink-3')} aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">
            <span className="num text-ink-3">{index + 1}.</span> {check.label}
          </p>
          <p className="text-[12px] text-ink-3">{check.rule}</p>
          {check.message && <p className={cx('mt-1 text-[12.5px]', check.state === 'fail' ? 'font-medium text-bad' : 'text-ink-2')}>{check.message}</p>}
          {check.state === 'pending' && <p className="mt-1 text-[12.5px] text-ink-3">Waiting for details</p>}
        </div>
      </div>
    </li>
  )
}

