import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Circle, FilePen, FilePlus2, FileSearch, FileSignature, FolderKanban, Gavel, Send, Undo2, XCircle } from 'lucide-react'
import type { Proposal, ProposalStatus } from '../data/types'
import { LifecycleRail, Stamp } from '../components/domain'
import { Avatar, Button, ButtonLink, Dialog, Dl, EmptyState, Field, Input, Notice, PageHeader, Panel, SearchInput, Segmented, Select, StatusBadge, Textarea, td, th, trHover, useToast } from '../components/ui'
import { cx, daysFromToday, fmtDate, inr, todayISO } from '../lib/format'
import { Link, navigate, useRoute } from '../lib/router'
import { agreementEligible, can, canEditProposal, canWithdraw, isAwaitingDecision, PROPOSAL_FIELDS, proposalErrors } from '../store/rules'
import { visibleProposals } from '../store/scope'
import { useLookup, useStore } from '../store/store'

type Filter = 'All' | ProposalStatus

export function ProposalList() {
  const { db, user } = useStore()
  const L = useLookup()
  const { query } = useRoute()
  const u = user!
  const all = visibleProposals(db, u)
  const [status, setStatus] = useState<Filter>((query.get('status') as Filter) || 'All')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [owner, setOwner] = useState('')

  useEffect(() => setStatus((query.get('status') as Filter) || 'All'), [query])

  const categories = [...new Set(db.proposals.map((p) => p.category).filter(Boolean))].sort()
  const owners = [...new Set(db.proposals.map((p) => p.ownerId))].map((id) => L.user(id)!).filter(Boolean)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((p) => status === 'All' || p.status === status)
      .filter((p) => !category || p.category === category)
      .filter((p) => !owner || p.ownerId === owner)
      .filter((p) => !needle || [p.id, p.title, L.client(p.clientId)?.name ?? '', L.user(p.ownerId)?.name ?? ''].some((s) => s.toLowerCase().includes(needle)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [all, status, category, owner, q, L])

  const statuses: ProposalStatus[] = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Withdrawn']

  return (
    <>
      <PageHeader
        title={u.roleId === 'faculty' ? 'My proposals' : 'Proposals'}
        description={u.roleId === 'faculty' ? 'Create, track and revise your consultancy proposals.' : 'All consultancy proposals submitted by faculty and institutional units.'}
        actions={
          can(db, u, 'proposal.create') && (
            <ButtonLink to="/proposals/new" variant="primary" icon={FilePlus2}>
              New proposal
            </ButtonLink>
          )
        }
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <Segmented
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={[{ value: 'All', label: 'All', count: all.length }, ...statuses.map((s) => ({ value: s as Filter, label: s === 'Under Review' ? 'Under review' : s, count: all.filter((p) => p.status === s).length }))]}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <SearchInput value={q} onChange={setQ} placeholder="Search by title, client or ID" className="sm:max-w-xs sm:flex-1" />
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="sm:w-52">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            {u.roleId !== 'faculty' && (
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Consultant" className="sm:w-52">
                <option value="">All consultants</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No proposals match these filters"
            body="Try a different status or clear the search."
            action={
              <Button
                onClick={() => {
                  setQ('')
                  setCategory('')
                  setOwner('')
                  navigate('/proposals')
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>Proposal</th>
                  <th className={th}>Client</th>
                  <th className={th}>Consultant</th>
                  <th className={cx(th, 'text-right')}>Proposed budget</th>
                  <th className={th}>Submitted</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={cx(trHover, 'cursor-pointer')} onClick={() => navigate(`/proposals/${p.id}`)}>
                    <td className={td}>
                      <Link to={`/proposals/${p.id}`} className="block max-w-[340px] font-semibold text-ink hover:text-brand" onClick={(e) => e.stopPropagation()}>
                        <span className="block truncate">{p.title || 'Untitled draft'}</span>
                      </Link>
                      <span className="num text-[12.5px] text-ink-3">
                        {p.id} · {p.category || 'No category'}
                      </span>
                    </td>
                    <td className={cx(td, 'max-w-[220px] truncate text-ink-2')}>{L.client(p.clientId)?.name ?? '—'}</td>
                    <td className={td}>
                      <span className="flex items-center gap-2 text-ink-2">
                        <Avatar name={L.user(p.ownerId)?.name ?? '?'} size={22} />
                        <span className="truncate">{L.user(p.ownerId)?.name}</span>
                      </span>
                    </td>
                    <td className={cx(td, 'num text-right')}>{p.proposedBudget ? inr(p.proposedBudget) : '—'}</td>
                    <td className={cx(td, 'num text-ink-2')}>{fmtDate(p.submissionDate)}</td>
                    <td className={td}>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
          Showing {rows.length} of {all.length} proposals
        </p>
      </Panel>
    </>
  )
}

/* ================================================================ Detail === */

export function ProposalDetail({ id, review }: { id: string; review?: boolean }) {
  const { db, user, actions } = useStore()
  const L = useLookup()
  const toast = useToast()
  const u = user!
  const p = db.proposals.find((x) => x.id === id)
  const [decision, setDecision] = useState<null | 'Approved' | 'Rejected'>(null)
  const [comments, setComments] = useState('')
  const [commentError, setCommentError] = useState('')
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [justDecided, setJustDecided] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)
  const opened = useRef(false)

  // State diagram T5: an approver opening a submitted proposal moves it to Under Review.
  useEffect(() => {
    if (review && p?.status === 'Submitted' && can(db, u, 'proposal.review') && !opened.current) {
      opened.current = true
      actions.openForReview(p.id)
    }
  }, [review, p?.status, p?.id, db, u, actions])

  if (!p) {
    return (
      <Panel>
        <EmptyState icon={FileSearch} title="Proposal not found" action={<ButtonLink to="/proposals">Back to proposals</ButtonLink>} />
      </Panel>
    )
  }
  if (u.roleId === 'faculty' && p.ownerId !== u.id && !p.team.includes(u.id)) {
    return (
      <Panel>
        <EmptyState icon={FileSearch} title="This proposal belongs to another consultant" body="Faculty can only open their own proposals." action={<ButtonLink to="/proposals">Back to proposals</ButtonLink>} />
      </Panel>
    )
  }

  const client = L.client(p.clientId)
  const owner = L.user(p.ownerId)
  const history = db.approvals.filter((a) => a.proposalId === p.id)
  const latest = history[0]
  const errors = proposalErrors(p)
  const missing = PROPOSAL_FIELDS.filter((f) => errors[f.key])
  const project = db.projects.find((x) => x.proposalId === p.id)
  const isOwner = p.ownerId === u.id
  const reviewer = can(db, u, 'proposal.review')

  const submit = () => {
    const r = actions.submitProposal(p.id)
    if (!r.ok) {
      setShowChecklist(true)
      return toast({ tone: 'bad', title: 'Proposal not submitted', body: r.error })
    }
    toast({ tone: 'ok', title: 'Proposal submitted', body: `${p.id} is now with the Proposal Approver. You’ll be notified of the decision.` })
  }

  const decide = () => {
    if (!decision) return
    if (decision === 'Rejected' && !comments.trim()) return setCommentError('Give the consultant a reason so they can revise the proposal.')
    const r = actions.decideProposal(p.id, decision, comments)
    if (!r.ok) return toast({ tone: 'bad', title: 'Decision not recorded', body: r.error })
    setDecision(null)
    setComments('')
    setJustDecided(true)
    toast({ tone: 'ok', title: decision === 'Approved' ? 'Proposal approved' : 'Proposal rejected', body: `${owner?.name} has been notified.` })
  }

  const backTo = review ? { to: '/approvals', label: 'Review queue' } : { to: '/proposals', label: 'Proposals' }

  return (
    <>
      <PageHeader
        back={backTo}
        title={p.title || 'Untitled draft'}
        meta={
          <>
            <StatusBadge status={p.status} />
            <span className="num text-[13px] text-ink-3">{p.id}</span>
            <span className="text-[13px] text-ink-3">for</span>
            <span className="text-[13px] font-medium text-ink-2">{client?.name ?? 'No client selected'}</span>
          </>
        }
        actions={
          <>
            {canWithdraw(p, u) && (
              <Button icon={Undo2} onClick={() => setWithdrawOpen(true)}>
                Withdraw
              </Button>
            )}
            {isOwner && p.status === 'Rejected' && (
              <Button
                variant="primary"
                icon={FilePen}
                onClick={() => {
                  const r = actions.reviseProposal(p.id)
                  if (r.ok) navigate(`/proposals/${p.id}/edit`)
                }}
              >
                Revise and resubmit
              </Button>
            )}
            {canEditProposal(p, u) && (
              <>
                <ButtonLink to={`/proposals/${p.id}/edit`} icon={FilePen}>
                  Edit draft
                </ButtonLink>
                <Button variant="primary" icon={Send} onClick={submit}>
                  Submit for approval
                </Button>
              </>
            )}
            {agreementEligible(p) && can(db, u, 'agreement.finalize') && (
              <Button variant="primary" icon={FileSignature} onClick={() => setFinalizeOpen(true)}>
                Finalize agreement
              </Button>
            )}
            {project && (
              <ButtonLink to={`/projects/${project.id}`} icon={FolderKanban}>
                Open project {project.id}
              </ButtonLink>
            )}
          </>
        }
      />

      <Panel className="mb-6" bodyClassName="px-5 pt-5 pb-4">
        <LifecycleRail db={db} proposal={p} />
        {p.status === 'Withdrawn' && <p className="mt-3 text-[13px] text-ink-3">This proposal was withdrawn by the consultant and is closed.</p>}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {p.status === 'Draft' && isOwner && (missing.length > 0 || showChecklist) && (
            <Notice tone={missing.length ? 'warn' : 'ok'} icon={missing.length ? Circle : CheckCircle2}>
              {missing.length ? (
                <>
                  <strong>
                    {missing.length} of {PROPOSAL_FIELDS.length} required fields are incomplete.
                  </strong>{' '}
                  Complete {missing.map((m) => m.label.toLowerCase()).join(', ')} before submitting (UC-004, step 5).{' '}
                  <Link to={`/proposals/${p.id}/edit`} className="font-semibold text-brand underline">
                    Complete the draft
                  </Link>
                </>
              ) : (
                <strong>All required information is provided. This draft is ready to submit.</strong>
              )}
            </Notice>
          )}

          <Panel title="Proposal">
            <div className="flex flex-col gap-6">
              <Section title="Description">{p.description}</Section>
              <Section title="Scope of work">{p.scope}</Section>
              <div className="grid gap-6 md:grid-cols-2">
                <Section title="Deliverables">
                  {p.deliverables.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {p.deliverables.map((d) => (
                        <li key={d} className="flex gap-2">
                          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
                          {d}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Section>
                <Section title="Milestones">
                  {p.milestones.length ? (
                    <ol className="flex flex-col gap-2">
                      {p.milestones.map((m, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-2 last:border-0">
                          <span>
                            <span className="num mr-2 text-ink-3">{i + 1}</span>
                            {m.title}
                          </span>
                          <span className="num shrink-0 text-[13px] text-ink-3">{fmtDate(m.date)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </Section>
              </div>
              <Section title="Expected outcomes">{p.expectedOutcomes}</Section>
              <Section title="Terms and conditions">{p.terms}</Section>
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* UC-005 decision panel */}
          {reviewer && isAwaitingDecision(p) && (
            <Panel title="Your decision" description="Recorded with today’s date and sent to the consultant.">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="success" icon={CheckCircle2} className="h-10" onClick={() => setDecision('Approved')}>
                  Approve
                </Button>
                <Button variant="secondary" icon={XCircle} className="h-10 !text-bad" onClick={() => setDecision('Rejected')}>
                  Reject
                </Button>
              </div>
              <p className="mt-3 text-[12.5px] text-ink-3">An approved proposal becomes eligible for agreement finalization. A rejection requires a reason (FR-013).</p>
            </Panel>
          )}

          {latest && (
            <Panel title="Decision">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-ink">{L.user(latest.approverId)?.name}</p>
                  <p className="text-[12.5px] text-ink-3">{L.user(latest.approverId)?.title}</p>
                  {latest.comments && <p className="mt-3 text-ink-2">“{latest.comments}”</p>}
                </div>
                <Stamp decision={latest.decision} date={latest.decisionDate} by={L.user(latest.approverId)?.name ?? ''} animate={justDecided} />
              </div>
              {p.status === 'Approved' && !p.agreementId && (
                <div className="mt-4">
                  <Notice>
                    Eligible for agreement finalization (FR-033).{' '}
                    {can(db, u, 'agreement.finalize') ? 'Use “Finalize agreement” to record it.' : 'The consultancy office will record the agreement.'}
                  </Notice>
                </div>
              )}
              {history.length > 1 && (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="mb-2 text-[12.5px] font-medium text-ink-3">Earlier decisions</p>
                  {history.slice(1).map((a) => (
                    <p key={a.id} className="text-[13px] text-ink-2">
                      <StatusBadge status={a.decision} /> <span className="num ml-1">{fmtDate(a.decisionDate)}</span> — {a.comments}
                    </p>
                  ))}
                </div>
              )}
            </Panel>
          )}

          <Panel title="Summary">
            <Dl
              cols={1}
              items={[
                { label: 'Client', value: client ? <span>{client.name}<span className="block text-[12.5px] text-ink-3">{client.contactPerson}, {client.orgType.toLowerCase()}</span></span> : '—' },
                { label: 'Category', value: p.category || '—' },
                { label: 'Proposed budget', value: <span className="num text-base font-semibold">{p.proposedBudget ? inr(p.proposedBudget) : '—'}</span> },
                { label: 'Period', value: <span className="num">{p.startDate ? `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}` : '—'}</span> },
                {
                  label: 'Consultant and team',
                  value: (
                    <ul className="mt-1 flex flex-col gap-1.5">
                      {p.team.map((t) => (
                        <li key={t} className="flex items-center gap-2">
                          <Avatar name={L.user(t)?.name ?? '?'} size={22} />
                          {L.user(t)?.name}
                          {t === p.ownerId && <span className="text-[12px] text-ink-3">lead</span>}
                        </li>
                      ))}
                    </ul>
                  ),
                },
                { label: 'Submitted', value: <span className="num">{p.submissionDate ? `${fmtDate(p.submissionDate)} (${-daysFromToday(p.submissionDate)} days ago)` : 'Not yet submitted'}</span> },
                ...(p.agreementId ? [{ label: 'Agreement', value: <Link to="/agreements" className="num font-medium text-brand hover:underline">{L.agreement(p.agreementId)?.reference}</Link> }] : []),
              ]}
            />
          </Panel>
        </div>
      </div>

      {/* Approve / reject confirmation */}
      <Dialog
        open={decision !== null}
        onClose={() => {
          setDecision(null)
          setCommentError('')
        }}
        title={decision === 'Approved' ? `Approve ${p.id}?` : `Reject ${p.id}?`}
        description={decision === 'Approved' ? `${owner?.name} will be notified and the proposal becomes eligible for an agreement.` : `${owner?.name} will be notified with your reason and can revise the proposal.`}
        footer={
          <>
            <Button onClick={() => setDecision(null)}>Cancel</Button>
            <Button variant={decision === 'Approved' ? 'success' : 'danger'} onClick={decide}>
              {decision === 'Approved' ? 'Approve proposal' : 'Reject proposal'}
            </Button>
          </>
        }
      >
        <Field label={decision === 'Rejected' ? 'Reason for rejection' : 'Comments'} required={decision === 'Rejected'} error={commentError} hint={decision === 'Approved' ? 'Optional. Visible to the consultant.' : undefined} htmlFor="decision-comments">
          <Textarea
            id="decision-comments"
            value={comments}
            invalid={!!commentError}
            onChange={(e) => {
              setComments(e.target.value)
              setCommentError('')
            }}
            placeholder={decision === 'Rejected' ? 'For example: budget is not broken down by deliverable.' : 'Any conditions or notes for the consultant.'}
          />
        </Field>
      </Dialog>

      <FinalizeDialog open={finalizeOpen} onClose={() => setFinalizeOpen(false)} proposal={p} />

      <Dialog
        open={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        size="sm"
        title={`Withdraw ${p.id}?`}
        description="A withdrawn proposal is closed and can’t be submitted again."
        footer={
          <>
            <Button onClick={() => setWithdrawOpen(false)}>Keep proposal</Button>
            <Button
              variant="danger"
              onClick={() => {
                const r = actions.withdrawProposal(p.id)
                setWithdrawOpen(false)
                toast(r.ok ? { tone: 'ok', title: 'Proposal withdrawn' } : { tone: 'bad', title: 'Not withdrawn', body: r.error })
              }}
            >
              Withdraw proposal
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">“{p.title}” will move to Withdrawn{p.status === 'Submitted' ? ' and the approver will be notified' : ''}.</p>
      </Dialog>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[13px] font-semibold text-ink-3">{title}</h3>
      <div className="max-w-[72ch] text-[14.5px] leading-relaxed text-ink">{children || <span className="text-ink-3 italic">Not provided yet</span>}</div>
    </div>
  )
}

function FinalizeDialog({ open, onClose, proposal }: { open: boolean; onClose: () => void; proposal: Proposal }) {
  const { actions } = useStore()
  const L = useLookup()
  const toast = useToast()
  const client = L.client(proposal.clientId)
  const [date, setDate] = useState(todayISO())
  const [signatory, setSignatory] = useState(client ? `${client.contactPerson}` : '')
  const [notes, setNotes] = useState(proposal.terms)
  const [error, setError] = useState('')

  const save = () => {
    const r = actions.finalizeAgreement(proposal.id, { agreementDate: date, signatory, notes })
    if (!r.ok) return setError(r.error)
    onClose()
    toast({ tone: 'ok', title: `Agreement ${r.value.agreementId} finalized`, body: `Project ${r.value.projectId} is active. Accounts have been asked to record its budget.` })
    navigate(`/projects/${r.value.projectId}`)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Finalize agreement"
      description={`Record the signed agreement for ${proposal.id}. This creates the project and lets accounts record its budget (FR-014, BR-002).`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Gavel} onClick={save}>
            Finalize agreement
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Agreement date" required htmlFor="agr-date">
          <Input id="agr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Agreement value" hint="From the approved proposal">
          <Input value={inr(proposal.proposedBudget ?? 0)} disabled className="num" />
        </Field>
        <Field label="Client signatory" required htmlFor="agr-sign" className="sm:col-span-2">
          <Input id="agr-sign" value={signatory} onChange={(e) => setSignatory(e.target.value)} placeholder="Name and designation" />
        </Field>
        <Field label="Key terms" htmlFor="agr-notes" className="sm:col-span-2">
          <Textarea id="agr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 text-[13px] font-medium text-bad">{error}</p>}
      <div className="mt-4">
        <Notice>The agreement is recorded in CPTS only. Contract documents are prepared and signed outside the system (automated contract generation is out of scope).</Notice>
      </div>
    </Dialog>
  )
}
