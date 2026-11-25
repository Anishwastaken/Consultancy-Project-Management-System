-- =============================================================================
-- CPTS — Consultancy Project Tracking System
-- MySQL schema (MySQL 8.0.16+; developed on 9.5)
--
-- One table per class of the class model (Lab 4, Section 33.1), plus the
-- entities of Lab 2, Section 16 that the full system needs (Milestone,
-- Deliverable) and join tables for multi-valued attributes.
--
--   Class (Lab 4)        Table                    Notes
--   -------------------  -----------------------  ----------------------------
--   Role                 roles, role_permissions  permissions is a lookup
--   User                 users                    password stored as a hash
--   Client               clients
--   Proposal             proposals                + proposal_deliverables,
--                                                   proposal_milestones,
--                                                   proposal_team
--   Approval             approvals                composition of Proposal
--   Agreement            agreements               0..1 per proposal
--   Project              projects                 0..1 per proposal/agreement
--   FinanceTransaction   finance_transactions     composition of Project
--   Milestone            milestones               (Lab 2 §16)
--   Deliverable          deliverables             (Lab 2 §16, FR-032)
--   Notification         notifications
--   AuditLog             audit_logs
--
-- Business rules are enforced first by the application (src/store/rules.ts)
-- and again here where a database constraint can express them, so a bad
-- write is refused even if it bypasses the application.
--
-- Every statement is idempotent (IF NOT EXISTS / INSERT IGNORE): the server
-- runs this file on start-up. `npm run db:reset` drops and recreates.
-- =============================================================================

-- ---------------------------------------------------------------- Roles --
-- FR-004, FR-005: each user holds exactly one role; a role grants permissions.

CREATE TABLE IF NOT EXISTS roles (
  role_id      VARCHAR(20)  NOT NULL,           -- faculty, approver, finance, admin, management
  code         CHAR(3)      NOT NULL,           -- R01 … R05, as in the object diagram
  name         VARCHAR(60)  NOT NULL,
  description  VARCHAR(255) NOT NULL,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS permissions (
  permission_code VARCHAR(40)  NOT NULL,
  description     VARCHAR(120) NOT NULL,
  PRIMARY KEY (permission_code)
) ENGINE = InnoDB;

INSERT IGNORE INTO permissions (permission_code, description) VALUES
  ('proposal.create',    'Create and submit proposals'),
  ('proposal.review',    'Approve or reject proposals'),
  ('agreement.finalize', 'Finalize agreements'),
  ('finance.record',     'Record budgets, invoices and payments'),
  ('project.cancel',     'Cancel projects'),
  ('deliverable.record', 'Record deliverables'),
  ('client.manage',      'Add clients'),
  ('users.manage',       'Manage users and roles'),
  ('audit.view',         'View audit log'),
  ('reports.view',       'View reports');

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id         VARCHAR(20) NOT NULL,
  permission_code VARCHAR(40) NOT NULL,
  position        TINYINT     NOT NULL DEFAULT 0,
  PRIMARY KEY (role_id, permission_code),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)         REFERENCES roles (role_id),
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_code) REFERENCES permissions (permission_code)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------- Users --
-- Only institutional accounts may exist (sign-in rule: @lnmiit.ac.in).

