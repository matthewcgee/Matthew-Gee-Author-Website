// Stand-in for the Firebase modules in builds that do not use Firebase (the
// demonstration build and data-service builds). vite.config.js swaps it in, so
// those builds neither contain nor need the Firebase library. Nothing calls it:
// the code paths that would are switched off at build time.

const unavailable = () => {
  throw new Error('This build does not include Firebase. Set VITE_FIREBASE_CONFIG to build the Firebase option.')
}

export const createFirebaseBackend = unavailable
export const firebaseApp = unavailable
export const startFirebaseAuth = unavailable
export const firebaseSignIn = unavailable
export const firebaseSignOut = unavailable
