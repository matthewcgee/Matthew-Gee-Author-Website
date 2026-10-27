// Firebase Authentication sign-in, for internal builds on the Firebase backend.
//
// Loaded only when the build sets VITE_AUTH_MODE=firebase. The public
// demonstration build never contains this code, so it carries no sign-in
// endpoints and no project identifiers.
//
// Sign-in goes through the organization's identity provider, configured in
// Firebase / Identity Platform as an OIDC ('oidc.<name>') or SAML
// ('saml.<name>') provider and named by VITE_AUTH_PROVIDER_ID. Roles are
// Firebase custom claims ({ acuitasRole: 'supervisor' }), set by an
// administrator. The shipped firestore.rules enforce them on the server.

import { getAuth, onAuthStateChanged, signInWithPopup, signOut, OAuthProvider, SAMLAuthProvider } from 'firebase/auth'
import { app } from './firebase.js'

export function startFirebaseAuth(onIdentity) {
  const auth = getAuth(app)
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return onIdentity(null)
    const token = await user.getIdTokenResult()
    onIdentity({
      // Must match what firestore.rules checks on audit entries: email, else uid.
      name: user.email || user.uid,
      displayName: user.displayName || null,
      role: token.claims.acuitasRole || 'viewer',
      source: 'firebase',
      uid: user.uid,
    })
  })
}

export function firebaseSignIn(providerId) {
  const auth = getAuth(app)
  const provider = String(providerId || '').startsWith('saml.') ? new SAMLAuthProvider(providerId) : new OAuthProvider(providerId)
  return signInWithPopup(auth, provider)
}

export function firebaseSignOut() {
  return signOut(getAuth(app))
}
