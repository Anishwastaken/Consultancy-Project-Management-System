// MySQL implementation of IDataAccess.
//
// Mapping: each class in src/data/types.ts has a TableSpec below that says
// which table it lives in and how its fields map to columns. Multi-valued
// attributes (a proposal's deliverables, milestones and team; a role's
// permissions) live in child tables.
//
// Writes: the server applies a use case to an in-memory copy, then calls
// commit(before, after). Only rows that changed are written, all inside one
// transaction, so a failure leaves the database exactly as it was.

import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createSeed, DEMO_PASSWORD } from '../../src/data/seed'
import type {
  Agreement,
  Approval,
  AuditLog,
  Client,
  DB,
  Deliverable,
  FinanceTransaction,
  Milestone,
  Notification,
  Permission,
  Project,
  Proposal,
  Role,
  RoleId,
  User,
} from '../../src/data/types'
import type { IDataAccess, Snapshot } from './IDataAccess'
import { checkPassword, hashPassword } from './passwords'

export interface MySqlConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

const SCHEMA_VERSION = '1'
const SCHEMA_FILE = path.join(import.meta.dirname, 'schema.sql')

type Row = Record<string, string | number | null>

/* ------------------------------------------------- value conversions -- */

const toDate = (s?: string) => (s ? s.slice(0, 10) : null)
const toDateTime = (s?: string) => (s ? s.replace('T', ' ').slice(0, 19) : null)
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const opt = (v: unknown) => (v === null || v === undefined ? undefined : String(v))
const fromDateTime = (v: unknown) => str(v).replace(' ', 'T')

/* ------------------------------------------------------ table specs -- */

interface ChildSpec<T> {
  table: string
  parentKey: string
  rows: (t: T) => Row[]
}

interface TableSpec<T> {
  table: string
  key: string
  list: (db: DB) => T[]
  id: (t: T) => string
  row: (t: T) => Row
  /** Columns written only when the record is first created (e.g. a password hash). */
  onInsert?: (t: T) => Row
  children?: ChildSpec<T>[]
  /** Delete order inside this table (finance: payments before the invoices they settle). */
  deleteOrder?: string
}

function spec<T>(s: TableSpec<T>): TableSpec<unknown> {
  return s as unknown as TableSpec<unknown>
}

