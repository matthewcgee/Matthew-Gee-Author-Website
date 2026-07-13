// localStorage-backed Firebase mock — used for the offline demo build.
// Replaces firebase/firestore so the app works with zero network calls.

const store = {
  get(name) {
    try { return JSON.parse(localStorage.getItem(`acuitas:db:${name}`) || '{}') }
    catch { return {} }
  },
  set(name, data) {
    localStorage.setItem(`acuitas:db:${name}`, JSON.stringify(data))
  },
}

const subs = {}

function addSub(key, fn) {
  if (!subs[key]) subs[key] = []
  subs[key].push(fn)
  return () => { subs[key] = (subs[key] || []).filter(f => f !== fn) }
}

function notifyCollection(name) {
  const data = store.get(name)
  const snap = {
    docs: Object.entries(data).map(([id, d]) => ({
      id,
      data: () => d,
      ref: makeDocRef(name, id),
    })),
    empty: Object.keys(data).length === 0,
  }
  ;(subs[name] || []).forEach(fn => fn(snap))
}

function notifyDoc(collName, docId) {
  const data = store.get(collName)
  const d = data[docId]
  const snap = { exists: () => d != null, data: () => d || null }
  ;(subs[`${collName}/${docId}`] || []).forEach(fn => fn(snap))
}

function makeDocRef(collName, docId) {
  return { _type: 'doc', _col: collName, _id: docId }
}

// ── Public exports (mirrors firebase/firestore) ──────────────────────────────

export const db = {}
export const STATE_DOC = ['appState', 'main']

// Also exported to replace firebase/app initializeApp + getFirestore
export function initializeApp() { return {} }
export function getFirestore() { return db }

export function collection(dbOrRef, name) {
  return { _type: 'collection', _name: name }
}

export function doc(dbOrRef, ...parts) {
  // doc(db, 'col', 'id')  OR  doc(db, ...STATE_DOC)
  const colStr = typeof parts[0] === 'string' ? parts[0] : parts[0]?._name || ''
  const idStr  = typeof parts[1] === 'string' ? parts[1] : 'default'
  return makeDocRef(colStr, idStr)
}

export function onSnapshot(ref, onNext, onError) {
  if (ref._type === 'collection') {
    const name = ref._name
    const data = store.get(name)
    setTimeout(() => onNext({
      docs: Object.entries(data).map(([id, d]) => ({ id, data: () => d, ref: makeDocRef(name, id) })),
      empty: Object.keys(data).length === 0,
    }), 0)
    return addSub(name, onNext)
  }

  if (ref._type === 'doc') {
    const { _col, _id } = ref
    const d = store.get(_col)[_id]
    setTimeout(() => onNext({ exists: () => d != null, data: () => d || null }), 0)
    return addSub(`${_col}/${_id}`, onNext)
  }

  return () => {}
}

export async function setDoc(ref, data, opts) {
  const coll = store.get(ref._col)
  coll[ref._id] = opts?.merge ? { ...(coll[ref._id] || {}), ...data } : { ...data }
  store.set(ref._col, coll)
  notifyCollection(ref._col)
  notifyDoc(ref._col, ref._id)
}

export async function deleteDoc(ref) {
  const coll = store.get(ref._col)
  delete coll[ref._id]
  store.set(ref._col, coll)
  notifyCollection(ref._col)
}

export async function getDocs(ref) {
  const name = ref._name || ref._col
  const data = store.get(name)
  return {
    docs: Object.entries(data).map(([id, d]) => ({ id, data: () => d, ref: makeDocRef(name, id) })),
    empty: Object.keys(data).length === 0,
  }
}

export async function updateDoc(ref, data) {
  const coll = store.get(ref._col)
  const existing = coll[ref._id] || {}
  const merged = { ...existing }
  for (const [k, v] of Object.entries(data)) {
    merged[k] = v && v._inc != null ? (existing[k] || 0) + v._inc : v
  }
  coll[ref._id] = merged
  store.set(ref._col, coll)
  notifyCollection(ref._col)
}

export function increment(n) { return { _inc: n } }

export function writeBatch() {
  const ops = []
  return {
    delete(ref) { ops.push({ op: 'del', ref }) },
    set(ref, data) { ops.push({ op: 'set', ref, data }) },
    async commit() {
      const changed = new Set()
      for (const { op, ref, data } of ops) {
        const coll = store.get(ref._col)
        if (op === 'del') delete coll[ref._id]
        else coll[ref._id] = data
        store.set(ref._col, coll)
        changed.add(ref._col)
      }
      changed.forEach(name => notifyCollection(name))
    },
  }
}
