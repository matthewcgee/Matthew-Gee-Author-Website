// Backend configuration.
//
// The database connection is supplied at build time through VITE_FIREBASE_CONFIG
// (a JSON string). Nothing is hardcoded here, which means a build produced
// without that variable contains no credentials, no project identifiers, and no
// trace of whichever backend a given institution happens to use.
//
// With no config supplied the app runs in LOCAL MODE: every shift entry,
// deployment and cap is kept in the browser and nothing is transmitted
// anywhere. That is the right default for a public demonstration build — a
// stranger who opens the page gets a working sandbox of their own and cannot
// read or write anyone else's data.
//
// To point a build at a real database:
//   VITE_FIREBASE_CONFIG='{"apiKey":"…","projectId":"…", …}' npm run build

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const raw = import.meta.env.VITE_FIREBASE_CONFIG

let app = null
let db = null

if (raw) {
  try {
    const config = typeof raw === 'string' ? JSON.parse(raw) : raw
    app = initializeApp(config)
    db = getFirestore(app)
  } catch (err) {
    // A malformed config must not take the app down — fall back to local mode
    // and say so loudly, rather than failing to render.
    console.error('VITE_FIREBASE_CONFIG could not be parsed; running in local mode.', err)
    app = null
    db = null
  }
}

export { app, db }

// True when there is no remote database: the app reads and writes the browser
// only. Every Firestore subscription and write in App.jsx checks this first.
export const LOCAL_MODE = db === null

export const STATE_DOC = ['appState', 'main']
