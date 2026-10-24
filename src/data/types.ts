// Domain model — mirrors the class model in Lab 4, Section 33.1 and the
// entities of Lab 2, Section 16.

export type RoleId = 'faculty' | 'approver' | 'finance' | 'admin' | 'management'

export type Permission =
  | 'proposal.create'
  | 'proposal.review'
  | 'agreement.finalize'
  | 'finance.record'
  | 'project.cancel'
  | 'deliverable.record'
  | 'client.manage'
  | 'users.manage'
  | 'audit.view'
  | 'reports.view'

export interface Role {
  id: RoleId
  code: string // R01…R05, as used in the object diagram
  name: string
  description: string
  permissions: Permission[]
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  roleId: RoleId
  department: string
  title: string
  status: 'Active' | 'Inactive'
}

export interface Client {
  id: string
  name: string
  orgType: string
  contactPerson: string
  contactEmail: string
  contactPhone: string
  address: string
  consultantId: string
  onboardingDate: string
  category: string
  status: 'Active' | 'Inactive'
}

export type ProposalStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Rejected' | 'Withdrawn'

export interface ProposalMilestone {
  title: string
  date: string
}

export interface Proposal {
  id: string
  clientId: string
  ownerId: string
  title: string
  description: string
  category: string
  proposedBudget: number | null
  startDate: string
  endDate: string
  scope: string
  deliverables: string[]
  milestones: ProposalMilestone[]
  team: string[]
  expectedOutcomes: string
  terms: string
  status: ProposalStatus
  createdAt: string
  updatedAt: string
  submissionDate?: string
  agreementId?: string
}

export interface Approval {
  id: string
  proposalId: string
  approverId: string
  decision: 'Approved' | 'Rejected'
  comments: string
  decisionDate: string
}

export interface Agreement {
  id: string
  proposalId: string
  clientId: string
  agreementDate: string
  reference: string
  signatory: string
  value: number
  notes: string
  status: 'Finalized'
}

export type ProjectStatus = 'Active' | 'Completed' | 'Cancelled'

export interface Project {
  id: string
  proposalId: string
  clientId: string
  agreementId: string
  title: string
  startDate: string
  endDate: string
  status: ProjectStatus
  consultantId: string
  cancelReason?: string
}

export type TransactionType = 'Budget' | 'Invoice' | 'Payment'

export interface FinanceTransaction {
  id: string
  projectId: string
  type: TransactionType
  amount: number
  date: string
  reference: string
  invoiceId?: string // payments settle an invoice
  recordedBy: string
  note: string
}

export interface Milestone {
  id: string
  projectId: string
  title: string
  plannedDate: string
  completionDate?: string
}

export type DeliverableStatus = 'Pending' | 'Submitted' | 'Accepted' | 'Revision requested'

export interface Deliverable {
  id: string
  projectId: string
  milestoneId: string
  title: string
  description: string
  dueDate: string
  submissionDate?: string
  status: DeliverableStatus
}

export interface Notification {
  id: string
  recipientId: string
  type: string
  message: string
  timestamp: string
  status: 'Unread' | 'Read'
  link?: string
}

export interface AuditLog {
  id: string
  actorId: string
  action: string
  entity: string
  details: string
  timestamp: string
}

export interface DB {
  version: number
  users: User[]
  roles: Role[]
  clients: Client[]
  proposals: Proposal[]
  approvals: Approval[]
  agreements: Agreement[]
  projects: Project[]
  transactions: FinanceTransaction[]
  milestones: Milestone[]
  deliverables: Deliverable[]
  notifications: Notification[]
  audit: AuditLog[]
}
