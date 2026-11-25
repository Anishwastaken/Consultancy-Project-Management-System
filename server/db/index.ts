// Chooses the data store from the environment (.env).
//
//   DATA_STORE=mysql (default)  MySQL, configured by MYSQL_HOST / MYSQL_PORT /
//                               MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
//   DATA_STORE=json             a local JSON file (fallback for machines without MySQL)

import type { IDataAccess } from './IDataAccess'
import { JsonFileDataAccess } from './JsonFileDataAccess'
import { MySqlDataAccess } from './MySqlDataAccess'

export class ConfigError extends Error {}

export function createDataAccess(dataDir: string): IDataAccess {
  const kind = (process.env.DATA_STORE ?? 'mysql').trim().toLowerCase()
  if (kind === 'json') return new JsonFileDataAccess(dataDir)
  if (kind !== 'mysql') throw new ConfigError(`DATA_STORE must be "mysql" or "json", not "${kind}".`)

  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env
  if (!MYSQL_USER)
    throw new ConfigError(
      'MySQL is not configured. Copy .env.example to .env and set MYSQL_USER and MYSQL_PASSWORD ' +
        '(or set DATA_STORE=json to use a local file instead).',
    )
  return new MySqlDataAccess({
    host: MYSQL_HOST || 'localhost',
    port: Number(MYSQL_PORT || 3306),
    user: MYSQL_USER,
    password: MYSQL_PASSWORD ?? '',
    database: MYSQL_DATABASE || 'cpts',
  })
}

/** Turn low-level connection errors into an instruction the user can act on. */
export function explainStoreError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  switch (err.code) {
    case 'ECONNREFUSED':
      return 'Could not connect to MySQL. Check that the MySQL service is running and that MYSQL_HOST / MYSQL_PORT in .env are right.'
    case 'ER_ACCESS_DENIED_ERROR':
      return 'MySQL refused the username or password. Check MYSQL_USER and MYSQL_PASSWORD in .env.'
    case 'ER_DBACCESS_DENIED_ERROR':
    case 'ER_SPECIFIC_ACCESS_DENIED_ERROR':
      return 'This MySQL user is not allowed to create or use the database. Grant it access, or use the root account for development.'
    default:
      return err.message ?? String(e)
  }
}
