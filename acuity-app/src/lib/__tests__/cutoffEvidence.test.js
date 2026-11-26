import { describe, it, expect } from 'vitest'
import { auc, youdenCutoff, contrastingCutoff, weightedKappa, cutoffEvidence, kappaLabel, MIN_RATED_SHIFTS } from '../cutoffEvidence.js'
import { DEFAULT_THRESHOLDS, PEDIATRIC_ED_THRESHOLDS } from '../model.js'

const TH = { ...DEFAULT_THRESHOLDS, pedsEd: PEDIATRIC_ED_THRESHOLDS }
const IP = { id: 'ip', name: '4 West', type: 'inpatient' }
const ED = { id: 'ed', name: 'Main ED', type: 'ed' }

// Deterministic pseudo-random numbers for synthetic shifts.
function rand(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

// Shifts whose nurse ratings follow a known "true" pair of cutoffs, with some
// disagreement near each boundary, as real ratings would have.
function synthetic({ loc, n, lo, hi, trueGreen, trueYellow, blur, seed = 7 }) {
  const r = rand(seed)
  const out = []
  for (let i = 0; i < n; i++) {
    const value = lo + (hi - lo) * r()
    const felt = value + (r() - 0.5) * 2 * blur
    const nurseRating = felt <= trueGreen ? 'manageable' : felt <= trueYellow ? 'strained' : 'unsafe'
    const e = { id: `e${i}`, locId: loc.id, nurseRating }
    if (loc.type === 'ed') e.points = Math.round(value)
    else { e.staff = 10; e.points = Math.round(value * 10 * 10) / 10 }
    out.push(e)
  }
  return out
}

describe('statistics', () => {
  it('finds the separating cutoff on clean data', () => {
    const pts = [1, 2, 3, 4].map((v) => ({ value: v, positive: false })).concat([5, 6, 7].map((v) => ({ value: v, positive: true })))
    expect(youdenCutoff(pts)).toEqual({ cutoff: 4, sensitivity: 1, specificity: 1, j: 1 })
  })

  it('places the contrasting-groups cutoff where shifts are rated 50/50, even with unequal groups', () => {
    // 90 negatives spread 0..9, 10 positives at 8..9.9: Youden leans low, the
    // contrasting-groups cutoff does not.
    const pts = []
    for (let i = 0; i < 90; i++) pts.push({ value: i / 10, positive: false })
    for (let i = 0; i < 10; i++) pts.push({ value: 8 + i / 5, positive: true })
    const cg = contrastingCutoff(pts)
    const yj = youdenCutoff(pts)
    expect(cg.cutoff).toBeGreaterThanOrEqual(8.9)
    expect(yj.cutoff).toBeLessThan(cg.cutoff)
  })

  it('computes AUC with ties counted half', () => {
    expect(auc([3, 4], [1, 2])).toBe(1)
    expect(auc([1, 2], [3, 4])).toBe(0)
    expect(auc([2], [2])).toBe(0.5)
  })

  it('gives weighted kappa 1 for perfect agreement and near 0 for none beyond chance', () => {
    expect(weightedKappa([[0, 0], [1, 1], [2, 2], [1, 1]])).toBe(1)
    const pairs = []
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) pairs.push([a, b])
    expect(weightedKappa(pairs)).toBe(0)
    expect(kappaLabel(0.65)).toBe('substantial')
    expect(kappaLabel(null)).toBe('not enough data')
  })
})

