import { useState } from 'react'
import { Download } from 'lucide-react'
import { BudgetBar, BudgetLegend, HBars } from '../components/domain'
import { Badge, Button, PageHeader, Panel, Tabs, td, th, trHover } from '../components/ui'
import { cx, daysFromToday, fmtDate, inr, inrShort } from '../lib/format'
import { Link } from '../lib/router'
import { can, projectFinance } from '../store/rules'
import { useLookup, useStore } from '../store/store'
import { downloadCSV } from './Finance'

type Tab = 'activity' | 'finance' | 'deliverables'

export default function Reports() {
  const { db, user } = useStore()
  const L = useLookup()
  const [tab, setTab] = useState<Tab>('activity')
  const financeAllowed = can(db, user, 'reports.view') && user!.roleId !== 'approver'

  // FR-044 consultancy activity
  const byCategory = Object.entries(
    db.proposals
      .filter((p) => p.status !== 'Draft' && p.status !== 'Withdrawn')
      .reduce<Record<string, number>>((m, p) => ({ ...m, [p.category]: (m[p.category] ?? 0) + (p.proposedBudget ?? 0) }), {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)

  const decided = db.approvals
  const approvalRate = decided.length ? Math.round((decided.filter((a) => a.decision === 'Approved').length / decided.length) * 100) : 0
  const turnaround = (() => {
    const ds = decided
      .map((a) => {
        const p = L.proposal(a.proposalId)
        return p?.submissionDate ? (new Date(a.decisionDate).getTime() - new Date(p.submissionDate).getTime()) / 86400000 : null
      })
      .filter((x): x is number => x !== null)
    return ds.length ? Math.round(ds.reduce((s, x) => s + x, 0) / ds.length) : 0
  })()

  const byConsultant = db.users
    .filter((u) => u.roleId === 'faculty')
    .map((u) => ({
      u,
      proposals: db.proposals.filter((p) => p.ownerId === u.id && p.status !== 'Draft').length,
      projects: db.projects.filter((p) => p.consultantId === u.id).length,
      value: db.agreements.filter((a) => L.proposal(a.proposalId)?.ownerId === u.id).reduce((s, a) => s + a.value, 0),
    }))
    .filter((r) => r.proposals || r.projects)
    .sort((a, b) => b.value - a.value)

  const finRows = db.projects.map((p) => ({ p, f: projectFinance(db, p.id) }))
  const delRows = db.deliverables
    .map((d) => ({ d, p: L.project(d.projectId)!, m: db.milestones.find((m) => m.id === d.milestoneId) }))
    .sort((a, b) => a.d.dueDate.localeCompare(b.d.dueDate))

  const exportCurrent = () => {
    if (tab === 'finance')
      downloadCSV('cpts-finance-report.csv', [['Project', 'Title', 'Status', 'Budget', 'Invoiced', 'Received', 'Outstanding'], ...finRows.map(({ p, f }) => [p.id, p.title, p.status, f.budget ?? '', f.invoiced, f.received, f.outstanding])])
    else if (tab === 'deliverables')
      downloadCSV('cpts-deliverable-report.csv', [['Deliverable', 'Project', 'Milestone', 'Due', 'Submitted', 'Status'], ...delRows.map(({ d, m }) => [d.title, d.projectId, m?.title ?? '', d.dueDate, d.submissionDate ?? '', d.status])])
    else downloadCSV('cpts-activity-report.csv', [['Consultant', 'Proposals submitted', 'Projects', 'Agreed value'], ...byConsultant.map((r) => [r.u.name, r.proposals, r.projects, r.value])])
  }

  return (
    <>
      <PageHeader title="Reports" description="Consultancy activity, finance and deliverable reports (FR-041 – FR-044). Export any report as CSV." actions={<Button icon={Download} onClick={exportCurrent}>Export CSV</Button>} />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'activity', label: 'Consultancy activity' },
          ...(financeAllowed ? [{ value: 'finance' as Tab, label: 'Finance' }] : []),
          { value: 'deliverables', label: 'Deliverables and timeline' },
        ]}
      />
      <div className="mt-6">
        {tab === 'activity' && (
          <div className="flex flex-col gap-6">
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
              {[
                ['Proposals submitted', String(db.proposals.filter((p) => p.submissionDate).length), 'All time'],
                ['Approval rate', `${approvalRate}%`, `${decided.length} decisions recorded`],
                ['Average decision time', `${turnaround} days`, 'Submission to decision'],
                ['Agreed value', inrShort(db.agreements.reduce((s, a) => s + a.value, 0)), `${db.agreements.length} agreements`],
              ].map(([k, v, n]) => (
                <div key={k} className="bg-surface px-5 py-4">
                  <p className="text-[12.5px] font-medium text-ink-3">{k}</p>
                  <p className="num mt-2 text-[24px] leading-none font-bold tracking-[-0.02em]">{v}</p>
                  <p className="mt-1.5 text-[12.5px] text-ink-3">{n}</p>
                </div>
              ))}
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Proposed value by category" description="Submitted proposals, excluding drafts and withdrawn">
                <HBars data={byCategory} />
              </Panel>
              <Panel title="By consultant" bodyClassName="p-0">
                <table className="w-full">
                  <thead className="bg-sunken">
                    <tr>
                      <th className={th}>Consultant</th>
                      <th className={cx(th, 'text-right')}>Proposals</th>
                      <th className={cx(th, 'text-right')}>Projects</th>
                      <th className={cx(th, 'text-right')}>Agreed value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byConsultant.map((r) => (
                      <tr key={r.u.id} className={trHover}>
                        <td className={td}>{r.u.name}</td>
                        <td className={cx(td, 'num text-right')}>{r.proposals}</td>
                        <td className={cx(td, 'num text-right')}>{r.projects}</td>
                        <td className={cx(td, 'num text-right font-semibold')}>{inr(r.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
          </div>
        )}

        {tab === 'finance' && financeAllowed && (
          <Panel title="Finance report" description="Budget, invoicing and receipts per project" action={<BudgetLegend />} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-sunken">
                  <tr>
                    <th className={th}>Project</th>
                    <th className={cx(th, 'text-right')}>Budget</th>
                    <th className={cx(th, 'text-right')}>Invoiced</th>
                    <th className={cx(th, 'text-right')}>Received</th>
                    <th className={cx(th, 'text-right')}>Outstanding</th>
                    <th className={th}>Utilisation</th>
                  </tr>
                </thead>
                <tbody>
                  {finRows.map(({ p, f }) => (
                    <tr key={p.id} className={trHover}>
                      <td className={td}>
                        <Link to={`/projects/${p.id}`} className="block max-w-[260px] truncate font-semibold hover:text-brand">
                          {p.title}
                        </Link>
                        <span className="text-[12.5px] text-ink-3">
                          <span className="num">{p.id}</span> · {p.status}
                        </span>
                      </td>
                      <td className={cx(td, 'num text-right')}>{f.budget !== null ? inr(f.budget) : '—'}</td>
                      <td className={cx(td, 'num text-right')}>{inr(f.invoiced)}</td>
                      <td className={cx(td, 'num text-right')}>{inr(f.received)}</td>
                      <td className={cx(td, 'num text-right', f.outstanding > 0 && 'font-semibold text-warn')}>{inr(f.outstanding)}</td>
                      <td className={cx(td, 'w-[180px]')}>
                        <BudgetBar budget={f.budget} invoiced={f.invoiced} received={f.received} compact />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-line-2 bg-sunken">
                  <tr>
                    <td className={cx(td, 'font-semibold')}>Total</td>
                    <td className={cx(td, 'num text-right font-semibold')}>{inr(finRows.reduce((s, r) => s + (r.f.budget ?? 0), 0))}</td>
                    <td className={cx(td, 'num text-right font-semibold')}>{inr(finRows.reduce((s, r) => s + r.f.invoiced, 0))}</td>
                    <td className={cx(td, 'num text-right font-semibold')}>{inr(finRows.reduce((s, r) => s + r.f.received, 0))}</td>
                    <td className={cx(td, 'num text-right font-semibold')}>{inr(finRows.reduce((s, r) => s + r.f.outstanding, 0))}</td>
                    <td className={td} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        )}

        {tab === 'deliverables' && (
          <Panel title="Deliverables and timeline" description="FR-042" bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead className="bg-sunken">
                  <tr>
                    <th className={th}>Deliverable</th>
                    <th className={th}>Project</th>
                    <th className={th}>Milestone</th>
                    <th className={th}>Due</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {delRows.map(({ d, p, m }) => {
                    const late = d.status === 'Pending' && daysFromToday(d.dueDate) < 0 && p.status === 'Active'
                    return (
                      <tr key={d.id} className={trHover}>
                        <td className={cx(td, 'font-medium')}>{d.title}</td>
                        <td className={td}>
                          <Link to={`/projects/${p.id}`} className="num hover:text-brand">
                            {p.id}
                          </Link>
                        </td>
                        <td className={cx(td, 'text-ink-2')}>{m?.title}</td>
                        <td className={cx(td, 'num', late ? 'font-semibold text-bad' : 'text-ink-2')}>{fmtDate(d.dueDate)}</td>
                        <td className={td}>{late ? <Badge tone="bad">Overdue</Badge> : <Badge tone={d.status === 'Accepted' ? 'ok' : d.status === 'Submitted' ? 'info' : d.status === 'Revision requested' ? 'bad' : 'neutral'}>{d.status}</Badge>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </>
  )
}
