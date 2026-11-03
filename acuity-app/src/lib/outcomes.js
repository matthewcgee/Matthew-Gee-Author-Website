// Acuitas™ Outcome Loop
//
// The rest of Acuitas recommends. This module checks whether the
// recommendations were followed and whether they were right, because a tool
// that never compares its advice with what actually happened can't improve and
// can't prove itself.
//
// Three loops, all computed from data the app already holds:
//
//   1. Deployment plans. A supervisor records the plan they were shown. Logged
//      deployments say whether it was followed, and the next logged reading says
//      whether the unit avoided RED. Comparing followed and not-followed moves
//      measures what following the plan was worth.
//   2. Forecast calibration. Each unit's own history is replayed one shift at a
//      time. At every step the engine forecasts only from the shifts before
//      it, and that predicted chance of RED is compared with what happened. When
//      the engine says 30%, RED should happen about 30% of the time.
//   3. Outpatient placements. For each AcuiPath placement: did the patient
//      attend the first visit, stay in care at 30 days, or need a higher level
//      of care? Grouped by tier, physician level and clinic, these outcomes show
//      where the screening thresholds may need adjusting.
//
// Like the rest of Acuitas, everything here is a plain calculation the reader
// can check by hand. Nothing is learned in a black box.

import { entryStage, thresholdsFor } from './model.js'
import { buildSeries, forecastSeries, slotIndex, slotToDateShift } from './forecast.js'
import { probabilityAbove } from './risk.js'
import { requiresAttending } from './opmatch.js'

/* ------------------------------------------------------------ plan snapshots */

// The shift a plan is aimed at. "Act on next shift" plans target the shift
// after the newest reading in the region; "act now" plans target that newest
// shift itself.
export function planTarget(entries, mode = 'forecast') {
  let latest = null
  for (const e of entries || []) {
    const s = slotIndex(e.date, e.shift)
    if (s != null && (latest == null || s > latest)) latest = s
  }
  if (latest == null) return null
  return slotToDateShift(mode === 'forecast' ? latest + 1 : latest)
}

/**
 * Freeze a recommended deployment plan so it can be scored later.
 * Returns null when there is nothing worth recording.
 */
export function snapshotPlan({ plan, target, mode, floatStaff, recordedBy = null, now = Date.now() }) {
  if (!plan?.ok || !target || !plan.moves?.length) return null
  return {
    id: `plan_${target.date}_${target.shift}_${now.toString(36)}`,
    createdAt: now,
    targetDate: target.date,
    targetShift: target.shift,
    mode: mode || plan.mode || 'forecast',
    floatStaff: Number(floatStaff) || 0,
    recordedBy,
    moves: plan.moves.map((m) => ({
      toLocId: m.toLocId,
      toName: m.toName,
      fromLocId: m.fromLocId ?? null,
      fromName: m.fromName,
      staff: m.staff,
      stageBefore: m.stageBefore,
      stageAfter: m.stageAfter,
      pRedBefore: m.pRedBefore ?? null,
      pRedAfter: m.pRedAfter ?? null,
    })),
    summary: {
      redBefore: plan.summary?.redBefore ?? null,
      redAfter: plan.summary?.redAfter ?? null,
      staffPlaced: plan.summary?.staffPlaced ?? plan.moves.reduce((s, m) => s + m.staff, 0),
    },
  }
}

function latestEntryAt(entries, locId, date, shift) {
  let best = null
  for (const e of entries || []) {
    if (e.locId !== locId || e.date !== date || e.shift !== shift) continue
    if (!best || (e.createdAt || 0) >= (best.createdAt || 0)) best = e
  }
  return best
}

/**
 * Score one recorded plan against what was logged afterwards.
 *
 * A move counts as followed when deployments to that unit were logged for the
 * target shift: 'full' if at least as many staff as recommended, 'partial' if
 * fewer. The outcome comes from the unit's reading for that same shift.
 */
