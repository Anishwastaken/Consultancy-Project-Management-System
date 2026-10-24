import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, FileLock2, Plus, Save, Send, Trash2 } from 'lucide-react'
import type { Proposal, ProposalMilestone } from '../data/types'
import { Avatar, Button, ButtonLink, EmptyState, Field, Input, PageHeader, Panel, Select, Textarea, useToast } from '../components/ui'
import { cx, inr } from '../lib/format'
import { navigate } from '../lib/router'
import { can, PROPOSAL_FIELDS, proposalErrors } from '../store/rules'
import { useStore } from '../store/store'

export const CATEGORIES = ['Software & AI', 'Data analytics', 'Testing & certification', 'Energy & environment', 'Structural & mechanical', 'Training']

type FormState = Omit<Proposal, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'ownerId' | 'submissionDate' | 'agreementId'>

export default function ProposalForm({ id }: { id?: string }) {
  const { db, user, actions } = useStore()
  const toast = useToast()
  const u = user!
  const existing = id ? db.proposals.find((p) => p.id === id) : undefined

  const [f, setF] = useState<FormState>(() =>
    existing
      ? {
          clientId: existing.clientId,
          title: existing.title,
          description: existing.description,
          category: existing.category,
          proposedBudget: existing.proposedBudget,
          startDate: existing.startDate,
          endDate: existing.endDate,
          scope: existing.scope,
          deliverables: existing.deliverables.length ? [...existing.deliverables] : [''],
          milestones: existing.milestones.length ? existing.milestones.map((m) => ({ ...m })) : [{ title: '', date: '' }],
          team: existing.team.length ? [...existing.team] : [u.id],
          expectedOutcomes: existing.expectedOutcomes,
          terms: existing.terms,
        }
      : { clientId: '', title: '', description: '', category: '', proposedBudget: null, startDate: '', endDate: '', scope: '', deliverables: [''], milestones: [{ title: '', date: '' }], team: [u.id], expectedOutcomes: '', terms: '' },
  )
  const [showErrors, setShowErrors] = useState(false)
  const [busy, setBusy] = useState(false)

  const clean = useMemo<FormState>(() => ({ ...f, deliverables: f.deliverables.filter((d) => d.trim()), milestones: f.milestones.filter((m) => m.title.trim() || m.date) }), [f])
  const errors = proposalErrors({ ...clean, id: '', status: 'Draft', createdAt: '', updatedAt: '', ownerId: u.id })
  const done = PROPOSAL_FIELDS.filter((x) => !errors[x.key]).length
  const err = (k: keyof Proposal) => (showErrors ? errors[k] : undefined)

  if (!can(db, u, 'proposal.create')) {
    return (
      <Panel>
        <EmptyState icon={FileLock2} title="Only faculty consultants can create proposals" body="This rule comes from BR-001. Sign in as a faculty consultant to try it." action={<ButtonLink to="/proposals">Back to proposals</ButtonLink>} />
      </Panel>
    )
  }
  if (existing && (existing.ownerId !== u.id || existing.status !== 'Draft')) {
    return (
      <Panel>
        <EmptyState icon={FileLock2} title={`${existing.id} can’t be edited`} body={`Only the owner can edit a proposal, and only while it is a draft. This one is ${existing.status}.`} action={<ButtonLink to={`/proposals/${existing.id}`}>Open proposal</ButtonLink>} />
      </Panel>
    )
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }))
  const faculty = db.users.filter((x) => x.roleId === 'faculty' && x.status === 'Active')

  const save = (submit: boolean) => {
    if (submit) setShowErrors(true)
    setBusy(true)
    const r = actions.saveProposal(clean, { id: existing?.id, submit })
    setBusy(false)
    if (!r.ok) {
      toast({ tone: 'bad', title: submit ? 'Proposal not submitted' : 'Draft not saved', body: r.error })
      if (submit) document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    toast(
      submit
        ? { tone: 'ok', title: 'Proposal submitted', body: `${r.value.id} is now with the Proposal Approver. You’ll be notified of the decision.` }
        : { tone: 'ok', title: 'Draft saved', body: `${r.value.id} is saved. You can submit it when it’s complete.` },
    )
    navigate(`/proposals/${r.value.id}`)
  }

  return (
    <>
      <PageHeader
        back={existing ? { to: `/proposals/${existing.id}`, label: existing.id } : { to: '/proposals', label: 'Proposals' }}
        title={existing ? `Edit ${existing.id}` : 'New proposal'}
        description="Save a draft at any time. Every field is required before you can submit for approval."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Client and project">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client" required error={err('clientId')} htmlFor="client" className="sm:col-span-2">
                <Select id="client" value={f.clientId} invalid={!!err('clientId')} onChange={(e) => set('clientId', e.target.value)}>
                  <option value="">Select a client</option>
                  {db.clients
                    .filter((c) => c.status === 'Active')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.id})
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Project title" required error={err('title')} htmlFor="title" className="sm:col-span-2">
                <Input id="title" value={f.title} invalid={!!err('title')} onChange={(e) => set('title', e.target.value)} placeholder="For example: Energy audit of three heritage properties" />
              </Field>
              <Field label="Description" required error={err('description')} htmlFor="desc" className="sm:col-span-2">
                <Textarea id="desc" value={f.description} invalid={!!err('description')} onChange={(e) => set('description', e.target.value)} placeholder="What the client needs and why the institute is suited to it." />
              </Field>
              <Field label="Category" required error={err('category')} htmlFor="cat">
                <Select id="cat" value={f.category} invalid={!!err('category')} onChange={(e) => set('category', e.target.value)}>
                  <option value="">Select a category</option>
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Proposed budget (₹)" required error={err('proposedBudget')} hint={f.proposedBudget ? inr(f.proposedBudget) : 'Total fee, before taxes'} htmlFor="budget">
                <Input
                  id="budget"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  className="num"
                  value={f.proposedBudget ?? ''}
                  invalid={!!err('proposedBudget')}
                  onChange={(e) => set('proposedBudget', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="350000"
                />
              </Field>
              <Field label="Start date" required error={err('startDate')} htmlFor="start">
                <Input id="start" type="date" value={f.startDate} invalid={!!err('startDate')} onChange={(e) => set('startDate', e.target.value)} />
              </Field>
              <Field label="End date" required error={err('endDate')} htmlFor="end">
                <Input id="end" type="date" value={f.endDate} min={f.startDate || undefined} invalid={!!err('endDate')} onChange={(e) => set('endDate', e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel title="Scope and deliverables">
            <div className="flex flex-col gap-4">
              <Field label="Scope of work" required error={err('scope')} htmlFor="scope">
                <Textarea id="scope" value={f.scope} invalid={!!err('scope')} onChange={(e) => set('scope', e.target.value)} placeholder="Activities included, and anything explicitly excluded." />
              </Field>
              <Field label="Deliverables" required error={err('deliverables')}>
                <ul className="flex flex-col gap-2">
                  {f.deliverables.map((d, i) => (
                    <li key={i} className="flex gap-2">
                      <Input
                        value={d}
                        aria-label={`Deliverable ${i + 1}`}
                        invalid={!!err('deliverables') && !d.trim() && i === 0}
                        onChange={(e) => set('deliverables', f.deliverables.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder={i === 0 ? 'For example: Field verification report' : 'Another deliverable'}
                      />
                      <Button variant="ghost" icon={Trash2} aria-label={`Remove deliverable ${i + 1}`} disabled={f.deliverables.length === 1} onClick={() => set('deliverables', f.deliverables.filter((_, j) => j !== i))} />
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" icon={Plus} className="mt-2 !text-brand" onClick={() => set('deliverables', [...f.deliverables, ''])}>
                  Add deliverable
                </Button>
              </Field>
            </div>
          </Panel>

          <Panel title="Milestones" description="Key dates the client and the institute agree to track.">
            <Field label="Milestones" required error={err('milestones')}>
              <ul className="flex flex-col gap-2">
                {f.milestones.map((m, i) => (
                  <li key={i} className="grid grid-cols-[minmax(0,1fr)_150px_auto] gap-2">
                    <Input value={m.title} aria-label={`Milestone ${i + 1} title`} invalid={!!err('milestones') && !m.title.trim()} onChange={(e) => set('milestones', f.milestones.map((x, j): ProposalMilestone => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Milestone" />
                    <Input type="date" value={m.date} aria-label={`Milestone ${i + 1} date`} invalid={!!err('milestones') && !m.date} onChange={(e) => set('milestones', f.milestones.map((x, j): ProposalMilestone => (j === i ? { ...x, date: e.target.value } : x)))} />
                    <Button variant="ghost" icon={Trash2} aria-label={`Remove milestone ${i + 1}`} disabled={f.milestones.length === 1} onClick={() => set('milestones', f.milestones.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" icon={Plus} className="mt-2 !text-brand" onClick={() => set('milestones', [...f.milestones, { title: '', date: '' }])}>
                Add milestone
              </Button>
            </Field>
          </Panel>

          <Panel title="Consultant and team">
            <Field label="Team members" required error={err('team')} hint="You are the lead consultant. Add colleagues who will work on the project.">
              <ul className="grid gap-2 sm:grid-cols-2">
                {faculty.map((x) => {
                  const on = f.team.includes(x.id)
                  const lead = x.id === u.id
                  return (
                    <li key={x.id}>
                      <label className={cx('flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 transition-colors', on ? 'border-brand/40 bg-brand-soft' : 'border-line hover:bg-sunken', lead && 'cursor-default')}>
                        <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={on} disabled={lead} onChange={() => set('team', on ? f.team.filter((t) => t !== x.id) : [...f.team, x.id])} />
                        <Avatar name={x.name} size={26} />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate text-[13.5px] font-medium">{x.name}</span>
                          <span className="block truncate text-[12px] text-ink-3">{lead ? 'Lead consultant' : x.department}</span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </Field>
          </Panel>

          <Panel title="Outcomes and terms">
            <div className="flex flex-col gap-4">
              <Field label="Expected outcomes" required error={err('expectedOutcomes')} htmlFor="outcomes">
                <Textarea id="outcomes" value={f.expectedOutcomes} invalid={!!err('expectedOutcomes')} onChange={(e) => set('expectedOutcomes', e.target.value)} placeholder="What the client will be able to do or measure afterwards." />
              </Field>
              <Field label="Terms and conditions" required error={err('terms')} htmlFor="terms">
                <Textarea id="terms" value={f.terms} invalid={!!err('terms')} onChange={(e) => set('terms', e.target.value)} placeholder="Payment schedule, confidentiality, IP, client obligations." />
              </Field>
            </div>
          </Panel>
        </div>

        {/* Sticky checklist and actions */}
        <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
          <Panel title="Ready to submit?" description={`${done} of ${PROPOSAL_FIELDS.length} required fields complete`}>
            <div className="mb-4 h-1.5 rounded-full bg-ink/[0.07]">
              <div className={cx('h-1.5 rounded-full transition-all', done === PROPOSAL_FIELDS.length ? 'bg-ok' : 'bg-brand')} style={{ width: `${(done / PROPOSAL_FIELDS.length) * 100}%` }} />
            </div>
            <ul className="flex flex-col gap-1.5">
              {PROPOSAL_FIELDS.map((x) => {
                const ok = !errors[x.key]
                return (
                  <li key={x.key} className={cx('flex items-center gap-2 text-[13px]', ok ? 'text-ink-2' : showErrors ? 'font-medium text-bad' : 'text-ink-3')}>
                    {ok ? <CheckCircle2 size={15} className="text-ok" aria-hidden /> : <Circle size={15} aria-hidden />}
                    {x.label}
                    <span className="sr-only">{ok ? 'complete' : 'incomplete'}</span>
                  </li>
                )
              })}
            </ul>
          </Panel>
          <div className="flex flex-col gap-2">
            <Button variant="primary" icon={Send} className="h-10" disabled={busy} onClick={() => save(true)}>
              Submit for approval
            </Button>
            <Button icon={Save} className="h-10" disabled={busy} onClick={() => save(false)}>
              Save draft
            </Button>
          </div>
          <p className="text-[12.5px] text-ink-3">Submitting moves the proposal from Draft to Submitted, records today’s date and notifies the Proposal Approver (UC-004).</p>
        </aside>
      </div>
    </>
  )
}