describe('cutoff evidence (contrasting groups)', () => {
  it('recovers the true inpatient cutoffs, with intervals that contain them', () => {
    const entries = synthetic({ loc: IP, n: 400, lo: 0.5, hi: 3.5, trueGreen: 1.8, trueYellow: 2.8, blur: 0.25 })
    const ev = cutoffEvidence({ entries, locations: [IP], thresholds: TH, zoneSet: 'inpatient' })
    expect(ev.rated).toBe(400)
    expect(ev.greenYellow.enough).toBe(true)
    expect(Math.abs(ev.greenYellow.suggested - 1.8)).toBeLessThan(0.15)
    expect(ev.greenYellow.ciLow).toBeLessThanOrEqual(1.8)
    expect(ev.greenYellow.ciHigh).toBeGreaterThanOrEqual(1.8)
    expect(Math.abs(ev.yellowRed.suggested - 2.8)).toBeLessThan(0.15)
    expect(ev.greenYellow.auc).toBeGreaterThan(0.9)
    // The cutoffs in use (1.5 / 2.5) sit outside what the nurses' ratings support.
    expect(ev.greenYellow.supported).toBe(false)
    expect(ev.yellowRed.supported).toBe(false)
  })

  it('confirms cutoffs in use when the ratings agree with them', () => {
    const entries = synthetic({ loc: ED, n: 400, lo: 10, hi: 55, trueGreen: 24, trueYellow: 40, blur: 3, seed: 11 })
    const ev = cutoffEvidence({ entries, locations: [ED], thresholds: TH, zoneSet: 'ed' })
    expect(ev.greenYellow.supported).toBe(true)
    expect(ev.yellowRed.supported).toBe(true)
    expect(ev.kappa).toBeGreaterThan(0.6)
  })

  it('uses only the zone set asked for, and counts unrated shifts', () => {
    const entries = [
      ...synthetic({ loc: IP, n: 50, lo: 0.5, hi: 3.5, trueGreen: 1.5, trueYellow: 2.5, blur: 0.2 }),
      ...synthetic({ loc: ED, n: 50, lo: 10, hi: 55, trueGreen: 24, trueYellow: 40, blur: 3 }).map((e) => ({ ...e, id: `d${e.id}` })),
      { id: 'u1', locId: 'ed', points: 30 },
    ]
    const ev = cutoffEvidence({ entries, locations: [IP, ED], thresholds: TH, zoneSet: 'ed' })
    expect(ev.rated).toBe(50)
    expect(ev.unrated).toBe(1)
    expect(ev.units).toBe(1)
  })

  it('makes no suggestion until there is enough evidence', () => {
    const entries = synthetic({ loc: IP, n: MIN_RATED_SHIFTS - 1, lo: 0.5, hi: 3.5, trueGreen: 1.5, trueYellow: 2.5, blur: 0.2 })
    const ev = cutoffEvidence({ entries, locations: [IP], thresholds: TH, zoneSet: 'inpatient' })
    expect(ev.greenYellow.enough).toBe(false)
    expect(ev.yellowRed.enough).toBe(false)
    expect(ev.greenYellow.suggested).toBeUndefined()
  })

  it('gives the same answer every time for the same data', () => {
    const entries = synthetic({ loc: IP, n: 200, lo: 0.5, hi: 3.5, trueGreen: 1.6, trueYellow: 2.6, blur: 0.3 })
    const a = cutoffEvidence({ entries, locations: [IP], thresholds: TH, zoneSet: 'inpatient' })
    const b = cutoffEvidence({ entries, locations: [IP], thresholds: TH, zoneSet: 'inpatient' })
    expect(a).toEqual(b)
  })
})

describe('cutoff evidence panel', async () => {
  const React = (await import('react')).default
  const { renderToString } = await import('react-dom/server')
  const { default: CutoffEvidence } = await import('../../components/CutoffEvidence.jsx')
  const { buildSampleData } = await import('../demoData.js')
  const { activeCalibration, calibrationState, calibratedThresholds } = await import('../calibration.js')

  it('shows a reading for every zone set in use, from the sample region', () => {
    const sample = buildSampleData()
    const cal = activeCalibration(calibrationState(null))
    const html = renderToString(React.createElement(CutoffEvidence, { entries: sample.entries, locations: sample.locations, thresholds: calibratedThresholds(cal), calibration: cal })).replace(/<!-- -->/g, '')
    expect(html).toContain('Cutoff evidence')
    expect(html).toContain('Inpatient units')
    expect(html).toContain('Emergency departments')
    expect(html).toMatch(/weighted kappa/)
    expect(html).toMatch(/Supported by nurses|Review: ratings point to/)
    expect(html).not.toContain('NaN')
  })
})
