// Acuitas™ Safety-Event Risk
//
// Workplace violence is a top concern for behavioral health leadership. This
// module links logged safety events (assaults, staff injuries, restraint,
// seclusion, behavioral codes) to the acuity state of the unit-shift where
// they happened. It answers two questions from the organization's own data:
//
//   1. How much more often do events happen on a RED shift than a GREEN one?
//   2. Given each unit's forecast for the next shift, how likely is at least
//      one event there?
//
// The second is the first applied forward: the unit's predicted chance of each
// stage, times the event rate observed in that stage, gives the expected
// number of events. From that, a Poisson model gives the chance of at least
// one. Every number traces back to counts shown on screen.
//
// Events are logged by unit, date, shift and type only. No patient or staff
// names are recorded or needed.

import { buildSeries } from './forecast.js'
import { thresholdsFor, computeStage } from './model.js'

export const SAFETY_EVENT_TYPES = [
  { id: 'assault-staff', label: 'Assault on staff', violence: true },
  { id: 'staff-injury', label: 'Staff injury', violence: true },
  { id: 'assault-patient', label: 'Patient-to-patient assault', violence: true },
  { id: 'restraint', label: 'Restraint', violence: true },
  { id: 'seclusion', label: 'Seclusion', violence: true },
  { id: 'behavioral-code', label: 'Behavioral emergency / code', violence: true },
  { id: 'self-harm', label: 'Self-harm event', violence: false },
  { id: 'elopement', label: 'Elopement / AWOL', violence: false },
]

export const SAFETY_TYPE_LABEL = Object.fromEntries(SAFETY_EVENT_TYPES.map((t) => [t.id, t.label]))
export const VIOLENCE_TYPES = SAFETY_EVENT_TYPES.filter((t) => t.violence).map((t) => t.id)

const STAGES = ['GREEN', 'YELLOW', 'RED']

/**
 * Event rate per unit-shift in each acuity stage, with relative risk against
 * GREEN. Only shifts with a logged acuity reading count, so every event is
 * compared with the reading for that same unit and shift.
 */
export function eventRatesByStage({ events, entries, locations, thresholds, types = null }) {
  const stageAt = new Map()
  const shifts = { GREEN: 0, YELLOW: 0, RED: 0 }
  for (const loc of locations || []) {
    const th = thresholdsFor(loc, thresholds)
    for (const p of buildSeries(entries, loc, thresholds, 'acuity')) {
      const st = computeStage(p.value, th)
      if (!(st in shifts)) continue
      shifts[st] += 1
      stageAt.set(`${loc.id}|${p.date}|${p.shift}`, st)
    }
  }

  const counted = { GREEN: 0, YELLOW: 0, RED: 0 }
  let unmatched = 0
  let total = 0
  for (const e of events || []) {
    if (types && !types.includes(e.type)) continue
    total += 1
    const st = stageAt.get(`${e.locId}|${e.date}|${e.shift}`)
    if (st) counted[st] += 1
    else unmatched += 1
  }

  const totalShifts = shifts.GREEN + shifts.YELLOW + shifts.RED
  const matched = counted.GREEN + counted.YELLOW + counted.RED
  const overallRate = totalShifts ? matched / totalShifts : null
  const greenRate = shifts.GREEN ? counted.GREEN / shifts.GREEN : null
  const byStage = {}
  for (const st of STAGES) {
    const rate = shifts[st] ? counted[st] / shifts[st] : null
    byStage[st] = {
      shifts: shifts[st],
      events: counted[st],
      rate,
      relativeRisk: rate != null && greenRate ? rate / greenRate : null,
    }
  }
  return { byStage, overallRate, totalEvents: total, matchedEvents: matched, unmatched, totalShifts }
}

/**
 * Expected events and the chance of at least one, for one unit's next shift,
 * from its forecast stage probabilities. A stage the unit's region has never
 * logged falls back to the overall rate rather than to zero.
 */
export function nextShiftEventRisk(probs, rates) {
  if (!probs || !rates || rates.overallRate == null) return null
  let lambda = 0
  for (const st of STAGES) {
    const r = rates.byStage[st]?.rate ?? rates.overallRate
    lambda += (probs[st] ?? 0) * r
  }
  return { expectedEvents: lambda, pAtLeastOne: 1 - Math.exp(-lambda) }
}

/** Every unit with a forecast, ranked by chance of at least one event. */
export function unitEventRisks(units, rates) {
  return (units || [])
    .map((u) => {
      const probs = u.assessment?.ok ? u.assessment.next?.probs : null
      const risk = nextShiftEventRisk(probs, rates)
      return risk ? { loc: u.loc, probs, ...risk } : null
    })
    .filter(Boolean)
    .sort((a, b) => b.pAtLeastOne - a.pAtLeastOne)
}

/** Counts by type and by unit over a date window, for the log summary. */
export function eventCounts(events, { from, to } = {}) {
  const inWin = (d) => (!from || d >= from) && (!to || d <= to)
  const byType = {}
  const byUnit = {}
  let n = 0
  for (const e of events || []) {
    if (!inWin(e.date)) continue
    n += 1
    byType[e.type] = (byType[e.type] || 0) + 1
    byUnit[e.locId] = (byUnit[e.locId] || 0) + 1
  }
  return { total: n, byType, byUnit }
}
