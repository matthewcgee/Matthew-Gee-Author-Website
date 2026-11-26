// Acuitas data service — configuration from environment variables.
//
//   ACUITAS_DB              sqlserver | postgres | memory   (default: memory)
//   ACUITAS_DB_CONNECTION   connection string for sqlserver or postgres
//   ACUITAS_DB_CONFIG       SQL Server only: a JSON config object instead of a
//                           connection string, e.g. to sign in with the app's
//                           managed identity:
//                           {"server":"x.database.windows.net","database":"acuitas",
//                            "authentication":{"type":"azure-active-directory-default"},
//                            "options":{"encrypt":true}}
//   ACUITAS_DB_AUTO_SCHEMA  1 = create the tables at start-up (development only;
//                           production runs the script in api/sql/ once)
//   ACUITAS_AUTH            swa | proxy | dev   (see src/core/principal.js)
//   ACUITAS_ROLE_MAP        JSON map of directory group or role -> Acuitas role

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createMemoryRepo } from './repo/memory.js'
import { createPostgresRepo, createSqlServerRepo } from './repo/sql.js'
import { principalConfig } from './core/principal.js'
import { createService } from './core/service.js'

const sqlFile = (name) => readFileSync(fileURLToPath(new URL(`../sql/${name}`, import.meta.url)), 'utf8')

export function sqlServerBatches() {
  return sqlFile('sqlserver.sql').split(/^\s*GO\s*$/m).map((b) => b.trim()).filter((b) => b && !/^(--[^\n]*\n?)*$/.test(b))
}

export function postgresSchema() {
  return sqlFile('postgres.sql')
}

export async function createRepoFromEnv(env = process.env) {
  const kind = (env.ACUITAS_DB || 'memory').toLowerCase()
  const autoSchema = env.ACUITAS_DB_AUTO_SCHEMA === '1'
  if (kind === 'memory') return createMemoryRepo()
  if (kind === 'postgres' || kind === 'postgresql') {
    if (!env.ACUITAS_DB_CONNECTION) throw new Error('Set ACUITAS_DB_CONNECTION to the PostgreSQL connection string.')
    return createPostgresRepo({ connectionString: env.ACUITAS_DB_CONNECTION, autoSchema, schemaSql: postgresSchema() })
  }
  if (kind === 'sqlserver' || kind === 'mssql' || kind === 'azuresql') {
    const config = env.ACUITAS_DB_CONFIG ? JSON.parse(env.ACUITAS_DB_CONFIG) : null
    if (!config && !env.ACUITAS_DB_CONNECTION) throw new Error('Set ACUITAS_DB_CONNECTION (or ACUITAS_DB_CONFIG) for SQL Server.')
    return createSqlServerRepo({ connectionString: env.ACUITAS_DB_CONNECTION, config, autoSchema, schemaBatches: sqlServerBatches() })
  }
  throw new Error(`Unknown ACUITAS_DB "${kind}". Use sqlserver, postgres or memory.`)
}

let cached = null
/** One service per process, created on first use. */
export function serviceFromEnv(env = process.env) {
  if (!cached) {
    cached = (async () => {
      if ((env.ACUITAS_DB || 'memory') === 'memory' && env.NODE_ENV === 'production') {
        console.warn('Acuitas data service: ACUITAS_DB is not set; using the in-memory store. Data will be lost on restart.')
      }
      const repo = await createRepoFromEnv(env)
      return createService({ repo, auth: principalConfig(env) })
    })()
    cached.catch(() => { cached = null })
  }
  return cached
}
