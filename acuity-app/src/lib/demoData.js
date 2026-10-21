// Acuitas™ Demo Scenario
//
// A self-contained synthetic region used to demonstrate the predictive features
// on a system that has history behind it.
//
// Nothing in here is ever written to Firestore. The scenario lives in React
// state for as long as the toggle is on and disappears when it is switched off,
// so turning on the demo cannot touch, seed, or contaminate live unit data.
// Every record is stamped `demo: true` as a second line of defense.
//
// The units below are deliberately varied — one drifting toward RED, one
// genuinely stable, one too noisy to forecast, one with barely any history —
// because the point is to show what the engine says when it knows something
// *and* what it says when it doesn't.

import { dayIndex, dateFromDayIndex, slotIndex, slotToDateShift, forecastLocation, SHIFTS } from './forecast.js'
import { today, uid } from './storage.js'
import { DEFAULT_THRESHOLDS, entryStage } from './model.js'
import { recommendDeployment } from './optimize.js'
import { snapshotPlan, placementSnapshot } from './outcomes.js'
import { scoreAssessment } from './mbc.js'

// Mulberry32 — small, fast, and deterministic, so the same scenario renders
// identically for everyone looking at it.
function rng(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard normal via Box-Muller, for noise that looks like measurement noise
// rather than a uniform smear.
function gauss(next) {
  const u = Math.max(1e-9, next())
  const v = next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Inpatient units are specified in the units people actually reason about —
// acuity per staff, the number on the Status Board — rather than in raw points.
// The generator converts to points using each unit's census and staffing, so
// "drifts from 1.15 to 2.70" means exactly that against the 1.5 / 2.5 bands.
const DEMO_UNITS = [
  {
    id: 'demo_1sa',
    name: '1 South A',
    type: 'inpatient',
    censusCap: 17,
    staff: 5,
    // Climbing steadily — the case the tool is built to catch before it breaks.
    pattern: { uaiStart: 1.15, uaiEnd: 2.7, mondayAm: 0.3, weekendDip: -0.1, noise: 0.13, census: 15 },
  },
  {
    id: 'demo_2n',
    name: '2 North',
    type: 'inpatient',
    censusCap: 14,
    staff: 5,
    // Comfortably stable: the donor unit a good plan should draw from.
    pattern: { uaiStart: 1.05, uaiEnd: 1.1, mondayAm: 0.08, weekendDip: -0.05, noise: 0.08, census: 12 },
  },
  {
    id: 'demo_3w',
    name: '3 West',
    type: 'inpatient',
    censusCap: 19,
    staff: 6,
    // Strong weekly rhythm — Monday AM lands hard after weekend admissions.
    pattern: { uaiStart: 1.25, uaiEnd: 1.35, mondayAm: 0.85, weekendDip: -0.25, noise: 0.12, census: 17 },
  },
  {
    id: 'demo_4e',
    name: '4 East',
    type: 'inpatient',
    censusCap: 12,
    staff: 4,
    // Genuinely erratic. The engine should decline to claim confidence here.
    pattern: { uaiStart: 1.6, uaiEnd: 1.6, mondayAm: 0.05, weekendDip: 0, noise: 0.55, census: 11 },
  },
  {
    id: 'demo_5ped',
    name: '5 Pediatrics',
    type: 'inpatient',
    censusCap: 12,
    staff: 4,
    // Census pressure rather than acuity pressure: filling toward its cap.
    pattern: { uaiStart: 1.0, uaiEnd: 1.15, mondayAm: 0.15, weekendDip: -0.08, noise: 0.1, census: 8, censusDrift: 0.04 },
  },
  {
    id: 'demo_new',
    name: '6 North (new unit)',
    type: 'inpatient',
    censusCap: 16,
    staff: 4,
    // Opened four shifts ago. Too new to forecast, and the app should say so.
    pattern: { uaiStart: 1.2, uaiEnd: 1.2, mondayAm: 0.1, weekendDip: 0, noise: 0.12, census: 9 },
    shifts: 4,
  },
  {
    id: 'demo_ed',
    name: 'Emergency Department',
    type: 'ed',
    censusCap: null,
    staff: null,
    // ED behavioral health points: Monday and Friday evenings run hot.
    pattern: { edBase: 17, drift: 0.03, mondayAm: 1.2, fridayPm: 5.5, weekendDip: -1.5, noise: 2.4 },
  },
]

/**
 * Build a full synthetic region ending at today's date, so forecasts project
 * forward from now.
 *
 * Returns { locations, entries, caps, meta } shaped exactly like live app state.
 */
export function buildDemoScenario({ weeks = 9, seed = 20260913 } = {}) {
  const next = rng(seed)
  // A separate stream for the ED capacity fields, so adding them never shifts
  // the random sequence that produces every other value in the scenario.
  const nextCap = rng(seed ^ 0x5bd1e995)
  const totalShifts = weeks * 7 * SHIFTS.length
  const endDay = dayIndex(today())
  // The newest reading is today's PM shift, so forecasts start from now.
  const endSlot = endDay * SHIFTS.length + 1

  const locations = DEMO_UNITS.map((u) => ({
    id: u.id,
    name: u.name,
    facility: '',
    market: '',
    region: 'Demonstration Region',
    type: u.type,
    censusCap: u.censusCap,
    thresholds: null,
    demo: true,
  }))

  const caps = {}
  for (const u of DEMO_UNITS) {
    if (u.censusCap != null) caps[u.id] = u.censusCap
  }

  const entries = []

  for (const unit of DEMO_UNITS) {
    const p = unit.pattern
    const count = unit.shifts ?? totalShifts
    // Walk backwards from today so the newest reading is the current shift.
    const firstIndex = totalShifts - count

    for (let i = 0; i < count; i++) {
      // Consecutive slots ending at today's PM shift, derived through the same
      // tested slot helpers the forecast engine uses.
      const slot = endSlot - (count - 1 - i)
      const { date, shift } = slotToDateShift(slot)
      const day = Math.floor(slot / SHIFTS.length)
      const weekday = (day + 4) % 7
      const isWeekend = weekday === 0 || weekday === 6
      const age = firstIndex + i

      if (unit.type === 'ed') {
        let points = p.edBase + age * p.drift
        if (weekday === 1 && shift === 'AM') points += p.mondayAm
        if (weekday === 5 && shift === 'PM') points += p.fridayPm
        if (isWeekend) points += p.weekendDip
        points += gauss(next) * p.noise
        // Boarding: BH patients held in the ED awaiting an inpatient bed. It
        // climbs slowly over the scenario as the region fills, and spikes on
        // the same Monday-morning and Friday-evening rush as ED acuity.
        let boarders = 1.6 + age * 0.02
        if (weekday === 1 && shift === 'AM') boarders += 1.4
        if (weekday === 5 && shift === 'PM') boarders += 2.9
        if (isWeekend) boarders -= 0.6
        boarders = Math.max(0, Math.round(boarders + gauss(nextCap) * 0.8))
        const bhArrivals = Math.max(0, Math.round(Math.max(0, points) / 2.6 + gauss(nextCap) * 1.1))
        const boardingHours = boarders === 0 ? 0 : Math.max(1, Math.round(boarders * (6.5 + gauss(nextCap) * 1.6)))
        entries.push({
          id: `demo_${unit.id}_${age}`,
          locId: unit.id,
          date,
          shift,
          census: null,
          points: Math.max(0, Math.round(points)),
          staff: null,
          bhArrivals,
          boarders,
          boardingHours,
          capInPlace: false,
          notes: '',
          pilot: false,
          demo: true,
          createdAt: day * 86400000 + (shift === 'AM' ? 0 : 43200000),
        })
        continue
      }

      const censusDrift = p.censusDrift ? age * p.censusDrift : 0
      const census = Math.max(
        1,
        Math.round(p.census + censusDrift + gauss(next) * 1.1 + (isWeekend ? -0.8 : 0.4))
      )

      // Target acuity-per-staff for this shift, then convert to a point total.
      const progress = totalShifts > 1 ? age / (totalShifts - 1) : 1
      let uai = p.uaiStart + (p.uaiEnd - p.uaiStart) * progress
      if (weekday === 1 && shift === 'AM') uai += p.mondayAm
      if (isWeekend) uai += p.weekendDip
      uai += gauss(next) * p.noise

      // Staffing wobbles by one now and then, which is exactly the kind of
      // variation that moves a unit across a threshold.
      const staff = Math.max(2, unit.staff + (next() < 0.18 ? -1 : 0))
      // Points scale with the nominal staffing the target was set against, so a
      // short-staffed shift shows up as higher acuity per staff — as it should —
      // and with census, so a fuller unit carries proportionally more load.
      const censusFactor = p.census > 0 ? census / p.census : 1
      const points = Math.max(0, Math.round(Math.max(0.1, uai) * unit.staff * censusFactor * 10) / 10)

      entries.push({
        id: `demo_${unit.id}_${age}`,
        locId: unit.id,
        date,
        shift,
        census,
        points,
        staff,
        capInPlace: unit.censusCap != null && census > unit.censusCap,
        notes: '',
        pilot: false,
        demo: true,
        createdAt: day * 86400000 + (shift === 'AM' ? 0 : 43200000),
      })
    }
  }

  return {
    locations,
    entries,
    caps,
    meta: {
      weeks,
      units: locations.length,
      observations: entries.length,
      generatedFor: today(),
    },
  }
}

// A few plausible staff deployments, so the Deployments tab and the deployment
// reports are populated when the sample region is loaded rather than empty.
// Dated across the last few days and aimed at the units the scenario runs hot.
function sampleDeployments() {
  const end = dayIndex(today())
  const day = (back) => new Date((end - back) * 86400000).toISOString().slice(0, 10)
  const rows = [
    { staffName: 'J. Alvarez, RN', role: 'RN', fromLocId: null, toLocId: 'demo_1sa', shift: 'PM', hours: 8, reason: 'Acuity surge', back: 0 },
    { staffName: 'M. Okafor, BHT', role: 'BHT', fromLocId: 'demo_2n', toLocId: 'demo_1sa', shift: 'AM', hours: 8, reason: 'Projected breach — moved ahead of surge', back: 1 },
    { staffName: 'D. Chen, RN', role: 'RN', fromLocId: null, toLocId: 'demo_4e', shift: 'PM', hours: 4, reason: 'Census cap support', back: 2 },
  ]
  return rows.map((r, i) => ({
    id: `demo_dep_${i}`,
    date: day(r.back),
    shift: r.shift,
    staffName: r.staffName,
    role: r.role,
    fromLocId: r.fromLocId,
    toLocId: r.toLocId,
    hours: r.hours,
    reason: r.reason,
    notes: '',
    demo: true,
    createdAt: Date.now() - r.back * 86400000,
  }))
}

/**
 * The full sample region, shaped exactly like live app state, for seeding the
 * whole app (Status Board, Reports, Deployments, caps) in local mode so a new
 * user has something to explore instead of empty screens.
 *
 * Everything is stamped `demo: true` and can be wiped with "Clear All Data".
 */
export function buildSampleData(opts = {}) {
  const scenario = buildDemoScenario(opts)
  const history = sampleOutcomeHistory(scenario)
  return {
    locations: scenario.locations,
    entries: history.entries,
    deployments: [...sampleDeployments(), ...history.deployments],
    caps: scenario.caps,
    thresholds: null, // caller applies its own defaults
    planLog: history.planLog,
    safetyEvents: sampleSafetyEvents(history.entries, scenario.locations),
    meta: scenario.meta,
  }
}

/* ---------------------------------------------------- outcome-loop history ---
 * A record of past deployment plans, as if a house supervisor had recorded
 * the Command Center's recommendation over the last few weeks and followed
 * about two-thirds of the moves. Each plan is produced by the real optimizer,
 * fed only the shifts before it. A followed move changes the target shift's
 * logged staffing, because following the plan really did add staff there.
 * Unfollowed moves leave the logged shift untouched. The outcome loop can
 * then measure what following the plan was worth, the way it would with real
 * data.
 */
export function sampleOutcomeHistory(scenario, { plans = 18, followRate = 0.68, seed = 424242 } = {}) {
  const next = rng(seed)
  const entries = scenario.entries.map((e) => ({ ...e }))
  const slotOf = (e) => slotIndex(e.date, e.shift)
  const lastSlot = entries.reduce((m, e) => Math.max(m, slotOf(e)), -Infinity)
  const planLog = []
  const deployments = []
  let staffNo = 1

  for (let k = 0; k < plans; k++) {
    // Cut-offs every other shift, ending two shifts before now so the present
    // board is left exactly as the live scenario draws it.
    const cutoff = lastSlot - 3 - 2 * (plans - 1 - k)
    const target = cutoff + 1
    const hist = entries.filter((e) => slotOf(e) <= cutoff)
    const forecasts = {}
    for (const loc of scenario.locations) {
      forecasts[loc.id] = forecastLocation(hist, loc, DEFAULT_THRESHOLDS, { horizon: 1 })
    }
    const plan = recommendDeployment({
      locations: scenario.locations, entries: hist, thresholds: DEFAULT_THRESHOLDS,
      forecasts, floatStaff: 2, mode: 'forecast',
    })
    const { date, shift } = slotToDateShift(target)
    const snap = snapshotPlan({
      plan, target: { date, shift }, mode: 'forecast', floatStaff: 2,
      recordedBy: 'House supervisor (demo)', now: (dayIndex(date) * 86400000) - 3600000,
    })
    if (!snap) continue
    snap.demo = true
    planLog.push(snap)

    snap.moves.forEach((m, mi) => {
      if (next() >= followRate) return
      for (let i = 0; i < m.staff; i++) {
        deployments.push({
          id: `demo_dep_plan_${k}_${mi}_${i}`,
          date, shift,
          staffName: `Float RN ${String(staffNo++).padStart(2, '0')}`,
          role: 'RN',
          fromLocId: m.fromLocId,
          toLocId: m.toLocId,
          hours: 12,
          reason: 'Acuitas recommended plan',
          source: m.fromLocId ? 'internal' : (next() < 0.25 ? 'overtime' : 'float'),
          notes: '',
          demo: true,
          createdAt: dayIndex(date) * 86400000,
        })
      }
      const recv = entries.find((e) => e.locId === m.toLocId && slotOf(e) === target)
      if (recv && recv.staff) recv.staff += m.staff
      if (m.fromLocId) {
        const donor = entries.find((e) => e.locId === m.fromLocId && slotOf(e) === target)
        if (donor && donor.staff) donor.staff = Math.max(2, donor.staff - m.staff)
      }
    })
  }
  return { entries, deployments, planLog }
}

/* --------------------------------------------------------- safety events ---
 * Synthetic safety events whose frequency rises with the acuity of the shift
 * they land on: rare on GREEN shifts, more common on YELLOW, most common on
 * RED. That is the relationship the safety module is built to measure from
 * real logs. Unit, date, shift and type only; no names.
 */
const EVENT_MIX = [
  ['restraint', 0.22], ['assault-staff', 0.16], ['behavioral-code', 0.16], ['seclusion', 0.12],
  ['assault-patient', 0.12], ['staff-injury', 0.08], ['self-harm', 0.08], ['elopement', 0.06],
]
const EVENT_RATE = { GREEN: 0.035, YELLOW: 0.085, RED: 0.2, NONE: 0 }

export function sampleSafetyEvents(entries, locations, { seed = 77017 } = {}) {
  const next = rng(seed)
  const locById = new Map((locations || []).map((l) => [l.id, l]))
  const pick = () => {
    let r = next()
    for (const [type, w] of EVENT_MIX) {
      if ((r -= w) <= 0) return type
    }
    return EVENT_MIX[0][0]
  }
  const out = []
  for (const e of entries || []) {
    const loc = locById.get(e.locId)
    if (!loc || loc.type === 'ed') continue
    const stage = entryStage(e, loc, DEFAULT_THRESHOLDS)
    let n = 0
    // Up to two events in one shift, each with the stage's probability.
    for (let i = 0; i < 2; i++) if (next() < EVENT_RATE[stage] * (i === 0 ? 1 : 0.35)) n++
    for (let i = 0; i < n; i++) {
      out.push({
        id: `demo_evt_${e.id}_${i}`, locId: e.locId, date: e.date, shift: e.shift,
        type: pick(), severity: next() < 0.2 ? 2 : 1, notes: '', demo: true, createdAt: e.createdAt,
      })
    }
  }
  return out
}

/* ------------------------------------------------------- outpatient sample ---
 * A small outpatient caseload and provider panel for exploring the Level of
 * Care module. Screened patients carry the six dimension scores so the screener
 * reproduces their recommended level exactly; the mix is deliberate — some
 * clearly outpatient, some needing a step-up, one telehealth-only, and a
 * specialty (trauma) with tight capacity so the assignment surfaces a gap.
 */

export const SAMPLE_PROGRAMS = [
  'Therapy only', 'Medication management', 'Neuromodulation',
  'Substance use program', 'Eating disorders program',
]

// Providers carry a training level (academic model) and the clinics/programs
// they staff. Dr. Okoro is a resident, so acute patients must route around
// them to an attending — the teaching-model behavior.
export function sampleProviders() {
  return [
    { id: 'prov_rivera', name: 'Dr. Rivera', credential: 'prescriber', population: 'adult', trainingLevel: 'attending', specialties: ['general', 'sud'], programs: ['Medication management', 'Substance use program', 'Neuromodulation'], telehealth: true, capacity: 3, panelLoad: 4, demo: true },
    { id: 'prov_okoro', name: 'Dr. Okoro', credential: 'prescriber', population: 'adult', trainingLevel: 'resident', specialties: ['general'], programs: ['Medication management'], telehealth: true, capacity: 2, panelLoad: 1, demo: true },
    { id: 'prov_shah', name: 'A. Shah, LCSW', credential: 'therapist', population: 'adult', trainingLevel: 'staff', specialties: ['trauma', 'general'], programs: ['Therapy only'], telehealth: true, capacity: 2, panelLoad: 3, demo: true },
    { id: 'prov_bynum', name: 'Dr. Bynum', credential: 'both', population: 'both', trainingLevel: 'attending', specialties: ['general'], programs: ['Medication management', 'Therapy only'], telehealth: false, capacity: 2, panelLoad: 2, demo: true },
    { id: 'prov_ellis', name: 'J. Ellis, LPC', credential: 'therapist', population: 'adolescent', trainingLevel: 'staff', specialties: ['adolescent', 'general'], programs: ['Therapy only'], telehealth: true, capacity: 3, panelLoad: 1, demo: true },
  ]
}

// De-identified case labels — no names or MRNs. Dimension scores are chosen to
// land on the intended level; the mix is deliberate: some clearly outpatient,
// some needing a step-up, one telehealth-only, and one acute-but-outpatient
// case (Case E) that must route to an attending rather than the resident.
export function samplePatients() {
  const rows = [
    { id: 'pt_a', name: 'Case A', population: 'adult', scores: { risk: 2, function: 2, comorbidity: 2, stress: 2, support: 2, engagement: 2 }, needs: { prescriber: false, therapy: true }, specialties: [], program: 'Therapy only', telehealthOnly: false, urgencyDays: 6 },
    { id: 'pt_b', name: 'Case B', population: 'adult', scores: { risk: 2, function: 3, comorbidity: 3, stress: 3, support: 3, engagement: 2 }, needs: { prescriber: true, therapy: false }, specialties: ['sud'], program: 'Substance use program', telehealthOnly: false, urgencyDays: 12 },
    { id: 'pt_c', name: 'Case C', population: 'adult', scores: { risk: 3, function: 3, comorbidity: 2, stress: 3, support: 3, engagement: 3 }, needs: { prescriber: false, therapy: true }, specialties: ['trauma'], program: 'Therapy only', telehealthOnly: false, urgencyDays: 20 },
    { id: 'pt_d', name: 'Case D', population: 'adult', scores: { risk: 2, function: 2, comorbidity: 2, stress: 2, support: 3, engagement: 2 }, needs: { prescriber: true, therapy: false }, specialties: [], program: 'Medication management', telehealthOnly: true, urgencyDays: 3 },
    { id: 'pt_e', name: 'Case E', population: 'adult', scores: { risk: 3, function: 3, comorbidity: 2, stress: 2, support: 2, engagement: 2 }, needs: { prescriber: true, therapy: false }, specialties: [], program: 'Medication management', telehealthOnly: false, urgencyDays: 9 },
    { id: 'pt_f', name: 'Case F', population: 'adult', scores: { risk: 4, function: 3, comorbidity: 3, stress: 3, support: 3, engagement: 3 }, needs: { prescriber: true, therapy: true }, specialties: [], program: 'Medication management', telehealthOnly: false, urgencyDays: 1 },
    { id: 'pt_g', name: 'Case G', population: 'adolescent', scores: { risk: 2, function: 2, comorbidity: 2, stress: 3, support: 2, engagement: 2 }, needs: { prescriber: false, therapy: true }, specialties: ['adolescent'], program: 'Therapy only', telehealthOnly: false, urgencyDays: 8 },
  ]
  // Presenting symptoms consistent with each case's recommended program.
  const symptomsById = {
    pt_a: ['depression', 'anxiety'], pt_b: ['substance'], pt_c: ['trauma'],
    pt_d: ['depression'], pt_e: ['depression'], pt_f: ['psychosis'], pt_g: ['anxiety'],
  }
  return rows.map((r) => ({ ...r, symptoms: symptomsById[r.id] || [], demo: true, createdAt: Date.now() }))
}

const daysAgo = (n) => dateFromDayIndex(dayIndex(today()) - n)

/* ------------------------------------------------------------- discharges ---
 * Recent inpatient discharges at every stage of the follow-up windows: seen
 * inside 7 days, seen at 8–30 days, missed, excluded, and still open (some
 * booked in time, some booked too late, some not booked). Three are already
 * bridged into AcuiPath, so they appear on the outpatient caseload.
 */
export function sampleDischarges() {
  const rows = [
    ['D01', 'demo_1sa', 45, { done: 4 }], ['D02', 'demo_3w', 42, { done: 6 }],
    ['D03', 'demo_2n', 40, { done: 12 }], ['D04', 'demo_4e', 38, {}],
    ['D05', 'demo_1sa', 36, { done: 3 }], ['D06', 'demo_3w', 34, { excluded: 'Readmitted within the window' }],
    ['D07', 'demo_2n', 31, { done: 7 }], ['D08', 'demo_4e', 28, { done: 9 }],
    ['D09', 'demo_1sa', 25, { done: 5 }], ['D10', 'demo_3w', 20, {}],
    ['D11', 'demo_5ped', 14, { done: 2, population: 'adolescent' }], ['D12', 'demo_2n', 10, { sched: 12 }],
    ['D13', 'demo_1sa', 5, { bridged: true }], ['D14', 'demo_4e', 4, { sched: 6 }],
    ['D15', 'demo_3w', 2, { sched: 11, bridged: true, complex: true }], ['D16', 'demo_1sa', 1, { bridged: true }],
  ]
  return rows.map(([code, unitId, ago, o]) => {
    const dischargeDate = daysAgo(ago)
    const at = (d) => dateFromDayIndex(dayIndex(dischargeDate) + d)
    return {
      id: `demo_dc_${code}`,
      caseLabel: `Discharge ${code}`,
      unitId,
      population: o.population || 'adult',
      dischargeDate,
      followUpScheduled: o.sched != null ? at(o.sched) : (o.done != null ? at(o.done) : null),
      followUpCompleted: o.done != null ? at(o.done) : null,
      excluded: !!o.excluded,
      excludeReason: o.excluded || '',
      complex: !!o.complex,
      bridged: !!o.bridged,
      program: 'Medication management',
      needs: { prescriber: true, therapy: true },
      demo: true,
      createdAt: dayIndex(dischargeDate) * 86400000,
    }
  })
}

/* -------------------------------------------------- PHQ-9 / GAD-7 scores ---
 * Score histories for the sample caseload covering each pattern the module
 * reads: improving to response or remission, meaningful worsening, a positive
 * self-harm item, severe, and overdue for a repeat.
 */
function itemsFor(instrument, total, { item9 = 0 } = {}) {
  const n = instrument === 'PHQ-9' ? 9 : 7
  const items = Array(n).fill(0)
  let left = total
  if (instrument === 'PHQ-9') { items[8] = item9; left -= item9 }
  const slots = instrument === 'PHQ-9' ? 8 : 7
  for (let round = 0; round < 3 && left > 0; round++) {
    for (let i = 0; i < slots && left > 0; i++) {
      if (items[i] < 3) { items[i] += 1; left -= 1 }
    }
  }
  return items
}

export function sampleAssessments() {
  const plan = {
    pt_a: { 'PHQ-9': [[44, 14], [22, 9], [5, 6]], 'GAD-7': [[44, 12], [5, 7]] },
    pt_b: { 'PHQ-9': [[60, 11], [36, 10]] },
    pt_c: { 'PHQ-9': [[30, 12], [3, 17, 1]], 'GAD-7': [[30, 13], [3, 15]] },
    pt_d: { 'PHQ-9': [[40, 16], [12, 7]] },
    pt_e: { 'PHQ-9': [[28, 10], [6, 9]], 'GAD-7': [[28, 8], [6, 14]] },
    pt_f: { 'PHQ-9': [[2, 22]] },
    pt_g: { 'GAD-7': [[50, 9], [10, 4]] },
  }
  const out = []
  for (const [patientId, byInst] of Object.entries(plan)) {
    for (const [instrument, points] of Object.entries(byInst)) {
      points.forEach(([ago, total, item9 = 0], i) => {
        const items = itemsFor(instrument, total, { item9 })
        out.push({
          id: `demo_mbc_${patientId}_${instrument}_${i}`,
          patientId, instrument, date: daysAgo(ago), items,
          ...scoreAssessment(instrument, items),
          demo: true, createdAt: (dayIndex(today()) - ago) * 86400000,
        })
      })
    }
  }
  return out
}

/* ------------------------------------------------------- placement outcomes ---
 * Outcomes for past AcuiPath placements that have since closed, each carrying
 * a snapshot of how it was placed. The cohort is built to show the review
 * prompts at work: Tier 1 direct placements step up noticeably more often than
 * fully screened cases, and one clinic has a high first-visit no-show rate.
 */
export function sampleOpOutcomes() {
  const cohort = [
    // [count, tier, attending, program, stepUps, noShows]
    [8, '1-direct', false, 'Therapy only', 2, 1],
    [8, '1-direct', false, 'Medication management', 2, 1],
    [6, '2-full', false, 'Substance use program', 0, 3],
    [6, '2-full', false, 'Therapy only', 0, 1],
    [4, '2-full', true, 'Substance use program', 1, 1],
    [6, '2-full', true, 'Medication management', 0, 0],
    [4, 'bridge', false, 'Medication management', 0, 1],
    [2, 'bridge', true, 'Medication management', 0, 0],
  ]
  const out = []
  let n = 1
  for (const [count, tier, attending, program, stepUps, noShows] of cohort) {
    for (let i = 0; i < count; i++) {
      const id = `demo_hist_${String(n++).padStart(2, '0')}`
      const noShow = i < noShows
      out.push({
        id: `demo_out_${id}`,
        patientId: id,
        placement: placementSnapshot({ tier, bridge: tier === 'bridge', requiresAttending: attending, program }),
        firstVisit: noShow ? 'no-show' : 'attended',
        retained30: !noShow && i % 5 !== 4,
        steppedUp: i >= count - stepUps,
        recordedAt: (dayIndex(today()) - 20 - n) * 86400000,
        demo: true,
      })
    }
  }
  // Two live caseload patients already seen.
  out.push({ id: 'demo_out_pt_a', patientId: 'pt_a', firstVisit: 'attended', retained30: true, steppedUp: false, demo: true, recordedAt: Date.now() })
  out.push({ id: 'demo_out_pt_d', patientId: 'pt_d', firstVisit: 'attended', retained30: null, steppedUp: null, demo: true, recordedAt: Date.now() })
  return out
}

export function buildSampleOutpatient() {
  return {
    providers: sampleProviders(),
    patients: samplePatients(),
    programs: SAMPLE_PROGRAMS,
    discharges: sampleDischarges(),
    assessments: sampleAssessments(),
    outcomes: sampleOpOutcomes(),
  }
}
