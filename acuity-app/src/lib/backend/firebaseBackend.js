// Google Cloud Firestore backend (reference option). Loaded only in builds
// that set VITE_FIREBASE_CONFIG; every other build leaves it out entirely.

import { initializeApp } from 'firebase/app'
import { collection, deleteDoc, doc, getDocs, getFirestore, increment, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { isIncrement } from './index.js'

let app = null
let db = null

export function firebaseApp() {
  if (!app) {
    const raw = import.meta.env.VITE_FIREBASE_CONFIG
    app = initializeApp(typeof raw === 'string' ? JSON.parse(raw) : raw)
    db = getFirestore(app)
  }
  return app
}

export function createFirebaseBackend() {
  firebaseApp()
  return {
    watchCollection(name, onItems, onError) {
      return onSnapshot(collection(db, name), (snap) => onItems(snap.docs.map((d) => ({ id: d.id, data: d.data() }))), onError)
    },
    watchDoc(col, id, onData, onError) {
      return onSnapshot(doc(db, col, id), (snap) => onData(snap.exists() ? snap.data() : null), onError)
    },
    setRecord(col, id, data, { merge }) {
      return merge ? setDoc(doc(db, col, id), data, { merge: true }) : setDoc(doc(db, col, id), data)
    },
    updateRecord(col, id, patch) {
      const p = {}
      for (const [k, v] of Object.entries(patch)) p[k] = isIncrement(v) ? increment(v.__acuitasIncrement) : v
      return updateDoc(doc(db, col, id), p)
    },
    deleteRecord(col, id) {
      return deleteDoc(doc(db, col, id))
    },
    async listRecords(col) {
      const snap = await getDocs(collection(db, col))
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }))
    },
    async replaceCollection(col, items) {
      const snap = await getDocs(collection(db, col))
      const batch = writeBatch(db)
      snap.docs.forEach((d) => batch.delete(d.ref))
      items.forEach((it) => batch.set(doc(db, col, it.id), it.data))
      await batch.commit()
    },
  }
}
