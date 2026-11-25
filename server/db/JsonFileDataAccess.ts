// Fallback store: one JSON file. Used only when DATA_STORE=json, e.g. on a
// machine without MySQL. Sample accounts use the shared demo password;
// accounts created by sign-up keep their own password hash in the file.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createSeed, DEMO_PASSWORD } from '../../src/data/seed'
import type { DB } from '../../src/data/types'
import type { IDataAccess, Snapshot } from './IDataAccess'
import { checkPassword } from './passwords'

type Saved = Snapshot & { passwords?: Record<string, string> }

export class JsonFileDataAccess implements IDataAccess {
  private readonly file: string
  private passwords: Record<string, string> = {}

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, 'db.json')
  }

  get description() {
    return `JSON file ${this.file}`
  }

  async init() {
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved
      if (saved.db?.version === createSeed().version) {
        this.passwords = saved.passwords ?? {}
        return
      }
    } catch {
      /* first run */
    }
    this.write({ rev: 1, db: createSeed() }, {})
  }

  async load(): Promise<Snapshot> {
    const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Saved
    this.passwords = saved.passwords ?? {}
    return { rev: saved.rev, db: saved.db }
  }

  async commit(_before: DB, after: DB, rev: number, passwords: Record<string, string> = {}) {
    this.write({ rev, db: after }, { ...this.passwords, ...passwords })
  }

  async reset(seed: DB, rev: number) {
    this.write({ rev, db: seed }, {})
  }

  async verifyPassword(userId: string, password: string) {
    const hash = this.passwords[userId]
    return hash ? checkPassword(password, hash) : password === DEMO_PASSWORD
  }

  async close() {}

  private write(s: Snapshot, passwords: Record<string, string>) {
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify({ ...s, passwords }))
    renameSync(tmp, this.file)
    this.passwords = passwords
  }
}
