// Acuitas™ Outpatient Assignment
//
// Takes the patients a level-of-care screen found appropriate for the outpatient
// continuum and matches them to outpatient providers — the OP counterpart of the
// inpatient deployment optimizer.
//
// HONEST FRAMING. Unlike the inpatient staff optimizer, this is NOT solved to a
// provable global optimum. Outpatient matching trades off soft, incommensurable
// goals — specialty fit, panel balance, continuity — with no single correct
// objective, so this is a transparent priority heuristic: it enforces the hard
// constraints exactly, places the most urgent patients first, respects every
// provider's capacity, and explains each match and every non-match. A patient it
// cannot place is reported with the reason, which turns the leftovers into a
// capacity-gap report rather than a silent failure.
//
// It assigns a single PRIMARY provider per patient. When a patient needs both a
// prescriber and therapy and no one clinician covers both, the primary covers
// the higher-priority role (prescribing) and the unmet role is flagged, not
// hidden.

export const ROLES = ['prescriber', 'therapy']

// Credentials and which roles each can fill.
export const CREDENTIAL_ROLES = {
  prescriber: ['prescriber'],
  therapist: ['therapy'],
  both: ['prescriber', 'therapy'],
}

export const UNMATCHED = {
  POPULATION: 'no-provider-for-population',
  CREDENTIAL: 'no-provider-for-required-role',
  SPECIALTY: 'no-provider-with-specialty',
  TELEHEALTH: 'no-telehealth-provider',
  CAPACITY: 'eligible-providers-all-at-capacity',
  NOT_OP: 'not-appropriate-for-outpatient',
}

const REASON_LABEL = {
  [UNMATCHED.POPULATION]: 'No provider serves this patient’s population',
  [UNMATCHED.CREDENTIAL]: 'No provider can fill the required role (prescriber / therapy)',
  [UNMATCHED.SPECIALTY]: 'No provider carries the required specialty',
  [UNMATCHED.TELEHEALTH]: 'Patient needs telehealth and no eligible provider offers it',
  [UNMATCHED.CAPACITY]: 'Eligible providers are all at capacity',
  [UNMATCHED.NOT_OP]: 'Screened above the outpatient level — needs a step-up referral',
}

export function reasonLabel(code) {
  return REASON_LABEL[code] || code
}

/* --------------------------------------------------------------- normalizing */

function providerRoles(provider) {
  return CREDENTIAL_ROLES[provider.credential] || []
}

function servesPopulation(provider, population) {
  return provider.population === 'both' || provider.population === population
}

// A patient's primary role: prescribing anchors the plan when medication is
// indicated, so it takes precedence when both are needed.
function primaryRole(patient) {
  if (patient.needs?.prescriber) return 'prescriber'
  if (patient.needs?.therapy) return 'therapy'
  return 'therapy'
}

function requiredSpecialties(patient) {
  return Array.isArray(patient.specialties) ? patient.specialties.filter(Boolean) : []
}

function specialtyOverlap(provider, patient) {
  const req = requiredSpecialties(patient)
  if (!req.length) return { ok: true, matched: [], count: 0 }
  const has = new Set(provider.specialties || [])
  const matched = req.filter((s) => has.has(s))
  return { ok: matched.length === req.length, matched, count: matched.length }
}

/* -------------------------------------------------------------- eligibility */

// Why (if at all) a provider cannot take a patient, as a specific reason code.
// Capacity is checked by the caller against live remaining capacity, so it is
// deliberately not part of static eligibility.
export function ineligibilityReason(provider, patient) {
  if (!servesPopulation(provider, patient.population)) return UNMATCHED.POPULATION
  const role = primaryRole(patient)
  if (!providerRoles(provider).includes(role)) return UNMATCHED.CREDENTIAL
  if (!specialtyOverlap(provider, patient).ok) return UNMATCHED.SPECIALTY
  if (patient.telehealthOnly && !provider.telehealth) return UNMATCHED.TELEHEALTH
  return null
}

export function isEligible(provider, patient) {
  return ineligibilityReason(provider, patient) === null
}

// The single most specific reason a patient could not be placed, given the whole
// provider set — so the gap report names the true blocker rather than whichever
// provider was checked last. Population/credential/specialty/telehealth in order
// of how fundamental the mismatch is; capacity only if some provider was
// otherwise eligible.
function bestUnmatchedReason(providers, patient) {
  const reasons = providers.map((p) => ineligibilityReason(p, patient))
  if (reasons.includes(null)) return UNMATCHED.CAPACITY
  const order = [UNMATCHED.TELEHEALTH, UNMATCHED.SPECIALTY, UNMATCHED.CREDENTIAL, UNMATCHED.POPULATION]
  for (const code of order) if (reasons.includes(code)) return code
  return UNMATCHED.POPULATION
}