export function evaluatePlan(snapshot, { entries, deployments, locations, thresholds }) {
  const locById = new Map((locations || []).map((l) => [l.id, l]))
  const moves = (snapshot.moves || []).map((m) => {
    const deployed = (deployments || []).filter(
      (d) => d.toLocId === m.toLocId && d.date === snapshot.targetDate && d.shift === snapshot.targetShift
    ).length
    const followed = deployed >= m.staff ? 'full' : deployed > 0 ? 'partial' : 'none'
    const loc = locById.get(m.toLocId)
    const entry = latestEntryAt(entries, m.toLocId, snapshot.targetDate, snapshot.targetShift)
    const hasReading = entry && entry.points != null && (loc?.type === 'ed' || Number(entry.staff) > 0)
    const actualStage = hasReading && loc ? entryStage(entry, loc, thresholds) : null
    const outcome = !actualStage || actualStage === 'NONE' ? 'pending' : actualStage === 'RED' ? 'red' : 'avoided'
    return { ...m, deployed, followed, actualStage, outcome }
  })
  return {
    ...snapshot,
    moves,
    resolved: moves.length > 0 && moves.every((m) => m.outcome !== 'pending'),
    adherence: moves.length
      ? moves.filter((m) => m.followed === 'full').length / moves.length
      : null,
  }
}

function group(moves, pKey) {
  const n = moves.length
  const red = moves.filter((m) => m.outcome === 'red').length
  const ps = moves.map((m) => m[pKey]).filter((p) => p != null)
  return {
    moves: n,
    red,
    redRate: n ? red / n : null,
    // What the engine predicted for these moves, so the reader can set the
    // prediction beside the observed rate and judge the plan's own claims.
    predictedRedRate: ps.length ? ps.reduce((s, p) => s + p, 0) / ps.length : null,
  }
}

/**
 * Followed vs not-followed, across every recorded plan whose outcome is known.
 *
 * `followed` is measured against the post-move prediction (pRedAfter): that is
 * what the plan claimed. `notFollowed` is measured against the pre-move
 * prediction (pRedBefore): that is what the plan warned would happen.
 */
export function adherenceSummary(evaluations) {
  const all = (evaluations || []).flatMap((e) => e.moves || [])
  const resolved = all.filter((m) => m.outcome !== 'pending')
  const followed = resolved.filter((m) => m.followed !== 'none')
  const notFollowed = resolved.filter((m) => m.followed === 'none')
  const f = group(followed, 'pRedAfter')
  const nf = group(notFollowed, 'pRedBefore')
  return {
    plans: (evaluations || []).length,
    moves: all.length,
    resolvedMoves: resolved.length,
    pendingMoves: all.length - resolved.length,
    adherenceRate: all.length ? all.filter((m) => m.followed === 'full').length / all.length : null,
    followed: f,
    notFollowed: nf,
    // Percentage-point drop in RED when the plan was followed. Null until both
    // sides have outcomes; a small sample is flagged by the caller.
    redReduction: f.redRate != null && nf.redRate != null ? nf.redRate - f.redRate : null,
  }
}

/* --------------------------------------------------------- forecast calibration */

/**
 * Replay one unit's history and collect (predicted chance of RED, did RED
 * happen) pairs for genuine one-shift-ahead forecasts. Each prediction uses
 * only the shifts before it, exactly as the live engine would have.
 */
export function calibrationPairs(entries, loc, thresholds, { window = 36, minTrain = 14 } = {}) {
  const series = buildSeries(entries, loc, thresholds, 'acuity')
  const th = thresholdsFor(loc, thresholds)
  const pairs = []
  const start = Math.max(minTrain, series.length - 1 - window)
  for (let t = start; t < series.length - 1; t++) {
    const next = series[t + 1]
    // Only score a true next-shift prediction; a gap in logging would make
    // this a longer-range forecast scored as if it were one shift ahead.
    if (next.slot !== series[t].slot + 1) continue
    const f = forecastSeries(series.slice(0, t + 1), { horizon: 1 })
    if (!f.ok) continue
    const p = probabilityAbove(f.points[0], th.yellowMax)
    if (p == null) continue
    pairs.push({ locId: loc.id, slot: next.slot, p, y: next.value > th.yellowMax ? 1 : 0 })
  }
  return pairs
}

