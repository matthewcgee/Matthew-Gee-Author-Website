import { uid } from './storage'

export const DEFAULT_THRESHOLDS = {
  inpatient: { greenMax: 1.5, yellowMax: 2.5, unit: 'Acuity per staff (UAI)' },
  ed: { greenMax: 21, yellowMax: 27, unit: 'Total ED behavioral health points' },
}

export const STAGE_COLORS = {
  GREEN: '#3fb37f',
  YELLOW: '#e0b341',
  RED: '#e0584a',
  NONE: '#6b7280',
}

export function normalizeThresholds(thresholds) {
  return {
    inpatient: { ...DEFAULT_THRESHOLDS.inpatient, ...(thresholds?.inpatient || {}) },
    ed: { ...DEFAULT_THRESHOLDS.ed, ...(thresholds?.ed || {}) },
  }
}

export function safeDiv(a, b) {
  if (!a || !b) return 0
  return a / b
}

export function computeStage(value, thresholds) {
  if (value == null || isNaN(value)) return 'NONE'
  if (value <= thresholds.greenMax) return 'GREEN'
  if (value <= thresholds.yellowMax) return 'YELLOW'
  return 'RED'
}

export function thresholdsFor(location, globalThresholds) {
  const type = location?.type === 'ed' ? 'ed' : 'inpatient'
  return (location?.thresholds && location.thresholds.greenMax != null)
    ? location.thresholds
    : (globalThresholds?.[type] || DEFAULT_THRESHOLDS[type])
}

export function computeEntryValue(entry, location, globalThresholds) {
  if (location?.type === 'ed') {
    return entry.points || 0
  }
  return safeDiv(entry.points, entry.staff)
}

export function entryStage(entry, location, globalThresholds) {
  const value = computeEntryValue(entry, location, globalThresholds)
  const th = thresholdsFor(location, globalThresholds)
  return computeStage(value, th)
}

function staffNeededForTarget(entry, target) {
  const points = entry.points || 0
  const staff = entry.staff || 0
  if (!points || target <= 0) return 0
  return Math.max(0, Math.ceil(points / target - staff))
}

// How many additional staff would move this IP unit to YELLOW and to GREEN.
// Never applies to ED. Returns null for ED or missing entries.
export function staffNeededForThresholds(entry, location, globalThresholds) {
  if (!entry || location?.type === 'ed') return null

  const stage = entryStage(entry, location, globalThresholds)
  const th = thresholdsFor(location, globalThresholds)

  return {
    stage,
    toYellow: stage === 'RED' ? staffNeededForTarget(entry, th.yellowMax) : 0,
    toGreen: stage === 'GREEN' || stage === 'NONE' ? 0 : staffNeededForTarget(entry, th.greenMax),
  }
}

export const ADULT_ACUITY_CRITERIA = [
  {
    group: 'Observation Status',
    items: [
      { id: 'obs_1to1', label: 'Constant Observation (1:1)', points: 5 },
      { id: 'obs_q15', label: 'Q15 Observation', points: 3 },
      { id: 'obs_los', label: 'Line-of-sight', points: 2 },
    ],
  },
  {
    group: 'Behavioral Risk (last 24 hours)',
    items: [
      { id: 'risk_aggression', label: 'Physical aggression toward staff/patient', points: 4 },
      { id: 'risk_restraint', label: 'Restraint (physical or chemical)', points: 4 },
      { id: 'risk_prn', label: 'Severe agitation requiring PRN sedation', points: 3 },
      { id: 'risk_si', label: 'Active suicide attempt or self-injury in the ED <48 hrs', points: 4 },
      { id: 'risk_hi', label: 'Active homicidal ideation with threat', points: 3 },
    ],
  },
  {
    group: 'Clinical Complexity',
    items: [
      { id: 'complex_psychosis', label: 'Severe psychosis with disorganization', points: 3 },
      { id: 'complex_mania', label: 'Severe mania with impulsivity', points: 3 },
      { id: 'complex_detox', label: 'Detox protocol (CIWA/COWS)', points: 2 },
      { id: 'complex_elopement', label: 'Elopement risk', points: 2 },
      { id: 'complex_forensic', label: 'Forensic/court hold', points: 2 },
      { id: 'complex_pd', label: 'Severe personality disorder behavioral dysregulation', points: 2 },
    ],
  },
  {
    group: 'Behavioral Severity – MASS (Last 24 Hours)',
    note: 'MASS 1–3 (Very Mild – behavioral interventions only) = 0 pts; select the highest applicable level.',
    items: [
      { id: 'mass_mild',     label: 'MASS 4–6 – Mild (behavioral interventions + oral meds)',         points: 1 },
      { id: 'mass_moderate', label: 'MASS 7–9 – Moderate (behavioral + oral or IM meds)',             points: 2 },
      { id: 'mass_severe',   label: 'MASS 10+ – Severe/Violent (IM meds ± seclusion/restraint)',      points: 4 },
    ],
  },
]

// MASS escalation clinical decision triggers (based on raw MASS scale level)
export const MASS_ESCALATION = [
  { massItem: 'mass_moderate', level: 'warning', label: 'MASS ≥7 — Charge RN awareness + mitigation plan required.' },
  { massItem: 'mass_severe',   level: 'danger',  label: 'MASS ≥10 — High-risk: consider 1:1, staffing flex, admin notification.' },
]

