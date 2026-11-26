// Acuitas™ cutoff evidence — the scientific standard for GREEN / YELLOW / RED.
//
// Cutoffs are set by a standard-setting method, not by opinion, and the same
// method applies to every setting (inpatient units, EDs, pediatric EDs); only
// the unit of the score differs (points per staff, or total points).
//
// The anchor is the frontline nurse. On every shift entry the charge nurse
// rates the shift in their own judgment — Manageable, Strained or Unsafe —
// before Acuitas shows its zone (blinded). That gives two independent views of
// the same shift: the AcuiCalc™ score and the nurse's rating. The
// contrasting-groups method then finds, for each boundary, the score that
// misclassifies the fewest shifts: the point at which a shift is as likely to
// be rated on one side of the boundary as on the other.
//
//   GREEN / YELLOW boundary: Manageable  vs  Strained or Unsafe
//   YELLOW / RED   boundary: Manageable or Strained  vs  Unsafe
//
// For each boundary we report that cutoff, its 95% bootstrap confidence
// interval, sensitivity and specificity at it, the AUC (how well the score
// separates the groups at all), and whether the cutoff in use falls inside
// the interval. (Youden's J is reported too, but not used to choose the
// cutoff: with groups of unequal size it pulls the cutoff toward the smaller
// group.) Agreement
// between the zones in use and the nurses' ratings is reported as a linearly
// weighted kappa. Suggestions are never applied automatically: an
// Administrator proposes any change through the governed calibration, with a
// written reason and the reviewing nurses.

import { computeEntryValue, entryThresholds, zoneSetFor } from './model.js'

export const SHIFT_RATINGS = [
  { id: 'manageable', label: 'Manageable', stage: 'GREEN', help: 'Workload fits the staff on shift' },
  { id: 'strained', label: 'Strained', stage: 'YELLOW', help: 'Getting it done, but stretched' },
  { id: 'unsafe', label: 'Unsafe', stage: 'RED', help: 'Not enough staff for this acuity' },
]
const RATING_RANK = { manageable: 0, strained: 1, unsafe: 2 }
const STAGE_RANK = { GREEN: 0, YELLOW: 1, RED: 2 }

// Minimum evidence before a boundary is estimated at all.
export const MIN_RATED_SHIFTS = 30
export const MIN_PER_GROUP = 5
export const BOOTSTRAP_RESAMPLES = 400

/** Seeded random numbers, so the same data always gives the same intervals. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

/** Area under the ROC curve: chance a positive shift scores above a negative one (ties count half). */
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return null
  let wins = 0
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0
  return wins / (pos.length * neg.length)
}

/**
 * The cutoff c (positive = score above c, the same rule computeStage uses)
 * that maximizes Youden's J. Ties in J take the middle candidate, so the
 * answer does not lean toward either end of a flat run.
 */
export function youdenCutoff(points) {
  const nPos = points.filter((p) => p.positive).length
  const nNeg = points.length - nPos
  if (!nPos || !nNeg) return null
  // One sweep over the sorted scores: at each distinct value c, count how many
  // positives and negatives score at or below it.
  const sorted = [...points].sort((a, b) => a.value - b.value)
  let posLE = 0
  let negLE = 0
  let best = []
  let bestJ = -Infinity
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].positive) posLE += 1
    else negLE += 1
    if (i + 1 < sorted.length && sorted[i + 1].value === sorted[i].value) continue
    const sens = (nPos - posLE) / nPos
    const spec = negLE / nNeg
    const j = sens + spec - 1
    const c = sorted[i].value
    if (j > bestJ + 1e-12) { bestJ = j; best = [{ c, sens, spec }] } else if (Math.abs(j - bestJ) <= 1e-12) best.push({ c, sens, spec })
  }
  const pick = best[Math.floor((best.length - 1) / 2)]
  return { cutoff: pick.c, sensitivity: pick.sens, specificity: pick.spec, j: bestJ }
}

/**
 * Contrasting-groups cutoff: the score c (positive = score above c) that
 * misclassifies the fewest shifts. Ties take the middle candidate.
 */
export function contrastingCutoff(points) {
  const nPos = points.filter((p) => p.positive).length
  const nNeg = points.length - nPos
  if (!nPos || !nNeg) return null
  const sorted = [...points].sort((a, b) => a.value - b.value)
  let posLE = 0
  let negLE = 0
  let best = []
  let bestCorrect = -Infinity
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].positive) posLE += 1
    else negLE += 1
    if (i + 1 < sorted.length && sorted[i + 1].value === sorted[i].value) continue
    const correct = negLE + (nPos - posLE)
    const c = sorted[i].value
    const row = { c, sens: (nPos - posLE) / nPos, spec: negLE / nNeg }
    if (correct > bestCorrect) { bestCorrect = correct; best = [row] } else if (correct === bestCorrect) best.push(row)
  }
  const pick = best[Math.floor((best.length - 1) / 2)]
  return { cutoff: pick.c, sensitivity: pick.sens, specificity: pick.spec, j: pick.sens + pick.spec - 1 }
}

