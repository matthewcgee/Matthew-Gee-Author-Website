// AcuiCalc™ governed local calibration.
//
// Acuitas is an operational staffing tool, not a diagnostic test. Each health
// system may tune AcuiCalc™ to match how its own nurses describe acuity, but
// only inside guard rails that keep the measure consistent and testable:
//
//   • Locked core: the four scoring domains, their items and the wording of
//     every score level are fixed. No hospital user, administrators included,
//     can change them. A calibration may only carry point values, zone cutoffs
//     and zone responses.
//   • Point values move at most WEIGHT_LIMIT_PCT from the shipped default.
//   • Zone cutoffs must keep GREEN, YELLOW and RED in order, with no gaps and
//     no overlaps.
//   • One calibration per health system. Every unit and ED uses it; there are
//     no single-unit overrides.
//   • Only an Administrator can change it, and every change needs a written
//     reason and the frontline nurses (names or roles) who reviewed it. Each
//     change is a new numbered version (v1, v2, ...) written to the
//     hash-chained audit log with the old and new values.
//   • Saved shift scores carry the version they were calculated under, so a
//     later calibration never rewrites history.

import {
  ADULT_ACUITY_CRITERIA,
  DEFAULT_THRESHOLDS,
  PEDIATRIC_ED_THRESHOLDS,
  normalizeThresholds,
  thresholdsFor,
  zoneSetFor,
} from './model.js'
import { can } from './roles.js'

export const INSTRUMENT_NAME = 'AcuiCalc™'

// The AcuiCalc™ instrument itself (its items and how a score is formed), as
// distinct from a system's calibration of it. Stamped on every saved shift so
// analyses never mix shifts scored under different definitions.
//   1  Original instrument.
//   2  Observation above the unit's routine level only (routine Q15 checks for
//      every patient are not scored). Inpatient acuity per staff divides by
//      staff on shift minus patients on 1:1, since each 1:1 takes one staff
//      member entirely.
export const INSTRUMENT_VERSION = 2

// The single knob for how far an administrator may move any point value from
// its shipped default, as a fraction (0.25 = ±25%).
export const WEIGHT_LIMIT_PCT = 0.25

// Shortest written reason accepted for a calibration change.
export const MIN_REASON_LENGTH = 10
export const MAX_RESPONSE_LENGTH = 200

export const ZONE_STAGES = ['GREEN', 'YELLOW', 'RED']

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

const clone = (v) => JSON.parse(JSON.stringify(v))

/* --------------------------------------------------------------- locked core */

// The domains and level descriptions, without point values. Frozen: nothing
// in the app can edit them, and a calibration that tries is rejected.
export const LOCKED_CORE = deepFreeze(
  ADULT_ACUITY_CRITERIA.map((g) => ({
    group: g.group,
    ...(g.note ? { note: g.note } : {}),
    items: g.items.map((i) => ({ id: i.id, label: i.label })),
  }))
)

export const LOCKED_ITEM_IDS = Object.freeze(LOCKED_CORE.flatMap((g) => g.items.map((i) => i.id)))

export const SHIPPED_POINTS = deepFreeze(
  Object.fromEntries(ADULT_ACUITY_CRITERIA.flatMap((g) => g.items.map((i) => [i.id, i.points])))
)

/* -------------------------------------------------------------------- zones */

export const ZONE_SETS = deepFreeze({
  inpatient: { label: 'Inpatient units', unit: DEFAULT_THRESHOLDS.inpatient.unit, step: 0.1 },
  ed: { label: 'Emergency departments', unit: DEFAULT_THRESHOLDS.ed.unit, step: 1 },
  pedsEd: { label: 'Pediatric emergency departments', unit: PEDIATRIC_ED_THRESHOLDS.unit, step: 1 },
})
export const ZONE_SET_IDS = Object.freeze(Object.keys(ZONE_SETS))

