// npm run db:reset — drop and recreate the CPTS tables, then load the sample data.
// Stop `npm run dev` first (or restart it afterwards) so the server reloads.

import '../env'
import path from 'node:path'
import { createDataAccess, explainStoreError } from '../db'
import { JsonFileDataAccess } from '../db/JsonFileDataAccess'
import { MySqlDataAccess } from '../db/MySqlDataAccess'
import { createSeed } from '../../src/data/seed'

const dataDir = process.env.CPTS_DATA_DIR ? path.resolve(process.env.CPTS_DATA_DIR) : path.join(import.meta.dirname, '..', 'data')

try {
  const store = createDataAccess(dataDir)
  if (store instanceof MySqlDataAccess) {
    await store.dropAll()
    await store.init() // recreates the schema and loads the sample data
  } else if (store instanceof JsonFileDataAccess) {
    await store.reset(createSeed(), 1)
  }
  const { db } = await store.load()
  console.log(`[db] ${store.description}: recreated with ${db.users.length} users, ${db.proposals.length} proposals, ${db.transactions.length} transactions.`)
  console.log('[db] restart `npm run dev` if it is running.')
  await store.close()
} catch (e) {
  console.error(`[db] ${explainStoreError(e)}`)
  process.exit(1)
}