function percentile(sorted, q) {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function boundary(rated, isPositive, current, seed) {
  const points = rated.map((r) => ({ value: r.value, positive: isPositive(r.rating) }))
  const nPos = points.filter((p) => p.positive).length
  const nNeg = points.length - nPos
  const base = { current, nPositive: nPos, nNegative: nNeg }
  if (points.length < MIN_RATED_SHIFTS || nPos < MIN_PER_GROUP || nNeg < MIN_PER_GROUP) {
    return { ...base, enough: false }
  }
  const est = contrastingCutoff(points)
  const next = rng(seed)
  const boots = []
  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b++) {
    const sample = points.map(() => points[Math.floor(next() * points.length)])
    const r = contrastingCutoff(sample)
    if (r) boots.push(r.cutoff)
  }
  boots.sort((a, b) => a - b)
  const ciLow = percentile(boots, 0.025)
  const ciHigh = percentile(boots, 0.975)
  const a = auc(points.filter((p) => p.positive).map((p) => p.value), points.filter((p) => !p.positive).map((p) => p.value))
  const supported = current >= ciLow - 1e-9 && current <= ciHigh + 1e-9
  return {
    ...base,
    enough: true,
    suggested: round(est.cutoff),
    ciLow: round(ciLow),
    ciHigh: round(ciHigh),
    sensitivity: round(est.sensitivity, 3),
    specificity: round(est.specificity, 3),
    youdenJ: round(est.j, 3),
    auc: round(a, 3),
    supported,
  }
}

/** Linearly weighted kappa between two 3-level ordinal ratings. */
export function weightedKappa(pairs) {
  const k = 3
  const n = pairs.length
  if (!n) return null
  const obs = Array.from({ length: k }, () => Array(k).fill(0))
  for (const [a, b] of pairs) obs[a][b] += 1
  const rows = obs.map((r) => r.reduce((s, x) => s + x, 0))
  const cols = obs[0].map((_, j) => obs.reduce((s, r) => s + r[j], 0))
  let po = 0
  let pe = 0
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = 1 - Math.abs(i - j) / (k - 1)
      po += (w * obs[i][j]) / n
      pe += (w * rows[i] * cols[j]) / (n * n)
    }
  }
  return pe === 1 ? null : round((po - pe) / (1 - pe), 3)
}

/**
 * Evidence for one zone set (inpatient, ed or pedsEd) from the shift entries
 * that carry a nurse rating. `thresholds` are the cutoffs in use now.
 */
export function cutoffEvidence({ entries, locations, thresholds, zoneSet }) {
  const locs = new Map((locations || []).filter((l) => zoneSetFor(l) === zoneSet).map((l) => [l.id, l]))
  const current = thresholds?.[zoneSet]
  const rated = []
  const zonePairs = []
  const crosstab = { GREEN: { manageable: 0, strained: 0, unsafe: 0 }, YELLOW: { manageable: 0, strained: 0, unsafe: 0 }, RED: { manageable: 0, strained: 0, unsafe: 0 } }
  let unrated = 0
  for (const e of entries || []) {
    const loc = locs.get(e.locId)
    if (!loc) continue
    if (!(e.nurseRating in RATING_RANK)) { unrated += 1; continue }
    const value = computeEntryValue(e, loc)
    if (value == null || !Number.isFinite(value) || (loc.type !== 'ed' && !e.staff)) continue
    rated.push({ value, rating: e.nurseRating })
    // Agreement is judged against the zone the shift was actually shown,
    // under the calibration stamped on it.
    const th = entryThresholds(e, loc, thresholds)
    const stage = value <= th.greenMax ? 'GREEN' : value <= th.yellowMax ? 'YELLOW' : 'RED'
    crosstab[stage][e.nurseRating] += 1
    zonePairs.push([STAGE_RANK[stage], RATING_RANK[e.nurseRating]])
  }
  const exact = zonePairs.filter(([a, b]) => a === b).length
  return {
    zoneSet,
    units: locs.size,
    rated: rated.length,
    unrated,
    minRated: MIN_RATED_SHIFTS,
    crosstab,
    agreement: zonePairs.length ? round(exact / zonePairs.length, 3) : null,
    kappa: weightedKappa(zonePairs),
    greenYellow: boundary(rated, (r) => r !== 'manageable', current?.greenMax, 0x5eed1),
    yellowRed: boundary(rated, (r) => r === 'unsafe', current?.yellowMax, 0x5eed2),
  }
}

/** Plain-language reading of a weighted kappa (Landis and Koch bands). */
export function kappaLabel(k) {
  if (k == null) return 'not enough data'
  if (k < 0.2) return 'slight'
  if (k < 0.4) return 'fair'
  if (k < 0.6) return 'moderate'
  if (k < 0.8) return 'substantial'
  return 'almost perfect'
}
