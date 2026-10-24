import type { DB, User } from '../data/types'

/** Faculty see their own proposals and projects; other roles see everything. */
export function visibleProposals(db: DB, user: User) {
  return user.roleId === 'faculty' ? db.proposals.filter((p) => p.ownerId === user.id || p.team.includes(user.id)) : db.proposals
}

export function visibleProjects(db: DB, user: User) {
  if (user.roleId !== 'faculty') return db.projects
  const mine = new Set(visibleProposals(db, user).map((p) => p.id))
  return db.projects.filter((p) => p.consultantId === user.id || mine.has(p.proposalId))
}

/** Entity ids a user may see activity for. */
export function relatedEntityIds(db: DB, user: User): Set<string> | null {
  if (user.roleId !== 'faculty') return null
  const ids = new Set<string>()
  visibleProposals(db, user).forEach((p) => {
    ids.add(p.id)
    if (p.agreementId) ids.add(p.agreementId)
  })
  visibleProjects(db, user).forEach((pr) => {
    ids.add(pr.id)
    db.transactions.filter((t) => t.projectId === pr.id).forEach((t) => ids.add(t.id))
    db.deliverables.filter((d) => d.projectId === pr.id).forEach((d) => ids.add(d.id))
    db.milestones.filter((m) => m.projectId === pr.id).forEach((m) => ids.add(m.id))
  })
  return ids
}

/** Upcoming / overdue milestones and deliverables (FR-039). */
export function deadlines(db: DB, user: User, horizonDays = 45) {
  const projects = visibleProjects(db, user).filter((p) => p.status === 'Active')
  const ids = new Set(projects.map((p) => p.id))
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const limit = today.getTime() + horizonDays * 86400000
  const items: { id: string; kind: 'Milestone' | 'Deliverable'; title: string; date: string; projectId: string }[] = []
  db.milestones.forEach((m) => {
    if (ids.has(m.projectId) && !m.completionDate) items.push({ id: m.id, kind: 'Milestone', title: m.title, date: m.plannedDate, projectId: m.projectId })
  })
  db.deliverables.forEach((d) => {
    if (ids.has(d.projectId) && (d.status === 'Pending' || d.status === 'Revision requested')) items.push({ id: d.id, kind: 'Deliverable', title: d.title, date: d.dueDate, projectId: d.projectId })
  })
  return items.filter((i) => new Date(i.date + 'T00:00:00').getTime() <= limit).sort((a, b) => a.date.localeCompare(b.date))
}
