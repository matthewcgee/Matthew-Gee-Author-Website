// Acuitas™ synced data stores
//
// One small layer that lets every new feature store its records the same
// way the shift entries always have:
//
//   local mode    — records live in this browser's storage
//   backend mode  — each record is its own Firestore document, synced live to
//                   everyone, so outpatient caseloads, discharges, plans and
//                   safety events are shared across users and devices
//
// Every component that reads a collection shares one store, so two views of
// the same data can never drift apart. Writes made through a store are also
// handed to the audit sink (registered by the app shell), so changes are
// recorded wherever they happen.

import { useSyncExternalStore, useMemo } from 'react'
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { db, LOCAL_MODE } from './firebase.js'
import { readStorage, writeStorage } from './storage.js'

const stores = new Map()
let auditSink = null

/** The app shell registers where audit entries go. */
export function setAuditSink(fn) {
  auditSink = typeof fn === 'function' ? fn : null
}

export function audit(action, target = null, detail = null) {
  try {
    if (auditSink) auditSink(action, target, detail)
  } catch (e) {
    console.error('audit', e)
  }
}

function makeStore(key, initial, { remote, kind }) {
  const s = { value: initial, listeners: new Set(), unsub: null, remote, kind }
  s.set = (v) => {
    s.value = v
    s.listeners.forEach((l) => l())
  }
  return s
}

function attachRemote(s, name, kind) {
  if (s.unsub || LOCAL_MODE) return
  if (kind === 'collection') {
    s.unsub = onSnapshot(
      collection(db, name),
      (snap) => s.set(snap.docs.map((d) => d.data())),
      (err) => console.error(`sync ${name}`, err)
    )
  } else {
    s.unsub = onSnapshot(
      doc(db, 'appConfig', name),
      (snap) => { if (snap.exists()) s.set(snap.data().value) },
      (err) => console.error(`sync config ${name}`, err)
    )
  }
}

function getCollectionStore(name, localKey, seed) {
  const k = `c:${name}`
  if (!stores.has(k)) {
    const initial = LOCAL_MODE ? readStorage(localKey, seed) : []
    stores.set(k, makeStore(k, Array.isArray(initial) ? initial : seed, { remote: !LOCAL_MODE, kind: 'collection' }))
  }
  const s = stores.get(k)
  attachRemote(s, name, 'collection')
  return s
}

function getValueStore(name, localKey, initial) {
  const k = `v:${name}`
  if (!stores.has(k)) {
    stores.set(k, makeStore(k, LOCAL_MODE ? readStorage(localKey, initial) : initial, { remote: !LOCAL_MODE, kind: 'value' }))
  }
  const s = stores.get(k)
  attachRemote(s, name, 'value')
  return s
}

/**
 * A shared, synced list of records keyed by `id`.
 * Returns [items, api] where api has add, update, remove, upsert and replace.
 */
export function useCollection(name, { localKey, seed = [], auditAs = name, audited = true } = {}) {
  const store = getCollectionStore(name, localKey, seed)
  const items = useSyncExternalStore(
    (cb) => { store.listeners.add(cb); return () => store.listeners.delete(cb) },
    () => store.value,
    () => store.value
  )
  const api = useMemo(() => collectionApi(name, localKey, store, { auditAs, audited }), [name, localKey, store, auditAs, audited])
  return [items, api]
}

export function collectionApi(name, localKey, store, { auditAs = name, audited = true } = {}) {
  const persistLocal = (next) => {
    store.set(next)
    writeStorage(localKey, next)
  }
  const log = (verb, target, detail) => { if (audited) audit(`${auditAs}.${verb}`, target, detail) }
  return {
    add(item) {
      log('add', item.id, summarize(item))
      if (LOCAL_MODE) return persistLocal([...store.value, item])
      return setDoc(doc(db, name, item.id), clean(item)).catch((e) => console.error(`add ${name}`, e))
    },
    upsert(item) {
      const exists = store.value.some((x) => x.id === item.id)
      log(exists ? 'update' : 'add', item.id, summarize(item))
      if (LOCAL_MODE) {
        return persistLocal(exists ? store.value.map((x) => (x.id === item.id ? item : x)) : [...store.value, item])
      }
      return setDoc(doc(db, name, item.id), clean(item)).catch((e) => console.error(`upsert ${name}`, e))
    },
    update(id, patch) {
      log('update', id, summarize(patch))
      const current = store.value.find((x) => x.id === id)
      if (!current) return undefined
      const next = { ...current, ...patch }
      if (LOCAL_MODE) return persistLocal(store.value.map((x) => (x.id === id ? next : x)))
      return setDoc(doc(db, name, id), clean(next)).catch((e) => console.error(`update ${name}`, e))
    },
    remove(id) {
      log('remove', id, null)
      if (LOCAL_MODE) return persistLocal(store.value.filter((x) => x.id !== id))
      return deleteDoc(doc(db, name, id)).catch((e) => console.error(`remove ${name}`, e))
    },
    async replace(items) {
      log('replace', null, { count: items.length })
      if (LOCAL_MODE) return persistLocal(items)
      const snap = await getDocs(collection(db, name))
      const batch = writeBatch(db)
      snap.docs.forEach((d) => batch.delete(d.ref))
      items.forEach((it) => batch.set(doc(db, name, it.id), clean(it)))
      await batch.commit()
    },
  }
}

/** A shared, synced single value, used for settings like clinic lists and rates. */
export function useConfigValue(name, { localKey, initial, auditAs = name } = {}) {
  const store = getValueStore(name, localKey, initial)
  const value = useSyncExternalStore(
    (cb) => { store.listeners.add(cb); return () => store.listeners.delete(cb) },
    () => store.value,
    () => store.value
  )
  const set = useMemo(() => (next) => {
    audit(`${auditAs}.update`, null, summarize(next))
    store.set(next)
    if (LOCAL_MODE) writeStorage(localKey, next)
    else setDoc(doc(db, 'appConfig', name), { value: clean(next) }).catch((e) => console.error(`config ${name}`, e))
  }, [store, localKey, name, auditAs])
  return [value, set]
}

// Firestore rejects `undefined`; JSON round-tripping drops it cleanly.
function clean(v) {
  return JSON.parse(JSON.stringify(v ?? null))
}

// A short, PHI-free description of a record for the audit trail: its field
// names and short scalar values, never long free text.
function summarize(v) {
  if (v == null || typeof v !== 'object') return v ?? null
  if (Array.isArray(v)) return { count: v.length }
  const out = {}
  for (const [k, val] of Object.entries(v)) {
    if (k === 'notes' || k === 'items') continue
    if (val == null || typeof val === 'number' || typeof val === 'boolean') out[k] = val
    else if (typeof val === 'string') out[k] = val.length > 40 ? `${val.slice(0, 40)}…` : val
  }
  return out
}

/** Test hook: forget every store (each test starts clean). */
export function __resetStores() {
  for (const s of stores.values()) if (s.unsub) s.unsub()
  stores.clear()
  auditSink = null
}