export const SHIPPED_ZONES = deepFreeze({
  inpatient: { greenMax: DEFAULT_THRESHOLDS.inpatient.greenMax, yellowMax: DEFAULT_THRESHOLDS.inpatient.yellowMax },
  ed: { greenMax: DEFAULT_THRESHOLDS.ed.greenMax, yellowMax: DEFAULT_THRESHOLDS.ed.yellowMax },
  pedsEd: { greenMax: PEDIATRIC_ED_THRESHOLDS.greenMax, yellowMax: PEDIATRIC_ED_THRESHOLDS.yellowMax },
})

// What each zone asks of the house. GREEN matches the wording the Status Board
// has always shown when a unit is at target.
export const SHIPPED_RESPONSES = deepFreeze({
  GREEN: 'Staffing is at target for current acuity',
  YELLOW: 'Elevated — deploy staff to return to GREEN',
  RED: 'Critical — needs attention now; deploy staff to return to GREEN',
})

/* ---------------------------------------------------------------- versions */

const CALIBRATION_FIELDS = ['points', 'zones', 'responses']

function makeVersion(version, values, meta) {
  return {
    version,
    points: clone(values.points),
    zones: clone(values.zones),
    responses: clone(values.responses),
    kind: meta.kind,
    reason: meta.reason || '',
    reviewers: meta.reviewers || [],
    actor: meta.actor || null,
    role: meta.role || null,
    at: meta.at ?? null,
  }
}

export function shippedValues() {
  return { points: clone(SHIPPED_POINTS), zones: clone(SHIPPED_ZONES), responses: clone(SHIPPED_RESPONSES) }
}

/**
 * Version 1. It is the shipped defaults, unless this system had already
 * changed its region-wide thresholds before calibration existed; then v1 keeps
 * those values so nothing scored today changes on upgrade.
 */
export function initialCalibration(legacyThresholds = null) {
  const values = shippedValues()
  let kind = 'shipped'
  if (legacyThresholds) {
    const legacy = normalizeThresholds(legacyThresholds)
    for (const set of ['inpatient', 'ed']) {
      const g = Number(legacy[set].greenMax)
      const y = Number(legacy[set].yellowMax)
      if (g !== values.zones[set].greenMax || y !== values.zones[set].yellowMax) {
        values.zones[set] = { greenMax: g, yellowMax: y }
        kind = 'migrated'
      }
    }
  }
  return makeVersion(1, values, {
    kind,
    reason: kind === 'shipped' ? 'Shipped defaults' : 'Carried forward from the thresholds in use before calibration',
  })
}

/** The stored calibration history, or a fresh one holding v1. */
export function calibrationState(stored, legacyThresholds = null) {
  if (stored && Array.isArray(stored.versions) && stored.versions.length) return stored
  return { versions: [initialCalibration(legacyThresholds)] }
}

export function activeCalibration(state) {
  const versions = state?.versions || []
  return versions.reduce((a, b) => (!a || b.version > a.version ? b : a), null) || initialCalibration()
}

export function calibrationByVersion(state, version) {
  return (state?.versions || []).find((v) => v.version === version) || null
}

export function versionLabel(cal) {
  return cal ? `v${cal.version}` : 'v1'
}

/* -------------------------------------------------------------- validation */

const EPS = 1e-9
const round2 = (n) => Math.round(n * 100) / 100

export function pointLimits(id, limitPct = WEIGHT_LIMIT_PCT) {
  const d = SHIPPED_POINTS[id]
  if (d == null) return null
  return { default: d, min: round2(d * (1 - limitPct)), max: round2(d * (1 + limitPct)) }
}

function itemLabel(id) {
  for (const g of LOCKED_CORE) for (const i of g.items) if (i.id === id) return i.label
  return id
}

