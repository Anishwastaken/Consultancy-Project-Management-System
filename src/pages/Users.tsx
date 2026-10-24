import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { RoleId } from '../data/types'
import { Avatar, Button, Dialog, PageHeader, Panel, SearchInput, Select, StatusBadge, Tabs, td, th, trHover, useToast } from '../components/ui'
import { cx } from '../lib/format'
import { useLookup, useStore } from '../store/store'

const PERMISSION_LABELS: Record<string, string> = {
  'proposal.create': 'Create and submit proposals',
  'proposal.review': 'Approve or reject proposals',
  'agreement.finalize': 'Finalize agreements',
  'finance.record': 'Record budgets, invoices and payments',
  'project.cancel': 'Cancel projects',
  'deliverable.record': 'Record deliverables',
  'client.manage': 'Add clients',
  'users.manage': 'Manage users and roles',
  'audit.view': 'View audit log',
  'reports.view': 'View reports',
}

export default function Users() {
  const { db, user, actions } = useStore()
  const L = useLookup()
  const toast = useToast()
  const [tab, setTab] = useState<'users' | 'roles'>('users')
  const [q, setQ] = useState('')
  const [pending, setPending] = useState<{ userId: string; roleId: RoleId } | null>(null)

  const users = db.users.filter((u) => !q || [u.name, u.email, u.id, u.department].some((s) => s.toLowerCase().includes(q.toLowerCase())))
  const target = pending && L.user(pending.userId)

  return (
    <>
      <PageHeader title="Users and roles" description="Assign roles to control what each person can do (FR-004, FR-005). Changes are recorded in the audit log." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Users', count: db.users.length },
          { value: 'roles', label: 'Roles and permissions', count: db.roles.length },
        ]}
      />
      <div className="mt-6">
        {tab === 'users' ? (
          <Panel bodyClassName="p-0">
            <div className="border-b border-line p-4">
              <SearchInput value={q} onChange={setQ} placeholder="Search users" className="sm:max-w-xs" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="bg-sunken">
                  <tr>
                    <th className={th}>User</th>
                    <th className={th}>Department</th>
                    <th className={th}>Role</th>
                    <th className={th}>Status</th>
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === user!.id
                    return (
                      <tr key={u.id} className={trHover}>
                        <td className={td}>
                          <span className="flex items-center gap-3">
                            <Avatar name={u.name} size={30} />
                            <span className="min-w-0">
                              <span className="block font-semibold">
                                {u.name} {self && <span className="text-[12px] font-normal text-ink-3">(you)</span>}
                              </span>
                              <span className="block text-[12.5px] text-ink-3">
                                <span className="num">{u.id}</span> · {u.email}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className={cx(td, 'text-ink-2')}>
                          <span className="block">{u.title}</span>
                          <span className="block text-[12.5px] text-ink-3">{u.department}</span>
                        </td>
                        <td className={td}>
                          <Select aria-label={`Role for ${u.name}`} value={u.roleId} disabled={self} className="!h-8 w-[210px] text-[13px]" onChange={(e) => setPending({ userId: u.id, roleId: e.target.value as RoleId })}>
                            {db.roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className={td}>
                          <StatusBadge status={u.status} />
                        </td>
                        <td className={cx(td, 'text-right')}>
                          {!self && (
                            <Button
                              size="sm"
                              onClick={() => {
                                const r = actions.toggleUserStatus(u.id)
                                toast(r.ok ? { tone: 'ok', title: u.status === 'Active' ? `${u.name} deactivated` : `${u.name} activated` } : { tone: 'bad', title: 'Not changed', body: r.error })
                              }}
                            >
                              {u.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {db.roles.map((r) => (
              <Panel
                key={r.id}
                title={
                  <span className="flex items-center gap-2">
                    {r.name} <span className="num text-[12px] font-medium text-ink-3">{r.code}</span>
                  </span>
                }
                description={`${db.users.filter((u) => u.roleId === r.id).length} users`}
              >
                <p className="text-[13.5px] text-ink-2">{r.description}</p>
                <ul className="mt-4 flex flex-col gap-1.5">
                  {r.permissions.map((p) => (
                    <li key={p} className="flex items-center gap-2 text-[13px]">
                      <ShieldCheck size={14} className="text-ok" aria-hidden /> {PERMISSION_LABELS[p]}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={!!pending}
        onClose={() => setPending(null)}
        size="sm"
        title="Change role?"
        description={target ? `${target.name} will move from ${L.role(target.roleId)?.name} to ${L.role(pending?.roleId)?.name}. Their access changes immediately.` : undefined}
        footer={
          <>
            <Button onClick={() => setPending(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (!pending) return
                const r = actions.assignRole(pending.userId, pending.roleId)
                toast(r.ok ? { tone: 'ok', title: 'Role assigned', body: `${target?.name} is now ${L.role(pending.roleId)?.name}.` } : { tone: 'bad', title: 'Role not changed', body: r.error })
                setPending(null)
              }}
            >
              Assign role
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">They will be notified of the change.</p>
      </Dialog>
    </>
  )
}
