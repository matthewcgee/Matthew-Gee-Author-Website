// Confirms the data service can reach its database and the schema is in place:
//   ACUITAS_DB=sqlserver ACUITAS_DB_CONNECTION="..." npm run check-db
// It writes, reads and removes one test record, and checks that the audit
// log's append-only trigger exists. It never touches real records.

import { createRepoFromEnv } from '../src/config.js'

const step = (msg) => process.stdout.write(`${msg} ... `)
const ok = (extra = '') => console.log(`ok${extra ? ` (${extra})` : ''}`)

const repo = await createRepoFromEnv()
try {
  step(`Connecting (${repo.kind})`); await repo.ping(); ok()
  step('Reading change numbers'); const c = await repo.changes(0); ok(`${c.changed.length} collections, latest change ${c.seq}`)
  step('Write, read and remove a test record')
  const id = `check_${Date.now()}`
  await repo.tx((t) => t.put('_healthcheck', id, { at: new Date().toISOString() }, 'check-db'))
  if (!(await repo.get('_healthcheck', id))) throw new Error('the test record could not be read back')
  await repo.tx((t) => t.del('_healthcheck', id))
  ok()
  if (repo.kind !== 'memory') {
    step('Audit log append-only trigger')
    // Confirm the trigger is installed and enabled, without writing an audit row.
    let refused = false
    if (repo.kind === 'postgres') {
      const { default: pg } = await import('pg')
      const client = new pg.Client({ connectionString: process.env.ACUITAS_DB_CONNECTION })
      await client.connect()
      const r = await client.query("SELECT 1 FROM pg_trigger WHERE tgname = 'tr_acuitas_audit_append_only' AND NOT tgisinternal")
      refused = r.rowCount === 1
      await client.end()
    } else {
      const mod = await import('mssql')
      const sql = mod.default || mod
      const pool = await new sql.ConnectionPool(process.env.ACUITAS_DB_CONFIG ? JSON.parse(process.env.ACUITAS_DB_CONFIG) : process.env.ACUITAS_DB_CONNECTION).connect()
      const r = await pool.request().query("SELECT 1 AS x FROM sys.triggers WHERE name = 'tr_acuitas_audit_append_only' AND is_disabled = 0")
      refused = r.recordset.length === 1
      await pool.close()
    }
    if (!refused) throw new Error('the trigger tr_acuitas_audit_append_only is missing or disabled; run the schema script in api/sql/')
    ok()
  }
  console.log('\nThe Acuitas database is ready.')
} catch (e) {
  console.log('FAILED')
  console.error(e.message)
  process.exitCode = 1
} finally {
  await repo.close()
}
