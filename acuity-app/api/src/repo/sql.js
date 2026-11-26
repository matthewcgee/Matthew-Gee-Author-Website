// SQL stores: Microsoft SQL Server / Azure SQL, and PostgreSQL.
//
// Both use the same three objects (see ../../sql/):
//   acuitas_records   one row per record: (collection, id) -> JSON
//   acuitas_versions  one row per collection: the change number of its last write
//   acuitas_seq       the change-number sequence
//
// Every write runs in a transaction that locks the record it changes, so two
// people saving at once never overwrite each other's read-check-write, and
// collection change numbers are handed out in commit order so polling clients
// never miss an update. A database trigger refuses any UPDATE or DELETE of an
// audit entry, so the audit log stays append-only even outside the service.

const SCHEMA_ERROR = 'The Acuitas tables are missing. Run the schema script in api/sql/ (or set ACUITAS_DB_AUTO_SCHEMA=1 for a development database).'

function parseData(v) {
  if (v == null) return null
  return typeof v === 'string' ? JSON.parse(v) : v
}

function withSchemaHint(e) {
  const msg = String(e?.message || e)
  if (/acuitas_records|acuitas_versions|acuitas_seq/.test(msg) && /(does not exist|Invalid object name|not exist)/i.test(msg)) {
    const err = new Error(SCHEMA_ERROR)
    err.cause = e
    return err
  }
  return e
}

/* ---------------------------------------------------------------- PostgreSQL */

export async function createPostgresRepo({ connectionString, autoSchema = false, schemaSql = null, pool = null }) {
  const pg = await import('pg')
  const Pool = pg.default?.Pool || pg.Pool
  const db = pool || new Pool({ connectionString, max: 10 })
  if (autoSchema && schemaSql) await db.query(schemaSql)

  const current = async (q) => {
    const r = await q('SELECT COALESCE(MAX(seq), 0) AS seq FROM acuitas_versions')
    return Number(r.rows[0].seq)
  }
  const run = (client) => (text, params) => client.query(text, params)

  return {
    kind: 'postgres',
    async ping() { await db.query('SELECT 1') },
    async list(collection) {
      try {
        const q = run(db)
        const r = await q('SELECT id, data FROM acuitas_records WHERE collection = $1 ORDER BY id', [collection])
        return { items: r.rows.map((x) => ({ id: x.id, data: parseData(x.data) })), seq: await current(q) }
      } catch (e) { throw withSchemaHint(e) }
    },
    async get(collection, id) {
      const r = await db.query('SELECT data FROM acuitas_records WHERE collection = $1 AND id = $2', [collection, id])
      return r.rows.length ? parseData(r.rows[0].data) : null
    },
    async changes(since) {
      try {
        const r = await db.query('SELECT collection, seq FROM acuitas_versions')
        const seq = r.rows.reduce((m, x) => Math.max(m, Number(x.seq)), 0)
        return { seq, changed: r.rows.filter((x) => Number(x.seq) > since).map((x) => x.collection) }
      } catch (e) { throw withSchemaHint(e) }
    },
    async tx(fn) {
      const client = await db.connect()
      const touched = new Set()
      try {
        await client.query('BEGIN')
        const result = await fn({
          async get(c, id, { lock = false } = {}) {
            if (lock) await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || '/' || $2))", [c, id])
            const r = await client.query(`SELECT data FROM acuitas_records WHERE collection = $1 AND id = $2${lock ? ' FOR UPDATE' : ''}`, [c, id])
            return r.rows.length ? parseData(r.rows[0].data) : null
          },
          async list(c) {
            const r = await client.query('SELECT id, data FROM acuitas_records WHERE collection = $1 ORDER BY id FOR UPDATE', [c])
            return r.rows.map((x) => ({ id: x.id, data: parseData(x.data) }))
          },
          async put(c, id, data, by = null) {
            await client.query(
              `INSERT INTO acuitas_records (collection, id, data, updated_by) VALUES ($1, $2, $3::jsonb, $4)
               ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by`,
              [c, id, JSON.stringify(data), by]
            )
            touched.add(c)
          },
          async del(c, id) {
            await client.query('DELETE FROM acuitas_records WHERE collection = $1 AND id = $2', [c, id])
            touched.add(c)
          },
        })
        if (touched.size) {
          // Serialize change numbers so they follow commit order.
          await client.query('LOCK TABLE acuitas_versions IN SHARE ROW EXCLUSIVE MODE')
          for (const c of [...touched].sort()) {
            await client.query(
              `INSERT INTO acuitas_versions (collection, seq) VALUES ($1, nextval('acuitas_seq'))
               ON CONFLICT (collection) DO UPDATE SET seq = EXCLUDED.seq`,
              [c]
            )
          }
        }
        await client.query('COMMIT')
        return result
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw withSchemaHint(e)
      } finally {
        client.release()
      }
    },
    async close() { if (!pool) await db.end() },
  }
}