// Listed in foreign-key dependency order: parents before children.
const SPECS: TableSpec<unknown>[] = [
  spec<Role>({
    table: 'roles',
    key: 'role_id',
    list: (db) => db.roles,
    id: (r) => r.id,
    row: (r) => ({ role_id: r.id, code: r.code, name: r.name, description: r.description }),
    children: [{ table: 'role_permissions', parentKey: 'role_id', rows: (r) => r.permissions.map((p, i) => ({ role_id: r.id, permission_code: p, position: i })) }],
  }),
  spec<User>({
    table: 'users',
    key: 'user_id',
    list: (db) => db.users,
    id: (u) => u.id,
    row: (u) => ({ user_id: u.id, name: u.name, email: u.email, phone: u.phone, role_id: u.roleId, department: u.department, title: u.title, account_status: u.status }),
    // Sample accounts start with the shared demo password, stored hashed.
    onInsert: () => ({ password_hash: hashPassword(DEMO_PASSWORD) }),
  }),
  spec<Client>({
    table: 'clients',
    key: 'client_id',
    list: (db) => db.clients,
    id: (c) => c.id,
    row: (c) => ({
      client_id: c.id,
      name: c.name,
      organization_type: c.orgType,
      contact_person: c.contactPerson,
      contact_email: c.contactEmail,
      contact_phone: c.contactPhone,
      address: c.address,
      assigned_consultant_id: c.consultantId,
      onboarding_date: toDate(c.onboardingDate),
      category: c.category,
      status: c.status,
    }),
  }),
  spec<Proposal>({
    table: 'proposals',
    key: 'proposal_id',
    list: (db) => db.proposals,
    id: (p) => p.id,
    row: (p) => ({
      proposal_id: p.id,
      client_id: p.clientId || null,
      owner_id: p.ownerId,
      title: p.title,
      description: p.description,
      category: p.category,
      proposed_budget: p.proposedBudget ?? null,
      start_date: toDate(p.startDate),
      end_date: toDate(p.endDate),
      scope: p.scope,
      expected_outcomes: p.expectedOutcomes,
      terms: p.terms,
      status: p.status,
      submission_date: toDate(p.submissionDate),
      created_at: toDateTime(p.createdAt),
      updated_at: toDateTime(p.updatedAt),
    }),
    children: [
      { table: 'proposal_deliverables', parentKey: 'proposal_id', rows: (p) => p.deliverables.map((title, i) => ({ proposal_id: p.id, position: i, title })) },
      { table: 'proposal_milestones', parentKey: 'proposal_id', rows: (p) => p.milestones.map((m, i) => ({ proposal_id: p.id, position: i, title: m.title, planned_date: toDate(m.date) })) },
      { table: 'proposal_team', parentKey: 'proposal_id', rows: (p) => p.team.map((u, i) => ({ proposal_id: p.id, user_id: u, position: i })) },
    ],
  }),
  spec<Approval>({
    table: 'approvals',
    key: 'approval_id',
    list: (db) => db.approvals,
    id: (a) => a.id,
    row: (a) => ({ approval_id: a.id, proposal_id: a.proposalId, approver_id: a.approverId, decision: a.decision, comments: a.comments, decision_date: toDate(a.decisionDate) }),
  }),
  spec<Agreement>({
    table: 'agreements',
    key: 'agreement_id',
    list: (db) => db.agreements,
    id: (a) => a.id,
    row: (a) => ({
      agreement_id: a.id,
      proposal_id: a.proposalId,
      client_id: a.clientId,
      agreement_date: toDate(a.agreementDate),
      reference: a.reference,
      signatory: a.signatory,
      agreement_value: a.value,
      notes: a.notes,
      status: a.status,
    }),
  }),
  spec<Project>({
    table: 'projects',
    key: 'project_id',
    list: (db) => db.projects,
    id: (p) => p.id,
    row: (p) => ({
      project_id: p.id,
      proposal_id: p.proposalId,
      client_id: p.clientId,
      agreement_id: p.agreementId,
      title: p.title,
      start_date: toDate(p.startDate),
      end_date: toDate(p.endDate),
      status: p.status,
      consultant_id: p.consultantId,
      cancel_reason: p.cancelReason ?? null,
    }),
  }),
  spec<Milestone>({
    table: 'milestones',
    key: 'milestone_id',
    list: (db) => db.milestones,
    id: (m) => m.id,
    row: (m) => ({ milestone_id: m.id, project_id: m.projectId, title: m.title, planned_date: toDate(m.plannedDate), completion_date: toDate(m.completionDate) }),
  }),
  spec<Deliverable>({
    table: 'deliverables',
    key: 'deliverable_id',
    list: (db) => db.deliverables,
    id: (d) => d.id,
    row: (d) => ({
      deliverable_id: d.id,
      project_id: d.projectId,
      milestone_id: d.milestoneId,
      title: d.title,
      description: d.description,
      due_date: toDate(d.dueDate),
      submission_date: toDate(d.submissionDate),
      status: d.status,
    }),
  }),
  spec<FinanceTransaction>({
    table: 'finance_transactions',
    key: 'transaction_id',
    list: (db) => db.transactions,
    id: (t) => t.id,
    row: (t) => ({
      transaction_id: t.id,
      project_id: t.projectId,
      txn_type: t.type,
      amount: t.amount,
      transaction_date: toDate(t.date),
      reference: t.reference,
      invoice_id: t.invoiceId ?? null,
      recorded_by: t.recordedBy,
      note: t.note,
    }),
    deleteOrder: '(invoice_id IS NULL)',
  }),
  spec<Notification>({
    table: 'notifications',
    key: 'notification_id',
    list: (db) => db.notifications,
    id: (n) => n.id,
    row: (n) => ({ notification_id: n.id, recipient_id: n.recipientId, type: n.type, message: n.message, created_at: toDateTime(n.timestamp), status: n.status, link: n.link ?? null }),
  }),
  spec<AuditLog>({
    table: 'audit_logs',
    key: 'log_id',
    list: (db) => db.audit,
    id: (a) => a.id,
    row: (a) => ({ log_id: a.id, actor_id: a.actorId, action: a.action, entity: a.entity, details: a.details, created_at: toDateTime(a.timestamp) }),
  }),
]

/** Every table holding records, children first: the safe order for deleting. */
const DELETE_ORDER = SPECS.slice()
  .reverse()
  .flatMap((s) => [...(s.children ?? []).map((c) => ({ table: c.table, order: undefined as string | undefined })), { table: s.table, order: s.deleteOrder }])

const emptyDB = (): DB => ({
  version: createSeed().version,
  users: [],
  roles: [],
  clients: [],
  proposals: [],
  approvals: [],
  agreements: [],
  projects: [],
  transactions: [],
  milestones: [],
  deliverables: [],
  notifications: [],
  audit: [],
})

