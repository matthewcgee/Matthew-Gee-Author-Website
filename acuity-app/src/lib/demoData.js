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

import { dayIndex, slotToDateShift, SHIFTS } from './forecast.js'
import { today, uid } from './storage.js'

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
    censusCap: 18,
    staff: 5,
    // Climbing steadily — the case the tool is built to catch before it breaks.
    pattern: { uaiStart: 1.15, uaiEnd: 2.7, mondayAm: 0.3, weekendDip: -0.1, noise: 0.13, census: 15 },
  },
  {
    id: 'demo_2n',
    name: '2 North',
    type: 'inpatient',
    censusCap: 16,
    staff: 5,
    // Comfortably stable: the donor unit a good plan should draw from.
    pattern: { uaiStart: 1.05, uaiEnd: 1.1, mondayAm: 0.08, weekendDip: -0.05, noise: 0.08, census: 12 },
  },
  {
    id: 'demo_3w',
    name: '3 West',
    type: 'inpatient',
    censusCap: 20,
    staff: 6,
    // Strong weekly rhythm — Monday AM lands hard after weekend admissions.
    pattern: { uaiStart: 1.25, uaiEnd: 1.35, mondayAm: 0.85, weekendDip: -0.25, noise: 0.12, census: 17 },
  },
  {
    id: 'demo_4e',
    name: '4 East',
    type: 'inpatient',
    censusCap: 14,
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
        entries.push({
          id: `demo_${unit.id}_${age}`,
          locId: unit.id,
          date,
          shift,
          census: null,
          points: Math.max(0, Math.round(points)),
          staff: null,
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
  return {
    locations: scenario.locations,
    entries: scenario.entries,
    deployments: sampleDeployments(),
    caps: scenario.caps,
    thresholds: null, // caller applies its own defaults
    meta: scenario.meta,
  }
}

/* ------------------------------------------------------- outpatient sample ---
 * A small outpatient caseload and provider panel for exploring the Level of
 * Care module. Screened patients carry the six dimension scores so the screener
 * reproduces their recommended level exactly; the mix is deliberate — some
 * clearly outpatient, some needing a step-up, one telehealth-only, and a
 * specialty (trauma) with tight capacity so the assignment surfaces a gap.
 */

export function sampleProviders() {
  return [
    { id: 'prov_rivera', name: 'Dr. Rivera', credential: 'prescriber', population: 'adult', specialties: ['general', 'sud'], telehealth: true, capacity: 3, demo: true },
    { id: 'prov_shah', name: 'A. Shah, LCSW', credential: 'therapist', population: 'adult', specialties: ['trauma', 'general'], telehealth: true, capacity: 2, demo: true },
    { id: 'prov_bynum', name: 'Dr. Bynum', credential: 'both', population: 'both', specialties: ['general'], telehealth: false, capacity: 2, demo: true },
    { id: 'prov_ellis', name: 'J. Ellis, LPC', credential: 'therapist', population: 'adolescent', specialties: ['adolescent', 'general'], telehealth: true, capacity: 3, demo: true },
  ]
}

// Each patient's dimension scores are chosen to land on the intended level.
export function samplePatients() {
  const rows = [
    { id: 'pt_ac', name: 'A.C.', population: 'adult', scores: { risk: 2, function: 2, comorbidity: 2, stress: 2, support: 2, engagement: 2 }, needs: { prescriber: false, therapy: true }, specialties: [], telehealthOnly: false, urgencyDays: 6 },
    { id: 'pt_dm', name: 'D.M.', population: 'adult', scores: { risk: 2, function: 3, comorbidity: 3, stress: 3, support: 3, engagement: 2 }, needs: { prescriber: true, therapy: true }, specialties: ['sud'], telehealthOnly: false, urgencyDays: 12 },
    { id: 'pt_tk', name: 'T.K.', population: 'adult', scores: { risk: 3, function: 3, comorbidity: 2, stress: 3, support: 3, engagement: 3 }, needs: { prescriber: false, therapy: true }, specialties: ['trauma'], telehealthOnly: false, urgencyDays: 20 },
    { id: 'pt_rl', name: 'R.L.', population: 'adult', scores: { risk: 2, function: 2, comorbidity: 2, stress: 2, support: 3, engagement: 2 }, needs: { prescriber: true, therapy: false }, specialties: [], telehealthOnly: true, urgencyDays: 3 },
    { id: 'pt_sv', name: 'S.V.', population: 'adult', scores: { risk: 4, function: 3, comorbidity: 3, stress: 3, support: 3, engagement: 3 }, needs: { prescriber: true, therapy: true }, specialties: [], telehealthOnly: false, urgencyDays: 1 },
    { id: 'pt_jp', name: 'J.P.', population: 'adolescent', scores: { risk: 2, function: 2, comorbidity: 2, stress: 3, support: 2, engagement: 2 }, needs: { prescriber: false, therapy: true }, specialties: ['adolescent'], telehealthOnly: false, urgencyDays: 8 },
    { id: 'pt_mn', name: 'M.N.', population: 'adolescent', scores: { risk: 3, function: 3, comorbidity: 2, stress: 4, support: 3, engagement: 3 }, needs: { prescriber: false, therapy: true }, specialties: ['trauma', 'adolescent'], telehealthOnly: false, urgencyDays: 15 },
  ]
  return rows.map((r) => ({ ...r, demo: true, createdAt: Date.now() }))
}

export function buildSampleOutpatient() {
  return { providers: sampleProviders(), patients: samplePatients() }
}