const CAL_BINS = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0001]

/**
 * Brier score, its skill against always predicting the base rate, and a
 * reliability table: within each band of predicted probability, how often RED
 * actually happened.
 */
export function calibrationSummary(pairs) {
  const n = pairs.length
  if (!n) return { n: 0, brier: null, baseRate: null, skill: null, bins: [] }
  const brier = pairs.reduce((s, q) => s + (q.p - q.y) ** 2, 0) / n
  const baseRate = pairs.reduce((s, q) => s + q.y, 0) / n
  const brierRef = baseRate * (1 - baseRate)
  const bins = []
  for (let i = 0; i < CAL_BINS.length - 1; i++) {
    const lo = CAL_BINS[i]
    const hi = CAL_BINS[i + 1]
    const inBin = pairs.filter((q) => q.p >= lo && q.p < hi)
    bins.push({
      lo,
      hi: Math.min(1, hi),
      n: inBin.length,
      meanPredicted: inBin.length ? inBin.reduce((s, q) => s + q.p, 0) / inBin.length : null,
      observed: inBin.length ? inBin.reduce((s, q) => s + q.y, 0) / inBin.length : null,
    })
  }
  // Expected calibration error: the average gap between predicted and observed,
  // weighted by how many predictions fell in each band.
  const ece = bins.reduce((s, b) => s + (b.n ? (b.n / n) * Math.abs(b.meanPredicted - b.observed) : 0), 0)
  return {
    n,
    brier,
    baseRate,
    // 0 = no better than always guessing the base rate; 1 = perfect. Undefined
    // when RED never (or always) happened, because there is nothing to beat.
    skill: brierRef > 0 ? 1 - brier / brierRef : null,
    ece,
    bins,
  }
}

/** Calibration across every unit with enough history. */
export function regionCalibration(entries, locations, thresholds, opts = {}) {
  const perUnit = []
  const all = []
  for (const loc of locations || []) {
    const pairs = calibrationPairs(entries, loc, thresholds, opts)
    if (!pairs.length) continue
    perUnit.push({ loc, ...calibrationSummary(pairs) })
    all.push(...pairs)
  }
  return { overall: calibrationSummary(all), perUnit }
}

/* ------------------------------------------------------ outpatient outcomes */

export const FIRST_VISIT = {
  PENDING: 'pending',
  ATTENDED: 'attended',
  NO_SHOW: 'no-show',
  CANCELLED: 'cancelled',
}

export const FIRST_VISIT_LABEL = {
  pending: 'Pending',
  attended: 'Attended',
  'no-show': 'No-show',
  cancelled: 'Cancelled',
}

function rates(rows) {
  const visits = rows.filter((r) => r.o.firstVisit === FIRST_VISIT.ATTENDED || r.o.firstVisit === FIRST_VISIT.NO_SHOW)
  const retainedKnown = rows.filter((r) => typeof r.o.retained30 === 'boolean')
  const stepKnown = rows.filter((r) => typeof r.o.steppedUp === 'boolean')
  return {
    tracked: rows.length,
    attendedRate: visits.length ? visits.filter((r) => r.o.firstVisit === FIRST_VISIT.ATTENDED).length / visits.length : null,
    attendedN: visits.length,
    retainedRate: retainedKnown.length ? retainedKnown.filter((r) => r.o.retained30).length / retainedKnown.length : null,
    retainedN: retainedKnown.length,
    stepUpRate: stepKnown.length ? stepKnown.filter((r) => r.o.steppedUp).length / stepKnown.length : null,
    stepUpN: stepKnown.length,
  }
}

