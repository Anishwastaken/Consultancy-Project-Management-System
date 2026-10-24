import { useEffect, useMemo, useState } from 'react'
import { Ban, CalendarCheck2, CheckCircle2, Circle, FolderKanban, FolderSearch, Plus, Wallet } from 'lucide-react'
import type { DeliverableStatus, ProjectStatus } from '../data/types'
import { BudgetBar, BudgetLegend } from '../components/domain'
import { Avatar, Badge, Button, ButtonLink, Dialog, Dl, EmptyState, Field, Input, Notice, PageHeader, Panel, SearchInput, Segmented, Select, StatusBadge, Tabs, Textarea, td, th, trHover, useToast } from '../components/ui'
import { cx, daysFromToday, dueLabel, fmtDate, inr, todayISO } from '../lib/format'
import { Link, navigate, useRoute } from '../lib/router'
import { can, projectFinance } from '../store/rules'
import { visibleProjects } from '../store/scope'
import { useLookup, useStore } from '../store/store'

type Filter = 'All' | ProjectStatus

export function ProjectList() {
  const { db, user } = useStore()
  const L = useLookup()
  const { query } = useRoute()
  const all = visibleProjects(db, user!)
  const [status, setStatus] = useState<Filter>((query.get('status') as Filter) || 'All')
  const [q, setQ] = useState('')
  const [consultant, setConsultant] = useState('')
  const [client, setClient] = useState('')
  useEffect(() => setStatus((query.get('status') as Filter) || 'All'), [query])

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return all
      .filter((p) => status === 'All' || p.status === status)
      .filter((p) => !consultant || p.consultantId === consultant)
      .filter((p) => !client || p.clientId === client)
      .filter((p) => !n || [p.id, p.title, L.client(p.clientId)?.name ?? ''].some((s) => s.toLowerCase().includes(n)))
  }, [all, status, consultant, client, q, L])

  return (
    <>
      <PageHeader title={user!.roleId === 'faculty' ? 'My projects' : 'Projects'} description="Active and closed consultancy projects created from finalized agreements." />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <Segmented
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={(['All', 'Active', 'Completed', 'Cancelled'] as Filter[]).map((s) => ({ value: s, label: s, count: s === 'All' ? all.length : all.filter((p) => p.status === s).length }))}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput value={q} onChange={setQ} placeholder="Search by title, client or ID" className="sm:max-w-xs sm:flex-1" />
            <Select value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client" className="sm:w-56">
              <option value="">All clients</option>
              {[...new Set(all.map((p) => p.clientId))].map((id) => (
                <option key={id} value={id}>
                  {L.client(id)?.name}
                </option>
              ))}
            </Select>
            {user!.roleId !== 'faculty' && (
              <Select value={consultant} onChange={(e) => setConsultant(e.target.value)} aria-label="Consultant" className="sm:w-52">
                <option value="">All consultants</option>
                {[...new Set(all.map((p) => p.consultantId))].map((id) => (
                  <option key={id} value={id}>
                    {L.user(id)?.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={FolderSearch} title="No projects match these filters" body="Projects are created when an agreement is finalized." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>Project</th>
                  <th className={th}>Consultant</th>
                  <th className={th}>Period</th>
                  <th className={th}>Finance</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const f = projectFinance(db, p.id)
                  return (
                    <tr key={p.id} className={cx(trHover, 'cursor-pointer')} onClick={() => navigate(`/projects/${p.id}`)}>
                      <td className={td}>
                        <Link to={`/projects/${p.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[320px] truncate font-semibold hover:text-brand">
                          {p.title}
                        </Link>
                        <span className="text-[12.5px] text-ink-3">
                          <span className="num">{p.id}</span> for {L.client(p.clientId)?.name}
                        </span>
                      </td>
                      <td className={td}>
                        <span className="flex items-center gap-2 text-ink-2">
                          <Avatar name={L.user(p.consultantId)?.name ?? ''} size={22} />
                          {L.user(p.consultantId)?.name}
                        </span>
                      </td>
                      <td className={cx(td, 'num whitespace-nowrap text-ink-2')}>
                        {fmtDate(p.startDate)} – {fmtDate(p.endDate)}
                      </td>
                      <td className={cx(td, 'w-[220px]')}>
                        <BudgetBar budget={f.budget} invoiced={f.invoiced} received={f.received} />
                      </td>
                      <td className={td}>
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}

/* ================================================================ Detail === */

type Tab = 'overview' | 'timeline' | 'finance'

export function ProjectDetail({ id }: { id: string }) {
  const { db, user, actions } = useStore()
  const L = useLookup()
  const toast = useToast()
  const u = user!
  const p = db.projects.find((x) => x.id === id)
  const [tab, setTab] = useState<Tab>('overview')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [delOpen, setDelOpen] = useState(false)

  if (!p || !visibleProjects(db, u).some((x) => x.id === id)) {
    return (
      <Panel>
        <EmptyState icon={FolderSearch} title="Project not found" body="It may not exist, or it belongs to another consultant." action={<ButtonLink to="/projects">Back to projects</ButtonLink>} />
      </Panel>
    )
  }

  const f = projectFinance(db, p.id)
  const ms = db.milestones.filter((m) => m.projectId === p.id).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
  const dels = db.deliverables.filter((d) => d.projectId === p.id)
  const agreement = L.agreement(p.agreementId)
  const isConsultant = p.consultantId === u.id
  const canCancel = p.status === 'Active' && can(db, u, 'project.cancel') && (u.roleId === 'admin' || isConsultant)
  const seesFinance = ['finance', 'admin', 'management', 'approver'].includes(u.roleId) || isConsultant
  const accepted = dels.filter((d) => d.status === 'Accepted').length
  const txns = db.transactions.filter((t) => t.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  const cancel = () => {
    if (!reason.trim()) return setReasonError('Give a reason. It is sent to everyone affected.')
    const r = actions.cancelProject(p.id, reason)
    if (!r.ok) return toast({ tone: 'bad', title: 'Project not cancelled', body: r.error })
    setCancelOpen(false)
    toast({ tone: 'ok', title: `${p.id} cancelled`, body: 'The team, approvers and accounts have been notified. No new transactions can be recorded.' })
  }

  return (
    <>
      <PageHeader
        back={{ to: '/projects', label: 'Projects' }}
        title={p.title}
        meta={
          <>
            <StatusBadge status={p.status} />
            <span className="num text-[13px] text-ink-3">{p.id}</span>
            <span className="text-[13px] text-ink-3">for</span>
            <span className="text-[13px] font-medium text-ink-2">{L.client(p.clientId)?.name}</span>
          </>
        }
        actions={
          <>
            {canCancel && (
              <Button icon={Ban} onClick={() => setCancelOpen(true)} className="!text-bad">
                Cancel project
              </Button>
            )}
            {can(db, u, 'finance.record') && p.status === 'Active' && (
              <ButtonLink to={`/finance?record=1&project=${p.id}`} variant="primary" icon={Wallet}>
                Record transaction
              </ButtonLink>
            )}
            {isConsultant && p.status === 'Active' && (
              <Button variant="primary" icon={Plus} onClick={() => setDelOpen(true)}>
                Record deliverable
              </Button>
            )}
          </>
        }
      />

      {p.status === 'Cancelled' && (
        <div className="mb-6">
          <Notice tone="bad" icon={Ban}>
            <strong>This project was cancelled.</strong> {p.cancelReason} Cancelled projects can’t accept new financial transactions (BR-010).
          </Notice>
        </div>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'timeline', label: 'Timeline and deliverables', count: dels.length },
          ...(seesFinance ? [{ value: 'finance' as Tab, label: 'Finance', count: txns.length }] : []),
        ]}
      />

      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Panel title="Project details">
              <Dl
                items={[
                  { label: 'Client', value: L.client(p.clientId)?.name },
                  { label: 'Lead consultant', value: <span className="flex items-center gap-2"><Avatar name={L.user(p.consultantId)?.name ?? ''} size={22} />{L.user(p.consultantId)?.name}</span> },
                  { label: 'Period', value: <span className="num">{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</span> },
                  { label: 'Ends', value: p.status === 'Active' ? dueLabel(p.endDate).replace('Due', 'Ends') : '—' },
                  { label: 'Proposal', value: <Link to={`/proposals/${p.proposalId}`} className="text-brand hover:underline"><span className="num">{p.proposalId}</span> {L.proposal(p.proposalId)?.title}</Link> },
                  { label: 'Agreement', value: <Link to="/agreements" className="num text-brand hover:underline">{agreement?.reference}</Link> },
                ]}
              />
              <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line">
                <div className="bg-surface p-4">
                  <p className="text-[12.5px] text-ink-3">Milestones completed</p>
                  <p className="num mt-1 text-[22px] font-bold">
                    {ms.filter((m) => m.completionDate).length}
                    <span className="text-[15px] font-medium text-ink-3"> / {ms.length}</span>
                  </p>
                </div>
                <div className="bg-surface p-4">
                  <p className="text-[12.5px] text-ink-3">Deliverables accepted</p>
                  <p className="num mt-1 text-[22px] font-bold">
                    {accepted}
                    <span className="text-[15px] font-medium text-ink-3"> / {dels.length}</span>
                  </p>
                </div>
              </div>
            </Panel>
            {seesFinance ? (
              <Panel title="Finance status" description="FR-027" action={<BudgetLegend />}>
                <BudgetBar budget={f.budget} invoiced={f.invoiced} received={f.received} />
                <div className="mt-5">
                  <Dl
                    items={[
                      { label: 'Approved budget', value: <span className="num font-semibold">{f.budget !== null ? inr(f.budget) : 'Not recorded'}</span> },
                      { label: 'Invoiced', value: <span className="num">{inr(f.invoiced)}</span> },
                      { label: 'Received', value: <span className="num">{inr(f.received)}</span> },
                      { label: 'Awaiting payment', value: <span className={cx('num', f.outstanding > 0 && 'font-semibold text-warn')}>{inr(f.outstanding)}</span> },
                    ]}
                  />
                </div>
              </Panel>
            ) : (
              <Panel title="Finance status">
                <p className="text-sm text-ink-3">Finance details are visible to the project consultant and the accounts office.</p>
              </Panel>
            )}
          </div>
        )}

        {tab === 'timeline' && (
          <Panel title="Timeline" description="Each deliverable belongs to a milestone (FR-032)." bodyClassName="p-0">
            <ol>
              {ms.map((m, i) => {
                const mDels = dels.filter((d) => d.milestoneId === m.id)
                const overdue = !m.completionDate && daysFromToday(m.plannedDate) < 0
                return (
                  <li key={m.id} className="relative border-b border-line px-5 py-5 last:border-0">
                    <div className="flex flex-wrap items-start gap-4">
                      <span className={cx('grid size-8 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold', m.completionDate ? 'border-ok bg-ok text-white' : overdue ? 'border-bad text-bad' : 'border-line-2 text-ink-3')}>
                        {m.completionDate ? <CheckCircle2 size={16} /> : i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-semibold">{m.title}</p>
                          {m.completionDate ? <Badge tone="ok">Completed {fmtDate(m.completionDate)}</Badge> : overdue ? <Badge tone="bad">{dueLabel(m.plannedDate)}</Badge> : <Badge>{dueLabel(m.plannedDate)}</Badge>}
                        </div>
                        <p className="num mt-0.5 text-[12.5px] text-ink-3">Planned {fmtDate(m.plannedDate)}</p>
                        <ul className="mt-3 flex flex-col gap-2">
                          {mDels.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-sunken/60 px-3.5 py-2.5">
                              {d.status === 'Accepted' ? <CheckCircle2 size={16} className="text-ok" aria-hidden /> : <Circle size={16} className="text-ink-3" aria-hidden />}
                              <div className="min-w-0 flex-1">
                                <p className="text-[13.5px] font-medium">{d.title}</p>
                                <p className="text-[12.5px] text-ink-3">
                                  <span className="num">{d.id}</span> · due <span className="num">{fmtDate(d.dueDate)}</span>
                                  {d.submissionDate && (
                                    <>
                                      {' '}
                                      · submitted <span className="num">{fmtDate(d.submissionDate)}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                              {isConsultant && p.status === 'Active' ? (
                                <Select
                                  aria-label={`Status of ${d.title}`}
                                  value={d.status}
                                  className="!h-8 w-[180px] text-[13px]"
                                  onChange={(e) => {
                                    const r = actions.setDeliverableStatus(d.id, e.target.value as DeliverableStatus)
                                    toast(r.ok ? { tone: 'ok', title: 'Deliverable updated', body: `${d.title}: ${e.target.value}` } : { tone: 'bad', title: 'Not updated', body: r.error })
                                  }}
                                >
                                  {(['Pending', 'Submitted', 'Accepted', 'Revision requested'] as DeliverableStatus[]).map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </Select>
                              ) : (
                                <StatusBadge status={d.status} />
                              )}
                            </li>
                          ))}
                          {mDels.length === 0 && <li className="text-[13px] text-ink-3">No deliverables linked to this milestone.</li>}
                        </ul>
                      </div>
                      {isConsultant && p.status === 'Active' && !m.completionDate && (
                        <Button
                          size="sm"
                          icon={CalendarCheck2}
                          onClick={() => {
                            const r = actions.completeMilestone(m.id)
                            toast(r.ok ? { tone: 'ok', title: 'Milestone completed', body: m.title } : { tone: 'bad', title: 'Not updated', body: r.error })
                          }}
                        >
                          Mark complete
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
              {ms.length === 0 && <EmptyState icon={FolderKanban} title="No milestones yet" />}
            </ol>
          </Panel>
        )}

        {tab === 'finance' && seesFinance && (
          <div className="flex flex-col gap-6">
            <Panel title="Invoices" description="Payments settle invoices; an invoice can’t be paid twice (BR-005)." bodyClassName="p-0">
              {f.invoices.length === 0 ? (
                <EmptyState icon={Wallet} title="No invoices yet" body={f.budget === null ? 'Accounts must record the approved budget before invoicing.' : 'Invoices raised for this project will appear here.'} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="bg-sunken">
                      <tr>
                        <th className={th}>Invoice</th>
                        <th className={th}>Date</th>
                        <th className={cx(th, 'text-right')}>Amount</th>
                        <th className={cx(th, 'text-right')}>Paid</th>
                        <th className={cx(th, 'text-right')}>Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.invoices.map((i) => (
                        <tr key={i.txn.id} className={trHover}>
                          <td className={td}>
                            <span className="num font-semibold">{i.txn.reference}</span>
                            <span className="num block text-[12.5px] text-ink-3">{i.txn.id}</span>
                          </td>
                          <td className={cx(td, 'num text-ink-2')}>{fmtDate(i.txn.date)}</td>
                          <td className={cx(td, 'num text-right')}>{inr(i.txn.amount)}</td>
                          <td className={cx(td, 'num text-right text-ink-2')}>{inr(i.paid)}</td>
                          <td className={cx(td, 'num text-right')}>{i.outstanding > 0 ? <span className="font-semibold text-warn">{inr(i.outstanding)}</span> : <Badge tone="ok">Paid</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Finance records" description="FR-028" bodyClassName="p-0">
              <LedgerTable txns={txns} />
            </Panel>
          </div>
        )}
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${p.id}?`}
        description="The project closes immediately. Everyone involved is notified and no new invoices or payments can be recorded."
        footer={
          <>
            <Button onClick={() => setCancelOpen(false)}>Keep project</Button>
            <Button variant="danger" onClick={cancel}>
              Cancel project
            </Button>
          </>
        }
      >
        <Field label="Reason" required error={reasonError} htmlFor="cancel-reason">
          <Textarea
            id="cancel-reason"
            value={reason}
            invalid={!!reasonError}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonError('')
            }}
            placeholder="For example: client withdrew funding."
          />
        </Field>
      </Dialog>

      <DeliverableDialog open={delOpen} onClose={() => setDelOpen(false)} projectId={p.id} />
    </>
  )
}

export function LedgerTable({ txns, showProject }: { txns: ReturnType<typeof useStore>['db']['transactions']; showProject?: boolean }) {
  const { db } = useStore()
  const L = useLookup()
  if (txns.length === 0) return <EmptyState icon={Wallet} title="No finance records" />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="bg-sunken">
          <tr>
            <th className={th}>Transaction</th>
            <th className={th}>Type</th>
            {showProject && <th className={th}>Project</th>}
            <th className={th}>Reference</th>
            <th className={th}>Date</th>
            <th className={cx(th, 'text-right')}>Amount</th>
            <th className={th}>Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => {
            const inv = t.invoiceId ? db.transactions.find((x) => x.id === t.invoiceId) : undefined
            return (
              <tr key={t.id} className={trHover}>
                <td className={cx(td, 'num font-semibold')}>{t.id}</td>
                <td className={td}>
                  <StatusBadge status={t.type} />
                </td>
                {showProject && (
                  <td className={td}>
                    <Link to={`/projects/${t.projectId}`} className="block max-w-[220px] truncate hover:text-brand">
                      {L.project(t.projectId)?.title}
                    </Link>
                    <span className="num text-[12.5px] text-ink-3">{t.projectId}</span>
                  </td>
                )}
                <td className={td}>
                  <span className="num">{t.reference}</span>
                  {inv && <span className="num block text-[12.5px] text-ink-3">against {inv.reference}</span>}
                </td>
                <td className={cx(td, 'num text-ink-2')}>{fmtDate(t.date)}</td>
                <td className={cx(td, 'num text-right font-semibold')}>{inr(t.amount)}</td>
                <td className={cx(td, 'text-ink-2')}>{L.user(t.recordedBy)?.name}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DeliverableDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { db, actions } = useStore()
  const toast = useToast()
  const ms = db.milestones.filter((m) => m.projectId === projectId && !m.completionDate)
  const [milestoneId, setMilestoneId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [submitNow, setSubmitNow] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setMilestoneId(ms[0]?.id ?? '')
      setDueDate(ms[0]?.plannedDate ?? todayISO())
      setTitle('')
      setDescription('')
      setError('')
    }
  }, [open])

  const save = () => {
    const r = actions.recordDeliverable(projectId, { milestoneId, title, description, dueDate, submitNow })
    if (!r.ok) return setError(r.error)
    onClose()
    toast({ tone: 'ok', title: submitNow ? 'Deliverable submitted' : 'Deliverable recorded', body: title })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Record deliverable"
      description={`Add a deliverable to ${projectId} and link it to a milestone (FR-029, FR-032).`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {submitNow ? 'Record and submit' : 'Record deliverable'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required htmlFor="del-title" className="sm:col-span-2">
          <Input id="del-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Interim findings memo" />
        </Field>
        <Field label="Milestone" required htmlFor="del-ms">
          <Select id="del-ms" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
            {ms.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" required htmlFor="del-due">
          <Input id="del-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="del-desc" className="sm:col-span-2">
          <Textarea id="del-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={submitNow} onChange={(e) => setSubmitNow(e.target.checked)} />
          Mark as submitted to the client today
        </label>
      </div>
      {error && <p className="mt-3 text-[13px] font-medium text-bad">{error}</p>}
    </Dialog>
  )
}
