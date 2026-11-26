// Acuitas™ data backend: where shared data lives.
//
// Chosen at build time:
//   VITE_BACKEND=api   the Acuitas data service (api/) in front of the
//                      organization's SQL Server, Azure SQL or PostgreSQL
//   VITE_FIREBASE_CONFIG set (and VITE_BACKEND unset)
//                      Google Cloud Firestore (reference option)
//   otherwise          LOCAL MODE: everything stays in this browser and
//                      nothing is sent anywhere. This is the demonstration
//                      build, and it is unchanged.
//
// The rest of the app calls only the functions below, never a database
// library, so the backend can change without touching any screen. Each build
// contains only the backend it uses: the choice is a build-time constant, so
// the others are dropped from the bundle.

function firebaseConfigOk() {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG
  if (!raw) return false
  try {
    return !!(typeof raw === 'string' ? JSON.parse(raw) : raw)
  } catch {
    console.error('VITE_FIREBASE_CONFIG could not be parsed; running in local mode.')
    return false
  }
}

export const BACKEND = import.meta.env.VITE_BACKEND === 'api'
  ? 'api'
  : (import.meta.env.VITE_BACKEND !== 'local' && firebaseConfigOk() ? 'firebase' : 'local')

// True when there is no shared database: the app reads and writes the browser only.
export const LOCAL_MODE = BACKEND === 'local'

export const STATE_DOC = ['appState', 'main']

let loading = null
function impl() {
  if (!loading) {
    if (import.meta.env.VITE_BACKEND === 'api') {
      loading = import('./apiBackend.js').then((m) => m.createApiBackend())
    } else if (import.meta.env.VITE_FIREBASE_CONFIG && import.meta.env.VITE_BACKEND !== 'local') {
      loading = import('./firebaseBackend.js').then((m) => m.createFirebaseBackend())
    } else {
      loading = Promise.reject(new Error('No shared backend in local mode.'))
    }
  }
  return loading
}

// Subscriptions return an unsubscribe function straight away, even though the
// backend module loads asynchronously.
function subscribe(start) {
  let stop = null
  let cancelled = false
  impl().then((b) => { if (!cancelled) stop = start(b) }).catch((e) => console.error('backend', e))
  return () => { cancelled = true; if (stop) stop() }
}

/** onItems receives [{ id, data }] for every record in the collection, now and on each change. */
export function watchCollection(name, onItems, onError) {
  return subscribe((b) => b.watchCollection(name, onItems, onError || ((e) => console.error(`sync ${name}`, e))))
}

/** onData receives the record's data, or null when it does not exist. */
export function watchDoc(collection, id, onData, onError) {
  return subscribe((b) => b.watchDoc(collection, id, onData, onError || ((e) => console.error(`sync ${collection}/${id}`, e))))
}

export async function setRecord(collection, id, data, { merge = false } = {}) {
  return (await impl()).setRecord(collection, id, data, { merge })
}

/** patch: { field: value } and/or { field: increment(n) }. The record must exist. */
export async function updateRecord(collection, id, patch) {
  return (await impl()).updateRecord(collection, id, patch)
}

export async function deleteRecord(collection, id) {
  return (await impl()).deleteRecord(collection, id)
}

export async function listRecords(collection) {
  return (await impl()).listRecords(collection)
}

/** items: [{ id, data }]. Deletes everything else in the collection. */
export async function replaceCollection(collection, items) {
  return (await impl()).replaceCollection(collection, items)
}

/** Add n to a numeric field atomically, inside updateRecord. */
export function increment(n) {
  return { __acuitasIncrement: n }
}

export function isIncrement(v) {
  return v != null && typeof v === 'object' && typeof v.__acuitasIncrement === 'number'
}
