// In-memory store with the same contract as the SQL stores. Used by the
// automated tests and for a quick local trial; data is lost on restart.

export function createMemoryRepo() {
  const records = new Map() // `${collection}\u0000${id}` -> { collection, id, data }
  const versions = new Map() // collection -> seq
  let seq = 0
  let chain = Promise.resolve()

  const key = (c, id) => `${c}\u0000${id}`
  const copy = (v) => JSON.parse(JSON.stringify(v))
  const listOf = (collection) => [...records.values()]
    .filter((r) => r.collection === collection)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => ({ id: r.id, data: copy(r.data) }))

  return {
    kind: 'memory',
    async ping() {},
    async list(collection) {
      return { items: listOf(collection), seq }
    },
    async get(collection, id) {
      const r = records.get(key(collection, id))
      return r ? copy(r.data) : null
    },
    async changes(since) {
      const changed = [...versions.entries()].filter(([, s]) => s > since).map(([c]) => c)
      return { seq, changed }
    },
    // Transactions run one at a time; a failure leaves nothing behind.
    tx(fn) {
      const run = chain.then(async () => {
        const staged = new Map()
        const touched = new Set()
        const view = (c, id) => {
          const k = key(c, id)
          if (staged.has(k)) return staged.get(k)
          const r = records.get(k)
          return r ? copy(r.data) : null
        }
        const result = await fn({
          get: async (c, id) => view(c, id),
          list: async (c) => {
            const base = new Map(listOf(c).map((r) => [r.id, r.data]))
            for (const [k, v] of staged) {
              const [sc, sid] = k.split('\u0000')
              if (sc !== c) continue
              if (v === null) base.delete(sid)
              else base.set(sid, v)
            }
            return [...base.entries()].map(([id, data]) => ({ id, data }))
          },
          put: async (c, id, data) => { staged.set(key(c, id), copy(data)); touched.add(c) },
          del: async (c, id) => {
            if (c === 'auditLog') throw new Error('Acuitas audit entries are append-only.')
            staged.set(key(c, id), null); touched.add(c)
          },
        })
        for (const [k, v] of staged) {
          const [c, id] = k.split('\u0000')
          if (v === null) records.delete(k)
          else {
            if (c === 'auditLog' && records.has(k)) throw new Error('Acuitas audit entries are append-only.')
            records.set(k, { collection: c, id, data: v })
          }
        }
        for (const c of touched) versions.set(c, ++seq)
        return result
      })
      chain = run.catch(() => {})
      return run
    },
    async close() {},
  }
}
