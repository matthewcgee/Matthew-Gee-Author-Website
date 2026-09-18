// Acuitas™ Risk & Early-Warning Engine
//
// Turns a forecast into the three things a charge nurse or house supervisor
// actually needs:
//
//   1. How likely is this unit to breach its threshold on the next shifts?
//   2. How long until it breaches if nothing changes?
//   3. Is it already drifting, before any single reading looks alarming?
//
// Every probability here is derived from the unit's own measured forecast error
// — an empirical predictive distribution, not an assumed bell curve — so the
// numbers degrade honestly when a unit's history is short or erratic.

import { thresholdsFor, computeStage, safeDiv } from './model.js'
import { mean, median, slotOfWeek, labelSlotOfWeek } from './forecast.js'

export const RISK_BANDS = [
  { id: 'low', max: 0.2, label: 'Low', color: '#3fb37f' },
  { id: 'elevated', max: 0.5, label: 'Elevated', color: '#e0b341' },
  { id: 'high', max: 0.8, label: 'High', color: '#e08a41' },
  { id: 'critical', max: Infinity, label: 'Critical', color: '#e0584a' },
]

export function riskBand(p) {
  return RISK_BANDS.find((b) => p <= b.max) || RISK_BANDS[RISK_BANDS.length - 1]
}

/* ------------------------------------------------------- predictive distribution */

// Abramowitz & Stegun 7.1.26 — max absolute error ~1.5e-7, far below the
// precision anyone acts on here.
function erf(x) {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function stdev(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1))
}

const MIN_EMPIRICAL_SAMPLE = 8

/**
 * P(actual value at this forecast point exceeds `threshold`).
 *
 * With enough measured residuals we count them directly, which captures skew
 * and fat tails that a normal approximation would flatten. Below that we fall
 * back to a normal with the residual spread we do have.
 */
export function probabilityAbove(point, threshold) {
  if (point == null || threshold == null || !Number.isFinite(threshold)) return null
  const center = point.p50
  const scale = point.residualScale || 1
  const residuals = point.residuals || []

  if (residuals.length >= MIN_EMPIRICAL_SAMPLE) {
    let over = 0
    for (const r of residuals) {
      if (center + r * scale > threshold) over++
    }
    // Laplace smoothing keeps the answer off 0 and 1, which would overstate
    // certainty from a few dozen samples.
    return (over + 0.5) / (residuals.length + 1)
  }

  const sd = Math.max(residuals.length >= 2 ? stdev(residuals) * scale : 0, Math.abs(center) * 0.15, 0.05)
  return 1 - normalCdf((threshold - center) / sd)
}

/**
 * Probability the unit lands in each stage on a given forecast point.
 */
export function stageProbabilities(point, th) {
  const pAboveGreen = probabilityAbove(point, th.greenMax)
  const pAboveYellow = probabilityAbove(point, th.yellowMax)
  if (pAboveGreen == null || pAboveYellow == null) return null
  const red = pAboveYellow
  const yellow = Math.max(0, pAboveGreen - pAboveYellow)
  const green = Math.max(0, 1 - pAboveGreen)
  const total = red + yellow + green || 1
  return { GREEN: green / total, YELLOW: yellow / total, RED: red / total }
}

/* --------------------------------------------------------------- unit risk view */

/**
 * Per-horizon risk for one unit, plus the summary numbers the board renders.
 *
 * `breachSlot` is the first forecast point whose median crosses into RED —
 * what happens if nothing changes. `riskSlot` is the first point where the
 * probability of RED passes 50%, which usually fires earlier and is the more
 * useful trigger for moving staff.
 */
