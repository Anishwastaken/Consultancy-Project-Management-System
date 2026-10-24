// Business rules from Lab 2 (Section 14) and the validation flows of
// UC-004, UC-005 and UC-010. Pure functions so each rule can be traced and
// tested independently of the UI.

import type { DB, FinanceTransaction, Permission, Project, Proposal, TransactionType, User } from '../data/types'

export function can(db: DB, user: User | undefined, perm: Permission) {
  if (!user || user.status !== 'Active') return false
  return db.roles.find((r) => r.id === user.roleId)?.permissions.includes(perm) ?? false
}

/* ----------------------------------------------------------- Proposals -- */

export const PROPOSAL_FIELDS: { key: keyof Proposal; label: string }[] = [
  { key: 'clientId', label: 'Client' },
  { key: 'title', label: 'Project title' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'proposedBudget', label: 'Proposed budget' },
  { key: 'startDate', label: 'Start date' },
  { key: 'endDate', label: 'End date' },
  { key: 'scope', label: 'Scope of work' },
  { key: 'deliverables', label: 'Deliverables' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'team', label: 'Consultant / team' },
  { key: 'expectedOutcomes', label: 'Expected outcomes' },
  { key: 'terms', label: 'Terms and conditions' },
]

/** FR-007 information required before submission (UC-004 step 5 — isComplete()). */
export function proposalErrors(p: Proposal): Partial<Record<keyof Proposal, string>> {
  const e: Partial<Record<keyof Proposal, string>> = {}
  if (!p.clientId) e.clientId = 'Select the client this proposal is for.'
  if (!p.title.trim()) e.title = 'Enter a project title.'
  if (!p.description.trim()) e.description = 'Describe the engagement in a sentence or two.'
  if (!p.category) e.category = 'Choose a category.'
  if (!p.proposedBudget || p.proposedBudget <= 0) e.proposedBudget = 'Enter a proposed budget greater than zero.'
  if (!p.startDate) e.startDate = 'Enter a start date.'
  if (!p.endDate) e.endDate = 'Enter an end date.'
  else if (p.startDate && p.endDate <= p.startDate) e.endDate = 'End date must be after the start date.'
  if (!p.scope.trim()) e.scope = 'Describe the scope of work.'
  if (p.deliverables.filter((d) => d.trim()).length === 0) e.deliverables = 'Add at least one deliverable.'
  if (p.milestones.filter((m) => m.title.trim() && m.date).length === 0) e.milestones = 'Add at least one milestone with a date.'
  else if (p.milestones.some((m) => (m.title.trim() && !m.date) || (!m.title.trim() && m.date)))
    e.milestones = 'Each milestone needs both a title and a date.'
  if (p.team.length === 0) e.team = 'Assign at least one consultant.'
  if (!p.expectedOutcomes.trim()) e.expectedOutcomes = 'State the expected outcomes.'
  if (!p.terms.trim()) e.terms = 'Add the terms and conditions.'
  return e
}

export const isComplete = (p: Proposal) => Object.keys(proposalErrors(p)).length === 0

/** FR-009: editing depends on status. Drafts are editable by their owner. */
export const canEditProposal = (p: Proposal, u?: User) => !!u && p.ownerId === u.id && p.status === 'Draft'

/** Section 11.1 / State diagram T9: withdraw from Draft, Submitted or Rejected. */
export const canWithdraw = (p: Proposal, u?: User) =>
  !!u && p.ownerId === u.id && ['Draft', 'Submitted', 'Rejected'].includes(p.status)

/** UC-005 alternative flow / US-008 AC-03: decisions only on Submitted or Under Review. */
export const isAwaitingDecision = (p: Proposal) => p.status === 'Submitted' || p.status === 'Under Review'

/** FR-033 / BR-002 / BR-008: agreement eligibility. */
export const agreementEligible = (p: Proposal) => p.status === 'Approved' && !p.agreementId

/* ------------------------------------------------------------- Finance -- */

export interface ProjectFinance {
  budget: number | null
  invoiced: number
  received: number
  outstanding: number // invoiced but unpaid
  available: number // budget not yet received (BR-006 ceiling)
  uninvoiced: number // budget not yet invoiced
  invoices: { txn: FinanceTransaction; paid: number; outstanding: number }[]
}

export function projectFinance(db: DB, projectId: string): ProjectFinance {
  const txns = db.transactions.filter((t) => t.projectId === projectId)
  const budgetTxn = txns.find((t) => t.type === 'Budget')
  const budget = budgetTxn ? budgetTxn.amount : null
  const invoicesRaw = txns.filter((t) => t.type === 'Invoice')
  const payments = txns.filter((t) => t.type === 'Payment')
  const invoices = invoicesRaw.map((inv) => {
    const paid = payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0)
    return { txn: inv, paid, outstanding: inv.amount - paid }
  })
  const invoiced = invoicesRaw.reduce((s, t) => s + t.amount, 0)
  const received = payments.reduce((s, t) => s + t.amount, 0)
  return {
    budget,
    invoiced,
    received,
    outstanding: invoiced - received,
    available: (budget ?? 0) - received,
    uninvoiced: (budget ?? 0) - invoiced,
    invoices,
  }
}

export interface TxnInput {
  projectId: string
  type: TransactionType
  amount: number
  date: string
  reference: string
  invoiceId?: string
  note: string
}

export type CheckState = 'pass' | 'fail' | 'pending'
export interface Check {
  id: 'auth' | 'agreement' | 'budget' | 'duplicate'
  label: string
  rule: string
  state: CheckState
  message: string
}