function tierOf(p) {
  if (p.tier === '1-direct') return '1-direct'
  if (p.tier === 'bridge' || p.bridge) return 'bridge'
  return '2-full'
}

export const TIER_LABEL = {
  '1-direct': 'Tier 1 direct placement',
  '2-full': 'Tier 2 in-depth screen',
  bridge: 'Discharge bridge',
}

/**
 * Freeze what was decided about a placement at the moment its outcome is
 * recorded. The outcome then still counts after the case closes and leaves
 * the active caseload.
 */
export function placementSnapshot(p) {
  return {
    tier: p.tier || (p.bridge ? 'bridge' : '2-full'),
    bridge: !!p.bridge,
    requiresAttending: requiresAttending(p),
    program: p.program || '',
    population: p.population || 'adult',
  }
}

/**
 * Outcome rates for AcuiPath placements, overall and broken down by screening
 * tier, primary-physician level, and clinic.
 */
export function opOutcomeSummary(patients, outcomes) {
  const byId = new Map((patients || []).map((p) => [p.id, p]))
  const rows = (outcomes || [])
    .map((o) => ({ o, p: byId.get(o.patientId) || o.placement || null }))
    .filter((r) => r.p)

  const by = (keyFn) => {
    const m = new Map()
    for (const r of rows) {
      const k = keyFn(r.p)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return Object.fromEntries([...m].map(([k, rs]) => [k, rates(rs)]))
  }

  return {
    overall: rates(rows),
    byTier: by(tierOf),
    byPhysician: by((p) => (requiresAttending(p) ? 'attending' : 'resident')),
    byClinic: by((p) => p.program || 'Unassigned'),
  }
}

/**
 * Plain-language prompts to review a threshold, raised only when the evidence
 * clears a minimum sample and a minimum gap. These are prompts for a clinical
 * leader to consider. They never change a setting on their own.
 */
export function thresholdFeedback(summary, { minN = 8, gap = 0.1, noShowFlag = 0.3 } = {}) {
  const out = []
  const pct = (x) => `${Math.round(x * 100)}%`
  const direct = summary?.byTier?.['1-direct']
  const full = summary?.byTier?.['2-full']
  if (direct && full && direct.stepUpN >= minN && full.stepUpN >= minN &&
      direct.stepUpRate - full.stepUpRate >= gap) {
    out.push({
      id: 'tier1-permissive',
      severity: 'review',
      message: `Tier 1 direct placements needed a higher level of care ${pct(direct.stepUpRate)} of the time, against ${pct(full.stepUpRate)} after a full screen. Consider adding red-flag triggers, so more cases get the in-depth screen.`,
      evidence: { direct: direct.stepUpN, full: full.stepUpN },
    })
  }
  const res = summary?.byPhysician?.resident
  const att = summary?.byPhysician?.attending
  if (res && att && res.stepUpN >= minN && att.stepUpN >= minN && res.stepUpRate - att.stepUpRate >= gap) {
    out.push({
      id: 'attending-threshold-high',
      severity: 'review',
      message: `Resident-eligible cases stepped up ${pct(res.stepUpRate)} of the time, compared with ${pct(att.stepUpRate)} for attending-led cases. The attending threshold may be set too high.`,
      evidence: { resident: res.stepUpN, attending: att.stepUpN },
    })
  }
  for (const [clinic, r] of Object.entries(summary?.byClinic || {})) {
    if (r.attendedN >= minN && r.attendedRate != null && 1 - r.attendedRate >= noShowFlag) {
      out.push({
        id: `noshow-${clinic}`,
        severity: 'info',
        message: `${clinic}: ${pct(1 - r.attendedRate)} of first visits were missed. Reminder outreach or a shorter wait for that clinic may help.`,
        evidence: { visits: r.attendedN },
      })
    }
  }
  return out
}