export function validatePoints(points, limitPct = WEIGHT_LIMIT_PCT) {
  const errors = []
  if (!points || typeof points !== 'object') return ['Point values are missing.']
  for (const id of Object.keys(points)) {
    if (!LOCKED_ITEM_IDS.includes(id)) {
      errors.push(`"${id}" is not an ${INSTRUMENT_NAME} item. Items can't be added, removed or renamed; only point values can change.`)
    }
  }
  for (const id of LOCKED_ITEM_IDS) {
    const raw = points[id]
    const v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw
    const lim = pointLimits(id, limitPct)
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${itemLabel(id)}: enter a number.`)
    } else if (v < lim.min - EPS || v > lim.max + EPS) {
      const pct = Math.round(limitPct * 100)
      errors.push(
        `${itemLabel(id)}: ${v} is outside the allowed range ${lim.min}–${lim.max} ` +
        `(shipped default ${lim.default}, ±${pct}%).`
      )
    }
  }
  return errors
}

/**
 * The bands a zone set produces, using the same rule as computeStage:
 * GREEN is 0..greenMax inclusive, YELLOW is above greenMax up to yellowMax
 * inclusive, RED is anything above yellowMax.
 */
export function zoneBands({ greenMax, yellowMax }) {
  return [
    { stage: 'GREEN', min: 0, minInclusive: true, max: greenMax, maxInclusive: true },
    { stage: 'YELLOW', min: greenMax, minInclusive: false, max: yellowMax, maxInclusive: true },
    { stage: 'RED', min: yellowMax, minInclusive: false, max: Infinity, maxInclusive: false },
  ]
}

/**
 * Check that bands run GREEN → YELLOW → RED from zero upward and meet exactly:
 * each band starts where the one before it ends, and every boundary value
 * belongs to exactly one band.
 */
export function validateBands(bands, label = 'Zones') {
  const errors = []
  if (!Array.isArray(bands) || bands.length !== ZONE_STAGES.length) {
    return [`${label}: needs exactly GREEN, YELLOW and RED.`]
  }
  bands.forEach((b, i) => {
    if (b.stage !== ZONE_STAGES[i]) errors.push(`${label}: zones must run GREEN, YELLOW, RED in that order.`)
    if (!(b.max > b.min) && b.max !== Infinity) errors.push(`${label}: the ${b.stage} zone is empty or reversed.`)
  })
  if (bands[0].min !== 0 || !bands[0].minInclusive) errors.push(`${label}: GREEN must start at zero.`)
  if (bands[bands.length - 1].max !== Infinity) errors.push(`${label}: RED must have no upper limit.`)
  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1]
    const cur = bands[i]
    if (cur.min > prev.max) errors.push(`${label}: there is a gap between ${prev.stage} and ${cur.stage} (${prev.max} to ${cur.min}).`)
    else if (cur.min < prev.max) errors.push(`${label}: ${prev.stage} and ${cur.stage} overlap (${cur.min} to ${prev.max}).`)
    else if (prev.maxInclusive === cur.minInclusive) {
      errors.push(`${label}: the value ${cur.min} must belong to exactly one of ${prev.stage} or ${cur.stage}.`)
    }
  }
  return [...new Set(errors)]
}

export function validateZones(zones) {
  const errors = []
  if (!zones || typeof zones !== 'object') return ['Zone cutoffs are missing.']
  for (const key of Object.keys(zones)) {
    if (!ZONE_SET_IDS.includes(key)) errors.push(`"${key}" is not a zone set. Zones apply system-wide to ${ZONE_SET_IDS.map((k) => ZONE_SETS[k].label.toLowerCase()).join(', ')}.`)
  }
  for (const set of ZONE_SET_IDS) {
    const label = ZONE_SETS[set].label
    const z = zones[set]
    if (!z) { errors.push(`${label}: cutoffs are missing.`); continue }
    const g = typeof z.greenMax === 'string' && z.greenMax.trim() !== '' ? Number(z.greenMax) : z.greenMax
    const y = typeof z.yellowMax === 'string' && z.yellowMax.trim() !== '' ? Number(z.yellowMax) : z.yellowMax
    if (typeof g !== 'number' || !Number.isFinite(g) || typeof y !== 'number' || !Number.isFinite(y)) {
      errors.push(`${label}: enter a number for both the GREEN and YELLOW cutoffs.`)
      continue
    }
    if (g <= 0) errors.push(`${label}: the GREEN cutoff must be above zero.`)
    if (y <= g) errors.push(`${label}: the YELLOW cutoff (${y}) must be higher than the GREEN cutoff (${g}), or the zones would overlap.`)
    if (g > 0 && y > g) errors.push(...validateBands(zoneBands({ greenMax: g, yellowMax: y }), label))
  }
  return errors
}

export function validateResponses(responses) {
  const errors = []
  if (!responses || typeof responses !== 'object') return ['Zone responses are missing.']
  for (const key of Object.keys(responses)) {
    if (!ZONE_STAGES.includes(key)) errors.push(`"${key}" is not a zone. Responses are set for GREEN, YELLOW and RED.`)
  }
  for (const stage of ZONE_STAGES) {
    const r = responses[stage]
    if (typeof r !== 'string' || !r.trim()) errors.push(`${stage}: describe the action this zone triggers.`)
    else if (r.length > MAX_RESPONSE_LENGTH) errors.push(`${stage}: keep the response under ${MAX_RESPONSE_LENGTH} characters.`)
  }
  return errors
}

export function normalizeReviewers(reviewers) {
  const list = Array.isArray(reviewers) ? reviewers : String(reviewers || '').split(/[\n,;]+/)
  return list.map((r) => String(r).trim()).filter(Boolean)
}

/** Who may change the calibration, and with what justification. */
export function validateChangeControl({ role, reason, reviewers }) {
  const errors = []
  if (!can(role, 'calibrate')) errors.push(`Only an Administrator can change the ${INSTRUMENT_NAME} calibration.`)
  if (String(reason || '').trim().length < MIN_REASON_LENGTH) {
    errors.push(`Write a reason for the change (at least ${MIN_REASON_LENGTH} characters).`)
  }
  if (normalizeReviewers(reviewers).length === 0) {
    errors.push('Name the frontline nurses (names or roles) who reviewed this change.')
  }
  return errors
}

/** Reject anything outside the editable fields: the core is locked. */
export function validateEditableFields(draft) {
  const errors = []
  for (const key of Object.keys(draft || {})) {
    if (!CALIBRATION_FIELDS.includes(key)) {
      errors.push(
        `The ${INSTRUMENT_NAME} core is locked: "${key}" can't be edited. The domains and score-level ` +
        'descriptions are fixed; only point values, zone cutoffs and zone responses can change.'
      )
    }
  }
  return errors
}

