import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Bell, Building2, ChartColumn, ClipboardCheck, FileSignature, FileText, FolderKanban, Gavel, LayoutDashboard, LogOut, Menu, RotateCcw, ScrollText, Users, Wallet, X, type LucideIcon } from 'lucide-react'
import type { RoleId } from '../data/types'
import { cx, relativeTime } from '../lib/format'
import { Link, navigate } from '../lib/router'
import { useLookup, useStore } from '../store/store'
import { Avatar, useToast } from './ui'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  roles: RoleId[]
}

const ALL: RoleId[] = ['faculty', 'approver', 'finance', 'admin', 'management']

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL }] },
  {
    group: 'Consultancy',
    items: [
      { path: '/proposals', label: 'Proposals', icon: FileText, roles: ['faculty', 'approver', 'admin', 'management'] },
      { path: '/approvals', label: 'Review queue', icon: Gavel, roles: ['approver', 'admin'] },
      { path: '/agreements', label: 'Agreements', icon: FileSignature, roles: ALL },
      { path: '/projects', label: 'Projects', icon: FolderKanban, roles: ALL },
      { path: '/clients', label: 'Clients', icon: Building2, roles: ['faculty', 'approver', 'finance', 'admin'] },
    ],
  },
  {
    group: 'Finance & reporting',
    items: [
      { path: '/finance', label: 'Finance', icon: Wallet, roles: ['finance', 'admin', 'management'] },
      { path: '/reports', label: 'Reports', icon: ChartColumn, roles: ['approver', 'finance', 'admin', 'management'] },
    ],
  },
  {
    group: 'Administration',
    items: [
      { path: '/users', label: 'Users & roles', icon: Users, roles: ['admin'] },
      { path: '/audit', label: 'Audit log', icon: ScrollText, roles: ['admin'] },
    ],
  },
]

