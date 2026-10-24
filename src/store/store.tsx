import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createSeed, DEMO_PASSWORD } from '../data/seed'
import type { Client, DB, DeliverableStatus, FinanceTransaction, Proposal, RoleId, User } from '../data/types'
import { inr, nextId, nowISO, todayISO } from '../lib/format'
import { agreementEligible, can, canWithdraw, financeChecks, isAwaitingDecision, isComplete, proposalErrors, type Check, type TxnInput } from './rules'

const DB_KEY = 'cpts.db.v3'
const SESSION_KEY = 'cpts.session'

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DB
      if (parsed.version === createSeed().version) return parsed
    }
  } catch {
    /* storage unavailable — fall back to seed */
  }
  return createSeed()
}

function loadSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string }

type ProposalInput = Omit<Proposal, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'ownerId' | 'submissionDate' | 'agreementId'>

/* Helpers that mutate a draft copy of the DB. */
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

function useStoreValue() {
  const [db, setDb] = useState<DB>(loadDB)
  const [sessionId, setSessionId] = useState<string | null>(loadSession)
  const ref = useRef(db)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  useEffect(() => {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db))
    } catch {
      /* ignore */
    }
  }, [db])

  useEffect(() => {
    try {
      if (sessionId) localStorage.setItem(SESSION_KEY, sessionId)
      else localStorage.removeItem(SESSION_KEY)
    } catch {
      /* ignore */
    }
  }, [sessionId])

  const user = db.users.find((u) => u.id === sessionId && u.status === 'Active')

  /** Apply a change to a deep copy, then commit. */
  const mutate = useCallback(<T,>(fn: (draft: DB) => T): T => {
    const draft: DB = structuredClone(ref.current)
    const out = fn(draft)
    ref.current = draft
    setDb(draft)
    return out
  }, [])

  const actions = useMemo(() => {
    const me = () => ref.current.users.find((u) => u.id === sessionIdRef.current)
    return {
      /* FR-001 / FR-002 */
      login(email: string, password: string): Result<User> {
        const u = ref.current.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
        if (!u || password !== DEMO_PASSWORD || u.status !== 'Active')
          return { ok: false, error: 'The email or password is incorrect, or the account is inactive.' }
        sessionIdRef.current = u.id
        setSessionId(u.id)
        return { ok: true, value: u }
      },
      /* FR-003 */
      logout() {
        sessionIdRef.current = null
        setSessionId(null)
      },
      switchUser(id: string) {
        sessionIdRef.current = id
        setSessionId(id)
      },

      /* UC-003 / FR-006, FR-008, FR-009 — create or update a draft; optionally submit (UC-004). */
      saveProposal(input: ProposalInput, opts: { id?: string; submit: boolean }): Result<Proposal> {
        const u = me()
        if (!u || !can(ref.current, u, 'proposal.create')) return { ok: false, error: 'Only faculty consultants can create proposals (BR-001).' }
        if (!input.title.trim()) return { ok: false, error: 'Enter a project title to save the draft.' }
        const existing = opts.id ? ref.current.proposals.find((p) => p.id === opts.id) : undefined
        if (existing && existing.status !== 'Draft') return { ok: false, error: `${existing.id} is ${existing.status} and can no longer be edited.` }
        const now = nowISO()
        const candidate: Proposal = {
          ...input,
          id: existing?.id ?? nextId(ref.current.proposals.map((p) => p.id), 'P'),
          ownerId: existing?.ownerId ?? u.id,
          status: 'Draft',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        if (opts.submit && !isComplete(candidate)) {
          const missing = Object.keys(proposalErrors(candidate)).length
          return { ok: false, error: `${missing} required field${missing > 1 ? 's are' : ' is'} incomplete.` }
        }
        return mutate((d) => {
          const idx = d.proposals.findIndex((p) => p.id === candidate.id)
          if (idx >= 0) d.proposals[idx] = candidate
          else d.proposals.unshift(candidate)
          audit(d, u.id, existing ? 'Edit proposal' : 'Create proposal', candidate.id, `Draft saved: “${candidate.title}”.`)
          if (opts.submit) submitInto(d, candidate.id, u)
          return { ok: true as const, value: d.proposals.find((p) => p.id === candidate.id)! }
        })
      },

      /* UC-004 Submit Proposal */
      submitProposal(id: string): Result {
        const u = me()
        const p = ref.current.proposals.find((x) => x.id === id)
        if (!p) return { ok: false, error: 'Proposal not found.' }
        if (!u || p.ownerId !== u.id || !can(ref.current, u, 'proposal.create')) return { ok: false, error: 'You are not authorized to submit this proposal.' }
        if (p.status !== 'Draft') return { ok: false, error: `Only drafts can be submitted. ${p.id} is ${p.status} (BR-004).` }
        if (!isComplete(p)) return { ok: false, error: 'Complete the missing information before submitting.' }
        mutate((d) => submitInto(d, id, u))
        return { ok: true, value: undefined }
      },

      withdrawProposal(id: string): Result {
        const u = me()
        const p = ref.current.proposals.find((x) => x.id === id)
        if (!p || !canWithdraw(p, u)) return { ok: false, error: 'This proposal cannot be withdrawn.' }
        mutate((d) => {
          const t = d.proposals.find((x) => x.id === id)!
          const from = t.status
          t.status = 'Withdrawn'
          t.updatedAt = nowISO()
          audit(d, u!.id, 'Withdraw proposal', id, `Status changed ${from} → Withdrawn.`)
          if (from === 'Submitted') notify(d, usersWithRole(d, 'approver'), 'Proposal withdrawn', `${u!.name} withdrew ${id} “${t.title}”.`, `/proposals/${id}`)
        })
        return { ok: true, value: undefined }
      },

      /* State diagram T8 — Rejected → Draft (revision → resubmission). */
      reviseProposal(id: string): Result {
        const u = me()
        const p = ref.current.proposals.find((x) => x.id === id)
        if (!p || !u || p.ownerId !== u.id || p.status !== 'Rejected') return { ok: false, error: 'Only a rejected proposal can be revised by its owner.' }
        mutate((d) => {
          const t = d.proposals.find((x) => x.id === id)!
          t.status = 'Draft'
          t.updatedAt = nowISO()
          audit(d, u.id, 'Revise proposal', id, 'Status changed Rejected → Draft for revision.')
        })
        return { ok: true, value: undefined }
      },

      /* State diagram T5 — approver opens a submitted proposal. */
      openForReview(id: string) {
        const u = me()
        const p = ref.current.proposals.find((x) => x.id === id)
        if (!p || p.status !== 'Submitted' || !can(ref.current, u, 'proposal.review')) return
        mutate((d) => {
          const t = d.proposals.find((x) => x.id === id)!
          t.status = 'Under Review'
          t.updatedAt = nowISO()
          audit(d, u!.id, 'Open for review', id, 'Status changed Submitted → Under Review.')
        })
      },

      /* UC-005 Approve Proposal / UC-006 Reject Proposal */
      decideProposal(id: string, decision: 'Approved' | 'Rejected', comments: string): Result {
        const u = me()
        if (!can(ref.current, u, 'proposal.review')) return { ok: false, error: 'You are not authorized to review proposals.' }
        const p = ref.current.proposals.find((x) => x.id === id)
        if (!p) return { ok: false, error: 'Proposal not found.' }
        if (!isAwaitingDecision(p)) return { ok: false, error: `A decision has already been recorded for ${id}.` }
        if (decision === 'Rejected' && !comments.trim()) return { ok: false, error: 'Give a reason for the rejection (FR-013).' }
        mutate((d) => {
          const t = d.proposals.find((x) => x.id === id)!
          const today = todayISO()
          d.approvals.unshift({
            id: nextId(d.approvals.map((a) => a.id), 'AP'),
            proposalId: id,
            approverId: u!.id,
            decision,
            comments: comments.trim(),
            decisionDate: today,
          })
          t.status = decision
          t.updatedAt = nowISO()
          audit(d, u!.id, decision === 'Approved' ? 'Approve proposal' : 'Reject proposal', id, decision === 'Approved' ? 'Decision recorded: Approved.' : `Reason: ${comments.trim()}`)
          notify(
            d,
            [t.ownerId],
            decision === 'Approved' ? 'Proposal approved' : 'Proposal rejected',
            decision === 'Approved'
              ? `${id} “${t.title}” was approved by ${u!.name}. It is now eligible for agreement finalization.`
              : `${id} “${t.title}” was rejected by ${u!.name}. Reason: ${comments.trim()}`,
            `/proposals/${id}`,
          )
        })
        return { ok: true, value: undefined }
      },

      /* UC-007 / FR-014, FR-034 — creates the agreement and the project. */
      finalizeAgreement(proposalId: string, input: { agreementDate: string; signatory: string; notes: string }): Result<{ agreementId: string; projectId: string }> {
        const u = me()
        if (!can(ref.current, u, 'agreement.finalize')) return { ok: false, error: 'You are not authorized to finalize agreements.' }
        const p = ref.current.proposals.find((x) => x.id === proposalId)
        if (!p || !agreementEligible(p)) return { ok: false, error: 'Only an approved proposal without an agreement can be finalized (BR-002).' }
        if (!input.agreementDate || !input.signatory.trim()) return { ok: false, error: 'Enter the agreement date and the client signatory.' }
        return mutate((d) => {
          const t = d.proposals.find((x) => x.id === proposalId)!
          const agreementId = nextId(d.agreements.map((a) => a.id), 'A')
          const projectId = nextId(d.projects.map((a) => a.id), 'PR')
          d.agreements.unshift({
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
          d.projects.unshift({
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
            const mid = `M${num}${i}`
            d.milestones.push({ id: mid, projectId, title: m.title, plannedDate: m.date })
          })
          const ms = d.milestones.filter((m) => m.projectId === projectId)
          t.deliverables.forEach((title, i) => {
            const m = ms[Math.min(i, ms.length - 1)]
            d.deliverables.push({ id: `D${num}${i}`, projectId, milestoneId: m.id, title, description: '', dueDate: m.plannedDate, status: 'Pending' })
          })
          audit(d, u!.id, 'Finalize agreement', agreementId, `Agreement finalized for ${proposalId}; project ${projectId} created.`)
          notify(d, [t.ownerId, ...t.team], 'Agreement finalized', `Agreement ${agreementId} for “${t.title}” is finalized. Project ${projectId} is now active.`, `/projects/${projectId}`)
          notify(d, usersWithRole(d, 'finance'), 'Budget required', `Project ${projectId} “${t.title}” is active. Record its approved budget to enable invoicing.`, `/finance`)
          return { ok: true as const, value: { agreementId, projectId } }
        })
      },

      /* UC-010 Record Finance Transaction */
      recordTransaction(input: TxnInput): { ok: true; txn: FinanceTransaction } | { ok: false; checks: Check[]; error: string } {
        const u = me()
        const checks = financeChecks(ref.current, u, input)
        const failed = checks.find((c) => c.state !== 'pass')
        if (failed) return { ok: false, checks, error: failed.state === 'fail' ? failed.message : 'Complete the transaction details.' }
        const txn = mutate((d) => {
          const project = d.projects.find((p) => p.id === input.projectId)!
          const t: FinanceTransaction = {
            id: nextId(d.transactions.map((x) => x.id), 'T'),
            projectId: input.projectId,
            type: input.type,
            amount: input.amount,
            date: input.date,
            reference: input.reference.trim(),
            invoiceId: input.type === 'Payment' ? input.invoiceId : undefined,
            recordedBy: u!.id,
            note: input.note.trim(),
          }
          d.transactions.push(t)
          const verb = input.type === 'Budget' ? 'Record budget' : input.type === 'Invoice' ? 'Record invoice' : 'Record payment'
          const inv = input.invoiceId ? d.transactions.find((x) => x.id === input.invoiceId) : undefined
          const detail =
            input.type === 'Payment'
              ? `Payment of ${inr(t.amount)} recorded against ${inv?.reference}.`
              : input.type === 'Invoice'
                ? `Invoice ${t.reference} of ${inr(t.amount)} recorded for ${project.id}.`
                : `Approved budget ${inr(t.amount)} recorded for ${project.id}.`
          audit(d, u!.id, verb, t.id, detail)
          notify(d, [u!.id], input.type === 'Payment' ? 'Payment confirmation' : `${input.type} recorded`, `${t.id}: ${detail}`, '/finance')
          if (input.type !== 'Budget') notify(d, [project.consultantId], `${input.type} recorded`, `${detail.replace(/\.$/, '')} on “${project.title}”.`, `/projects/${project.id}`)
          return t
        })
        return { ok: true, txn }
      },

      /* FR-015 / FR-040 / BR-010 */
      cancelProject(id: string, reason: string): Result {
        const u = me()
        const pr = ref.current.projects.find((p) => p.id === id)
        if (!pr) return { ok: false, error: 'Project not found.' }
        const allowed = can(ref.current, u, 'project.cancel') && (u!.roleId === 'admin' || pr.consultantId === u!.id)
        if (!allowed) return { ok: false, error: 'You are not authorized to cancel this project.' }
        if (pr.status !== 'Active') return { ok: false, error: `${id} is ${pr.status}.` }
        if (!reason.trim()) return { ok: false, error: 'Give a reason for cancelling.' }
        mutate((d) => {
          const t = d.projects.find((p) => p.id === id)!
          t.status = 'Cancelled'
          t.cancelReason = reason.trim()
          audit(d, u!.id, 'Cancel project', id, `Reason: ${reason.trim()}`)
          const proposal = d.proposals.find((p) => p.id === t.proposalId)
          notify(
            d,
            [t.consultantId, ...(proposal?.team ?? []), ...usersWithRole(d, 'finance'), ...usersWithRole(d, 'approver')].filter((x) => x !== u!.id),
            'Project cancelled',
            `${id} “${t.title}” was cancelled by ${u!.name}. No new financial transactions can be recorded.`,
            `/projects/${id}`,
          )
        })
        return { ok: true, value: undefined }
      },

      /* FR-029 / FR-032 */
      recordDeliverable(projectId: string, input: { milestoneId: string; title: string; description: string; dueDate: string; submitNow: boolean }): Result {
        const u = me()
        const pr = ref.current.projects.find((p) => p.id === projectId)
        if (!pr || !u || !can(ref.current, u, 'deliverable.record') || pr.consultantId !== u.id) return { ok: false, error: 'Only the project consultant can record deliverables (BR-007).' }
        if (pr.status !== 'Active') return { ok: false, error: `${projectId} is ${pr.status}.` }
        if (!input.title.trim() || !input.milestoneId || !input.dueDate) return { ok: false, error: 'Enter a title, milestone and due date.' }
        mutate((d) => {
          const id = nextId(d.deliverables.map((x) => x.id), 'D', 3)
          d.deliverables.push({
            id,
            projectId,
            milestoneId: input.milestoneId,
            title: input.title.trim(),
            description: input.description.trim(),
            dueDate: input.dueDate,
            submissionDate: input.submitNow ? todayISO() : undefined,
            status: input.submitNow ? 'Submitted' : 'Pending',
          })
          audit(d, u.id, 'Record deliverable', id, `Deliverable “${input.title.trim()}” ${input.submitNow ? 'submitted' : 'recorded'} for ${projectId}.`)
        })
        return { ok: true, value: undefined }
      },

      /* FR-030 */
      setDeliverableStatus(id: string, status: DeliverableStatus): Result {
        const u = me()
        const del = ref.current.deliverables.find((x) => x.id === id)
        const pr = del && ref.current.projects.find((p) => p.id === del.projectId)
        if (!del || !pr || !u || pr.consultantId !== u.id) return { ok: false, error: 'Only the project consultant can update this deliverable.' }
        mutate((d) => {
          const t = d.deliverables.find((x) => x.id === id)!
          t.status = status
          if (status === 'Submitted') t.submissionDate = todayISO()
          audit(d, u.id, 'Update deliverable', id, `Status changed to ${status}.`)
        })
        return { ok: true, value: undefined }
      },

      completeMilestone(id: string): Result {
        const u = me()
        const m = ref.current.milestones.find((x) => x.id === id)
        const pr = m && ref.current.projects.find((p) => p.id === m.projectId)
        if (!m || !pr || !u || pr.consultantId !== u.id) return { ok: false, error: 'Only the project consultant can complete milestones.' }
        mutate((d) => {
          d.milestones.find((x) => x.id === id)!.completionDate = todayISO()
          audit(d, u.id, 'Complete milestone', id, `Milestone “${m.title}” marked complete on ${pr.id}.`)
        })
        return { ok: true, value: undefined }
      },

      markRead(id: string) {
        mutate((d) => {
          const n = d.notifications.find((x) => x.id === id)
          if (n) n.status = 'Read'
        })
      },
      markAllRead() {
        const u = me()
        if (!u) return
        mutate((d) => d.notifications.forEach((n) => n.recipientId === u.id && (n.status = 'Read')))
      },

      addClient(input: Omit<Client, 'id' | 'status' | 'onboardingDate'>): Result<Client> {
        const u = me()
        if (!can(ref.current, u, 'client.manage')) return { ok: false, error: 'You are not authorized to add clients.' }
        if (!input.name.trim() || !input.contactPerson.trim() || !input.contactEmail.trim()) return { ok: false, error: 'Name, contact person and contact email are required.' }
        return mutate((d) => {
          const c: Client = { ...input, id: nextId(d.clients.map((x) => x.id), 'C'), status: 'Active', onboardingDate: todayISO() }
          d.clients.push(c)
          audit(d, u!.id, 'Add client', c.id, `Client “${c.name}” onboarded.`)
          return { ok: true as const, value: c }
        })
      },

      /* FR-004 */
      assignRole(userId: string, roleId: RoleId): Result {
        const u = me()
        if (!can(ref.current, u, 'users.manage')) return { ok: false, error: 'Only administrators can assign roles.' }
        if (userId === u!.id) return { ok: false, error: 'You cannot change your own role.' }
        mutate((d) => {
          const t = d.users.find((x) => x.id === userId)!
          const from = d.roles.find((r) => r.id === t.roleId)?.name
          t.roleId = roleId
          const to = d.roles.find((r) => r.id === roleId)?.name
          audit(d, u!.id, 'Assign role', userId, `${t.name}: ${from} → ${to}.`)
          notify(d, [userId], 'Role changed', `Your role was changed to ${to} by ${u!.name}.`)
        })
        return { ok: true, value: undefined }
      },
      toggleUserStatus(userId: string): Result {
        const u = me()
        if (!can(ref.current, u, 'users.manage')) return { ok: false, error: 'Only administrators can change account status.' }
        if (userId === u!.id) return { ok: false, error: 'You cannot deactivate your own account.' }
        mutate((d) => {
          const t = d.users.find((x) => x.id === userId)!
          t.status = t.status === 'Active' ? 'Inactive' : 'Active'
          audit(d, u!.id, t.status === 'Active' ? 'Activate user' : 'Deactivate user', userId, `Account status changed to ${t.status}.`)
        })
        return { ok: true, value: undefined }
      },

      resetDemo() {
        const fresh = createSeed()
        ref.current = fresh
        setDb(fresh)
      },
    }
  }, [mutate])

  return { db, user, actions }
}

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

type Store = ReturnType<typeof useStoreValue>
const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue()
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore outside provider')
  return s
}

/** Convenience lookups */
export function useLookup() {
  const { db } = useStore()
  return useMemo(
    () => ({
      user: (id?: string) => db.users.find((u) => u.id === id),
      client: (id?: string) => db.clients.find((c) => c.id === id),
      project: (id?: string) => db.projects.find((p) => p.id === id),
      proposal: (id?: string) => db.proposals.find((p) => p.id === id),
      agreement: (id?: string) => db.agreements.find((a) => a.id === id),
      role: (id?: string) => db.roles.find((r) => r.id === id),
    }),
    [db],
  )
}