const same = (a: Row, b: Row) => JSON.stringify(a) === JSON.stringify(b)

/* -------------------------------------------------------- data access -- */

export class MySqlDataAccess implements IDataAccess {
  private pool: Pool | null = null

  constructor(private readonly cfg: MySqlConfig) {
    if (!/^[A-Za-z0-9_]+$/.test(cfg.database)) throw new Error(`Invalid MYSQL_DATABASE name "${cfg.database}". Use letters, digits and underscores.`)
  }

  get description() {
    return `MySQL ${this.cfg.user}@${this.cfg.host}:${this.cfg.port}/${this.cfg.database}`
  }

  private get db(): Pool {
    if (!this.pool) throw new Error('MySQL pool not initialised; call init() first.')
    return this.pool
  }

  async init() {
    // Create the database and tables (idempotent).
    const admin = await mysql.createConnection({ host: this.cfg.host, port: this.cfg.port, user: this.cfg.user, password: this.cfg.password, multipleStatements: true })
    try {
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${this.cfg.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`)
      await admin.query(`USE \`${this.cfg.database}\``)
      await admin.query(readFileSync(SCHEMA_FILE, 'utf8'))
    } finally {
      await admin.end()
    }

    this.pool = mysql.createPool({
      host: this.cfg.host,
      port: this.cfg.port,
      user: this.cfg.user,
      password: this.cfg.password,
      database: this.cfg.database,
      connectionLimit: 5,
      dateStrings: true, // DATE → 'YYYY-MM-DD', DATETIME → 'YYYY-MM-DD HH:MM:SS'
      decimalNumbers: true, // DECIMAL → number
    })

    const [meta] = await this.db.query<RowDataPacket[]>(`SELECT meta_value FROM app_meta WHERE meta_key = 'schema_version'`)
    if (!meta.length) await this.db.query(`INSERT INTO app_meta (meta_key, meta_value) VALUES ('schema_version', ?)`, [SCHEMA_VERSION])
    else if (meta[0].meta_value !== SCHEMA_VERSION)
      console.log(`[db] warning: database schema is version ${meta[0].meta_value}, the app expects ${SCHEMA_VERSION}. Run "npm run db:reset".`)

    const [[{ n }]] = await this.db.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM users')
    if (Number(n) === 0) {
      console.log('[db] empty database: loading the sample data')
      await this.reset(createSeed(), 1)
    }
  }