/* -------------------------------------------------- SQL Server / Azure SQL */

export async function createSqlServerRepo({ connectionString, config = null, autoSchema = false, schemaBatches = null }) {
  const mod = await import('mssql')
  const sql = mod.default || mod
  const pool = await new sql.ConnectionPool(config || connectionString).connect()
  if (autoSchema && schemaBatches) {
    for (const batch of schemaBatches) await pool.request().batch(batch)
  }

  const bind = (req, params) => {
    for (const [name, [type, value]] of Object.entries(params)) req.input(name, type, value)
    return req
  }
  const T = {
    c: sql.NVarChar(64),
    id: sql.NVarChar(128),
    data: sql.NVarChar(sql.MAX),
    by: sql.NVarChar(256),
    res: sql.NVarChar(255),
  }

  return {
    kind: 'sqlserver',
    async ping() { await pool.request().query('SELECT 1 AS ok') },
    async list(collection) {
      try {
        const r = await bind(pool.request(), { c: [T.c, collection] })
          .query('SELECT id, data FROM dbo.acuitas_records WHERE collection = @c ORDER BY id; SELECT COALESCE(MAX(seq), 0) AS seq FROM dbo.acuitas_versions;')
        return { items: r.recordsets[0].map((x) => ({ id: x.id, data: parseData(x.data) })), seq: Number(r.recordsets[1][0].seq) }
      } catch (e) { throw withSchemaHint(e) }
    },
    async get(collection, id) {
      const r = await bind(pool.request(), { c: [T.c, collection], id: [T.id, id] })
        .query('SELECT data FROM dbo.acuitas_records WHERE collection = @c AND id = @id')
      return r.recordset.length ? parseData(r.recordset[0].data) : null
    },
    async changes(since) {
      try {
        const r = await pool.request().query('SELECT collection, seq FROM dbo.acuitas_versions')
        const seq = r.recordset.reduce((m, x) => Math.max(m, Number(x.seq)), 0)
        return { seq, changed: r.recordset.filter((x) => Number(x.seq) > since).map((x) => x.collection) }
      } catch (e) { throw withSchemaHint(e) }
    },
    async tx(fn) {
      const t = new sql.Transaction(pool)
      const touched = new Set()
      await t.begin(sql.ISOLATION_LEVEL.READ_COMMITTED)
      const req = (params = {}) => bind(new sql.Request(t), params)
      try {
        const result = await fn({
          async get(c, id, { lock = false } = {}) {
            if (lock) {
              await req({ res: [T.res, `acuitas/${c}/${id}`.slice(0, 255)] })
                .query("EXEC sp_getapplock @Resource = @res, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000")
            }
            const r = await req({ c: [T.c, c], id: [T.id, id] })
              .query(`SELECT data FROM dbo.acuitas_records${lock ? ' WITH (UPDLOCK, HOLDLOCK)' : ''} WHERE collection = @c AND id = @id`)
            return r.recordset.length ? parseData(r.recordset[0].data) : null
          },
          async list(c) {
            const r = await req({ c: [T.c, c] }).query('SELECT id, data FROM dbo.acuitas_records WITH (UPDLOCK, HOLDLOCK) WHERE collection = @c ORDER BY id')
            return r.recordset.map((x) => ({ id: x.id, data: parseData(x.data) }))
          },
          async put(c, id, data, by = null) {
            await req({ c: [T.c, c], id: [T.id, id], data: [T.data, JSON.stringify(data)], by: [T.by, by] }).query(
              `UPDATE dbo.acuitas_records SET data = @data, updated_at = SYSUTCDATETIME(), updated_by = @by WHERE collection = @c AND id = @id;
               IF @@ROWCOUNT = 0 INSERT INTO dbo.acuitas_records (collection, id, data, updated_by) VALUES (@c, @id, @data, @by);`
            )
            touched.add(c)
          },
          async del(c, id) {
            await req({ c: [T.c, c], id: [T.id, id] }).query('DELETE FROM dbo.acuitas_records WHERE collection = @c AND id = @id')
            touched.add(c)
          },
        })
        if (touched.size) {
          await req().query("EXEC sp_getapplock @Resource = 'acuitas_versions', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000")
          for (const c of [...touched].sort()) {
            await req({ c: [T.c, c] }).query(
              `DECLARE @s bigint = NEXT VALUE FOR dbo.acuitas_seq;
               UPDATE dbo.acuitas_versions SET seq = @s WHERE collection = @c;
               IF @@ROWCOUNT = 0 INSERT INTO dbo.acuitas_versions (collection, seq) VALUES (@c, @s);`
            )
          }
        }
        await t.commit()
        return result
      } catch (e) {
        await t.rollback().catch(() => {})
        throw withSchemaHint(e)
      }
    },
    async close() { await pool.close() },
  }
}