export function canAccess(path: string, role: RoleId) {
  if (path.startsWith('/notifications')) return true
  const root = '/' + (path.split('/')[1] ?? '')
  const item = NAV.flatMap((g) => g.items).find((i) => i.path === root)
  return item ? item.roles.includes(role) : true
}

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const { db, user } = useStore()
  const [open, setOpen] = useState(false)
  const role = db.roles.find((r) => r.id === user?.roleId)
  const root = '/' + (path.split('/')[1] ?? '')
  const pending = db.proposals.filter((p) => p.status === 'Submitted' || p.status === 'Under Review').length

  useEffect(() => setOpen(false), [path])

  const nav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => user && i.roles.includes(user.roleId))
        if (!items.length) return null
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[12px] font-medium text-ink-3">{g.group}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map((i) => {
                const active = root === i.path
                return (
                  <li key={i.path}>
                    <Link
                      to={i.path}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'relative flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                        active ? 'bg-brand-soft text-brand' : 'text-ink-2 hover:bg-ink/[0.04] hover:text-ink',
                      )}
                    >
                      {active && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r bg-brand" aria-hidden />}
                      <i.icon size={17} strokeWidth={active ? 2.2 : 1.9} aria-hidden />
                      <span className="flex-1">{i.label}</span>
                      {i.path === '/approvals' && pending > 0 && <span className="num rounded-full bg-warn-soft px-1.5 text-[11.5px] font-semibold text-warn">{pending}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  return (
    <div className="flex min-h-full">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <Brand />
        {nav}
        <SidebarFooter roleName={role?.name ?? ''} />
      </aside>

      {/* Sidebar — mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <aside className="dialog-in absolute inset-y-0 left-0 flex w-[272px] flex-col bg-surface shadow-pop">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-2 text-ink-3 hover:bg-ink/5" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            {nav}
            <SidebarFooter roleName={role?.name ?? ''} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="-ml-1 rounded-md p-2 text-ink-2 hover:bg-ink/5 lg:hidden" aria-label="Open menu">
            <Menu size={19} />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium text-ink-2">{role?.name}</span>
            <span className="hidden rounded-full border border-line-2 px-2 py-0.5 text-[11.5px] font-medium text-ink-3 sm:inline">Prototype · sample data</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/dashboard" className="flex h-14 items-center gap-2.5 border-b border-line px-5 lg:h-[57px]">
      <span className="grid size-8 place-items-center rounded-[7px] bg-brand text-white" aria-hidden>
        <ClipboardCheck size={17} strokeWidth={2.2} />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-[-0.01em] text-ink">CPTS</span>
        <span className="block text-[11.5px] text-ink-3">Consultancy Project Tracking</span>
      </span>
    </Link>
  )
}

function SidebarFooter({ roleName }: { roleName: string }) {
  const { user } = useStore()
  if (!user) return null
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-3.5">
      <Avatar name={user.name} size={32} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
        <p className="truncate text-[12px] text-ink-3">{roleName}</p>
      </div>
    </div>
  )
}

function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return { open, setOpen, ref }
}

function NotificationBell() {
  const { db, user, actions } = useStore()
  const { open, setOpen, ref } = usePopover()
  const mine = db.notifications.filter((n) => n.recipientId === user?.id)
  const unread = mine.filter((n) => n.status === 'Unread').length
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="relative rounded-md p-2 text-ink-2 hover:bg-ink/5 hover:text-ink" aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Bell size={19} />
        {unread > 0 && <span className="num absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10.5px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="dialog-in absolute right-0 mt-2 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button type="button" onClick={actions.markAllRead} className="text-[12.5px] font-medium text-brand hover:underline">
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-[360px] overflow-y-auto">
            {mine.slice(0, 6).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    actions.markRead(n.id)
                    setOpen(false)
                    if (n.link) navigate(n.link)
                  }}
                  className="flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-sunken"
                >
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.status === 'Unread' ? 'bg-brand' : 'bg-transparent')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-ink">{n.type}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{n.message}</span>
                    <span className="mt-1 block text-[12px] text-ink-3">{relativeTime(n.timestamp)}</span>
                  </span>
                </button>
              </li>
            ))}
            {mine.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-3">You have no notifications.</li>}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-line px-4 py-2.5 text-center text-[13px] font-medium text-brand hover:bg-sunken">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  )
}

function UserMenu() {
  const { db, user, actions } = useStore()
  const L = useLookup()
  const toast = useToast()
  const { open, setOpen, ref } = usePopover()
  if (!user) return null
  const demoUsers = db.users.filter((u) => u.status === 'Active' && ['U101', 'U103', 'U104', 'U105', 'U106'].includes(u.id))
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-md py-1 pr-2 pl-1 hover:bg-ink/5" aria-expanded={open} aria-label="Account menu">
        <Avatar name={user.name} size={30} />
        <span className="hidden text-[13px] font-medium text-ink md:inline">{user.name}</span>
      </button>
      {open && (
        <div className="dialog-in absolute right-0 mt-2 w-72 overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">{user.name}</p>
            <p className="text-[12.5px] text-ink-3">{user.email}</p>
          </div>
          <div className="px-2 py-2">
            <p className="px-2 pt-1 pb-1.5 text-[12px] font-medium text-ink-3">Switch demo account</p>
            {demoUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  actions.switchUser(u.id)
                  setOpen(false)
                  navigate('/dashboard')
                  toast({ tone: 'info', title: `Signed in as ${u.name}`, body: L.role(u.roleId)?.name })
                }}
                className={cx('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken', u.id === user.id && 'bg-brand-soft')}
              >
                <Avatar name={u.name} size={24} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-medium text-ink">{u.name}</span>
                  <span className="block truncate text-[12px] text-ink-3">{L.role(u.roleId)?.name}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="border-t border-line px-2 py-2">
            <button
              type="button"
              onClick={() => {
                actions.resetDemo()
                setOpen(false)
                toast({ tone: 'info', title: 'Sample data restored', body: 'All changes made in this browser were cleared.' })
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 hover:bg-sunken"
            >
              <RotateCcw size={15} aria-hidden /> Reset sample data
            </button>
            <button
              type="button"
              onClick={() => {
                actions.logout()
                navigate('/')
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 hover:bg-sunken"
            >
              <LogOut size={15} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
