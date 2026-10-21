// Acuitas™ Discharge Bridge — follow-up after psychiatric hospitalization
//
// The riskiest stretch in behavioral health is the first few weeks after an
// inpatient discharge. Quality programs measure it as follow-up after
// hospitalization for mental illness: did the patient see a mental health
// provider within 7 days, and within 30 days, of discharge? That is the HEDIS
// FUH measure, which carries both quality and payment weight.
//
// This module turns each discharge into an AcuiPath outpatient case, tracks it
// against those two windows, and builds a worklist of discharges that are
// about to miss them.
//
// SCOPE. This is an operational approximation of FUH, built to drive
// follow-up. It is not a certified HEDIS calculation: it applies no diagnosis,
// age, continuous-enrollment or readmission logic. Cases a user marks as
// excluded (for example readmitted, transferred or deceased) drop out of both
// rates. By default a visit on the day of discharge does not count, matching
// the measure; that is configurable.

import { dayIndex } from './forecast.js'

export const FUH_WINDOWS = { short: 7, long: 30 }

export const EXCLUSION_REASONS = [
  'Readmitted within the window',
  'Transferred to another facility',
  'Discharged to residential / higher level of care',
  'Deceased',
  'Other',
]

export const FUH_STATUS = {
  EXCLUDED: 'excluded',
  MET_7: 'met-7',
  MET_30: 'met-30',
  OPEN_7: 'open-7',
  MISSED_7_OPEN_30: 'missed-7-open-30',
  MISSED: 'missed',
}

export const FUH_STATUS_LABEL = {
  excluded: 'Excluded',
  'met-7': 'Seen within 7 days',
  'met-30': 'Seen in 8–30 days',
  'open-7': 'Due — 7-day window open',
  'missed-7-open-30': '7-day missed — 30-day window open',
  missed: 'Missed both windows',
}

const daysBetween = (from, to) => {
  const a = dayIndex(from)
  const b = dayIndex(to)
  return a == null || b == null ? null : b - a
}

/**
 * Where one discharge stands as of `asOf` (YYYY-MM-DD).
 */
export function fuhStatus(d, asOf, { sameDayCounts = false } = {}) {
  const minDay = sameDayCounts ? 0 : 1
  const since = daysBetween(d.dischargeDate, asOf)
  const visitDay = d.followUpCompleted ? daysBetween(d.dischargeDate, d.followUpCompleted) : null
  const scheduledDay = d.followUpScheduled ? daysBetween(d.dischargeDate, d.followUpScheduled) : null

  const base = {
    daysSince: since,
    visitDay,
    scheduledDay,
    // A visit can be logged that does not count, e.g. on the discharge day
    // itself; the case then stays open rather than looking resolved.
    visitQualifies: visitDay != null && visitDay >= minDay && visitDay <= FUH_WINDOWS.long,
    scheduledInside7: scheduledDay != null && scheduledDay >= minDay && scheduledDay <= FUH_WINDOWS.short,
    daysLeft7: since == null ? null : FUH_WINDOWS.short - since,
    daysLeft30: since == null ? null : FUH_WINDOWS.long - since,
  }

  if (d.excluded) return { ...base, status: FUH_STATUS.EXCLUDED }
  if (base.visitQualifies && visitDay <= FUH_WINDOWS.short) return { ...base, status: FUH_STATUS.MET_7 }
  if (base.visitQualifies) return { ...base, status: FUH_STATUS.MET_30 }
  if (since == null || since <= FUH_WINDOWS.short) return { ...base, status: FUH_STATUS.OPEN_7 }
  if (since <= FUH_WINDOWS.long) return { ...base, status: FUH_STATUS.MISSED_7_OPEN_30 }
  return { ...base, status: FUH_STATUS.MISSED }
}

/**
 * FUH-7 and FUH-30 rates. A discharge enters a rate's denominator only once
 * its window has closed. Counting open windows would understate the rate,
 * because those patients still have time to be seen.
 */
