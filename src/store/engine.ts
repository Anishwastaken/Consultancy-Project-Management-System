// The CPTS use-case engine. Pure functions over a DB object: no React, no DOM.
//
// It runs in two places with identical results:
//   - on the server (server/index.ts), where it is the source of truth, and
//   - in the browser (store.tsx), to give instant feedback and to keep the
//     prototype usable when the server is not running.
//
// Every handler validates first and mutates only if all rules pass, so a
// rejected action leaves the DB untouched.

import type { Client, DB, DeliverableStatus, FinanceTransaction, Proposal, RoleId, User } from '../data/types'
import { inr, nextId, nowISO, todayISO } from '../lib/format'
import { agreementEligible, can, canWithdraw, financeChecks, isAwaitingDecision, isComplete, proposalErrors, type Check, type TxnInput } from './rules'

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string }

export type ProposalInput = Omit<Proposal, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'ownerId' | 'submissionDate' | 'agreementId'>

interface Ctx {
  db: DB
  me: User | undefined
}

const ok = (): Result => ({ ok: true, value: undefined })

function notify(db: DB, recipients: string[], type: string, message: string, link?: string) {
  for (const r of [...new Set(recipients)]) {
    db.notifications.unshift({
      id: nextId(db.notifications.map((n) => n.id), 'N'),
      recipientId: r,
      type,
      message,
      timestamp: nowISO(),
      status: 'Unread',
      link,
    })
  }
}

function audit(db: DB, actorId: string, action: string, entity: string, details: string) {
  db.audit.unshift({ id: nextId(db.audit.map((a) => a.id), 'L'), actorId, action, entity, details, timestamp: nowISO() })
}

const usersWithRole = (db: DB, role: RoleId) => db.users.filter((u) => u.roleId === role && u.status === 'Active').map((u) => u.id)

/** UC-004 steps 6–9: status change, submission date, forward and notify. */
function submitInto(d: DB, id: string, u: User) {
  const t = d.proposals.find((x) => x.id === id)!
  t.status = 'Submitted'
  t.submissionDate = todayISO()
  t.updatedAt = nowISO()
  audit(d, u.id, 'Submit proposal', id, 'Status changed Draft → Submitted.')
  notify(d, usersWithRole(d, 'approver'), 'Proposal submitted', `${u.name} submitted ${id} “${t.title}” for review.`, `/approvals/${id}`)
  notify(d, [u.id], 'Submission confirmed', `${id} “${t.title}” was submitted and forwarded to the Proposal Approver.`, `/proposals/${id}`)
}

