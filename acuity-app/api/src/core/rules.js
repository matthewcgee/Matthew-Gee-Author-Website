// Acuitas™ data service — access rules.
//
// A line-for-line port of firestore.rules. Every request the data service
// handles is checked here against the signed-in user's Acuitas role, on the
// server, before the database is touched. Anything not listed is closed.

import { appendedVersionProblem, versionProblems } from './acuicalc.js'

export const ALL_ROLES = ['admin', 'supervisor', 'charge', 'screener', 'analyst', 'viewer']
const OP_READERS = ['admin', 'supervisor', 'screener', 'analyst']

const board = { read: ALL_ROLES, create: ['admin', 'supervisor', 'charge'], update: ['admin', 'supervisor', 'charge'], delete: ['admin', 'supervisor'] }

// Per collection: which roles may read, create, update and delete.
export const COLLECTION_RULES = {
  appState: { read: ALL_ROLES, create: ['admin'], update: ['admin'], delete: ['admin'] },
  entries: board,
  deployments: board,
  safetyEvents: board,
  locationCaps: { read: ALL_ROLES, create: ['admin', 'supervisor', 'charge'], update: ['admin', 'supervisor', 'charge'], delete: ['admin', 'supervisor', 'charge'] },
  planLog: { read: ['admin', 'supervisor', 'analyst'], create: ['admin', 'supervisor'], update: ['admin'], delete: ['admin'] },
  opPatients: { read: OP_READERS, create: ['admin', 'screener'], update: ['admin', 'screener'], delete: ['admin', 'screener'] },
  iopIntakes: { read: OP_READERS, create: ['admin', 'screener'], update: ['admin', 'screener'], delete: ['admin', 'screener'] },
  opProviders: { read: OP_READERS, create: ['admin'], update: ['admin'], delete: ['admin'] },
  opDischarges: { read: OP_READERS, create: ['admin', 'screener'], update: ['admin', 'screener'], delete: ['admin', 'screener'] },
  opAssessments: { read: ['admin', 'screener', 'analyst'], create: ['admin', 'screener'], update: ['admin', 'screener'], delete: ['admin', 'screener'] },
  opOutcomes: { read: OP_READERS, create: ['admin', 'screener'], update: ['admin', 'screener'], delete: ['admin', 'screener'] },
  // Append-only: nobody, administrators included, may edit or delete.
  auditLog: { read: ['admin', 'analyst'], create: ALL_ROLES, update: [], delete: [] },
  appConfig: null, // per document, below
}

const CONFIG_RULES = {
  costRates: { read: ALL_ROLES, write: ['admin', 'analyst'] },
  censusPrefill: { read: ALL_ROLES, write: ['admin', 'supervisor'] },
  acuiCalibration: { read: ALL_ROLES, write: ['admin'], noDelete: true },
}
const CONFIG_DEFAULT = { read: ALL_ROLES, write: ['admin'] }

export const COLLECTIONS = Object.keys(COLLECTION_RULES)

export function isKnownCollection(name) {
  return Object.prototype.hasOwnProperty.call(COLLECTION_RULES, name)
}

/** May this role perform `op` ('read' | 'create' | 'update' | 'delete') on collection/id? */
export function allowed(role, op, collection, id = null) {
  if (!ALL_ROLES.includes(role)) return false
  if (collection === 'appConfig') {
    const r = (id && CONFIG_RULES[id]) || CONFIG_DEFAULT
    if (op === 'read') return r.read.includes(role)
    if (op === 'delete' && r.noDelete) return false
    return r.write.includes(role)
  }
  const r = COLLECTION_RULES[collection]
  if (!r) return false
  return (r[op] || []).includes(role)
}

// Order-independent JSON, so two copies of the same record compare equal.
export function canonical(v) {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
}

/**
 * Content rules that go beyond role, checked with the stored record in hand.
 * Returns null when allowed, or a reason string.
 */
export function contentRule({ principal, collection, id, before, after }) {
  if (collection === 'auditLog') {
    if (before) return 'Audit entries are append-only.'
    if (!after || after.actor !== principal.name) return 'An audit entry must name the signed-in user as its actor.'
    if (after.role !== principal.role) return 'An audit entry must carry the signed-in user\'s role.'
  }
  if (collection === 'appConfig' && id === 'acuiCalibration') {
    const next = after?.value?.versions
    if (!Array.isArray(next) || next.length < 1) return 'The calibration must hold at least one version.'
    const prev = before ? (before?.value?.versions || []) : []
    if (before) {
      if (next.length !== prev.length + 1) return 'Each calibration save must add exactly one version.'
      for (let i = 0; i < prev.length; i++) {
        if (canonical(prev[i]) !== canonical(next[i])) return 'Earlier calibration versions cannot be changed.'
      }
    }
    // The first save also carries v1 (shipped or carried-forward values).
    const base = before ? prev : next.slice(0, 1)
    if (!before) {
      const v1 = next[0]
      if (v1.version !== 1 || !['shipped', 'migrated'].includes(v1.kind)) return 'The first calibration version must be v1.'
      const p = versionProblems(v1)
      if (p.length) return p[0]
      if (next.length > 2) return 'Each calibration save must add exactly one version.'
    }
    if (before || next.length === 2) {
      const problem = appendedVersionProblem(base, next.at(-1), principal)
      if (problem) return problem
    }
  }
  return null
}
