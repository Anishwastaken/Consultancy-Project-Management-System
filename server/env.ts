// Loads settings from .env (if present) before any other server module reads
// process.env. Imported first by server/index.ts.

import { existsSync } from 'node:fs'
import path from 'node:path'

const file = path.resolve(import.meta.dirname, '..', '.env')
if (existsSync(file)) process.loadEnvFile(file)
