import { useState } from 'react'
import { FileSignature } from 'lucide-react'
import { Dialog, Dl, EmptyState, Notice, PageHeader, Panel, SearchInput, StatusBadge, td, th, trHover, Button, ButtonLink } from '../components/ui'
import { cx, fmtDate, inr } from '../lib/format'
import { Link } from '../lib/router'
import { agreementEligible, can } from '../store/rules'
import { visibleProjects } from '../store/scope'
import { useLookup, useStore } from '../store/store'

export default function Agreements() {
  const { db, user } = useStore()
  const L = useLookup()
  const u = user!
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const projectIds = new Set(visibleProjects(db, u).map((p) => p.agreementId))
  const list = db.agreements
    .filter((a) => u.roleId !== 'faculty' || projectIds.has(a.id))
    .filter((a) => {
      const n = q.trim().toLowerCase()
      return !n || [a.id, a.reference, L.client(a.clientId)?.name ?? '', L.proposal(a.proposalId)?.title ?? ''].some((s) => s.toLowerCase().includes(n))
    })
    .sort((a, b) => b.agreementDate.localeCompare(a.agreementDate))
  const awaiting = db.proposals.filter((p) => agreementEligible(p) && (u.roleId !== 'faculty' || p.ownerId === u.id))
  const open = db.agreements.find((a) => a.id === openId)

  return (
    <>
      <PageHeader title="Agreements" description="Finalized consultancy agreements, each linked to an approved proposal (BR-002, FR-036)." />

      {awaiting.length > 0 && (
        <div className="mb-6">
          <Notice tone="warn" icon={FileSignature}>
            <strong>
              {awaiting.length} approved proposal{awaiting.length > 1 ? 's are' : ' is'} waiting for an agreement:
            </strong>{' '}
            {awaiting.map((p, i) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <Link to={`/proposals/${p.id}`} className="font-semibold text-brand underline">
                  {p.id} {p.title}
                </Link>
              </span>
            ))}
            .{can(db, u, 'agreement.finalize') ? ' Open the proposal to finalize it.' : ''}
          </Notice>
        </div>
      )}

      <Panel bodyClassName="p-0">
        <div className="border-b border-line p-4">
          <SearchInput value={q} onChange={setQ} placeholder="Search agreements" className="sm:max-w-xs" />
        </div>
        {list.length === 0 ? (
          <EmptyState icon={FileSignature} title="No agreements found" body="Agreements are created when an approved proposal is finalized." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>Reference</th>
                  <th className={th}>Proposal</th>
                  <th className={th}>Client</th>
                  <th className={cx(th, 'text-right')}>Value</th>
                  <th className={th}>Agreement date</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className={cx(trHover, 'cursor-pointer')} onClick={() => setOpenId(a.id)}>
                    <td className={td}>
                      <button type="button" className="num text-left font-semibold hover:text-brand" onClick={() => setOpenId(a.id)}>
                        {a.reference}
                      </button>
                      <span className="num block text-[12.5px] text-ink-3">{a.id}</span>
                    </td>
                    <td className={td}>
                      <span className="block max-w-[260px] truncate">{L.proposal(a.proposalId)?.title}</span>
                      <span className="num text-[12.5px] text-ink-3">{a.proposalId}</span>
                    </td>
                    <td className={cx(td, 'max-w-[200px] truncate text-ink-2')}>{L.client(a.clientId)?.name}</td>
                    <td className={cx(td, 'num text-right')}>{inr(a.value)}</td>
                    <td className={cx(td, 'num text-ink-2')}>{fmtDate(a.agreementDate)}</td>
                    <td className={td}>
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <Dialog
          open
          onClose={() => setOpenId(null)}
          title={open.reference}
          description={`Agreement ${open.id} for proposal ${open.proposalId}`}
          footer={
            <>
              <Button onClick={() => setOpenId(null)}>Close</Button>
              {db.projects.find((p) => p.agreementId === open.id) && (
                <ButtonLink to={`/projects/${db.projects.find((p) => p.agreementId === open.id)!.id}`} variant="primary">
                  Open project
                </ButtonLink>
              )}
            </>
          }
        >
          <Dl
            items={[
              { label: 'Client', value: L.client(open.clientId)?.name },
              { label: 'Client signatory', value: open.signatory },
              { label: 'Agreement date', value: <span className="num">{fmtDate(open.agreementDate)}</span> },
              { label: 'Value', value: <span className="num font-semibold">{inr(open.value)}</span> },
              { label: 'Proposal', value: <Link to={`/proposals/${open.proposalId}`} className="text-brand hover:underline">{L.proposal(open.proposalId)?.title}</Link> },
              { label: 'Status', value: <StatusBadge status={open.status} /> },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[12.5px] text-ink-3">Key terms</p>
            <p className="mt-1 text-sm leading-relaxed">{open.notes || '—'}</p>
          </div>
        </Dialog>
      )}
    </>
  )
}
