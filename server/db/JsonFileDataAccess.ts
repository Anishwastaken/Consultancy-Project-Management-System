// Fallback store: one JSON file. Used only when DATA_STORE=json, e.g. on a
// machine without MySQL. Demo accounts all use the shared demo password.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createSeed, DEMO_PASSWORD } from '../../src/data/seed'
import type { DB } from '../../src/data/types'
import type { IDataAccess, Snapshot } from './IDataAccess'

export class JsonFileDataAccess implements IDataAccess {
  private readonly file: string

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true })
    this.file = path.join(dir, 'db.json')
  }

  get description() {
    return `JSON file ${this.file}`
  }

  async init() {
    try {
      const saved = JSON.parse(readFileSync(this.file, 'utf8')) as Snapshot
      if (saved.db?.version === createSeed().version) return
    } catch {
      /* first run */
    }
    this.write({ rev: 1, db: createSeed() })
  }

  async load(): Promise<Snapshot> {
    return JSON.parse(readFileSync(this.file, 'utf8')) as Snapshot
  }

  async commit(_before: DB, after: DB, rev: number) {
    this.write({ rev, db: after })
  }

  async reset(seed: DB, rev: number) {
    this.write({ rev, db: seed })
  }

  async verifyPassword(_userId: string, password: string) {
    return password === DEMO_PASSWORD
  }

  async close() {}

  private write(s: Snapshot) {
    const tmp = this.file + '.tmp'
    writeFileSync(tmp, JSON.stringify(s))
    renameSync(tmp, this.file)
  }
}
