// Acuitas™ identity: who is using the app, and in what role.
//
// The mode is fixed at build time:
//   VITE_AUTH_MODE=gateway  + VITE_IDENTITY_ENDPOINT (e.g. /.auth/me)
//   VITE_AUTH_MODE=firebase + VITE_AUTH_PROVIDER_ID  (internal Firebase builds)
//   otherwise               local — name and role chosen after the access gate
// See roles.js for what each mode does and does not guarantee.

import { identityFromPrincipal, parseRoleMap, ROLES } from './roles.js'
import { readStorage, writeStorage } from './storage.js'

const env = import.meta.env || {}
export const IDENTITY_ENDPOINT = env.VITE_IDENTITY_ENDPOINT || ''
export const AUTH_MODE = env.VITE_AUTH_MODE === 'firebase'
  ? 'firebase'
  : (env.VITE_AUTH_MODE === 'gateway' || IDENTITY_ENDPOINT ? 'gateway' : 'local')
export const AUTH_PROVIDER_ID = env.VITE_AUTH_PROVIDER_ID || ''
export const SIGN_IN_URL = env.VITE_SIGN_IN_URL || '/.auth/login/aad'
export const ROLE_MAP = parseRoleMap(env.VITE_ROLE_MAP)

const LOCAL_ID_KEY = 'bhai:identity:v1'

export function readLocalIdentity() {
  const id = readStorage(LOCAL_ID_KEY, null)
  return id && id.name && ROLES[id.role] ? { ...id, source: 'local' } : null
}

export function writeLocalIdentity(id) {
  writeStorage(LOCAL_ID_KEY, id ? { name: id.name, role: id.role } : null)
}

export async function loadGatewayIdentity() {
  const res = await fetch(IDENTITY_ENDPOINT || '/.auth/me', { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Identity endpoint returned ${res.status}`)
  return identityFromPrincipal(await res.json(), ROLE_MAP)
}

// Loaded only in firebase mode. The condition is a build-time constant, so
// other builds drop this import entirely.
export async function loadFirebaseAuth() {
  if (import.meta.env.VITE_AUTH_MODE === 'firebase') {
    return import('./firebaseAuth.js')
  }
  return null
}