export const handlers = {
  /* UC-003 / FR-006, FR-008, FR-009 — create or update a draft; optionally submit (UC-004). */
  saveProposal({ db, me: u }: Ctx, input: ProposalInput, opts: { id?: string; submit: boolean }): Result<Proposal> {
    if (!u || !can(db, u, 'proposal.create')) return { ok: false, error: 'Only faculty consultants can create proposals.' }
    if (!input.title.trim()) return { ok: false, error: 'Enter a project title to save the draft.' }
    const existing = opts.id ? db.proposals.find((p) => p.id === opts.id) : undefined
    if (existing && existing.ownerId !== u.id) return { ok: false, error: `${existing.id} belongs to another consultant.` }
    if (existing && existing.status !== 'Draft') return { ok: false, error: `${existing.id} is ${existing.status} and can no longer be edited.` }
    const now = nowISO()
    const candidate: Proposal = {
      ...input,
      id: existing?.id ?? nextId(db.proposals.map((p) => p.id), 'P'),
      ownerId: existing?.ownerId ?? u.id,
      status: 'Draft',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    if (opts.submit && !isComplete(candidate)) {
      const missing = Object.keys(proposalErrors(candidate)).length
      return { ok: false, error: `${missing} required field${missing > 1 ? 's are' : ' is'} incomplete.` }
    }
    const idx = db.proposals.findIndex((p) => p.id === candidate.id)
    if (idx >= 0) db.proposals[idx] = candidate
    else db.proposals.unshift(candidate)
    audit(db, u.id, existing ? 'Edit proposal' : 'Create proposal', candidate.id, `Draft saved: “${candidate.title}”.`)
    if (opts.submit) submitInto(db, candidate.id, u)
    return { ok: true, value: db.proposals.find((p) => p.id === candidate.id)! }
  },

  /* UC-004 Submit Proposal */
  submitProposal({ db, me: u }: Ctx, id: string): Result {
    const p = db.proposals.find((x) => x.id === id)
    if (!p) return { ok: false, error: 'Proposal not found.' }
    if (!u || p.ownerId !== u.id || !can(db, u, 'proposal.create')) return { ok: false, error: 'You are not authorized to submit this proposal.' }
    if (p.status !== 'Draft') return { ok: false, error: `Only drafts can be submitted. ${p.id} is ${p.status}.` }
    if (!isComplete(p)) return { ok: false, error: 'Complete the missing information before submitting.' }
    submitInto(db, id, u)
    return ok()
  },

  withdrawProposal({ db, me: u }: Ctx, id: string): Result {
    const p = db.proposals.find((x) => x.id === id)
    if (!p || !canWithdraw(p, u)) return { ok: false, error: 'This proposal cannot be withdrawn.' }
    const from = p.status
    p.status = 'Withdrawn'
    p.updatedAt = nowISO()
    audit(db, u!.id, 'Withdraw proposal', id, `Status changed ${from} → Withdrawn.`)
    if (from === 'Submitted') notify(db, usersWithRole(db, 'approver'), 'Proposal withdrawn', `${u!.name} withdrew ${id} “${p.title}”.`, `/proposals/${id}`)
    return ok()
  },

  /* State diagram T8 — Rejected → Draft (revision → resubmission). */
  reviseProposal({ db, me: u }: Ctx, id: string): Result {
    const p = db.proposals.find((x) => x.id === id)
    if (!p || !u || p.ownerId !== u.id || p.status !== 'Rejected') return { ok: false, error: 'Only a rejected proposal can be revised by its owner.' }
    p.status = 'Draft'
    p.updatedAt = nowISO()
    audit(db, u.id, 'Revise proposal', id, 'Status changed Rejected → Draft for revision.')
    return ok()
  },

  /* State diagram T5 — approver opens a submitted proposal. */
  openForReview({ db, me: u }: Ctx, id: string): void {
    const p = db.proposals.find((x) => x.id === id)
    if (!p || p.status !== 'Submitted' || !can(db, u, 'proposal.review')) return
    p.status = 'Under Review'
    p.updatedAt = nowISO()
    audit(db, u!.id, 'Open for review', id, 'Status changed Submitted → Under Review.')
  },

  /* UC-005 Approve Proposal / UC-006 Reject Proposal */
  decideProposal({ db, me: u }: Ctx, id: string, decision: 'Approved' | 'Rejected', comments: string): Result {
    if (!can(db, u, 'proposal.review')) return { ok: false, error: 'You are not authorized to review proposals.' }
    const p = db.proposals.find((x) => x.id === id)
    if (!p) return { ok: false, error: 'Proposal not found.' }
    if (!isAwaitingDecision(p)) return { ok: false, error: `A decision has already been recorded for ${id}.` }
    if (decision !== 'Approved' && decision !== 'Rejected') return { ok: false, error: 'Decision must be Approved or Rejected.' }
    if (decision === 'Rejected' && !comments.trim()) return { ok: false, error: 'Give a reason for the rejection.' }
    db.approvals.unshift({
      id: nextId(db.approvals.map((a) => a.id), 'AP'),
      proposalId: id,
      approverId: u!.id,
      decision,
      comments: comments.trim(),
      decisionDate: todayISO(),
    })
    p.status = decision
    p.updatedAt = nowISO()
    audit(db, u!.id, decision === 'Approved' ? 'Approve proposal' : 'Reject proposal', id, decision === 'Approved' ? 'Decision recorded: Approved.' : `Reason: ${comments.trim()}`)
    notify(
      db,
      [p.ownerId],
      decision === 'Approved' ? 'Proposal approved' : 'Proposal rejected',
      decision === 'Approved'
        ? `${id} “${p.title}” was approved by ${u!.name}. It is now eligible for agreement finalization.`
        : `${id} “${p.title}” was rejected by ${u!.name}. Reason: ${comments.trim()}`,
      `/proposals/${id}`,
    )
    return ok()
  },

  /* UC-007 / FR-014, FR-034 — creates the agreement and the project. */
  finalizeAgreement({ db, me: u }: Ctx, proposalId: string, input: { agreementDate: string; signatory: string; notes: string }): Result<{ agreementId: string; projectId: string }> {
    if (!can(db, u, 'agreement.finalize')) return { ok: false, error: 'You are not authorized to finalize agreements.' }
    const t = db.proposals.find((x) => x.id === proposalId)
    if (!t || !agreementEligible(t)) return { ok: false, error: 'Only an approved proposal without an agreement can be finalized.' }
    if (!input.agreementDate || !input.signatory.trim()) return { ok: false, error: 'Enter the agreement date and the client signatory.' }
    const agreementId = nextId(db.agreements.map((a) => a.id), 'A')
    const projectId = nextId(db.projects.map((a) => a.id), 'PR')
    db.agreements.unshift({
      id: agreementId,
      proposalId,
      clientId: t.clientId,
      agreementDate: input.agreementDate,
      reference: `CPTS/AGR/${input.agreementDate.slice(0, 4)}/${agreementId.slice(1)}`,
      signatory: input.signatory.trim(),
      value: t.proposedBudget ?? 0,
      notes: input.notes.trim(),
      status: 'Finalized',
    })
    t.agreementId = agreementId
    t.updatedAt = nowISO()
    db.projects.unshift({
      id: projectId,
      proposalId,
      clientId: t.clientId,
      agreementId,
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      status: 'Active',
      consultantId: t.ownerId,
    })
    const num = parseInt(projectId.slice(2), 10)
    t.milestones.forEach((m, i) => {
      db.milestones.push({ id: `M${num}${i}`, projectId, title: m.title, plannedDate: m.date })
    })
    const ms = db.milestones.filter((m) => m.projectId === projectId)
    t.deliverables.forEach((title, i) => {
      const m = ms[Math.min(i, ms.length - 1)]
      db.deliverables.push({ id: `D${num}${i}`, projectId, milestoneId: m.id, title, description: '', dueDate: m.plannedDate, status: 'Pending' })
    })
    audit(db, u!.id, 'Finalize agreement', agreementId, `Agreement finalized for ${proposalId}; project ${projectId} created.`)
    notify(db, [t.ownerId, ...t.team], 'Agreement finalized', `Agreement ${agreementId} for “${t.title}” is finalized. Project ${projectId} is now active.`, `/projects/${projectId}`)
    notify(db, usersWithRole(db, 'finance'), 'Budget required', `Project ${projectId} “${t.title}” is active. Record its approved budget to enable invoicing.`, `/finance`)
    return { ok: true, value: { agreementId, projectId } }
  },

  /* UC-010 Record Finance Transaction */
  recordTransaction({ db, me: u }: Ctx, input: TxnInput): { ok: true; txn: FinanceTransaction } | { ok: false; checks: Check[]; error: string } {
    const checks = financeChecks(db, u, input)
    const failed = checks.find((c) => c.state !== 'pass')
    if (failed) return { ok: false, checks, error: failed.state === 'fail' ? failed.message : 'Complete the transaction details.' }
    const project = db.projects.find((p) => p.id === input.projectId)!
    const t: FinanceTransaction = {
      id: nextId(db.transactions.map((x) => x.id), 'T'),
      projectId: input.projectId,
      type: input.type,
      amount: input.amount,
      date: input.date,
      reference: input.reference.trim(),
      invoiceId: input.type === 'Payment' ? input.invoiceId : undefined,
      recordedBy: u!.id,
      note: input.note.trim(),
    }
    db.transactions.push(t)
    const verb = input.type === 'Budget' ? 'Record budget' : input.type === 'Invoice' ? 'Record invoice' : 'Record payment'
    const inv = input.invoiceId ? db.transactions.find((x) => x.id === input.invoiceId) : undefined
    const detail =
      input.type === 'Payment'
        ? `Payment of ${inr(t.amount)} recorded against ${inv?.reference}.`
        : input.type === 'Invoice'
          ? `Invoice ${t.reference} of ${inr(t.amount)} recorded for ${project.id}.`
          : `Approved budget ${inr(t.amount)} recorded for ${project.id}.`
    audit(db, u!.id, verb, t.id, detail)
    notify(db, [u!.id], input.type === 'Payment' ? 'Payment confirmation' : `${input.type} recorded`, `${t.id}: ${detail}`, '/finance')
    if (input.type !== 'Budget') notify(db, [project.consultantId], `${input.type} recorded`, `${detail.replace(/\.$/, '')} on “${project.title}”.`, `/projects/${project.id}`)
    return { ok: true, txn: t }
  },

  /* FR-015 / FR-040 / BR-010 */
  cancelProject({ db, me: u }: Ctx, id: string, reason: string): Result {
    const pr = db.projects.find((p) => p.id === id)
    if (!pr) return { ok: false, error: 'Project not found.' }
    const allowed = can(db, u, 'project.cancel') && (u!.roleId === 'admin' || pr.consultantId === u!.id)
    if (!allowed) return { ok: false, error: 'You are not authorized to cancel this project.' }
    if (pr.status !== 'Active') return { ok: false, error: `${id} is ${pr.status}.` }
    if (!reason.trim()) return { ok: false, error: 'Give a reason for cancelling.' }
    pr.status = 'Cancelled'
    pr.cancelReason = reason.trim()
    audit(db, u!.id, 'Cancel project', id, `Reason: ${reason.trim()}`)
    const proposal = db.proposals.find((p) => p.id === pr.proposalId)
    notify(
      db,
      [pr.consultantId, ...(proposal?.team ?? []), ...usersWithRole(db, 'finance'), ...usersWithRole(db, 'approver')].filter((x) => x !== u!.id),
      'Project cancelled',
      `${id} “${pr.title}” was cancelled by ${u!.name}. No new financial transactions can be recorded.`,
      `/projects/${id}`,
    )
    return ok()
  },

  /* FR-029 / FR-032 */
  recordDeliverable({ db, me: u }: Ctx, projectId: string, input: { milestoneId: string; title: string; description: string; dueDate: string; submitNow: boolean }): Result {
    const pr = db.projects.find((p) => p.id === projectId)
    if (!pr || !u || !can(db, u, 'deliverable.record') || pr.consultantId !== u.id) return { ok: false, error: 'Only the project consultant can record deliverables.' }
    if (pr.status !== 'Active') return { ok: false, error: `${projectId} is ${pr.status}.` }
    if (!input.title.trim() || !input.milestoneId || !input.dueDate) return { ok: false, error: 'Enter a title, milestone and due date.' }
    if (!db.milestones.some((m) => m.id === input.milestoneId && m.projectId === projectId)) return { ok: false, error: 'Choose a milestone that belongs to this project.' }
    const id = nextId(db.deliverables.map((x) => x.id), 'D', 3)
    db.deliverables.push({
      id,
      projectId,
      milestoneId: input.milestoneId,
      title: input.title.trim(),
      description: input.description.trim(),
      dueDate: input.dueDate,
      submissionDate: input.submitNow ? todayISO() : undefined,
      status: input.submitNow ? 'Submitted' : 'Pending',
    })
    audit(db, u.id, 'Record deliverable', id, `Deliverable “${input.title.trim()}” ${input.submitNow ? 'submitted' : 'recorded'} for ${projectId}.`)
    return ok()
  },

  /* FR-030 */
  setDeliverableStatus({ db, me: u }: Ctx, id: string, status: DeliverableStatus): Result {
    const del = db.deliverables.find((x) => x.id === id)
    const pr = del && db.projects.find((p) => p.id === del.projectId)
    if (!del || !pr || !u || pr.consultantId !== u.id) return { ok: false, error: 'Only the project consultant can update this deliverable.' }
    if (!['Pending', 'Submitted', 'Accepted', 'Revision requested'].includes(status)) return { ok: false, error: 'Unknown deliverable status.' }
    del.status = status
    if (status === 'Submitted') del.submissionDate = todayISO()
    audit(db, u.id, 'Update deliverable', id, `Status changed to ${status}.`)
    return ok()
  },

  completeMilestone({ db, me: u }: Ctx, id: string): Result {
    const m = db.milestones.find((x) => x.id === id)
    const pr = m && db.projects.find((p) => p.id === m.projectId)
    if (!m || !pr || !u || pr.consultantId !== u.id) return { ok: false, error: 'Only the project consultant can complete milestones.' }
    m.completionDate = todayISO()
    audit(db, u.id, 'Complete milestone', id, `Milestone “${m.title}” marked complete on ${pr.id}.`)
    return ok()
  },

  markRead({ db, me: u }: Ctx, id: string): void {
    const n = db.notifications.find((x) => x.id === id && x.recipientId === u?.id)
    if (n) n.status = 'Read'
  },

  markAllRead({ db, me: u }: Ctx): void {
    if (!u) return
    db.notifications.forEach((n) => n.recipientId === u.id && (n.status = 'Read'))
  },

  addClient({ db, me: u }: Ctx, input: Omit<Client, 'id' | 'status' | 'onboardingDate'>): Result<Client> {
    if (!can(db, u, 'client.manage')) return { ok: false, error: 'You are not authorized to add clients.' }
    if (!input.name.trim() || !input.contactPerson.trim() || !input.contactEmail.trim()) return { ok: false, error: 'Name, contact person and contact email are required.' }
    const c: Client = { ...input, id: nextId(db.clients.map((x) => x.id), 'C'), status: 'Active', onboardingDate: todayISO() }
    db.clients.push(c)
    audit(db, u!.id, 'Add client', c.id, `Client “${c.name}” onboarded.`)
    return { ok: true, value: c }
  },

  /* FR-004 */
  assignRole({ db, me: u }: Ctx, userId: string, roleId: RoleId): Result {
    if (!can(db, u, 'users.manage')) return { ok: false, error: 'Only administrators can assign roles.' }
    if (userId === u!.id) return { ok: false, error: 'You cannot change your own role.' }
    const t = db.users.find((x) => x.id === userId)
    if (!t) return { ok: false, error: 'User not found.' }
    if (!db.roles.some((r) => r.id === roleId)) return { ok: false, error: 'Unknown role.' }
    const from = db.roles.find((r) => r.id === t.roleId)?.name
    t.roleId = roleId
    const to = db.roles.find((r) => r.id === roleId)?.name
    audit(db, u!.id, 'Assign role', userId, `${t.name}: ${from} → ${to}.`)
    notify(db, [userId], 'Role changed', `Your role was changed to ${to} by ${u!.name}.`)
    return ok()
  },

  toggleUserStatus({ db, me: u }: Ctx, userId: string): Result {
    if (!can(db, u, 'users.manage')) return { ok: false, error: 'Only administrators can change account status.' }
    if (userId === u!.id) return { ok: false, error: 'You cannot deactivate your own account.' }
    const t = db.users.find((x) => x.id === userId)
    if (!t) return { ok: false, error: 'User not found.' }
    t.status = t.status === 'Active' ? 'Inactive' : 'Active'
    audit(db, u!.id, t.status === 'Active' ? 'Activate user' : 'Deactivate user', userId, `Account status changed to ${t.status}.`)
    return ok()
  },
}

export type ActionName = keyof typeof handlers
type Tail<F> = F extends (first: never, ...rest: infer R) => unknown ? R : never
export type ActionArgs<K extends ActionName> = Tail<(typeof handlers)[K]>
export type ActionResult<K extends ActionName> = ReturnType<(typeof handlers)[K]>

export const isActionName = (n: unknown): n is ActionName => typeof n === 'string' && Object.prototype.hasOwnProperty.call(handlers, n)

/** Run one named action as `actorId` against `db`, mutating `db` in place. */
export function runAction(db: DB, actorId: string | undefined, name: ActionName, args: unknown[]): unknown {
  const me = db.users.find((u) => u.id === actorId && u.status === 'Active')
  const fn = handlers[name] as (ctx: Ctx, ...a: unknown[]) => unknown
  return fn({ db, me }, ...args)
}

export const didFail = (r: unknown): boolean => typeof r === 'object' && r !== null && 'ok' in r && (r as { ok: unknown }).ok === false