export function assessForecast(forecast, loc, globalThresholds) {
  const th = thresholdsFor(loc, globalThresholds)
  if (!forecast?.ok) {
    return { ok: false, reason: forecast?.reason || 'no-forecast', thresholds: th, horizons: [] }
  }

  const horizons = forecast.points.map((point) => {
    const probs = stageProbabilities(point, th)
    const stage = computeStage(point.p50, th)
    return {
      ...point,
      stage,
      probs,
      pRed: probs?.RED ?? null,
      pYellowOrWorse: probs ? probs.RED + probs.YELLOW : null,
      band: riskBand(probs?.RED ?? 0),
    }
  })

  const breachPoint = horizons.find((h) => h.stage === 'RED') || null
  const riskPoint = horizons.find((h) => (h.pRed ?? 0) >= 0.5) || null
  const peak = horizons.reduce((a, b) => ((b.pRed ?? 0) > (a?.pRed ?? -1) ? b : a), null)

  return {
    ok: true,
    thresholds: th,
    method: forecast.method,
    confidence: forecast.confidence,
    accuracy: forecast.accuracy,
    horizons,
    next: horizons[0] || null,
    breachPoint,
    riskPoint,
    peak,
    // Shifts of runway before the projected breach; null when none projected.
    shiftsToBreach: breachPoint ? breachPoint.horizon : null,
    shiftsToRisk: riskPoint ? riskPoint.horizon : null,
  }
}

/* ------------------------------------------------------- drift / control charts */

const EWMA_LAMBDA = 0.3
const EWMA_L = 2.8

/**
 * EWMA control chart over the unit's own history.
 *
 * Catches a sustained small upward shift — the pattern that precedes a breach —
 * well before any single shift reading looks abnormal. Baseline mean and spread
 * come from the earlier half of the series so recent drift can't inflate its own
 * control limits.
 */
export function driftSignal(series) {
  const values = series.map((p) => p.value)
  const n = values.length
  if (n < 8) return { ok: false, reason: 'thin-history' }

  const baselineCount = Math.max(4, Math.floor(n / 2))
  const baseline = values.slice(0, baselineCount)
  const mu = median(baseline)
  const sigma = Math.max(stdev(baseline), 1e-6)

  const limit = EWMA_L * sigma * Math.sqrt(EWMA_LAMBDA / (2 - EWMA_LAMBDA))
  let ewma = mu
  const chart = []
  for (let i = 0; i < n; i++) {
    ewma = EWMA_LAMBDA * values[i] + (1 - EWMA_LAMBDA) * ewma
    chart.push({
      slot: series[i].slot,
      date: series[i].date,
      shift: series[i].shift,
      value: values[i],
      ewma,
      ucl: mu + limit,
      lcl: Math.max(0, mu - limit),
    })
  }

  const last = chart[chart.length - 1]
  const rising = last.ewma > last.ucl
  const falling = last.ewma < last.lcl

  // Consecutive points on the same side of center — Western Electric run rule,
  // a second independent signal that doesn't depend on the EWMA weighting.
  let run = 0
  for (let i = chart.length - 1; i >= 0; i--) {
    if (chart[i].ewma > mu) run++
    else break
  }

  // How far the unit has actually moved, in units of its own noise. The run rule
  // alone fires on any sustained shift however small — a unit that crept up by
  // three hundredths of a point for two weeks is statistically "out of control"
  // and clinically irrelevant. Gating the headline signal on at least one sigma
  // of movement keeps the board free of drift nobody would act on, while the raw
  // run count stays available for anyone who wants it.
  const shift = last.ewma - mu
  const shiftSigmas = sigma > 0 ? shift / sigma : 0
  const MEANINGFUL_SHIFT_SIGMAS = 1

  const drifting = run >= 8 && shiftSigmas >= MEANINGFUL_SHIFT_SIGMAS

  return {
    ok: true,
    mu,
    sigma,
    ucl: mu + limit,
    lcl: Math.max(0, mu - limit),
    chart,
    ewma: last.ewma,
    rising,
    falling,
    shift,
    shiftSigmas,
    runAboveCenter: run,
    // A run of 8+ is the conventional out-of-control rule.
    runSignal: run >= 8,
    drifting,
    signal: rising ? 'rising' : falling ? 'falling' : drifting ? 'drifting-up' : 'stable',
  }
}

