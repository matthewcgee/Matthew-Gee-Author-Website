// Acuitas™ Audit Log
//
// Every change made through Acuitas is recorded: who, in which role, did
// what, to which record, and when. Entries form a hash chain. Each entry
// stores the SHA-256 of the entry before it, and its own hash covers that link
// plus its own content. Editing or deleting any past entry breaks every link
// after it, and "Verify chain" finds the first break.
//
// Two layers of protection apply on a shared backend. The shipped Firestore
// rules make the audit collection append-only: entries can be created, never
// changed or deleted. The hash chain then makes any tampering that bypassed
// the rules detectable. When several people work at once, two entries can
// claim the same position in the chain. The verifier reports that as a fork,
// not as tampering. A deployment that needs a single strict sequence should
// append entries server-side.

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
}

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const GENESIS = '0'.repeat(64)

function body(e) {
  return { seq: e.seq, at: e.at, actor: e.actor, role: e.role, action: e.action, target: e.target ?? null, detail: e.detail ?? null }
}

/** Build the next entry after `prev` (null for the first entry). */
export async function makeAuditEntry(prev, { actor, role, action, target = null, detail = null, at = Date.now() }) {
  const seq = prev ? prev.seq + 1 : 1
  const prevHash = prev ? prev.hash : GENESIS
  const entry = { seq, at, actor: actor || 'unknown', role: role || 'unknown', action, target, detail }
  const hash = await sha256Hex(`${prevHash}|${canonical(body(entry))}`)
  return { id: `${String(seq).padStart(7, '0')}_${hash.slice(0, 10)}`, ...entry, prevHash, hash }
}

export function sortAudit(entries) {
  return (entries || []).slice().sort((a, b) => a.seq - b.seq || (a.at || 0) - (b.at || 0) || String(a.id).localeCompare(String(b.id)))
}

/**
 * Walk the chain in sequence order and report the first problem:
 *   'tampered' — an entry's content no longer matches its own hash
 *   'broken'   — an entry does not point at the hash of the one before it
 *   'fork'     — two entries claim the same sequence number (concurrent writers)
 */
export async function verifyAuditChain(entries) {
  const list = sortAudit(entries)
  let prev = null
  let forks = 0
  for (const e of list) {
    const expected = await sha256Hex(`${e.prevHash}|${canonical(body(e))}`)
    if (expected !== e.hash) return { ok: false, checked: list.length, brokenAt: e.seq, reason: 'tampered', forks }
    if (prev && e.seq === prev.seq) {
      forks += 1
      continue
    }
    const want = prev ? prev.hash : GENESIS
    if (e.prevHash !== want) return { ok: false, checked: list.length, brokenAt: e.seq, reason: 'broken', forks }
    prev = e
  }
  return { ok: true, checked: list.length, brokenAt: null, reason: null, forks }
}

export const AUDIT_ACTION_LABEL = {
  'entry.add': 'Logged a shift entry',
  'entry.remove': 'Removed a shift entry',
  'deployment.add': 'Logged a deployment',
  'deployment.remove': 'Removed a deployment',
  'cap.update': 'Changed a census cap',
  'locations.update': 'Changed locations',
  'thresholds.update': 'Changed acuity thresholds',
  'data.import': 'Imported data',
  'data.clear': 'Cleared all data',
  'data.sample': 'Loaded sample data',
  'fhir.import': 'Applied a FHIR census import',
  'identity.signin': 'Signed in',
  'identity.switch': 'Switched user or role',
}

export function actionLabel(action) {
  if (AUDIT_ACTION_LABEL[action]) return AUDIT_ACTION_LABEL[action]
  const [what, verb] = String(action).split('.')
  const verbs = { add: 'Added', update: 'Updated', remove: 'Removed', replace: 'Replaced' }
  return verbs[verb] ? `${verbs[verb]} ${what.replace(/([A-Z])/g, ' $1').toLowerCase()}` : action
}