/**
 * UC-010 step 6–8 and the four sequential checks of State Diagram 02
 * (Checking Authorization → Agreement → Budget → Duplicate). A failed check
 * stops the sequence: later checks stay pending, as in the activity diagram.
 */
export function financeChecks(db: DB, user: User | undefined, input: TxnInput): Check[] {
  const project: Project | undefined = db.projects.find((p) => p.id === input.projectId)
  const fin = project ? projectFinance(db, project.id) : undefined
  const checks: Check[] = [
    { id: 'auth', label: 'Officer authorized', rule: 'BR-007', state: 'pending', message: '' },
    { id: 'agreement', label: 'Agreement finalized and budget defined', rule: 'BR-003 · BR-010', state: 'pending', message: '' },
    { id: 'budget', label: 'Within approved budget', rule: 'BR-006', state: 'pending', message: '' },
    { id: 'duplicate', label: 'Not already recorded', rule: 'BR-005', state: 'pending', message: '' },
  ]
  const [auth, agr, bud, dup] = checks

  if (!can(db, user, 'finance.record')) {
    auth.state = 'fail'
    auth.message = 'Only an active Finance/Accounts Officer can record transactions.'
    return checks
  }
  auth.state = 'pass'
  auth.message = `${user!.name} holds the Finance/Accounts Officer role.`

  if (!project || !fin) return checks
  const agreement = db.agreements.find((a) => a.id === project.agreementId)
  if (project.status === 'Cancelled') {
    agr.state = 'fail'
    agr.message = `${project.id} is cancelled. Cancelled projects cannot accept new transactions.`
    return checks
  }
  if (!agreement || agreement.status !== 'Finalized') {
    agr.state = 'fail'
    agr.message = 'No finalized agreement is linked to this project.'
    return checks
  }
  if (input.type === 'Budget') {
    if (fin.budget !== null) {
      agr.state = 'fail'
      agr.message = `An approved budget of ₹${fin.budget.toLocaleString('en-IN')} is already recorded for this project.`
      return checks
    }
    agr.state = 'pass'
    agr.message = `Agreement ${agreement.id} is finalized.`
  } else {
    if (fin.budget === null) {
      agr.state = 'fail'
      agr.message = 'Record the approved budget for this project first.'
      return checks
    }
    agr.state = 'pass'
    agr.message = `Agreement ${agreement.id} is finalized; budget ₹${fin.budget.toLocaleString('en-IN')} is defined.`
  }

  const amount = input.amount
  if (!amount || amount <= 0) return checks

  if (input.type === 'Budget') {
    bud.state = 'pass'
    bud.message = `Sets the approved budget for ${project.id} (FR-021). Agreement value: ₹${agreement.value.toLocaleString('en-IN')}.`
  } else if (input.type === 'Invoice') {
    if (amount > fin.uninvoiced) {
      bud.state = 'fail'
      bud.message = `Only ₹${fin.uninvoiced.toLocaleString('en-IN')} of the approved budget is left to invoice.`
      return checks
    }
    bud.state = 'pass'
    bud.message = `₹${(fin.uninvoiced - amount).toLocaleString('en-IN')} of budget will remain uninvoiced.`
  } else {
    const inv = fin.invoices.find((i) => i.txn.id === input.invoiceId)
    if (!inv) return checks
    if (amount > fin.available) {
      bud.state = 'fail'
      bud.message = `Payments would exceed the approved budget. Available balance: ₹${fin.available.toLocaleString('en-IN')}.`
      return checks
    }
    if (amount > inv.outstanding) {
      bud.state = 'fail'
      bud.message = `Amount is more than the ₹${inv.outstanding.toLocaleString('en-IN')} outstanding on ${inv.txn.reference}.`
      return checks
    }
    bud.state = 'pass'
    bud.message = `Available balance after payment: ₹${(fin.available - amount).toLocaleString('en-IN')}.`
  }

  const ref = input.reference.trim().toLowerCase()
  if (!ref) return checks
  const same = db.transactions.filter((t) => t.type === input.type && t.projectId === project.id)
  let dupOf: FinanceTransaction | undefined
  if (input.type === 'Payment') {
    dupOf = db.transactions.find(
      (t) =>
        t.type === 'Payment' &&
        (t.reference.trim().toLowerCase() === ref ||
          (t.invoiceId === input.invoiceId && t.amount === amount && t.date === input.date)),
    )
  } else {
    dupOf = (input.type === 'Invoice' ? db.transactions.filter((t) => t.type === 'Invoice') : same).find(
      (t) => t.reference.trim().toLowerCase() === ref,
    )
  }
  if (dupOf) {
    dup.state = 'fail'
    dup.message = `Already recorded as ${dupOf.id} (${dupOf.reference}, ₹${dupOf.amount.toLocaleString('en-IN')}).`
    return checks
  }
  dup.state = 'pass'
  dup.message = 'No matching transaction found.'
  return checks
}

/* ------------------------------------------------------------ Lifecycle -- */

export type LifecycleStage = 'Draft' | 'Submitted' | 'Under Review' | 'Decision' | 'Agreement' | 'Active' | 'Completed'
export const LIFECYCLE: LifecycleStage[] = ['Draft', 'Submitted', 'Under Review', 'Decision', 'Agreement', 'Active', 'Completed']

/** Index of the furthest lifecycle stage reached (Lab 2, Section 17). */
export function lifecycleIndex(db: DB, p: Proposal): number {
  const project = db.projects.find((pr) => pr.proposalId === p.id)
  if (project?.status === 'Completed') return 6
  if (project) return 5
  if (p.agreementId) return 4
  if (p.status === 'Approved' || p.status === 'Rejected') return 3
  if (p.status === 'Under Review') return 2
  if (p.status === 'Submitted') return 1
  return 0
}