/* ------------------------------------------------------------------- diffs */

function toNumber(v) {
  return typeof v === 'string' && v.trim() !== '' ? Number(v) : v
}

function cleanValues(draft, base) {
  const points = {}
  for (const id of LOCKED_ITEM_IDS) points[id] = round2(toNumber(draft.points?.[id] ?? base.points[id]))
  const zones = {}
  for (const set of ZONE_SET_IDS) {
    const z = draft.zones?.[set] || base.zones[set]
    zones[set] = { greenMax: toNumber(z.greenMax), yellowMax: toNumber(z.yellowMax) }
  }
  const responses = {}
  for (const s of ZONE_STAGES) responses[s] = String(draft.responses?.[s] ?? base.responses[s]).trim()
  return { points, zones, responses }
}

/** Field-by-field list of what differs between two calibrations. */
export function diffCalibrations(a, b) {
  const changes = []
  for (const id of LOCKED_ITEM_IDS) {
    if (a.points[id] !== b.points[id]) changes.push({ field: `points.${id}`, label: itemLabel(id), from: a.points[id], to: b.points[id] })
  }
  for (const set of ZONE_SET_IDS) {
    for (const k of ['greenMax', 'yellowMax']) {
      if (a.zones[set][k] !== b.zones[set][k]) {
        changes.push({ field: `zones.${set}.${k}`, label: `${ZONE_SETS[set].label} ${k === 'greenMax' ? 'GREEN' : 'YELLOW'} cutoff`, from: a.zones[set][k], to: b.zones[set][k] })
      }
    }
  }
  for (const s of ZONE_STAGES) {
    if (a.responses[s] !== b.responses[s]) changes.push({ field: `responses.${s}`, label: `${s} response`, from: a.responses[s], to: b.responses[s] })
  }
  return changes
}