export const PEDIATRIC_MODIFIERS = [
  { id: 'C1', label: 'Line-of-sight / continuous visual observation', points: 4, group: 'Observation', cluster: true },
  { id: 'C7', label: 'On-unit self-harm or suicide attempt (this admission)', points: 4, group: 'Observation', cluster: true },
  { id: 'C4', label: 'Prior restraint / seclusion on unit', points: 3, group: 'Behavioral Safety' },
  { id: 'C8', label: 'Sexually inappropriate / boundary-risk behavior', points: 3, group: 'Behavioral Safety' },
  { id: 'C3', label: 'Eating disorder protocol', points: 3, group: 'Medical Complexity' },
  { id: 'C5', label: 'Brittle Type 1 diabetes (off pump / frequent checks)', points: 3, group: 'Medical Complexity' },
  { id: 'C2', label: 'Contact precautions / room isolation', points: 2, group: 'Medical Complexity' },
]

// Observation cluster (C1, C7) does not stack — the higher single value
// governs and the rest of the cluster is dropped from the total.
export const PEDIATRIC_OBSERVATION_GOVERNS = true

export function scorePediatricModifiers(activeIds) {
  const active = PEDIATRIC_MODIFIERS.filter((m) => activeIds.includes(m.id))
  const cluster = active.filter((m) => m.cluster)
  const others = active.filter((m) => !m.cluster)

  let observationPts = 0
  let governedOut = []
  if (PEDIATRIC_OBSERVATION_GOVERNS && cluster.length) {
    const top = cluster.reduce((a, b) => (b.points > a.points ? b : a))
    observationPts = top.points
    governedOut = cluster.filter((m) => m.id !== top.id)
  } else {
    observationPts = cluster.reduce((s, m) => s + m.points, 0)
  }
  const otherPts = others.reduce((s, m) => s + m.points, 0)
  return { total: observationPts + otherPts, observationPts, otherPts, active, governedOut }
}

// Recommended thresholds for a Pediatric ED location (raw point totals,
// 20% above the initial 45/60 pilot bands): YELLOW starts at 54, RED at 72.
// Expressed as greenMax/yellowMax for the <= comparisons in computeStage.
export const PEDIATRIC_ED_THRESHOLDS = {
  greenMax: 53,
  yellowMax: 71,
  unit: 'Total pediatric ED behavioral health points',
}

export const PEDIATRIC_MODIFIER_GROUPS = ['Observation', 'Behavioral Safety', 'Medical Complexity'].map((group) => ({
  group,
  items: PEDIATRIC_MODIFIERS.filter((m) => m.group === group),
}))

export function seedLocations() {
  return [
    {
      id: 'loc_unit_1sa',
      name: '1 South A',
      facility: '',
      market: '',
      region: '',
      type: 'inpatient',
      censusCap: 18,
      thresholds: null,
    },
    {
      id: 'loc_unit_ed',
      name: 'Emergency Department',
      facility: '',
      market: '',
      region: '',
      type: 'ed',
      censusCap: null,
      thresholds: null,
    },
  ]
}

export function seedEntries() {
  return []
}

export function seedDeployments() {
  return []
}

const SHIFT_ORDER = { AM: 0, PM: 1 }

// Linear-regression trend over the last 3–5 entries for a location.
// Returns { direction: 'up' | 'down' | 'stable', pct: number }
export function detectTrend(locId, allEntries, location, globalThresholds) {
  const list = allEntries
    .filter((e) => e.locId === locId)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (SHIFT_ORDER[a.shift] || 0) - (SHIFT_ORDER[b.shift] || 0)
    })
    .slice(-5)

  if (list.length < 3) return { direction: 'stable', pct: 0 }

  const values = list.map((e) => computeEntryValue(e, location, globalThresholds))
  const n = values.length
  const meanX = (n - 1) / 2
  const meanY = values.reduce((s, v) => s + v, 0) / n
  const num = values.reduce((s, v, i) => s + (i - meanX) * (v - meanY), 0)
  const den = values.reduce((s, _, i) => s + (i - meanX) * (i - meanX), 0)
  const slope = den === 0 ? 0 : num / den
  const pct = (slope * (n - 1)) / (Math.abs(meanY) || 1)

  if (pct > 0.15) return { direction: 'up', pct: Math.round(pct * 100) }
  if (pct < -0.15) return { direction: 'down', pct: Math.round(Math.abs(pct) * 100) }
  return { direction: 'stable', pct: 0 }
}

// Nurse-to-patient ratio recommendation based on current acuity stage.
export function staffingRatioRecommendation(entry, location, globalThresholds) {
  if (!entry || !location) return null
  const stage = entryStage(entry, location, globalThresholds)
  const isEd = location.type === 'ed'
  const census = entry.census || 0

  if (isEd) {
    if (stage === 'GREEN') return { label: 'Standard staffing adequate', ratio: null, recommended: null, color: STAGE_COLORS.GREEN }
    if (stage === 'YELLOW') return { label: 'Enhanced: add 1 dedicated BH staff', ratio: null, recommended: null, color: STAGE_COLORS.YELLOW }
    if (stage === 'RED') return { label: 'Surge: activate BH flex pool (+2 minimum)', ratio: null, recommended: null, color: STAGE_COLORS.RED }
    return null
  }

  if (stage === 'GREEN') return { label: '1:5 ratio adequate', ratio: '1:5', recommended: census ? Math.ceil(census / 5) : null, color: STAGE_COLORS.GREEN }
  if (stage === 'YELLOW') return { label: '1:4 — consider 1 flex staff', ratio: '1:4', recommended: census ? Math.ceil(census / 4) : null, color: STAGE_COLORS.YELLOW }
  if (stage === 'RED') return { label: '1:2 — surge staffing required', ratio: '1:2', recommended: census ? Math.ceil(census / 2) : null, color: STAGE_COLORS.RED }
  return null
}
