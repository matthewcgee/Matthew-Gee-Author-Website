// Acuitas™ Forecast Engine
//
// Shift-level forecasting for behavioral health acuity, census, and volume.
// Everything here is pure math on data the app already collects — no network
// calls, no external model service, no PHI leaving the browser. That is a
// deliberate design constraint: a clinical staffing tool has to be auditable,
// and every number it shows has to be explainable to the charge nurse acting
// on it.
//
// The model is a damped-trend Holt smoother over a deseasonalized series, with
// a shrunk shift-of-week seasonal profile. Parameters are fit per unit by
// minimizing one-step-ahead error, and the method actually used (model vs.
// seasonal naive vs. flat mean) is chosen by out-of-sample backtest error —
// so a unit whose history is too thin or too erratic to model falls back to a
// simpler estimator instead of pretending to precision it doesn't have.

import { computeEntryValue } from './model.js'

export const SHIFTS = ['AM', 'PM']
export const SLOTS_PER_DAY = SHIFTS.length
// One full weekly cycle at shift granularity: 7 days x 2 shifts.
export const SEASON_LENGTH = 7 * SLOTS_PER_DAY

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Minimum observations before we will show a forecast at all.
const MIN_OBSERVATIONS = 6
// Shrinkage constant for per-slot seasonal offsets: an offset estimated from a
// single observation is pulled ~2/3 of the way back to zero, while one backed
// by eight observations survives nearly intact.
const SEASONAL_SHRINK_K = 2
// Floor on interval half-width so a run of identical readings doesn't render
// as absolute certainty.
const MIN_INTERVAL_FRACTION = 0.04
const MIN_INTERVAL_ABSOLUTE = 0.05

/* ---------------------------------------------------------------- time index */

// Whole days since the Unix epoch, parsed as UTC so a user's local timezone
// can never shift an entry onto the wrong day.
export function dayIndex(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

export function dateFromDayIndex(idx) {
  return new Date(idx * 86400000).toISOString().slice(0, 10)
}

export function shiftIndex(shift) {
  const i = SHIFTS.indexOf(shift)
  return i === -1 ? 0 : i
}

// A "slot" is one shift on one unit — the atomic unit of time in this app.
export function slotIndex(dateStr, shift) {
  const d = dayIndex(dateStr)
  if (d == null) return null
  return d * SLOTS_PER_DAY + shiftIndex(shift)
}

export function slotToDateShift(slot) {
  const d = Math.floor(slot / SLOTS_PER_DAY)
  return { date: dateFromDayIndex(d), shift: SHIFTS[slot - d * SLOTS_PER_DAY] }
}

// 1970-01-01 (dayIndex 0) was a Thursday, so +4 aligns 0 to Sunday.
export function weekdayOf(dateStr) {
  const d = dayIndex(dateStr)
  return d == null ? null : (d + 4) % 7
}

// Position within the weekly cycle, 0..13.
export function slotOfWeek(slot) {
  const d = Math.floor(slot / SLOTS_PER_DAY)
  const weekday = (d + 4) % 7
  return weekday * SLOTS_PER_DAY + (slot - d * SLOTS_PER_DAY)
}

export function labelSlotOfWeek(sow) {
  return `${WEEKDAY_NAMES[Math.floor(sow / SLOTS_PER_DAY)]} ${SHIFTS[sow % SLOTS_PER_DAY]}`
}

/* ------------------------------------------------------------------- helpers */

export function quantile(sortedValues, q) {
  const n = sortedValues.length
  if (!n) return 0
  if (n === 1) return sortedValues[0]
  const pos = (n - 1) * Math.min(1, Math.max(0, q))
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sortedValues[lo]
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo)
}

export function median(values) {
  if (!values.length) return 0
  return quantile(values.slice().sort((a, b) => a - b), 0.5)
}