CREATE TABLE IF NOT EXISTS users (
  user_id        VARCHAR(10)  NOT NULL,          -- U101 …
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(120) NOT NULL,
  phone          VARCHAR(30)  NOT NULL DEFAULT '',
  role_id        VARCHAR(20)  NOT NULL,
  department     VARCHAR(100) NOT NULL DEFAULT '',
  title          VARCHAR(100) NOT NULL DEFAULT '',
  account_status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  password_hash  VARCHAR(200) NOT NULL,          -- scrypt; never the plain password
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_role (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (role_id),
  CONSTRAINT ck_users_institute_email CHECK (email LIKE '%@lnmiit.ac.in')
) ENGINE = InnoDB;

-- -------------------------------------------------------------- Clients --

CREATE TABLE IF NOT EXISTS clients (
  client_id              VARCHAR(10)  NOT NULL,  -- C017 …
  name                   VARCHAR(150) NOT NULL,
  organization_type      VARCHAR(60)  NOT NULL,
  contact_person         VARCHAR(100) NOT NULL,
  contact_email          VARCHAR(120) NOT NULL,
  contact_phone          VARCHAR(30)  NOT NULL DEFAULT '',
  address                VARCHAR(255) NOT NULL DEFAULT '',
  assigned_consultant_id VARCHAR(10)  NOT NULL,
  onboarding_date        DATE         NOT NULL,
  category               VARCHAR(60)  NOT NULL,
  status                 ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  PRIMARY KEY (client_id),
  KEY ix_clients_consultant (assigned_consultant_id),
  CONSTRAINT fk_clients_consultant FOREIGN KEY (assigned_consultant_id) REFERENCES users (user_id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------ Proposals --
-- FR-006 … FR-010. Drafts may be incomplete (FR-008), so most columns are
-- nullable; completeness is checked on submission (UC-004 step 5).

CREATE TABLE IF NOT EXISTS proposals (
  proposal_id       VARCHAR(10)   NOT NULL,      -- P042 …
  client_id         VARCHAR(10)   NULL,
  owner_id          VARCHAR(10)   NOT NULL,      -- the submitting consultant (BR-001)
  title             VARCHAR(200)  NOT NULL,
  description       TEXT          NOT NULL,
  category          VARCHAR(60)   NOT NULL DEFAULT '',
  proposed_budget   DECIMAL(14,2) NULL,
  start_date        DATE          NULL,
  end_date          DATE          NULL,
  scope             TEXT          NOT NULL,
  expected_outcomes TEXT          NOT NULL,
  terms             TEXT          NOT NULL,
  status            ENUM('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Withdrawn') NOT NULL DEFAULT 'Draft',
  submission_date   DATE          NULL,          -- recorded by UC-004 step 7
  created_at        DATETIME      NOT NULL,
  updated_at        DATETIME      NOT NULL,
  PRIMARY KEY (proposal_id),
  KEY ix_proposals_owner (owner_id),
  KEY ix_proposals_client (client_id),
  KEY ix_proposals_status (status),
  CONSTRAINT fk_proposals_client FOREIGN KEY (client_id) REFERENCES clients (client_id),
  CONSTRAINT fk_proposals_owner  FOREIGN KEY (owner_id)  REFERENCES users (user_id),
  CONSTRAINT ck_proposals_title  CHECK (CHAR_LENGTH(TRIM(title)) > 0),
  CONSTRAINT ck_proposals_budget CHECK (proposed_budget IS NULL OR proposed_budget > 0),
  CONSTRAINT ck_proposals_dates  CHECK (start_date IS NULL OR end_date IS NULL OR end_date > start_date),
  -- BR-004: only a draft can be submitted, so anything past Draft (other than a
  -- draft withdrawn before submission) has a submission date.
  CONSTRAINT ck_proposals_submitted CHECK (status IN ('Draft', 'Withdrawn') OR submission_date IS NOT NULL)
) ENGINE = InnoDB;

-- FR-007 multi-valued attributes of Proposal.
CREATE TABLE IF NOT EXISTS proposal_deliverables (
  proposal_id VARCHAR(10)  NOT NULL,
  position    SMALLINT     NOT NULL,
  title       VARCHAR(200) NOT NULL,
  PRIMARY KEY (proposal_id, position),
  CONSTRAINT fk_pd_proposal FOREIGN KEY (proposal_id) REFERENCES proposals (proposal_id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS proposal_milestones (
  proposal_id  VARCHAR(10)  NOT NULL,
  position     SMALLINT     NOT NULL,
  title        VARCHAR(200) NOT NULL,
  planned_date DATE         NULL,
  PRIMARY KEY (proposal_id, position),
  CONSTRAINT fk_pm_proposal FOREIGN KEY (proposal_id) REFERENCES proposals (proposal_id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS proposal_team (
  proposal_id VARCHAR(10) NOT NULL,
  user_id     VARCHAR(10) NOT NULL,
  position    SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (proposal_id, user_id),
  CONSTRAINT fk_pt_proposal FOREIGN KEY (proposal_id) REFERENCES proposals (proposal_id),
  CONSTRAINT fk_pt_user     FOREIGN KEY (user_id)     REFERENCES users (user_id)
) ENGINE = InnoDB;

-- ------------------------------------------------------------ Approvals --
-- UC-005 / UC-006. Composition: Proposal 1 — Approval 0..*.

CREATE TABLE IF NOT EXISTS approvals (
  approval_id   VARCHAR(10) NOT NULL,            -- AP019 …
  proposal_id   VARCHAR(10) NOT NULL,
  approver_id   VARCHAR(10) NOT NULL,
  decision      ENUM('Approved', 'Rejected') NOT NULL,
  comments      TEXT        NOT NULL,
  decision_date DATE        NOT NULL,            -- UC-005 step 8
  PRIMARY KEY (approval_id),
  KEY ix_approvals_proposal (proposal_id),
  CONSTRAINT fk_approvals_proposal FOREIGN KEY (proposal_id) REFERENCES proposals (proposal_id),
  CONSTRAINT fk_approvals_approver FOREIGN KEY (approver_id) REFERENCES users (user_id),
  -- FR-013: a rejection must carry a reason.
  CONSTRAINT ck_approvals_reason CHECK (decision = 'Approved' OR CHAR_LENGTH(TRIM(comments)) > 0)
) ENGINE = InnoDB;

-- ----------------------------------------------------------- Agreements --
-- FR-014, FR-033 … FR-036. BR-002 / BR-008: one agreement per approved proposal.

CREATE TABLE IF NOT EXISTS agreements (
  agreement_id    VARCHAR(10)   NOT NULL,        -- A031 …
  proposal_id     VARCHAR(10)   NOT NULL,
  client_id       VARCHAR(10)   NOT NULL,
  agreement_date  DATE          NOT NULL,
  reference       VARCHAR(40)   NOT NULL,        -- CPTS/AGR/2026/031
  signatory       VARCHAR(150)  NOT NULL,
  agreement_value DECIMAL(14,2) NOT NULL,
  notes           TEXT          NOT NULL,
  status          ENUM('Finalized') NOT NULL DEFAULT 'Finalized',
  PRIMARY KEY (agreement_id),
  UNIQUE KEY uq_agreements_proposal (proposal_id),
  UNIQUE KEY uq_agreements_reference (reference),
  CONSTRAINT fk_agreements_proposal FOREIGN KEY (proposal_id) REFERENCES proposals (proposal_id),
  CONSTRAINT fk_agreements_client   FOREIGN KEY (client_id)   REFERENCES clients (client_id),
  CONSTRAINT ck_agreements_value    CHECK (agreement_value >= 0)
) ENGINE = InnoDB;

-- ------------------------------------------------------------- Projects --
-- FR-015 … FR-020. Agreement 1 — Project 0..1 (BR-003).

CREATE TABLE IF NOT EXISTS projects (
  project_id    VARCHAR(10)  NOT NULL,           -- PR031 …
  proposal_id   VARCHAR(10)  NOT NULL,
  client_id     VARCHAR(10)  NOT NULL,
  agreement_id  VARCHAR(10)  NOT NULL,
  title         VARCHAR(200) NOT NULL,
  start_date    DATE         NOT NULL,
  end_date      DATE         NOT NULL,
  status        ENUM('Active', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Active',
  consultant_id VARCHAR(10)  NOT NULL,
  cancel_reason TEXT         NULL,
  PRIMARY KEY (project_id),
  UNIQUE KEY uq_projects_proposal (proposal_id),
  UNIQUE KEY uq_projects_agreement (agreement_id),
  KEY ix_projects_consultant (consultant_id),
  CONSTRAINT fk_projects_proposal   FOREIGN KEY (proposal_id)   REFERENCES proposals (proposal_id),
  CONSTRAINT fk_projects_client     FOREIGN KEY (client_id)     REFERENCES clients (client_id),
  CONSTRAINT fk_projects_agreement  FOREIGN KEY (agreement_id)  REFERENCES agreements (agreement_id),
  CONSTRAINT fk_projects_consultant FOREIGN KEY (consultant_id) REFERENCES users (user_id),
  -- FR-015 / FR-040: a cancellation is always explained.
  CONSTRAINT ck_projects_cancel_reason CHECK (status <> 'Cancelled' OR (cancel_reason IS NOT NULL AND CHAR_LENGTH(TRIM(cancel_reason)) > 0))
) ENGINE = InnoDB;

-- ----------------------------------------------- Milestones / Deliverables --
-- FR-029 … FR-032.

CREATE TABLE IF NOT EXISTS milestones (
  milestone_id    VARCHAR(10)  NOT NULL,         -- M310 …
  project_id      VARCHAR(10)  NOT NULL,
  title           VARCHAR(200) NOT NULL,
  planned_date    DATE         NOT NULL,
  completion_date DATE         NULL,
  PRIMARY KEY (milestone_id),
  UNIQUE KEY uq_milestones_project (milestone_id, project_id),
  KEY ix_milestones_project (project_id),
  CONSTRAINT fk_milestones_project FOREIGN KEY (project_id) REFERENCES projects (project_id)
) ENGINE = InnoDB;

CREATE TABLE IF NOT EXISTS deliverables (
  deliverable_id  VARCHAR(10)  NOT NULL,         -- D310 …
  project_id      VARCHAR(10)  NOT NULL,
  milestone_id    VARCHAR(10)  NOT NULL,
  title           VARCHAR(200) NOT NULL,
  description     TEXT         NOT NULL,
  due_date        DATE         NOT NULL,
  submission_date DATE         NULL,
  status          ENUM('Pending', 'Submitted', 'Accepted', 'Revision requested') NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (deliverable_id),
  KEY ix_deliverables_project (project_id),
  CONSTRAINT fk_deliverables_project FOREIGN KEY (project_id) REFERENCES projects (project_id),
  -- FR-032: the milestone must belong to the same project.
  CONSTRAINT fk_deliverables_milestone FOREIGN KEY (milestone_id, project_id) REFERENCES milestones (milestone_id, project_id)
) ENGINE = InnoDB;

-- ------------------------------------------------- Finance transactions --
-- UC-010, FR-021 … FR-028. Composition: Project 1 — FinanceTransaction 0..*.

CREATE TABLE IF NOT EXISTS finance_transactions (
  transaction_id   VARCHAR(10)   NOT NULL,       -- T118 …
  project_id       VARCHAR(10)   NOT NULL,
  txn_type         ENUM('Budget', 'Invoice', 'Payment') NOT NULL,
  amount           DECIMAL(14,2) NOT NULL,
  transaction_date DATE          NOT NULL,
  reference        VARCHAR(60)   NOT NULL,       -- BUD/…, INV/…, UTR …
  invoice_id       VARCHAR(10)   NULL,           -- the invoice a payment settles
  recorded_by      VARCHAR(10)   NOT NULL,       -- BR-007
  note             TEXT          NOT NULL,
  -- One approved budget per project (FR-021): unique only for Budget rows.
  budget_project_id VARCHAR(10) GENERATED ALWAYS AS (IF(txn_type = 'Budget', project_id, NULL)) VIRTUAL,
  PRIMARY KEY (transaction_id),
  UNIQUE KEY uq_txn_one_budget_per_project (budget_project_id),
  UNIQUE KEY uq_txn_project (transaction_id, project_id),
  -- BR-005: the same invoice number or payment reference can't be recorded twice.
  UNIQUE KEY uq_txn_reference (txn_type, reference),
  KEY ix_txn_project (project_id),
  CONSTRAINT fk_txn_project     FOREIGN KEY (project_id)  REFERENCES projects (project_id),
  CONSTRAINT fk_txn_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (user_id),
  -- A payment settles an invoice of the same project.
  CONSTRAINT fk_txn_invoice FOREIGN KEY (invoice_id, project_id) REFERENCES finance_transactions (transaction_id, project_id),
  CONSTRAINT ck_txn_amount CHECK (amount > 0),
  CONSTRAINT ck_txn_payment_has_invoice CHECK ((txn_type = 'Payment') = (invoice_id IS NOT NULL))
) ENGINE = InnoDB;

-- -------------------------------------------------------- Notifications --
-- FR-037 … FR-040.

CREATE TABLE IF NOT EXISTS notifications (
  notification_id VARCHAR(12)  NOT NULL,         -- N201 …
  recipient_id    VARCHAR(10)  NOT NULL,
  type            VARCHAR(60)  NOT NULL,
  message         TEXT         NOT NULL,
  created_at      DATETIME     NOT NULL,
  status          ENUM('Unread', 'Read') NOT NULL DEFAULT 'Unread',
  link            VARCHAR(120) NULL,
  PRIMARY KEY (notification_id),
  KEY ix_notifications_recipient (recipient_id, status),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users (user_id)
) ENGINE = InnoDB;

-- ----------------------------------------------------------- Audit logs --
-- NFR-007, NFR-020. `entity` names any record (P042, T118, U109 …), so it is
-- not a foreign key.

CREATE TABLE IF NOT EXISTS audit_logs (
  log_id     VARCHAR(12)  NOT NULL,              -- L308 …
  actor_id   VARCHAR(10)  NOT NULL,
  action     VARCHAR(60)  NOT NULL,
  entity     VARCHAR(20)  NOT NULL,
  details    TEXT         NOT NULL,
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (log_id),
  KEY ix_audit_created (created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users (user_id)
) ENGINE = InnoDB;

-- -------------------------------------------------------------- App meta --
-- Schema version and a revision counter the browser uses to detect changes.

CREATE TABLE IF NOT EXISTS app_meta (
  meta_key   VARCHAR(40) NOT NULL,
  meta_value VARCHAR(80) NOT NULL,
  PRIMARY KEY (meta_key)
) ENGINE = InnoDB;