/* --------------------------------------------------------------- prioritize */

// Sort key for who gets first pick of scarce capacity: acuity first (higher
// risk / more intensive level), then longest wait, then a stable id tiebreak.
function urgencyKey(patient) {
  const levelWeight = patient.level === 'iop' ? 2 : 1
  const risk = Number(patient.riskScore) || 0
  const wait = Number(patient.urgencyDays) || 0
  return { risk, levelWeight, wait }
}

function compareUrgency(a, b) {
  const ka = urgencyKey(a)
  const kb = urgencyKey(b)
  if (kb.risk !== ka.risk) return kb.risk - ka.risk
  if (kb.levelWeight !== ka.levelWeight) return kb.levelWeight - ka.levelWeight
  if (kb.wait !== ka.wait) return kb.wait - ka.wait
  return String(a.id).localeCompare(String(b.id))
}

// Among eligible providers with capacity, the best fit: strongest specialty
// overlap first, then the most remaining capacity (load-balancing keeps access
// open across the panel), then a stable name/id tiebreak.
function pickProvider(eligible, patient, remaining) {
  return eligible
    .map((p) => ({ p, spec: specialtyOverlap(p, patient).count, cap: remaining[p.id] }))
    .sort((a, b) => (b.spec - a.spec) || (b.cap - a.cap) || String(a.p.id).localeCompare(String(b.p.id)))
    [0]?.p || null
}

/* ------------------------------------------------------------------- assign */

/**
 * Match a caseload of screened patients to outpatient providers.
 *
 * @param patients  screened patients, each { id, name, population, level,
 *                  opAppropriate, needs:{prescriber,therapy}, specialties[],
 *                  telehealthOnly, urgencyDays, riskScore }
 * @param providers { id, name, credential, population, specialties[],
 *                  telehealth, capacity }
 */
export function assignCaseload(patients = [], providers = []) {
  const remaining = Object.fromEntries(providers.map((p) => [p.id, Math.max(0, Math.floor(p.capacity) || 0)]))
  const totalCapacity = Object.values(remaining).reduce((s, c) => s + c, 0)

  // Only outpatient-appropriate patients are matched here; the rest are reported
  // so they are not silently dropped from the caseload.
  const eligiblePatients = []
  const assignments = []
  const unmatched = []

  for (const patient of patients) {
    if (!patient.opAppropriate) {
      unmatched.push({ patientId: patient.id, patient, reason: UNMATCHED.NOT_OP, reasonLabel: reasonLabel(UNMATCHED.NOT_OP) })
    } else {
      eligiblePatients.push(patient)
    }
  }

  eligiblePatients.sort(compareUrgency)

  for (const patient of eligiblePatients) {
    const eligible = providers.filter((p) => isEligible(p, patient) && remaining[p.id] > 0)
    const provider = pickProvider(eligible, patient, remaining)

    if (!provider) {
      unmatched.push({
        patientId: patient.id,
        patient,
        reason: bestUnmatchedReason(providers, patient),
        reasonLabel: reasonLabel(bestUnmatchedReason(providers, patient)),
      })
      continue
    }

    remaining[provider.id] -= 1
    const overlap = specialtyOverlap(provider, patient)
    const role = primaryRole(patient)
    // The patient needs both prescribing and therapy, but this provider covers
    // only one role — so therapy (the non-primary role) is left to arrange
    // separately. Flagged, never hidden.
    const needsBoth = patient.needs?.prescriber && patient.needs?.therapy
    const coversBoth = providerRoles(provider).length === 2
    const unmetRole = needsBoth && !coversBoth ? (role === 'prescriber' ? 'therapy' : 'prescriber') : null

    assignments.push({
      patientId: patient.id,
      patient,
      providerId: provider.id,
      provider,
      role,
      specialtyMatched: overlap.matched,
      unmetRole,
    })
  }

  const placed = assignments.length
  return {
    assignments,
    unmatched,
    summary: {
      patients: patients.length,
      outpatientCandidates: eligiblePatients.length,
      placed,
      unplaced: unmatched.length,
      needStepUp: unmatched.filter((u) => u.reason === UNMATCHED.NOT_OP).length,
      capacityGap: unmatched.filter((u) => u.reason === UNMATCHED.CAPACITY).length,
      remainingCapacity: Object.values(remaining).reduce((s, c) => s + c, 0),
      totalCapacity,
    },
    remaining,
  }
}