const valuesOf = (cal) => ({ points: clone(cal.points), zones: clone(cal.zones), responses: clone(cal.responses) })

function commit(state, values, kind, { actor, role, reason, reviewers, at = Date.now() }) {
  const current = activeCalibration(state)
  const changes = diffCalibrations(current, values)
  if (changes.length === 0) {
    return { ok: false, errors: [kind === 'reset' ? 'The calibration is already at the shipped defaults.' : 'Nothing has changed from the active calibration.'] }
  }
  const nextVersion = Math.max(...state.versions.map((v) => v.version)) + 1
  const names = normalizeReviewers(reviewers)
  const record = makeVersion(nextVersion, values, { kind, reason: String(reason).trim(), reviewers: names, actor, role, at })
  return {
    ok: true,
    errors: [],
    version: record,
    state: { versions: [...state.versions, record] },
    audit: {
      action: kind === 'reset' ? 'calibration.reset' : 'calibration.update',
      target: `v${nextVersion}`,
      detail: {
        version: nextVersion,
        previousVersion: current.version,
        reason: record.reason,
        reviewers: names,
        changes,
        old: valuesOf(current),
        new: valuesOf(record),
      },
    },
  }
}

/**
 * Validate and record a calibration change. Returns { ok, errors } and, when
 * ok, the new version, the next state to store, and the audit entry to write.
 * Nothing is stored here; the caller persists `state` and writes `audit`.
 */
export function proposeCalibration(state, draft, meta) {
  const errors = validateEditableFields(draft)
  // Keys that aren't part of the instrument (a new item, a unit-specific zone
  // set, an extra zone) are rejected rather than silently dropped.
  const unknown = (obj, allowed, msg) => Object.keys(obj || {}).filter((k) => !allowed.includes(k)).forEach((k) => errors.push(msg(k)))
  unknown(draft?.points, LOCKED_ITEM_IDS, (k) => `"${k}" is not an ${INSTRUMENT_NAME} item. Items can't be added, removed or renamed; only point values can change.`)
  unknown(draft?.zones, ZONE_SET_IDS, (k) => `"${k}" is not a zone set. Zones apply system-wide; a single unit can't have its own.`)
  unknown(draft?.responses, ZONE_STAGES, (k) => `"${k}" is not a zone. Responses are set for GREEN, YELLOW and RED.`)
  if (errors.length) return { ok: false, errors: [...validateChangeControl(meta), ...errors] }
  // Report every problem at once: who may change it, why, and the values.
  const values = cleanValues(draft || {}, activeCalibration(state))
  errors.push(
    ...validateChangeControl(meta),
    ...validatePoints(values.points),
    ...validateZones(values.zones),
    ...validateResponses(values.responses),
  )
  if (errors.length) return { ok: false, errors }
  return commit(state, values, 'update', meta)
}

/** Restore the shipped defaults, recorded as a new version. */
export function resetCalibration(state, meta) {
  const errors = validateChangeControl(meta)
  if (errors.length) return { ok: false, errors }
  return commit(state, shippedValues(), 'reset', meta)
}

/* ------------------------------------------------------- applying it */

/** Scoring criteria with the calibration's point values on the locked core. */
export function calibratedCriteria(cal) {
  return ADULT_ACUITY_CRITERIA.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, points: cal?.points?.[i.id] ?? i.points })),
  }))
}

