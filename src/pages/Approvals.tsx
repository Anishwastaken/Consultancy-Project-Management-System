import { useState } from 'react'
import { Gavel, Inbox } from 'lucide-react'
import { Avatar, EmptyState, Notice, PageHeader, Panel, Segmented, StatusBadge, td, th, trHover } from '../components/ui'
import { cx, daysFromToday, fmtDate, inr } from '../lib/format'
import { Link, navigate } from '../lib/router'
import { can } from '../store/rules'
import { useLookup, useStore } from '../store/store'

export default function Approvals() {
  const { db, user } = useStore()
  const L = useLookup()
  const [view, setView] = useState<'queue' | 'decided'>('queue')
  const queue = db.proposals
    .filter((p) => p.status === 'Submitted' || p.status === 'Under Review')
    .sort((a, b) => (a.submissionDate ?? '').localeCompare(b.submissionDate ?? ''))
  const decided = db.approvals
  const reviewer = can(db, user, 'proposal.review')

  return (
    <>
      <PageHeader title="Review queue" description="Submitted proposals waiting for a decision, oldest first. Opening a submitted proposal marks it as under review." />
      {!reviewer && (
        <div className="mb-4">
          <Notice>You can view the queue, but only a Proposal Approver can approve or reject proposals.</Notice>
        </div>
      )}
      <Panel bodyClassName="p-0">
        <div className="border-b border-line p-4">
          <Segmented
            label="Queue view"
            value={view}
            onChange={setView}
            options={[
              { value: 'queue', label: 'Awaiting decision', count: queue.length },
              { value: 'decided', label: 'Decision history', count: decided.length },
            ]}
          />
        </div>
        {view === 'queue' ? (
          queue.length === 0 ? (
            <EmptyState icon={Inbox} title="No proposals are waiting for review" body="New submissions will appear here and you’ll get a notification." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="bg-sunken">
                  <tr>
                    <th className={th}>Proposal</th>
                    <th className={th}>Consultant</th>
                    <th className={cx(th, 'text-right')}>Proposed budget</th>
                    <th className={th}>Submitted</th>
                    <th className={th}>Waiting</th>
                    <th className={th}>Status</th>
                    <th className={th}>
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((p) => {
                    const waiting = -daysFromToday(p.submissionDate ?? p.updatedAt)
                    return (
                      <tr key={p.id} className={cx(trHover, 'cursor-pointer')} onClick={() => navigate(`/approvals/${p.id}`)}>
                        <td className={td}>
                          <span className="block max-w-[320px] truncate font-semibold">{p.title}</span>
                          <span className="text-[12.5px] text-ink-3">
                            <span className="num">{p.id}</span> for {L.client(p.clientId)?.name}
                          </span>
                        </td>
                        <td className={td}>
                          <span className="flex items-center gap-2 text-ink-2">
                            <Avatar name={L.user(p.ownerId)?.name ?? ''} size={22} /> {L.user(p.ownerId)?.name}
                          </span>
                        </td>
                        <td className={cx(td, 'num text-right')}>{inr(p.proposedBudget ?? 0)}</td>
                        <td className={cx(td, 'num text-ink-2')}>{fmtDate(p.submissionDate)}</td>
                        <td className={cx(td, 'num', waiting > 7 ? 'font-semibold text-warn' : 'text-ink-2')}>
                          {waiting} day{waiting === 1 ? '' : 's'}
                        </td>
                        <td className={td}>
                          <StatusBadge status={p.status} />
                        </td>
                        <td className={cx(td, 'text-right')}>
                          <Link to={`/approvals/${p.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-md border border-line-2 px-2.5 py-1 text-[13px] font-medium hover:bg-sunken">
                            <Gavel size={14} aria-hidden /> Review
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>Proposal</th>
                  <th className={th}>Decision</th>
                  <th className={th}>Comments</th>
                  <th className={th}>Approver</th>
                  <th className={th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((a) => {
                  const p = L.proposal(a.proposalId)
                  return (
                    <tr key={a.id} className={cx(trHover, 'cursor-pointer')} onClick={() => navigate(`/proposals/${a.proposalId}`)}>
                      <td className={td}>
                        <span className="block max-w-[280px] truncate font-semibold">{p?.title}</span>
                        <span className="num text-[12.5px] text-ink-3">{a.proposalId}</span>
                      </td>
                      <td className={td}>
                        <StatusBadge status={a.decision} />
                      </td>
                      <td className={cx(td, 'max-w-[320px] text-ink-2')}>
                        <span className="line-clamp-2">{a.comments || '—'}</span>
                      </td>
                      <td className={cx(td, 'text-ink-2')}>{L.user(a.approverId)?.name}</td>
                      <td className={cx(td, 'num text-ink-2')}>{fmtDate(a.decisionDate)}</td>
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
