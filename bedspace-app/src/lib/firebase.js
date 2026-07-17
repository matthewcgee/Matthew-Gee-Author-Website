import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

// ⚠️ PLACEHOLDER PROJECT — replace before go-live with real resident data.
// Create a Firebase project for BedSpace and paste its config below.
// See HANDOFF.md → "Connecting Firebase" for step-by-step instructions,
// including the Firestore security rules and role-claim Cloud Function that
// are required for the disallowed-resident list to be genuinely
// confidential (not just hidden in the UI).
const firebaseConfig = {
  apiKey: 'REPLACE_WITH_YOUR_FIREBASE_API_KEY',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
}

export const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== 'REPLACE_WITH_YOUR_FIREBASE_API_KEY'

let app = null
let db = null
let auth = null

if (FIREBASE_CONFIGURED) {
  try {
    app = initializeApp(firebaseConfig)
    db = getFirestore(app)
    auth = getAuth(app)
    signInAnonymously(auth).catch((e) => console.error('anonymous sign-in failed', e))
  } catch (e) {
    console.error('Firebase init failed — running in local-only mode', e)
  }
}

export { app, db, auth }

export const STATE_DOC = ['appState', 'main']