/* ------------------------------------------------------------------ attribution */

/**
 * Why is the forecast what it is?
 *
 * The damped-trend model is additive by construction, so its prediction splits
 * exactly into unit baseline + shift-of-week pattern + recent momentum. Nothing
 * is approximated here; the parts sum to the prediction.
 */
export function explainForecast(forecast, point) {
  if (!forecast?.ok || !point) return null
  const seasonal = forecast.seasonal
  const sow = slotOfWeek(point.slot)
  const seasonalOffset = seasonal?.offsets?.[sow] ?? 0
  // The smoother's current level is the true "where this unit sits now"; the
  // series median is only a stand-in for estimators that don't track a level.
  const baseline = forecast.state?.level ?? seasonal?.base ?? point.p50
  // Whatever the prediction is beyond baseline and seasonality is momentum, so
  // the three parts reconstruct the prediction exactly.
  const momentum = point.p50 - baseline - seasonalOffset

  const parts = [
    { id: 'baseline', label: 'Unit baseline', value: baseline, detail: 'Typical reading for this unit' },
    {
      id: 'seasonal',
      label: `${labelSlotOfWeek(sow)} pattern`,
      value: seasonalOffset,
      detail: seasonalOffset >= 0
        ? `This shift historically runs above the unit's normal`
        : `This shift historically runs below the unit's normal`,
      evidence: seasonal?.counts?.[sow] ?? 0,
    },
    {
      id: 'momentum',
      label: 'Recent momentum',
      value: momentum,
      detail: momentum >= 0 ? 'Recent shifts trending up' : 'Recent shifts trending down',
    },
  ]

  return { total: point.p50, parts, method: forecast.method, confidence: forecast.confidence }
}

/**
 * Exact decomposition of a change in inpatient acuity-per-staff into the part
 * caused by acuity points moving and the part caused by staffing moving.
 *
 * The two contributions sum exactly to the change — no residual term — which
 * makes it safe to put in front of clinicians who will check the arithmetic.
 */
export function decomposeUai(prev, curr) {
  if (!prev || !curr) return null
  const p0 = Number(prev.points) || 0
  const s0 = Number(prev.staff) || 0
  const p1 = Number(curr.points) || 0
  const s1 = Number(curr.staff) || 0
  if (!s0 || !s1) return null

  const from = safeDiv(p0, s0)
  const to = safeDiv(p1, s1)
  const fromPoints = (p1 - p0) / s0
  const fromStaff = p1 * (1 / s1 - 1 / s0)

  return {
    from,
    to,
    delta: to - from,
    fromPoints,
    fromStaff,
    pointsChange: p1 - p0,
    staffChange: s1 - s0,
    driver: Math.abs(fromPoints) >= Math.abs(fromStaff) ? 'acuity' : 'staffing',
  }
}

/* ------------------------------------------------------------- census / volume */

/**
 * Census outlook against the nursing-driven cap: probability of running over
 * cap on each forecast shift, and the expected admissions headroom.
 */
export function assessCensus(censusForecast, cap) {
  if (!censusForecast?.ok) return { ok: false, reason: censusForecast?.reason || 'no-forecast' }
  if (cap == null) return { ok: false, reason: 'no-cap' }

  const horizons = censusForecast.points.map((point) => {
    const pOver = probabilityAbove(point, cap)
    return {
      ...point,
      cap,
      pOverCap: pOver,
      headroom: cap - point.p50,
      band: riskBand(pOver ?? 0),
    }
  })

  const firstOver = horizons.find((h) => h.p50 > cap) || null
  const firstRisk = horizons.find((h) => (h.pOverCap ?? 0) >= 0.5) || null

  return {
    ok: true,
    cap,
    horizons,
    next: horizons[0] || null,
    firstOver,
    firstRisk,
    shiftsToOverCap: firstOver ? firstOver.horizon : null,
    peakPOverCap: horizons.reduce((m, h) => Math.max(m, h.pOverCap ?? 0), 0),
  }
}
