import { useMemo } from 'react'
import { ArrowUpRight, CalendarClock, CircleDollarSign, FilePen, FilePlus2, FileSignature, Gavel, Inbox, ListChecks, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BudgetBar, BudgetLegend, MonthlyBars } from '../components/domain'
import { Avatar, ButtonLink, EmptyState, Panel, PageHeader, StatusBadge } from '../components/ui'
import { cx, daysFromToday, dueLabel, fmtDate, inrShort, relativeTime } from '../lib/format'
import { Link } from '../lib/router'
import { projectFinance } from '../store/rules'
import { deadlines, relatedEntityIds, visibleProjects, visibleProposals } from '../store/scope'
import { useLookup, useStore } from '../store/store'

export default function Dashboard() {
  const { db, user } = useStore()
  const L = useLookup()
  const u = user!
  const proposals = visibleProposals(db, u)
  const projects = visibleProjects(db, u)

  const count = (s: string) => proposals.filter((p) => p.status === s).length
  const stations = [
    { label: 'Draft', value: count('Draft'), to: '/proposals?status=Draft' },
    { label: 'Submitted', value: count('Submitted'), to: '/proposals?status=Submitted' },
    { label: 'Under review', value: count('Under Review'), to: '/proposals?status=Under Review' },
    { label: 'Awaiting agreement', value: proposals.filter((p) => p.status === 'Approved' && !p.agreementId).length, to: '/proposals?status=Approved' },
    { label: 'Active projects', value: projects.filter((p) => p.status === 'Active').length, to: '/projects?status=Active' },
    { label: 'Completed', value: projects.filter((p) => p.status === 'Completed').length, to: '/projects?status=Completed' },
  ]

  const fin = useMemo(() => {
    const live = projects.filter((p) => p.status !== 'Cancelled')
    const rows = live.map((p) => ({ project: p, f: projectFinance(db, p.id) }))
    return {
      rows,
      budget: rows.reduce((s, r) => s + (r.f.budget ?? 0), 0),
      received: rows.reduce((s, r) => s + r.f.received, 0),
      outstanding: rows.reduce((s, r) => s + r.f.outstanding, 0),
      uninvoiced: rows.reduce((s, r) => s + Math.max(0, r.f.uninvoiced), 0),
    }
  }, [db, projects])

  const months = useMemo(() => {
    const ids = new Set(projects.map((p) => p.id))
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const value = db.transactions.filter((t) => t.type === 'Payment' && ids.has(t.projectId) && t.date.startsWith(key)).reduce((s, t) => s + t.amount, 0)
      return { label: d.toLocaleDateString('en-GB', { month: 'short' }), value }
    })
  }, [db, projects])

  const related = relatedEntityIds(db, u)
  const activity = db.audit.filter((a) => !related || related.has(a.entity) || a.actorId === u.id).slice(0, 7)
  const due = deadlines(db, u).slice(0, 6)
  const firstName = u.name.replace(/^(Dr\.|Prof\.)\s+/, '').split(' ')[0]
  const hour = new Date().getHours()

  const primary =
    u.roleId === 'faculty' ? (
      <ButtonLink to="/proposals/new" variant="primary" icon={FilePlus2}>
        New proposal
      </ButtonLink>
    ) : u.roleId === 'approver' ? (
      <ButtonLink to="/approvals" variant="primary" icon={Gavel}>
        Open review queue
      </ButtonLink>
    ) : u.roleId === 'finance' ? (
      <ButtonLink to="/finance?record=1" variant="primary" icon={Wallet}>
        Record transaction
      </ButtonLink>
    ) : null

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${firstName}`}
        description={u.roleId === 'faculty' ? 'Your proposals, projects and deadlines.' : 'Consultancy activity across the institute.'}
        actions={primary}
      />

      {/* Pipeline — the lifecycle of Lab 2, Section 17, as live counts. */}
      <section aria-label="Proposal pipeline" className="mb-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{u.roleId === 'faculty' ? 'Your pipeline' : 'Consultancy pipeline'}</h2>
          <p className="text-[12.5px] text-ink-3">
            {count('Rejected')} rejected and {count('Withdrawn')} withdrawn not shown
          </p>
        </div>
        <ol className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 xl:grid-cols-6">
          {stations.map((s, i) => (
            <li key={s.label} className="bg-surface">
              <Link to={s.to} className="group relative block px-5 pt-4 pb-5 hover:bg-sunken">
                <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
                  <span className={cx('size-2 rounded-full', i < 3 ? 'bg-[#a9b8e0]' : 'bg-brand')} aria-hidden />
                  {s.label}
                </span>
                <span className="num mt-2 block text-[34px] leading-none font-bold tracking-[-0.03em] text-ink">{s.value}</span>
                <ArrowUpRight size={15} className="absolute top-4 right-4 hidden text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 sm:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
        <div className="flex h-1.5" aria-hidden>
          {stations.map((s, i) => (
            <span key={s.label} className={i < 3 ? 'bg-[#a9b8e0]' : 'bg-brand'} style={{ flex: Math.max(s.value, 0.25) }} />
          ))}
        </div>
      </section>

      {/* Money in four figures */}
      {u.roleId !== 'approver' && (
        <section aria-label="Finance summary" className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
          <Figure icon={CircleDollarSign} label="Approved budget" value={inrShort(fin.budget)} note={`${fin.rows.filter((r) => r.f.budget).length} projects with a recorded budget`} />
          <Figure icon={Wallet} label="Received" value={inrShort(fin.received)} note={fin.budget ? `${Math.round((fin.received / fin.budget) * 100)}% of approved budget` : '—'} />
          <Figure icon={Inbox} label="Invoiced, awaiting payment" value={inrShort(fin.outstanding)} note={`${fin.rows.reduce((s, r) => s + r.f.invoices.filter((i) => i.outstanding > 0).length, 0)} open invoices`} />
          <Figure icon={FileSignature} label="Not yet invoiced" value={inrShort(fin.uninvoiced)} note="Remaining approved budget" />
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {u.roleId !== 'approver' && (
            <Panel title="Payments received" description="Last six months, all projects you can see" action={<span className="num text-[13px] font-semibold text-ink">{inrShort(months.reduce((s, m) => s + m.value, 0))}</span>}>
              <MonthlyBars data={months} label="Payments received per month" />
            </Panel>
          )}

          <Panel title="Budget utilisation" description="Active projects" action={<BudgetLegend />} bodyClassName="p-0">
            <ul>
              {fin.rows
                .filter((r) => r.project.status === 'Active')
                .map(({ project, f }) => (
                  <li key={project.id} className="border-b border-line last:border-0">
                    <Link to={`/projects/${project.id}`} className="grid gap-3 px-5 py-3.5 hover:bg-sunken sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{project.title}</p>
                        <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
                          <span className="num">{project.id}</span> for {L.client(project.clientId)?.name}
                        </p>
                      </div>
                      <BudgetBar budget={f.budget} invoiced={f.invoiced} received={f.received} />
                    </Link>
                  </li>
                ))}
              {fin.rows.filter((r) => r.project.status === 'Active').length === 0 && <EmptyState icon={ListChecks} title="No active projects" body="Projects appear here once an agreement is finalized." />}
            </ul>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Tasks />

          <Panel title="Upcoming deadlines" description="Milestones and deliverables in the next 45 days" bodyClassName="p-0">
            {due.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nothing due soon" />
            ) : (
              <ul>
                {due.map((d) => {
                  const days = daysFromToday(d.date)
                  return (
                    <li key={d.id} className="border-b border-line last:border-0">
                      <Link to={`/projects/${d.projectId}`} className="flex items-start gap-3 px-5 py-3 hover:bg-sunken">
                        <span className={cx('mt-0.5 w-12 shrink-0 rounded-md py-1 text-center leading-none', days < 0 ? 'bg-bad-soft text-bad' : days <= 7 ? 'bg-warn-soft text-warn' : 'bg-ink/[0.05] text-ink-2')}>
                          <span className="num block text-[15px] font-bold">{new Date(d.date + 'T00:00:00').getDate()}</span>
                          <span className="block text-[10.5px] font-semibold">{new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-ink">{d.title}</span>
                          <span className="block text-[12.5px] text-ink-3">
                            {d.kind} on <span className="num">{d.projectId}</span> · <span className={days < 0 ? 'font-semibold text-bad' : ''}>{dueLabel(d.date)}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" bodyClassName="p-0" action={u.roleId === 'admin' ? <Link to="/audit" className="text-[13px] font-medium text-brand hover:underline">Audit log</Link> : undefined}>
            <ul>
              {activity.map((a) => {
                const actor = L.user(a.actorId)
                return (
                  <li key={a.id} className="flex gap-3 border-b border-line px-5 py-3 last:border-0">
                    <Avatar name={actor?.name ?? '?'} size={26} />
                    <div className="min-w-0 text-[13px]">
                      <p className="text-ink">
                        <span className="font-semibold">{actor?.name}</span> <span className="text-ink-2">{a.action.toLowerCase()}</span> <span className="num font-medium">{a.entity}</span>
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-ink-3">{a.details}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">{relativeTime(a.timestamp)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  )
}

function Figure({ icon: Icon, label, value, note, className }: { icon: LucideIcon; label: string; value: string; note: string; className?: string }) {
  return (
    <div className={cx('bg-surface px-5 py-4', className)}>
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
        <Icon size={15} aria-hidden /> {label}
      </p>
      <p className="num mt-2 text-[24px] leading-none font-bold tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">{note}</p>
    </div>
  )
}

/** Role-specific work queue. */
function Tasks() {
  const { db, user } = useStore()
  const L = useLookup()
  const u = user!
  type Task = { id: string; title: string; sub: string; to: string; status?: string; icon: LucideIcon }
  let tasks: Task[] = []

  if (u.roleId === 'faculty') {
    const mine = visibleProposals(db, u).filter((p) => p.ownerId === u.id)
    tasks = [
      ...mine.filter((p) => p.status === 'Rejected').map((p) => ({ id: p.id, title: p.title, sub: `${p.id} was rejected — revise and resubmit`, to: `/proposals/${p.id}`, status: p.status, icon: FilePen })),
      ...mine.filter((p) => p.status === 'Draft').map((p) => ({ id: p.id, title: p.title, sub: `${p.id} draft, last edited ${relativeTime(p.updatedAt)}`, to: `/proposals/${p.id}`, status: p.status, icon: FilePen })),
      ...db.deliverables
        .filter((d) => {
          const pr = L.project(d.projectId)
          return pr?.consultantId === u.id && pr.status === 'Active' && d.status === 'Pending' && daysFromToday(d.dueDate) <= 14
        })
        .map((d) => ({ id: d.id, title: d.title, sub: `${d.projectId} · ${dueLabel(d.dueDate)}`, to: `/projects/${d.projectId}`, icon: ListChecks })),
    ]
  } else if (u.roleId === 'approver' || u.roleId === 'admin') {
    tasks = [
      ...(u.roleId === 'approver'
        ? db.proposals
            .filter((p) => p.status === 'Submitted' || p.status === 'Under Review')
            .map((p) => ({ id: p.id, title: p.title, sub: `${p.id} by ${L.user(p.ownerId)?.name}, submitted ${fmtDate(p.submissionDate)}`, to: `/approvals/${p.id}`, status: p.status, icon: Gavel }))
        : []),
      ...db.proposals
        .filter((p) => p.status === 'Approved' && !p.agreementId)
        .map((p) => ({ id: p.id + 'a', title: p.title, sub: `${p.id} approved — agreement not yet finalized`, to: `/proposals/${p.id}`, icon: FileSignature })),
    ]
  } else if (u.roleId === 'finance') {
    tasks = [
      ...db.projects
        .filter((p) => p.status === 'Active' && projectFinance(db, p.id).budget === null)
        .map((p) => ({ id: p.id, title: p.title, sub: `${p.id} has a finalized agreement but no recorded budget`, to: '/finance?record=1', icon: CircleDollarSign })),
      ...db.projects
        .filter((p) => p.status === 'Active')
        .flatMap((p) => projectFinance(db, p.id).invoices.filter((i) => i.outstanding > 0).map((i) => ({ i, p })))
        .map(({ i, p }) => ({ id: i.txn.id, title: `${i.txn.reference} awaiting payment`, sub: `${p.id} · ${inrShort(i.outstanding)} outstanding since ${fmtDate(i.txn.date)}`, to: '/finance?record=1', icon: Inbox })),
    ]
  } else {
    tasks = db.deliverables
      .filter((d) => d.status === 'Pending' && daysFromToday(d.dueDate) < 0 && L.project(d.projectId)?.status === 'Active')
      .map((d) => ({ id: d.id, title: d.title, sub: `${d.projectId} · ${dueLabel(d.dueDate)}`, to: `/projects/${d.projectId}`, icon: CalendarClock }))
  }

  const title = u.roleId === 'management' ? 'Needs attention' : 'Your tasks'
  return (
    <Panel title={title} description={tasks.length ? `${tasks.length} item${tasks.length > 1 ? 's' : ''}` : undefined} bodyClassName="p-0">
      {tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="You’re all caught up" body="New work will appear here as it arrives." />
      ) : (
        <ul>
          {tasks.slice(0, 6).map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <Link to={t.to} className="flex items-start gap-3 px-5 py-3 hover:bg-sunken">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                  <t.icon size={15} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{t.title}</span>
                  <span className="block text-[12.5px] text-ink-3">{t.sub}</span>
                </span>
                {t.status && <StatusBadge status={t.status} className="hidden sm:inline-flex" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