/** Thresholds in the shape the rest of the app reads ({ inpatient, ed, pedsEd }). */
export function calibratedThresholds(cal) {
  const zones = cal?.zones || SHIPPED_ZONES
  return Object.fromEntries(ZONE_SET_IDS.map((set) => [set, { ...zones[set], unit: ZONE_SETS[set].unit }]))
}

export function zoneResponse(cal, stage) {
  return cal?.responses?.[stage] || SHIPPED_RESPONSES[stage] || ''
}

/**
 * One calibration per health system: strip any per-unit threshold override a
 * location still carries from earlier builds. A Pediatric ED that used the
 * recommended 53/71 override moves to the system-wide Pediatric ED zone set.
 */
export function orgScopedLocation(loc) {
  if (!loc) return loc
  const { thresholds, ...rest } = loc
  if (rest.type === 'ed' && rest.zoneSet == null && zoneSetFor(loc) === 'pedsEd') rest.zoneSet = 'pedsEd'
  return { ...rest, thresholds: null }
}

/** Stamp a new shift score with the calibration it is calculated under. */
export function stampEntry(entry, location, cal) {
  const loc = orgScopedLocation(location)
  const set = zoneSetFor(loc)
  const th = calibratedThresholds(cal)[set]
  return {
    ...entry,
    instrumentVersion: INSTRUMENT_VERSION,
    calibrationVersion: cal.version,
    zoneSet: set,
    zones: { greenMax: th.greenMax, yellowMax: th.yellowMax },
  }
}

/**
 * Shift scores saved before calibration existed carry no stamp. They were
 * calculated under v1 (and any per-unit override the unit had then), so they
 * are read that way, whatever the active calibration is now.
 */
export function withLegacyStamps(entries, locations, baselineCal) {
  if (!Array.isArray(entries)) return entries
  const byId = new Map((locations || []).map((l) => [l.id, l]))
  const base = calibratedThresholds(baselineCal)
  let changed = false
  const out = entries.map((e) => {
    if (e.zones && e.zones.greenMax != null && e.zones.yellowMax != null) return e
    const loc = byId.get(e.locId)
    if (!loc) return e
    const th = thresholdsFor(loc, base)
    changed = true
    return {
      ...e,
      calibrationVersion: e.calibrationVersion ?? baselineCal.version,
      instrumentVersion: e.instrumentVersion ?? 1,
      zoneSet: zoneSetFor(loc),
      zones: { greenMax: th.greenMax, yellowMax: th.yellowMax },
      calibrationInferred: true,
    }
  })
  return changed ? out : entries
}

/**
 * What a locations edit changed, for the audit log. A unit's type and zone set
 * decide which cutoffs it is scored against, so every change to either is
 * recorded unit by unit, with the value before and after.
 */
export function locationChanges(prev, next) {
  const before = new Map((prev || []).map((l) => [l.id, l]))
  const after = new Map((next || []).map((l) => [l.id, l]))
  const out = { count: (next || []).length, added: [], removed: [], changed: [] }
  for (const [id, l] of after) {
    const b = before.get(id)
    if (!b) { out.added.push({ id, name: l.name || '', type: l.type, zoneSet: zoneSetFor(l) }); continue }
    const c = {}
    if (b.type !== l.type) c.type = { from: b.type, to: l.type }
    if (zoneSetFor(b) !== zoneSetFor(l)) c.zoneSet = { from: zoneSetFor(b), to: zoneSetFor(l) }
    if ((b.name || '') !== (l.name || '')) c.name = { from: b.name || '', to: l.name || '' }
    if (Object.keys(c).length) out.changed.push({ id, name: l.name || '', ...c })
  }
  for (const [id, b] of before) if (!after.has(id)) out.removed.push({ id, name: b.name || '' })
  return out
}
