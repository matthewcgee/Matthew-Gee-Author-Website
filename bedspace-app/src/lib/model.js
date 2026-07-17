import { uid } from './storage'

// ---------- Dorms & bed layout ----------
// Beds are physically stacked three-high (bottom / middle / top). Each dorm's
// bed count is built from as many full triple-bunk stacks as possible, with
// any remainder modeled as bottom-only single beds (e.g. an accessible bed).

export const DORMS = [
  { id: 'men', label: "Men's Dorm", code: 'M', capacity: 70 },
  { id: 'women', label: "Women's Dorm", code: 'W', capacity: 30 },
]

export const POSITION_LABEL = { bottom: 'Bottom', middle: 'Middle', top: 'Top' }

export const BED_STATUS = {
  AVAILABLE: 'available',
  HELD: 'held',
  OCCUPIED: 'occupied',
  OUT_OF_SERVICE: 'out_of_service',
}

export const HOLD_DURATION_MS = 2 * 60 * 60 * 1000 // 2 hours
export const RESIDENCY_CAP_DAYS = 90

export function generateBeds() {
  const beds = []
  DORMS.forEach((dorm) => {
    const fullStacks = Math.floor(dorm.capacity / 3)
    const remainder = dorm.capacity % 3
    let stackNum = 0

    for (let i = 0; i < fullStacks; i++) {
      stackNum++
      ;['bottom', 'middle', 'top'].forEach((position) => {
        beds.push(makeBed(dorm, stackNum, position))
      })
    }
    for (let i = 0; i < remainder; i++) {
      stackNum++
      beds.push(makeBed(dorm, stackNum, 'bottom', true))
    }
  })
  return beds
}

function makeBed(dorm, stackNum, position, accessible = false) {
  const stackLabel = String(stackNum).padStart(2, '0')
  const posCode = position[0].toUpperCase()
  return {
    id: `${dorm.code}-${stackLabel}-${posCode}`,
    dorm: dorm.id,
    stack: stackNum,
    position, // bottom | middle | top
    bottomBunk: position === 'bottom',
    accessible,
    status: BED_STATUS.AVAILABLE,
    residentId: null,
    hold: null, // { heldBy, heldAt, expiresAt, extendedBy, extendedAt, note }
  }
}

export function seedBeds() {
  return generateBeds()
}

export function seedResidents() {
  return []
}

export function seedDisallowedList() {
  return []
}

export function seedScreeningLog() {
  return []
}

// ---------- Hold logic ----------

export function holdExpiresAt(from = Date.now()) {
  return from + HOLD_DURATION_MS
}

export function isHoldExpired(hold, now = Date.now()) {
  if (!hold) return false
  return now >= hold.expiresAt
}

export function holdTimeRemainingMs(hold, now = Date.now()) {
  if (!hold) return 0
  return Math.max(0, hold.expiresAt - now)
}

export function formatDuration(ms) {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---------- Residency / 90-day cap ----------

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function daysElapsed(admittedAt, now = Date.now()) {
  return Math.floor((now - admittedAt) / MS_PER_DAY)
}

export function capDateFor(resident) {
  const extension = resident.extensionDays || 0
  return resident.admittedAt + (RESIDENCY_CAP_DAYS + extension) * MS_PER_DAY
}

export function residencyStatus(resident, now = Date.now()) {
  const cap = capDateFor(resident)
  const daysRemaining = Math.ceil((cap - now) / MS_PER_DAY)
  const elapsed = daysElapsed(resident.admittedAt, now)
  let status = 'ok'
  if (daysRemaining <= 0) status = 'expired'
  else if (daysRemaining <= 7) status = 'warning'
  return { capDate: cap, daysRemaining, elapsed, status }
}

export function defaultCommitments() {
  return {
    psychAppt: false,
    primaryCareAppt: false,
    groupTherapyWeekly: false,
  }
}

export function commitmentsAccepted(commitments) {
  if (!commitments) return false
  return !!(commitments.psychAppt && commitments.primaryCareAppt && commitments.groupTherapyWeekly)
}

// ---------- Name normalization & matching ----------
// Screening never exposes the disallowed list itself to hospital-side users —
// it only ever returns one of three outcomes (see screenName below).

export function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Classic Levenshtein edit distance, used only to flag close-but-not-exact
// matches for human verification — never to make an automatic "not accepted"
// determination on its own.
export function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

export const SCREEN_RESULT = {
  ACCEPTED: 'accepted',
  NOT_ACCEPTED: 'not_accepted',
  POSSIBLE_MATCH: 'possible_match',
}

// Returns { result, matchedEntryId } for internal audit-log purposes only.
// The matchedEntryId is never surfaced in hospital-facing UI.
export function screenName(inputName, disallowedList) {
  const query = normalizeName(inputName)
  if (!query) return { result: null, matchedEntryId: null }

  for (const entry of disallowedList) {
    const target = normalizeName(entry.name)
    if (!target) continue
    if (target === query) {
      return { result: SCREEN_RESULT.NOT_ACCEPTED, matchedEntryId: entry.id }
    }
  }

  // Fuzzy pass: flag close matches (e.g. typos/nicknames) for a human to verify
  // rather than silently deciding either way.
  let bestDistance = Infinity
  let bestEntry = null
  for (const entry of disallowedList) {
    const target = normalizeName(entry.name)
    if (!target) continue
    const threshold = target.length <= 5 ? 1 : 2
    const distance = levenshtein(query, target)
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance
      bestEntry = entry
    }
  }
  if (bestEntry) {
    return { result: SCREEN_RESULT.POSSIBLE_MATCH, matchedEntryId: bestEntry.id }
  }

  return { result: SCREEN_RESULT.ACCEPTED, matchedEntryId: null }
}

export function makeScreeningLogEntry({ queriedName, result, matchedEntryId, screenedBy }) {
  return {
    id: uid(),
    queriedName,
    result,
    matchedEntryId: matchedEntryId || null,
    screenedBy: screenedBy || 'ED/IP Staff',
    resolvedBy: null,
    resolvedAs: null, // 'accepted' | 'not_accepted' set once Bethesda reviews a possible_match
    createdAt: Date.now(),
  }
}

export function makeDisallowedEntry({ name, reason, addedBy }) {
  return {
    id: uid(),
    name,
    reason: reason || '',
    addedBy: addedBy || 'Bethesda Center',
    createdAt: Date.now(),
  }
}

export function makeResident({ name, gender, bedId, mobility, commitments }) {
  return {
    id: uid(),
    name,
    gender, // 'men' | 'women' — determines dorm eligibility
    bedId,
    mobility: mobility || 'any', // 'bottom_required' | 'any'
    admittedAt: Date.now(),
    dischargedAt: null,
    extensionDays: 0,
    extensionGrantedBy: null,
    extensionGrantedAt: null,
    extensionNote: null,
    commitments: commitments || defaultCommitments(),
    compliance: {
      lastPsychApptAt: null,
      lastPrimaryCareApptAt: null,
      groupTherapyWeeks: [], // array of ISO week-start dates attended
    },
    notes: '',
  }
}
