import { useState } from 'react'
import { BellOff, CheckCheck } from 'lucide-react'
import { Button, EmptyState, Notice, PageHeader, Panel, Segmented } from '../components/ui'
import { cx, fmtDateTime, relativeTime } from '../lib/format'
import { navigate } from '../lib/router'
import { useStore } from '../store/store'

export default function Notifications() {
  const { db, user, actions } = useStore()
  const [view, setView] = useState<'all' | 'unread'>('all')
  const mine = db.notifications.filter((n) => n.recipientId === user!.id)
  const list = view === 'unread' ? mine.filter((n) => n.status === 'Unread') : mine
  const unread = mine.filter((n) => n.status === 'Unread').length

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates on proposals, approvals, deadlines, payments and cancellations (FR-037 – FR-040)."
        actions={
          unread > 0 && (
            <Button icon={CheckCheck} onClick={actions.markAllRead}>
              Mark all as read
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Notice>Notifications are delivered in-app in this prototype. E-mail delivery through the institutional mail server is not connected.</Notice>
      </div>
      <Panel bodyClassName="p-0">
        <div className="border-b border-line p-4">
          <Segmented
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: 'All', count: mine.length },
              { value: 'unread', label: 'Unread', count: unread },
            ]}
          />
        </div>
        {list.length === 0 ? (
          <EmptyState icon={BellOff} title={view === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
        ) : (
          <ul>
            {list.map((n) => (
              <li key={n.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => {
                    actions.markRead(n.id)
                    if (n.link) navigate(n.link)
                  }}
                  className={cx('flex w-full gap-4 px-5 py-4 text-left hover:bg-sunken', n.status === 'Unread' && 'bg-brand-soft/40')}
                >
                  <span className={cx('mt-1.5 size-2 shrink-0 rounded-full', n.status === 'Unread' ? 'bg-brand' : 'bg-line-2')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-sm font-semibold">{n.type}</span>
                      <span className="text-[12.5px] text-ink-3" title={fmtDateTime(n.timestamp)}>
                        {relativeTime(n.timestamp)}
                      </span>
                    </span>
                    <span className="mt-0.5 block max-w-[80ch] text-[13.5px] text-ink-2">{n.message}</span>
                  </span>
                  <span className="sr-only">{n.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