  async load(): Promise<Snapshot> {
    const q = async (sql: string) => (await this.db.query<RowDataPacket[]>(sql))[0]
    const byId = (col: string) => `ORDER BY CHAR_LENGTH(${col}), ${col}`

    const [roles, rolePerms, users, clients, proposals, pDeliv, pMiles, pTeam, approvals, agreements, projects, milestones, deliverables, txns, notifications, audit, meta] = await Promise.all([
      q(`SELECT * FROM roles ORDER BY code`),
      q(`SELECT * FROM role_permissions ORDER BY role_id, position`),
      q(`SELECT * FROM users ${byId('user_id')}`),
      q(`SELECT * FROM clients ${byId('client_id')}`),
      q(`SELECT * FROM proposals ${byId('proposal_id')}`),
      q(`SELECT * FROM proposal_deliverables ORDER BY proposal_id, position`),
      q(`SELECT * FROM proposal_milestones ORDER BY proposal_id, position`),
      q(`SELECT * FROM proposal_team ORDER BY proposal_id, position`),
      q(`SELECT * FROM approvals ORDER BY decision_date DESC, CHAR_LENGTH(approval_id) DESC, approval_id DESC`),
      q(`SELECT * FROM agreements ${byId('agreement_id')}`),
      q(`SELECT * FROM projects ${byId('project_id')}`),
      q(`SELECT * FROM milestones ${byId('milestone_id')}`),
      q(`SELECT * FROM deliverables ${byId('deliverable_id')}`),
      q(`SELECT transaction_id, project_id, txn_type, amount, transaction_date, reference, invoice_id, recorded_by, note FROM finance_transactions ${byId('transaction_id')}`),
      q(`SELECT * FROM notifications ORDER BY created_at DESC, CHAR_LENGTH(notification_id) DESC, notification_id DESC`),
      q(`SELECT * FROM audit_logs ORDER BY created_at DESC, CHAR_LENGTH(log_id) DESC, log_id DESC`),
      q(`SELECT meta_value FROM app_meta WHERE meta_key = 'rev'`),
    ])

    const group = (rows: RowDataPacket[]) => {
      const m = new Map<string, RowDataPacket[]>()
      for (const r of rows) m.set(r.proposal_id ?? r.role_id, [...(m.get(r.proposal_id ?? r.role_id) ?? []), r])
      return m
    }
    const permsByRole = group(rolePerms)
    const delivByProposal = group(pDeliv)
    const milesByProposal = group(pMiles)
    const teamByProposal = group(pTeam)
    const agreementByProposal = new Map(agreements.map((a) => [String(a.proposal_id), String(a.agreement_id)]))

    const db: DB = {
      version: createSeed().version,
      roles: roles.map((r) => ({
        id: r.role_id as RoleId,
        code: r.code,
        name: r.name,
        description: r.description,
        permissions: (permsByRole.get(r.role_id) ?? []).map((p) => p.permission_code as Permission),
      })),
      users: users.map((u) => ({ id: u.user_id, name: u.name, email: u.email, phone: u.phone, roleId: u.role_id, department: u.department, title: u.title, status: u.account_status })),
      clients: clients.map((c) => ({
        id: c.client_id,
        name: c.name,
        orgType: c.organization_type,
        contactPerson: c.contact_person,
        contactEmail: c.contact_email,
        contactPhone: c.contact_phone,
        address: c.address,
        consultantId: c.assigned_consultant_id,
        onboardingDate: str(c.onboarding_date),
        category: c.category,
        status: c.status,
      })),
      proposals: proposals.map((p) => ({
        id: p.proposal_id,
        clientId: str(p.client_id),
        ownerId: p.owner_id,
        title: p.title,
        description: p.description,
        category: p.category,
        proposedBudget: p.proposed_budget ?? null,
        startDate: str(p.start_date),
        endDate: str(p.end_date),
        scope: p.scope,
        deliverables: (delivByProposal.get(p.proposal_id) ?? []).map((d) => d.title),
        milestones: (milesByProposal.get(p.proposal_id) ?? []).map((m) => ({ title: m.title, date: str(m.planned_date) })),
        team: (teamByProposal.get(p.proposal_id) ?? []).map((t) => t.user_id),
        expectedOutcomes: p.expected_outcomes,
        terms: p.terms,
        status: p.status,
        createdAt: fromDateTime(p.created_at),
        updatedAt: fromDateTime(p.updated_at),
        submissionDate: opt(p.submission_date),
        agreementId: agreementByProposal.get(p.proposal_id),
      })),
      approvals: approvals.map((a) => ({ id: a.approval_id, proposalId: a.proposal_id, approverId: a.approver_id, decision: a.decision, comments: a.comments, decisionDate: str(a.decision_date) })),
      agreements: agreements.map((a) => ({
        id: a.agreement_id,
        proposalId: a.proposal_id,
        clientId: a.client_id,
        agreementDate: str(a.agreement_date),
        reference: a.reference,
        signatory: a.signatory,
        value: Number(a.agreement_value),
        notes: a.notes,
        status: a.status,
      })),
      projects: projects.map((p) => ({
        id: p.project_id,
        proposalId: p.proposal_id,
        clientId: p.client_id,
        agreementId: p.agreement_id,
        title: p.title,
        startDate: str(p.start_date),
        endDate: str(p.end_date),
        status: p.status,
        consultantId: p.consultant_id,
        cancelReason: opt(p.cancel_reason),
      })),
      milestones: milestones.map((m) => ({ id: m.milestone_id, projectId: m.project_id, title: m.title, plannedDate: str(m.planned_date), completionDate: opt(m.completion_date) })),
      deliverables: deliverables.map((d) => ({
        id: d.deliverable_id,
        projectId: d.project_id,
        milestoneId: d.milestone_id,
        title: d.title,
        description: d.description,
        dueDate: str(d.due_date),
        submissionDate: opt(d.submission_date),
        status: d.status,
      })),
      transactions: txns.map((t) => ({
        id: t.transaction_id,
        projectId: t.project_id,
        type: t.txn_type,
        amount: Number(t.amount),
        date: str(t.transaction_date),
        reference: t.reference,
        invoiceId: opt(t.invoice_id),
        recordedBy: t.recorded_by,
        note: t.note,
      })),
      notifications: notifications.map((n) => ({ id: n.notification_id, recipientId: n.recipient_id, type: n.type, message: n.message, timestamp: fromDateTime(n.created_at), status: n.status, link: opt(n.link) })),
      audit: audit.map((a) => ({ id: a.log_id, actorId: a.actor_id, action: a.action, entity: a.entity, details: a.details, timestamp: fromDateTime(a.created_at) })),
    }
    return { rev: meta.length ? Number(meta[0].meta_value) : 1, db }
  }

