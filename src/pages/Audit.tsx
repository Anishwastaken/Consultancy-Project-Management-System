import { useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { Avatar, Button, EmptyState, PageHeader, Panel, SearchInput, Select, td, th, trHover } from '../components/ui'
import { cx, fmtDateTime } from '../lib/format'
import { useLookup, useStore } from '../store/store'
import { downloadCSV } from './Finance'

export default function Audit() {
  const { db } = useStore()
  const L = useLookup()
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return db.audit
      .filter((a) => !action || a.action === action)
      .filter((a) => !actor || a.actorId === actor)
      .filter((a) => !n || [a.entity, a.details, a.action].some((s) => s.toLowerCase().includes(n)))
  }, [db.audit, q, action, actor])

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Significant actions on proposals, agreements, finances, projects and accounts (NFR-007, NFR-020). Entries can’t be edited."
        actions={
          <Button icon={Download} onClick={() => downloadCSV('cpts-audit-log.csv', [['Log ID', 'Timestamp', 'User', 'Action', 'Entity', 'Details'], ...rows.map((a) => [a.id, a.timestamp, L.user(a.actorId)?.name ?? '', a.action, a.entity, a.details])])}>
            Export CSV
          </Button>
        }
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Search entity or details" className="sm:max-w-xs sm:flex-1" />
          <Select value={action} onChange={(e) => setAction(e.target.value)} aria-label="Action" className="sm:w-56">
            <option value="">All actions</option>
            {[...new Set(db.audit.map((a) => a.action))].sort().map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <Select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="User" className="sm:w-52">
            <option value="">All users</option>
            {[...new Set(db.audit.map((a) => a.actorId))].map((id) => (
              <option key={id} value={id}>
                {L.user(id)?.name}
              </option>
            ))}
          </Select>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="No entries match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>User</th>
                  <th className={th}>Action</th>
                  <th className={th}>Entity</th>
                  <th className={th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={trHover}>
                    <td className={cx(td, 'num whitespace-nowrap text-ink-2')}>
                      {fmtDateTime(a.timestamp)}
                      <span className="block text-[12px] text-ink-3">{a.id}</span>
                    </td>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <Avatar name={L.user(a.actorId)?.name ?? ''} size={22} />
                        <span className="whitespace-nowrap">{L.user(a.actorId)?.name}</span>
                      </span>
                    </td>
                    <td className={cx(td, 'font-medium whitespace-nowrap')}>{a.action}</td>
                    <td className={cx(td, 'num')}>{a.entity}</td>
                    <td className={cx(td, 'max-w-[420px] text-ink-2')}>{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
