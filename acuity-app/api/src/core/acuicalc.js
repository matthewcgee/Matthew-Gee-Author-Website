// AcuiCalc™ calibration rules, enforced by the data service.
//
// The app already refuses a calibration change without a written reason,
// named frontline reviewers, points inside the limit and zones in order. These
// checks repeat that on the server, so no one, an Administrator included, can
// save a version that skips them by calling the API directly.
//
// Same values as src/lib/calibration.js (a test checks they match).

export const WEIGHT_LIMIT_PCT = 0.25
export const MIN_REASON_LENGTH = 10
export const MAX_RESPONSE_LENGTH = 200

export const SHIPPED_POINTS = Object.freeze({
  obs_1to1: 5, obs_q15: 3, obs_los: 2,
  risk_aggression: 4, risk_restraint: 4, risk_prn: 3, risk_si: 4, risk_hi: 3,
  complex_psychosis: 3, complex_mania: 3, complex_detox: 2, complex_elopement: 2, complex_forensic: 2, complex_pd: 2,
  mass_mild: 1, mass_moderate: 2, mass_severe: 4,
})

export const ZONE_SET_IDS = ['inpatient', 'ed', 'pedsEd']
export const ZONE_STAGES = ['GREEN', 'YELLOW', 'RED']

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Problems with one calibration version's values; empty when it is valid. */
export function versionProblems(v) {
  const out = []
  if (!v || typeof v !== 'object') return ['A calibration version must be an object.']
  if (!Number.isInteger(v.version) || v.version < 1) out.push('Each version needs a whole version number.')
  const points = v.points || {}
  const ids = Object.keys(SHIPPED_POINTS)
  for (const k of Object.keys(points)) if (!ids.includes(k)) out.push(`"${k}" is not an AcuiCalc item; the core is locked.`)
  for (const id of ids) {
    const p = points[id]
    const d = SHIPPED_POINTS[id]
    if (!isNum(p)) out.push(`Point value for ${id} is missing.`)
    else if (p < d * (1 - WEIGHT_LIMIT_PCT) - 1e-9 || p > d * (1 + WEIGHT_LIMIT_PCT) + 1e-9) out.push(`Point value for ${id} is outside ±${WEIGHT_LIMIT_PCT * 100}% of ${d}.`)
  }
  const zones = v.zones || {}
  for (const k of Object.keys(zones)) if (!ZONE_SET_IDS.includes(k)) out.push(`"${k}" is not a zone set.`)
  for (const set of ZONE_SET_IDS) {
    const z = zones[set]
    if (!z || !isNum(z.greenMax) || !isNum(z.yellowMax)) out.push(`Zone cutoffs for ${set} are missing.`)
    else if (!(z.greenMax > 0 && z.yellowMax > z.greenMax)) out.push(`Zone cutoffs for ${set} must run 0 < GREEN < YELLOW.`)
  }
  const responses = v.responses || {}
  for (const s of ZONE_STAGES) {
    const r = responses[s]
    if (typeof r !== 'string' || !r.trim() || r.length > MAX_RESPONSE_LENGTH) out.push(`The ${s} zone response is missing or too long.`)
  }
  return out
}

/**
 * Change control for a version an Administrator adds: who, why, and which
 * frontline nurses reviewed it. Returns a reason string, or null when allowed.
 */
export function appendedVersionProblem(prevVersions, next, principal) {
  const last = prevVersions.reduce((m, v) => Math.max(m, v.version || 0), 0)
  if (next.version !== last + 1) return `The new calibration must be v${last + 1}.`
  if (!['update', 'reset'].includes(next.kind)) return 'A saved calibration is either a change or a reset to shipped defaults.'
  if (next.actor !== principal.name) return 'A calibration version must name the signed-in Administrator as its author.'
  if (String(next.reason || '').trim().length < MIN_REASON_LENGTH) return `A calibration change needs a written reason (at least ${MIN_REASON_LENGTH} characters).`
  if (!Array.isArray(next.reviewers) || !next.reviewers.some((r) => typeof r === 'string' && r.trim())) {
    return 'A calibration change must name the frontline nurses who reviewed it.'
  }
  const problems = versionProblems(next)
  return problems.length ? problems[0] : null
}
