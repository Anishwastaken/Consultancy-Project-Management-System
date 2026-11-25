// IDataAccess — the Data Access Layer interface from the component diagram
// (Lab 5, Section 39). Business components never talk to the database
// directly; they go through this interface, so the store can be swapped
// (MySQL in normal use, a JSON file as a fallback) without touching the rules.

import type { DB } from '../../src/data/types'

export interface Snapshot {
  rev: number
  db: DB
}

export interface IDataAccess {
  /** Human-readable description for the start-up log. */
  readonly description: string

  /** Create the schema if needed and load the sample data into an empty store. */
  init(): Promise<void>

  /** Read every record. */
  load(): Promise<Snapshot>

  /** Persist the difference between `before` and `after` atomically, as revision `rev`. */
  commit(before: DB, after: DB, rev: number): Promise<void>

  /** Replace all data with `seed` (demo reset), as revision `rev`. */
  reset(seed: DB, rev: number): Promise<void>

  /** Check a user's password against the stored credential. */
  verifyPassword(userId: string, password: string): Promise<boolean>

  close(): Promise<void>
}