export function mean(values) {
  if (!values.length) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

// Sum of phi^1..phi^g — how much of the trend survives g steps under damping.
function dampSum(phi, g) {
  if (g <= 0) return 0
  if (phi >= 0.9999) return g
  return (phi * (1 - Math.pow(phi, g))) / (1 - phi)
}

/* -------------------------------------------------------------------- series */

export const METRICS = {
  // Acuity as the app already defines it: UAI for inpatient, raw points for ED.
  acuity: { key: 'acuity', label: 'Acuity', decimals: 2 },
  census: { key: 'census', label: 'Census', decimals: 1 },
  points: { key: 'points', label: 'Acuity points', decimals: 1 },
  staff: { key: 'staff', label: 'Staff', decimals: 1 },
}

function metricValue(entry, loc, thresholds, metric) {
  switch (metric) {
    case 'census': return entry.census == null ? null : Number(entry.census)
    case 'points': return entry.points == null ? null : Number(entry.points)
    case 'staff': return entry.staff == null ? null : Number(entry.staff)
    case 'acuity':
    default: {
      const v = computeEntryValue(entry, loc, thresholds)
      return Number.isFinite(v) ? v : null
    }
  }
}

// Collapse this unit's entries into one observation per shift, ordered in time.
//
// When two entries exist for the same slot the most recently created one wins,
// matching how the Status Board already picks "latest reading" — the forecast
// must never disagree with the number on the board.
export function buildSeries(entries, loc, thresholds, metric = 'acuity') {
  if (!loc || !Array.isArray(entries)) return []
  const bySlot = new Map()

  for (const e of entries) {
    if (e.locId !== loc.id) continue
    const slot = slotIndex(e.date, e.shift)
    if (slot == null) continue
    const prev = bySlot.get(slot)
    if (prev && (prev.createdAt || 0) >= (e.createdAt || 0)) continue
    bySlot.set(slot, e)
  }

  const out = []
  for (const [slot, e] of bySlot) {
    const value = metricValue(e, loc, thresholds, metric)
    if (value == null || !Number.isFinite(value)) continue
    out.push({
      slot,
      date: e.date,
      shift: e.shift,
      value,
      census: e.census ?? null,
      points: e.points ?? null,
      staff: e.staff ?? null,
      capInPlace: !!e.capInPlace,
    })
  }
  return out.sort((a, b) => a.slot - b.slot)
}

/* ------------------------------------------------------------------ seasonal */

// Half-width of the detrending window: one full week centered on each point,
// so a within-week seasonal pattern averages out of the local baseline.
const SEASONAL_WINDOW = Math.floor(SEASON_LENGTH / 2)

// Additive shift-of-week offsets, estimated with medians (outlier-resistant)
// and shrunk toward zero in proportion to how little evidence backs each slot.
//
// Each observation is compared against a *local* baseline — the median of the
// week centered on it — not against the series-wide median. Without that, a
// unit whose acuity is climbing steadily would have the climb misread as
// seasonality, because later shift-of-week slots would sit higher than earlier
// ones purely by virtue of when they occurred.
export function seasonalProfile(series) {
  const base = median(series.map((p) => p.value))
  const buckets = new Map()

  // Slots increase monotonically, so both window edges only ever move forward.
  let lo = 0
  let hi = 0
  for (let i = 0; i < series.length; i++) {
    const slot = series[i].slot
    while (lo < series.length && series[lo].slot < slot - SEASONAL_WINDOW) lo++
    while (hi < series.length && series[hi].slot <= slot + SEASONAL_WINDOW) hi++
    const window = []
    for (let j = lo; j < hi; j++) window.push(series[j].value)
    const local = window.length ? median(window) : base

    const sow = slotOfWeek(slot)
    if (!buckets.has(sow)) buckets.set(sow, [])
    buckets.get(sow).push(series[i].value - local)
  }

  const offsets = new Array(SEASON_LENGTH).fill(0)
  const counts = new Array(SEASON_LENGTH).fill(0)

  // Bucket values are already deviations from the local baseline, so their
  // median *is* the raw seasonal offset for that slot.
  for (const [sow, deviations] of buckets) {
    const n = deviations.length
    offsets[sow] = median(deviations) * (n / (n + SEASONAL_SHRINK_K))
    counts[sow] = n
  }

  // Center the profile so seasonality carries shape, not level. The level term
  // owns the overall magnitude; without centering the two would fight.
  const observed = offsets.filter((_, i) => counts[i] > 0)
  const centerAdj = observed.length ? mean(observed) : 0
  for (let i = 0; i < SEASON_LENGTH; i++) {
    if (counts[i] > 0) offsets[i] -= centerAdj
  }

  return { base, offsets, counts }
}

/* ------------------------------------------------- damped-trend Holt smoother */

const ALPHA_GRID = [0.15, 0.3, 0.45, 0.6, 0.8]
const BETA_GRID = [0, 0.05, 0.15, 0.3]
const PHI_GRID = [0.75, 0.9, 0.98]

// Run the smoother across the series, returning final state and the one-step
// residuals it produced along the way. Gaps in the series (an unlogged shift)
// advance the level by the damped trend without fabricating an observation.
function runHolt(points, alpha, beta, phi) {
  if (!points.length) return null

  let level = points[0].deseason
  let trend = 0
  const residuals = []

  for (let i = 1; i < points.length; i++) {
    const gap = Math.max(1, points[i].slot - points[i - 1].slot)
    const f = level + trend * dampSum(phi, gap)
    const err = points[i].deseason - f
    residuals.push(err)
    level = f + alpha * err
    trend = Math.pow(phi, gap) * trend + beta * err
  }

  return { level, trend, residuals, lastSlot: points[points.length - 1].slot }
}

function sse(residuals) {
  return residuals.reduce((s, e) => s + e * e, 0)
}

/* ----------------------------------------------------------------- estimators */

// Each estimator exposes predict(slot) -> number, so backtesting can score
// them against each other on identical footing.

function modelEstimator(series) {
  const seasonal = seasonalProfile(series)
  const points = series.map((p) => ({
    slot: p.slot,
    deseason: p.value - seasonal.offsets[slotOfWeek(p.slot)],
  }))

  let best = null
  for (const alpha of ALPHA_GRID) {
    for (const beta of BETA_GRID) {
      for (const phi of PHI_GRID) {
        const run = runHolt(points, alpha, beta, phi)
        if (!run) continue
        const score = sse(run.residuals)
        if (!best || score < best.score) best = { score, alpha, beta, phi, run }
      }
    }
  }
  if (!best) return null

  const { level, trend, lastSlot } = best.run
  return {
    method: 'damped-trend',
    params: { alpha: best.alpha, beta: best.beta, phi: best.phi },
    seasonal,
    level,
    trend,
    lastSlot,
    residuals: best.run.residuals,
    predict(slot) {
      const gap = Math.max(0, slot - lastSlot)
      const deseason = level + trend * dampSum(best.phi, gap)
      return Math.max(0, deseason + seasonal.offsets[slotOfWeek(slot)])
    },
  }
}

// Same shift last week, falling back to the unit's median when that slot has
// never been logged. This is the honest baseline any forecast has to beat.
function seasonalNaiveEstimator(series) {
  const bySlot = new Map(series.map((p) => [p.slot, p.value]))
  const med = median(series.map((p) => p.value))
  const bySow = new Map()
  for (const p of series) {
    const sow = slotOfWeek(p.slot)
    if (!bySow.has(sow)) bySow.set(sow, [])
    bySow.get(sow).push(p.value)
  }
  return {
    method: 'seasonal-naive',
    predict(slot) {
      for (let back = SEASON_LENGTH; back <= SEASON_LENGTH * 4; back += SEASON_LENGTH) {
        const v = bySlot.get(slot - back)
        if (v != null) return v
      }
      const sow = bySow.get(slotOfWeek(slot))
      return sow ? median(sow) : med
    },
  }
}

// Recent central tendency, ignoring time order entirely. Wins on units whose
// acuity is essentially stationary noise — which is a real and common case.
function flatEstimator(series) {
  const recent = series.slice(-SEASON_LENGTH * 2).map((p) => p.value)
  const m = median(recent)
  return { method: 'recent-median', predict: () => m }
}

const ESTIMATORS = [
  { name: 'damped-trend', build: modelEstimator },
  { name: 'seasonal-naive', build: seasonalNaiveEstimator },
  { name: 'recent-median', build: flatEstimator },
]

/* ------------------------------------------------------------------ backtest */

const MIN_TRAIN = 5
const MAX_SPLITS = 60

// Walk-forward validation: at each split, fit only on what was knowable then
// and score the next `horizon` slots. Residuals are kept per horizon so
// prediction intervals widen with distance using measured error, not an
// assumed variance law.
export function backtest(series, horizon = 4) {
  const n = series.length
  const scores = new Map()
  for (const est of ESTIMATORS) {
    scores.set(est.name, { absErr: [], byHorizon: new Map(), pctErr: [] })
  }

  const firstSplit = Math.max(MIN_TRAIN, n - MAX_SPLITS)
  let splits = 0

  for (let s = firstSplit; s < n; s++) {
    const train = series.slice(0, s)
    splits++
    for (const est of ESTIMATORS) {
      const fitted = est.build(train)
      if (!fitted) continue
      const bucket = scores.get(est.name)
      for (let h = 1; h <= horizon; h++) {
        const target = series[s + h - 1]
        if (!target) break
        const predicted = fitted.predict(target.slot)
        const err = target.value - predicted
        bucket.absErr.push(Math.abs(err))
        if (!bucket.byHorizon.has(h)) bucket.byHorizon.set(h, [])
        bucket.byHorizon.get(h).push(err)
        if (target.value > 0) bucket.pctErr.push(Math.abs(err) / target.value)
      }
    }
  }

  const summary = {}
  for (const [name, bucket] of scores) {
    summary[name] = {
      mae: bucket.absErr.length ? mean(bucket.absErr) : null,
      mape: bucket.pctErr.length ? mean(bucket.pctErr) : null,
      rmse: bucket.absErr.length ? Math.sqrt(mean(bucket.absErr.map((e) => e * e))) : null,
      samples: bucket.absErr.length,
      residualsByHorizon: bucket.byHorizon,
    }
  }

  return { splits, summary, horizon }
}

/* -------------------------------------------------------------- forecast API */

// Mean absolute deviation about the median — how much this unit's acuity moves
// around on its own. Forecast error only means something relative to this.
export function dispersion(values) {
  if (!values.length) return 0
  const med = median(values)
  return mean(values.map((v) => Math.abs(v - med)))
}

// How much of the unit's own variability the forecast actually explains.
// 1 = perfectly predicted, 0 = no better than quoting the unit's usual number.
export function informativeness(mae, mad) {
  if (mae == null) return null
  if (!mad) return mae === 0 ? 1 : 0
  return 1 - mae / mad
}

// How tight the forecast is in absolute terms, relative to the unit's own
// level. A unit that barely moves can be pinned down precisely even though
// there is no pattern to "explain".
function precisionTier(mae, level) {
  if (mae == null || !level) return null
  const relative = mae / Math.abs(level)
  if (relative < 0.1) return 'high'
  if (relative < 0.2) return 'moderate'
  return 'low'
}

const TIER_ORDER = ['low', 'moderate', 'high']

// Confidence is about predictive usefulness, not sophistication.
//
// There are two independent reasons to trust a forecast, and a unit only needs
// one of them. Either the model explains the unit's swings (high
// informativeness), or the unit hardly swings and the prediction is tight in
// absolute terms (high precision). Judging on explained variance alone would
// label the steadiest unit on the floor "low confidence" purely for being
// predictable, which is exactly backwards; judging on precision alone would
// flatter a unit whose acuity is pure noise around a stable mean.
function confidenceTier(n, info, mae, level) {
  if (n < MIN_OBSERVATIONS) return 'insufficient'
  if (n < SEASON_LENGTH) return 'low'

  const explained = info == null || info < 0.15 ? 'low' : info >= 0.35 ? 'high' : 'moderate'
  const precise = precisionTier(mae, level) || 'low'
  let tier = TIER_ORDER[Math.max(TIER_ORDER.indexOf(explained), TIER_ORDER.indexOf(precise))]

  // Under two full weekly cycles there is not enough evidence to claim the top
  // tier, however well the model happens to be scoring.
  if (n < SEASON_LENGTH * 2 && tier === 'high') tier = 'moderate'
  return tier
}

// Half-width of the prediction interval at a given horizon and coverage.
// Prefers measured h-step residuals; falls back to scaling 1-step error by
// sqrt(h) (random-walk error accumulation) when the backtest is too short.
function intervalHalfWidth(residualsByHorizon, h, coverage, level) {
  const q = coverage
  let sample = residualsByHorizon?.get(h)
  let scale = 1

  if (!sample || sample.length < 5) {
    sample = residualsByHorizon?.get(1)
    scale = Math.sqrt(h)
  }

  let half
  if (sample && sample.length) {
    const abs = sample.map(Math.abs).sort((a, b) => a - b)
    half = quantile(abs, q) * scale
  } else {
    half = Math.abs(level) * 0.25
  }

  const floor = Math.max(MIN_INTERVAL_ABSOLUTE, Math.abs(level) * MIN_INTERVAL_FRACTION)
  return Math.max(half, floor)
}

// The next `horizon` slots after the last observation, whether or not anyone
// has logged them yet.
export function futureSlots(lastSlot, horizon) {
  const out = []
  for (let i = 1; i <= horizon; i++) out.push(lastSlot + i)
  return out
}

/**
 * Forecast one unit's metric forward.
 *
 * Returns { ok, reason, points[], method, confidence, accuracy, seasonal, series }
 * where each point carries p50 plus 80% and 95% prediction bands.
 */
export function forecastSeries(series, { horizon = 4 } = {}) {
  const n = series.length

  if (n === 0) {
    return { ok: false, reason: 'no-data', observations: 0, points: [], confidence: 'insufficient' }
  }
  if (n < MIN_OBSERVATIONS) {
    return {
      ok: false,
      reason: 'thin-history',
      observations: n,
      needed: MIN_OBSERVATIONS,
      points: [],
      confidence: 'insufficient',
    }
  }

  const bt = backtest(series, horizon)

  // Pick the estimator with the lowest out-of-sample error, not the most
  // sophisticated one.
  let bestName = 'recent-median'
  let bestMae = Infinity
  for (const [name, s] of Object.entries(bt.summary)) {
    if (s.mae != null && s.mae < bestMae) {
      bestMae = s.mae
      bestName = name
    }
  }

  const chosen = ESTIMATORS.find((e) => e.name === bestName).build(series)
  const chosenScore = bt.summary[bestName]
  const baselineMae = bt.summary['seasonal-naive']?.mae ?? bt.summary['recent-median']?.mae ?? null
  const lastSlot = series[n - 1].slot

  // Per-horizon bands come from measured h-step error, which is more faithful
  // than an assumed variance law — but finite samples can make a far horizon
  // look narrower than a near one. Carrying a running maximum removes that
  // artifact without inventing width: you cannot know shift 6 more precisely
  // than shift 1, because shift 6 is reached through shift 1.
  let widest80 = 0
  let widest95 = 0

  const points = futureSlots(lastSlot, horizon).map((slot, i) => {
    const h = i + 1
    const p50 = Math.max(0, chosen.predict(slot))
    widest80 = Math.max(widest80, intervalHalfWidth(chosenScore?.residualsByHorizon, h, 0.8, p50))
    widest95 = Math.max(widest95, intervalHalfWidth(chosenScore?.residualsByHorizon, h, 0.95, p50))
    const h80 = widest80
    const h95 = Math.max(widest95, widest80)
    const { date, shift } = slotToDateShift(slot)
    return {
      slot,
      horizon: h,
      date,
      shift,
      label: `${date} ${shift}`,
      slotOfWeek: slotOfWeek(slot),
      p50,
      low80: Math.max(0, p50 - h80),
      high80: p50 + h80,
      low95: Math.max(0, p50 - h95),
      high95: p50 + h95,
      // Empirical residuals for this horizon, reused downstream to compute
      // threshold-breach probabilities without assuming a distribution shape.
      residuals: (chosenScore?.residualsByHorizon?.get(h)?.length >= 5
        ? chosenScore.residualsByHorizon.get(h)
        : chosenScore?.residualsByHorizon?.get(1)) || [],
      residualScale: (chosenScore?.residualsByHorizon?.get(h)?.length >= 5) ? 1 : Math.sqrt(h),
    }
  })

  // Skill score: fraction of baseline error removed. 0 means no better than
  // the naive rule; negative means worse.
  const skill = (chosenScore?.mae != null && baselineMae)
    ? 1 - chosenScore.mae / baselineMae
    : null

  const values = series.map((p) => p.value)
  const mad = dispersion(values)
  const info = informativeness(chosenScore?.mae ?? null, mad)
  const level = median(values)

  return {
    ok: true,
    observations: n,
    method: bestName,
    params: chosen.params || null,
    confidence: confidenceTier(n, info, chosenScore?.mae ?? null, level),
    // Level and trend at the last observation. The damped-trend forecast is
    // additive in these, so downstream attribution can decompose a prediction
    // exactly rather than approximately.
    state: chosen.level != null
      ? { level: chosen.level, trend: chosen.trend, phi: chosen.params?.phi ?? null, lastSlot }
      : null,
    accuracy: {
      mae: chosenScore?.mae ?? null,
      mape: chosenScore?.mape ?? null,
      rmse: chosenScore?.rmse ?? null,
      samples: chosenScore?.samples ?? 0,
      splits: bt.splits,
      baselineMae,
      skill,
      dispersion: mad,
      informativeness: info,
      level,
      relativeError: chosenScore?.mae != null && level ? chosenScore.mae / Math.abs(level) : null,
      compared: Object.fromEntries(
        Object.entries(bt.summary).map(([k, v]) => [k, { mae: v.mae, samples: v.samples }])
      ),
    },
    seasonal: chosen.seasonal || seasonalProfile(series),
    lastObservation: series[n - 1],
    points,
  }
}

/**
 * Convenience wrapper: build the series for a location and forecast it.
 */
export function forecastLocation(entries, loc, thresholds, { metric = 'acuity', horizon = 4 } = {}) {
  const series = buildSeries(entries, loc, thresholds, metric)
  const result = forecastSeries(series, { horizon })
  return { ...result, metric, series, loc }
}