export function fuhRates(discharges, asOf, opts = {}) {
  const rows = (discharges || []).map((d) => ({ d, s: fuhStatus(d, asOf, opts) }))
  const live = rows.filter((r) => r.s.status !== FUH_STATUS.EXCLUDED)

  const closed7 = live.filter((r) => r.s.daysSince != null && r.s.daysSince > FUH_WINDOWS.short)
  const met7 = closed7.filter((r) => r.s.status === FUH_STATUS.MET_7)
  const closed30 = live.filter((r) => r.s.daysSince != null && r.s.daysSince > FUH_WINDOWS.long)
  const met30 = closed30.filter((r) => r.s.status === FUH_STATUS.MET_7 || r.s.status === FUH_STATUS.MET_30)

  const count = (st) => rows.filter((r) => r.s.status === st).length
  return {
    discharges: rows.length,
    excluded: count(FUH_STATUS.EXCLUDED),
    fuh7: { numerator: met7.length, denominator: closed7.length, rate: closed7.length ? met7.length / closed7.length : null },
    fuh30: { numerator: met30.length, denominator: closed30.length, rate: closed30.length ? met30.length / closed30.length : null },
    open7: count(FUH_STATUS.OPEN_7),
    openUnscheduled7: rows.filter((r) => r.s.status === FUH_STATUS.OPEN_7 && !r.s.scheduledInside7).length,
    missed7Open30: count(FUH_STATUS.MISSED_7_OPEN_30),
  }
}

/**
 * The follow-up worklist: discharges that still need a qualifying visit,
 * most urgent first: inside the 7-day window, cases with no visit booked,
 * then cases booked too late to count for 7 days, then cases booked in time
 * (attendance to confirm); after those, missed-7 cases still inside 30 days.
 * Within each group, the nearest deadline comes first.
 */
export function fuhWorklist(discharges, asOf, opts = {}) {
  const rank = (s) => {
    if (s.status !== FUH_STATUS.OPEN_7) return 3
    if (s.scheduledInside7) return 2
    if (s.scheduledDay != null) return 1
    return 0
  }
  return (discharges || [])
    .map((d) => ({ discharge: d, ...fuhStatus(d, asOf, opts) }))
    .filter((r) => r.status === FUH_STATUS.OPEN_7 || r.status === FUH_STATUS.MISSED_7_OPEN_30)
    .map((r) => ({
      ...r,
      priority: rank(r),
      action: r.status === FUH_STATUS.OPEN_7
        ? (r.scheduledInside7
          ? 'Scheduled inside 7 days — confirm attendance'
          : (r.scheduledDay != null
            ? `Scheduled day ${r.scheduledDay} — move inside 7 days`
            : 'Not scheduled — book a visit within 7 days'))
        : 'Missed 7 days — book within 30',
    }))
    .sort((a, b) =>
      a.priority - b.priority ||
      (a.status === FUH_STATUS.OPEN_7 ? a.daysLeft7 - b.daysLeft7 : a.daysLeft30 - b.daysLeft30) ||
      String(a.discharge.id).localeCompare(String(b.discharge.id))
    )
}

/**
 * Turn a discharge into an AcuiPath outpatient case so it is routed to a
 * clinic and a provider like any other referral. The assignment engine places
 * bridge cases ahead of routine referrals, because their follow-up clock is
 * already running.
 */
export function dischargeToOpPatient(d, { id, now = Date.now() } = {}) {
  return {
    id: id || `bridge_${d.id}`,
    name: d.caseLabel,
    population: d.population || 'adult',
    tier: 'bridge',
    bridge: true,
    dischargeId: d.id,
    dischargeDate: d.dischargeDate,
    level: 'op',
    levelLabel: 'Outpatient — post-discharge',
    opAppropriate: true,
    routableOutpatient: true,
    // A complex discharge (marked by the discharging team) needs an attending
    // as primary physician; otherwise a resident may take it under supervision.
    requiresAttending: !!d.complex,
    riskScore: 0,
    needs: d.needs || { prescriber: true, therapy: true },
    specialties: d.specialties || [],
    symptoms: d.symptoms || [],
    program: d.program || '',
    telehealthOnly: !!d.telehealthOnly,
    urgencyDays: 0,
    createdAt: now,
  }
}