  async commit(before: DB, after: DB, rev: number, passwords: Record<string, string> = {}) {
    await this.transaction(async (c) => {
      await applyDiff(c, before, after)
      for (const [userId, hash] of Object.entries(passwords)) await c.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, userId])
      await setRev(c, rev)
    })
  }

  async reset(seed: DB, rev: number) {
    await this.transaction(async (c) => {
      for (const t of DELETE_ORDER) await c.query(`DELETE FROM \`${t.table}\`${t.order ? ` ORDER BY ${t.order}` : ''}`)
      await applyDiff(c, emptyDB(), seed)
      await setRev(c, rev)
    })
  }

  /** Drop every CPTS table (used by `npm run db:reset`, followed by init()). */
  async dropAll() {
    const admin = await mysql.createConnection({ host: this.cfg.host, port: this.cfg.port, user: this.cfg.user, password: this.cfg.password })
    try {
      await admin.query(`CREATE DATABASE IF NOT EXISTS \`${this.cfg.database}\``)
      await admin.query(`USE \`${this.cfg.database}\``)
      for (const t of [...DELETE_ORDER.map((d) => d.table), 'permissions', 'app_meta']) await admin.query(`DROP TABLE IF EXISTS \`${t}\``)
    } finally {
      await admin.end()
    }
  }

  async verifyPassword(userId: string, password: string) {
    const [rows] = await this.db.query<RowDataPacket[]>('SELECT password_hash FROM users WHERE user_id = ?', [userId])
    return rows.length > 0 && checkPassword(password, String(rows[0].password_hash))
  }

  async close() {
    await this.pool?.end()
    this.pool = null
  }

  private async transaction(fn: (c: PoolConnection) => Promise<void>) {
    const c = await this.db.getConnection()
    try {
      await c.beginTransaction()
      await fn(c)
      await c.commit()
    } catch (e) {
      await c.rollback()
      throw e
    } finally {
      c.release()
    }
  }
}

/* ------------------------------------------------------ diff writer -- */

async function insert(c: PoolConnection, table: string, row: Row) {
  const cols = Object.keys(row)
  await c.query(`INSERT INTO \`${table}\` (${cols.map((k) => `\`${k}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(row))
}

async function update(c: PoolConnection, table: string, key: string, row: Row) {
  const cols = Object.keys(row).filter((k) => k !== key)
  await c.query(`UPDATE \`${table}\` SET ${cols.map((k) => `\`${k}\` = ?`).join(', ')} WHERE \`${key}\` = ?`, [...cols.map((k) => row[k]), row[key]])
}

async function replaceChildren(c: PoolConnection, child: ChildSpec<unknown>, parentId: string, rows: Row[]) {
  await c.query(`DELETE FROM \`${child.table}\` WHERE \`${child.parentKey}\` = ?`, [parentId])
  for (const r of rows) await insert(c, child.table, r)
}

/** Write only what changed between two snapshots. */
async function applyDiff(c: PoolConnection, before: DB, after: DB) {
  // Removals, children before parents.
  for (const s of SPECS.slice().reverse()) {
    const keep = new Set(s.list(after).map(s.id))
    for (const t of s.list(before).slice().reverse()) {
      const id = s.id(t)
      if (keep.has(id)) continue
      for (const child of s.children ?? []) await c.query(`DELETE FROM \`${child.table}\` WHERE \`${child.parentKey}\` = ?`, [id])
      await c.query(`DELETE FROM \`${s.table}\` WHERE \`${s.key}\` = ?`, [id])
    }
  }
  // Inserts and updates, parents before children.
  for (const s of SPECS) {
    const prev = new Map(s.list(before).map((t) => [s.id(t), t]))
    for (const t of s.list(after)) {
      const id = s.id(t)
      const row = s.row(t)
      const old = prev.get(id)
      if (!old) {
        await insert(c, s.table, { ...row, ...(s.onInsert?.(t) ?? {}) })
        for (const child of s.children ?? []) for (const r of child.rows(t)) await insert(c, child.table, r)
        continue
      }
      if (!same(s.row(old), row)) await update(c, s.table, s.key, row)
      for (const child of s.children ?? []) {
        const rows = child.rows(t)
        if (JSON.stringify(child.rows(old)) !== JSON.stringify(rows)) await replaceChildren(c, child, id, rows)
      }
    }
  }
}

async function setRev(c: PoolConnection, rev: number) {
  await c.query(`INSERT INTO app_meta (meta_key, meta_value) VALUES ('rev', ?) ON DUPLICATE KEY UPDATE meta_value = ?`, [String(rev), String(rev)])
}
