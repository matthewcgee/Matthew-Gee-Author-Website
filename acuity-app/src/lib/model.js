import { uid } from './storage'

export const DEFAULT_THRESHOLDS = {
  inpatient: { greenMax: 1.5, yellowMax: 2.5, unit: 'Acuity per staff (UAI)' },
  ed: { greenMax: 8, yellowMax: 14, unit: 'Total ED behavioral health points' },
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

export function seedLocations() {
  return [
    {
      id: 'loc_hpmc_1sa',
      name: '1 South A',
      facility: 'High Point Medical Center',
      market: 'Atrium Health Wake Forest Baptist',
      region: 'North Carolina',
      type: 'inpatient',
      censusCap: 18,
      thresholds: null,
    },
    {
      id: 'loc_hpmc_ed',
      name: 'Emergency Department',
      facility: 'High Point Medical Center',
      market: 'Atrium Health Wake Forest Baptist',
      region: 'North Carolina',
      type: 'ed',
      censusCap: null,
      thresholds: null,
    },
  ]
}

export function seedEntries() {
  const rows = [
    ['2026-05-04', 'AM', 16, 22, 9],
    ['2026-05-04', 'PM', 17, 26, 9],
    ['2026-05-05', 'AM', 15, 19, 9],
    ['2026-05-05', 'PM', 18, 31, 9],
    ['2026-05-06', 'AM', 16, 24, 9],
    ['2026-05-06', 'PM', 18, 34, 8],
    ['2026-05-07', 'AM', 17, 28, 9],
  ]
  return rows.map(([date, shift, census, points, staff]) => ({
    id: uid(),
    locId: 'loc_hpmc_1sa',
    date,
    shift,
    census,
    points,
    staff,
    notes: 'HPMC pilot data',
    pilot: true,
    createdAt: Date.now(),
  }))
}

export function seedDeployments() {
  return []
}
