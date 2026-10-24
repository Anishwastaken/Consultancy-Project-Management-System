import type { ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { canAccess, Shell } from './components/Shell'
import { ButtonLink, EmptyState, Panel } from './components/ui'
import { match, useRoute } from './lib/router'
import { useStore } from './store/store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { ProposalList, ProposalDetail } from './pages/Proposals'
import ProposalForm from './pages/ProposalForm'
import Approvals from './pages/Approvals'
import Agreements from './pages/Agreements'
import { ProjectList, ProjectDetail } from './pages/Projects'
import Finance from './pages/Finance'
import Clients from './pages/Clients'
import Notifications from './pages/Notifications'
import Users from './pages/Users'
import Audit from './pages/Audit'
import Reports from './pages/Reports'

const routes: [string, (p: Record<string, string>) => ReactNode][] = [
  ['/dashboard', () => <Dashboard />],
  ['/proposals', () => <ProposalList />],
  ['/proposals/new', () => <ProposalForm />],
  ['/proposals/:id/edit', (p) => <ProposalForm id={p.id} />],
  ['/proposals/:id', (p) => <ProposalDetail id={p.id} />],
  ['/approvals', () => <Approvals />],
  ['/approvals/:id', (p) => <ProposalDetail id={p.id} review />],
  ['/agreements', () => <Agreements />],
  ['/projects', () => <ProjectList />],
  ['/projects/:id', (p) => <ProjectDetail id={p.id} />],
  ['/finance', () => <Finance />],
  ['/clients', () => <Clients />],
  ['/notifications', () => <Notifications />],
  ['/users', () => <Users />],
  ['/audit', () => <Audit />],
  ['/reports', () => <Reports />],
]

export default function App() {
  const { user } = useStore()
  const { path } = useRoute()

  if (!user) return <Login />

  const target = path === '/' ? '/dashboard' : path
  let page: ReactNode = null
  for (const [pattern, render] of routes) {
    const params = match(pattern, target)
    if (params) {
      page = render(params)
      break
    }
  }

  if (!canAccess(target, user.roleId)) {
    page = (
      <Panel>
        <EmptyState icon={ShieldOff} title="Your role doesn’t have access to this page" body="Access to each module is controlled by your assigned role (FR-005). Switch to a different demo account to see it." action={<ButtonLink to="/dashboard">Go to dashboard</ButtonLink>} />
      </Panel>
    )
  }

  return (
    <Shell path={target}>
      {page ?? (
        <Panel>
          <EmptyState icon={ShieldOff} title="Page not found" body="The link may be out of date." action={<ButtonLink to="/dashboard">Go to dashboard</ButtonLink>} />
        </Panel>
      )}
    </Shell>
  )
}
