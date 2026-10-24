import { useMemo, useState } from 'react'
import { Building2, Mail, MapPin, Phone, Plus } from 'lucide-react'
import { Avatar, Button, Dialog, Dl, EmptyState, Field, Input, PageHeader, Panel, SearchInput, Select, StatusBadge, td, th, trHover, useToast } from '../components/ui'
import { cx, fmtDate, inr } from '../lib/format'
import { Link } from '../lib/router'
import { can } from '../store/rules'
import { useLookup, useStore } from '../store/store'

const ORG_TYPES = ['Private company', 'Public sector undertaking', 'Limited liability partnership', 'Government body', 'Non-profit organisation']
const CLIENT_CATEGORIES = ['Information technology', 'Manufacturing', 'Infrastructure', 'Logistics', 'Agriculture', 'Hospitality', 'Education & training', 'Healthcare']

export default function Clients() {
  const { db, user } = useStore()
  const L = useLookup()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return db.clients
      .filter((c) => !category || c.category === category)
      .filter((c) => !n || [c.id, c.name, c.contactPerson, c.address].some((s) => s.toLowerCase().includes(n)))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [db.clients, q, category])

  const open = db.clients.find((c) => c.id === openId)
  const proposalsOf = (id: string) => db.proposals.filter((p) => p.clientId === id)
  const projectsOf = (id: string) => db.projects.filter((p) => p.clientId === id)

  return (
    <>
      <PageHeader
        title="Clients"
        description="External organisations the institute provides consultancy services to. Proposals are created for a client on record."
        actions={
          can(db, user, 'client.manage') && (
            <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>
              Add client
            </Button>
          )
        }
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Search clients" className="sm:max-w-xs sm:flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Sector" className="sm:w-56">
            <option value="">All sectors</option>
            {[...new Set(db.clients.map((c) => c.category))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Building2} title="No clients match your search" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-sunken">
                <tr>
                  <th className={th}>Client</th>
                  <th className={th}>Contact</th>
                  <th className={th}>Assigned consultant</th>
                  <th className={cx(th, 'text-right')}>Proposals</th>
                  <th className={cx(th, 'text-right')}>Projects</th>
                  <th className={th}>Onboarded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className={cx(trHover, 'cursor-pointer')} onClick={() => setOpenId(c.id)}>
                    <td className={td}>
                      <button type="button" className="text-left font-semibold hover:text-brand" onClick={() => setOpenId(c.id)}>
                        {c.name}
                      </button>
                      <span className="block text-[12.5px] text-ink-3">
                        <span className="num">{c.id}</span> · {c.category}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="block">{c.contactPerson}</span>
                      <span className="block text-[12.5px] text-ink-3">{c.contactEmail}</span>
                    </td>
                    <td className={td}>
                      <span className="flex items-center gap-2 text-ink-2">
                        <Avatar name={L.user(c.consultantId)?.name ?? ''} size={22} /> {L.user(c.consultantId)?.name}
                      </span>
                    </td>
                    <td className={cx(td, 'num text-right')}>{proposalsOf(c.id).length}</td>
                    <td className={cx(td, 'num text-right')}>{projectsOf(c.id).length}</td>
                    <td className={cx(td, 'num text-ink-2')}>{fmtDate(c.onboardingDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {open && (
        <Dialog open onClose={() => setOpenId(null)} title={open.name} description={`${open.id} · ${open.orgType}`} size="lg" footer={<Button onClick={() => setOpenId(null)}>Close</Button>}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-ink-2">
              <span className="flex items-center gap-1.5"><Mail size={14} aria-hidden /> {open.contactEmail}</span>
              <span className="flex items-center gap-1.5"><Phone size={14} aria-hidden /> {open.contactPhone}</span>
              <span className="flex items-center gap-1.5"><MapPin size={14} aria-hidden /> {open.address}</span>
            </div>
            <Dl
              cols={3}
              items={[
                { label: 'Contact person', value: open.contactPerson },
                { label: 'Sector', value: open.category },
                { label: 'Status', value: <StatusBadge status={open.status} /> },
                { label: 'Assigned consultant', value: L.user(open.consultantId)?.name },
                { label: 'Onboarded', value: <span className="num">{fmtDate(open.onboardingDate)}</span> },
                { label: 'Agreed value', value: <span className="num font-semibold">{inr(db.agreements.filter((a) => a.clientId === open.id).reduce((s, a) => s + a.value, 0))}</span> },
              ]}
            />
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-3">Proposals</p>
              <ul className="divide-y divide-line rounded-md border border-line">
                {proposalsOf(open.id).map((p) => (
                  <li key={p.id}>
                    <Link to={`/proposals/${p.id}`} onClick={() => setOpenId(null)} className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-sunken">
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{p.title || 'Untitled draft'}</span>
                        <span className="num text-[12px] text-ink-3">{p.id}</span>
                      </span>
                      <StatusBadge status={p.status} />
                    </Link>
                  </li>
                ))}
                {proposalsOf(open.id).length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">No proposals yet.</li>}
              </ul>
            </div>
          </div>
        </Dialog>
      )}

      <AddClientDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  )
}

function AddClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, user, actions } = useStore()
  const toast = useToast()
  const empty = { name: '', orgType: ORG_TYPES[0], contactPerson: '', contactEmail: '', contactPhone: '', address: '', consultantId: user!.roleId === 'faculty' ? user!.id : '', category: CLIENT_CATEGORIES[0] }
  const [f, setF] = useState(empty)
  const [error, setError] = useState('')
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }))
  const save = () => {
    if (f.contactEmail && !/^\S+@\S+\.\S+$/.test(f.contactEmail)) return setError('Enter a valid contact email.')
    if (!f.consultantId) return setError('Assign a faculty consultant.')
    const r = actions.addClient(f)
    if (!r.ok) return setError(r.error)
    toast({ tone: 'ok', title: 'Client added', body: `${r.value.name} (${r.value.id})` })
    setF(empty)
    setError('')
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add client"
      description="Clients are recorded by institute staff (client self-service is out of scope)."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Add client
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organisation name" required htmlFor="c-name" className="sm:col-span-2">
          <Input id="c-name" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Organisation type" htmlFor="c-type">
          <Select id="c-type" value={f.orgType} onChange={(e) => set('orgType', e.target.value)}>
            {ORG_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Sector" htmlFor="c-cat">
          <Select id="c-cat" value={f.category} onChange={(e) => set('category', e.target.value)}>
            {CLIENT_CATEGORIES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Contact person" required htmlFor="c-person">
          <Input id="c-person" value={f.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
        </Field>
        <Field label="Contact email" required htmlFor="c-email">
          <Input id="c-email" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        </Field>
        <Field label="Contact phone" htmlFor="c-phone">
          <Input id="c-phone" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
        </Field>
        <Field label="Assigned consultant" required htmlFor="c-cons">
          <Select id="c-cons" value={f.consultantId} onChange={(e) => set('consultantId', e.target.value)}>
            <option value="">Select a consultant</option>
            {db.users.filter((u) => u.roleId === 'faculty' && u.status === 'Active').map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Address" htmlFor="c-addr" className="sm:col-span-2">
          <Input id="c-addr" value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
      </div>
      {error && <p className="mt-3 text-[13px] font-medium text-bad">{error}</p>}
    </Dialog>
  )
}
