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
  PROGRAM: 'no-provider-in-program',
  SPECIALTY: 'no-provider-with-specialty',
  SUPERVISION: 'needs-attending-supervision',
  TELEHEALTH: 'no-telehealth-provider',
  CAPACITY: 'eligible-providers-all-at-capacity',
  NOT_OP: 'not-appropriate-for-outpatient',
  ACUTE: 'acute-urgent-evaluation',
}

const REASON_LABEL = {
  [UNMATCHED.POPULATION]: 'No provider serves this patient’s population',
  [UNMATCHED.CREDENTIAL]: 'No provider can fill the required role (prescriber / therapy)',
  [UNMATCHED.PROGRAM]: 'No provider staffs the recommended clinic / program',
  [UNMATCHED.SPECIALTY]: 'No provider carries the required specialty',
  [UNMATCHED.SUPERVISION]: 'Too acute for a resident — needs an attending, and none is available',
  [UNMATCHED.TELEHEALTH]: 'Patient needs telehealth and no eligible provider offers it',
  [UNMATCHED.CAPACITY]: 'Eligible providers are all at capacity',
  [UNMATCHED.NOT_OP]: 'Screened above the outpatient level — needs a step-up referral',
  [UNMATCHED.ACUTE]: 'Acute — not routine outpatient; needs urgent / same-day evaluation',
}

export function reasonLabel(code) {
  return REASON_LABEL[code] || code
}

// Academic / teaching model. A patient at or above this risk level is too acute
// to be seen by a resident alone and must be routed to an attending (or an
// independently-licensed non-trainee). Adjustable; risk 3 is the point at which
// intent is present but the patient is still outpatient-appropriate — exactly
// the "too acute for a trainee, not yet inpatient" band the academic model
// exists for. A patient this rule targets who is NOT outpatient-appropriate has
// already been routed to a step-up before matching.
export const ATTENDING_RISK_THRESHOLD = 3

// Provider training levels. 'staff' is an independently-licensed non-trainee
// (e.g., a staff therapist or attending-equivalent); only 'resident' is barred
// from acute patients. A provider with no training level set is treated as
// 'staff', so a non-academic clinic needs no extra configuration.
export const TRAINING_LEVELS = ['attending', 'fellow', 'staff', 'resident']

// The attending determination is now made by the screen (loc.js), from a
// configurable complexity rule, and stored on the patient. When that flag is
// present it governs; otherwise fall back to the risk-based rule so older
// records and direct callers still work.
export function requiresAttending(patient) {
  if (typeof patient?.requiresAttending === 'boolean') return patient.requiresAttending
  return (Number(patient?.riskScore) || 0) >= ATTENDING_RISK_THRESHOLD
}

// A case belongs in routine outpatient routing unless it was pulled out for
// acute safety. A PHP/IOP advisory does NOT exclude it — it is routed with the
// advisory attached. Back-compat: records without the new flag fall back to the
// old opAppropriate signal.
export function isRoutable(patient) {
  if (typeof patient?.routableOutpatient === 'boolean') return patient.routableOutpatient
  return patient?.opAppropriate !== false
}

function isResident(provider) {
  return provider.trainingLevel === 'resident'
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

// Which clinic / program the patient is routed to. Empty means unassigned, so
// the program constraint does not apply — the feature is opt-in per patient.
function offersProgram(provider, patient) {
  if (!patient.program) return true
  return (provider.programs || []).includes(patient.program)
}

function supervisionOk(provider, patient) {
  return !requiresAttending(patient) || !isResident(provider)
}

/* -------------------------------------------------------------- eligibility */

// Why (if at all) a provider cannot take a patient, as a specific reason code.
// Capacity is checked by the caller against live remaining capacity, so it is
// deliberately not part of static eligibility.
export function ineligibilityReason(provider, patient) {
  if (!servesPopulation(provider, patient.population)) return UNMATCHED.POPULATION
  const role = primaryRole(patient)
  if (!providerRoles(provider).includes(role)) return UNMATCHED.CREDENTIAL
  if (!offersProgram(provider, patient)) return UNMATCHED.PROGRAM
  if (!specialtyOverlap(provider, patient).ok) return UNMATCHED.SPECIALTY
  if (!supervisionOk(provider, patient)) return UNMATCHED.SUPERVISION
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
  // Most actionable / specific blocker first: a supervision or telehealth gap is
  // a narrower fix than a whole missing program, specialty, role or population.
  const order = [
    UNMATCHED.SUPERVISION, UNMATCHED.TELEHEALTH, UNMATCHED.SPECIALTY,
    UNMATCHED.PROGRAM, UNMATCHED.CREDENTIAL, UNMATCHED.POPULATION,
  ]
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
// overlap first (clinical fit leads), then the LEAST-loaded provider so patients
// are distributed evenly, then most remaining capacity, then a stable tiebreak.
// `load` is each provider's total patient count — existing panel plus what this
// run has already assigned — which is what "equal distribution" balances on.
function pickProvider(eligible, patient, remaining, load) {
  return eligible
    .map((p) => ({ p, spec: specialtyOverlap(p, patient).count, load: load[p.id], cap: remaining[p.id] }))
    .sort((a, b) =>
      (b.spec - a.spec) || (a.load - b.load) || (b.cap - a.cap) || String(a.p.id).localeCompare(String(b.p.id))
    )
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
  // Running patient load per provider = existing panel size + assignments made
  // this run. Balancing on this spreads new patients to the least-loaded.
  const load = Object.fromEntries(providers.map((p) => [p.id, Math.max(0, Math.floor(p.panelLoad) || 0)]))
  const baseLoad = { ...load }
  const assignedCount = Object.fromEntries(providers.map((p) => [p.id, 0]))

  // Acute-safety cases are pulled from routine outpatient routing; everyone else
  // is a candidate. A PHP/IOP advisory does NOT exclude a patient here.
  const eligiblePatients = []
  const assignments = []
  const unmatched = []

  for (const patient of patients) {
    if (!isRoutable(patient)) {
      unmatched.push({ patientId: patient.id, patient, reason: UNMATCHED.ACUTE, reasonLabel: reasonLabel(UNMATCHED.ACUTE) })
    } else {
      eligiblePatients.push(patient)
    }
  }

  eligiblePatients.sort(compareUrgency)

  for (const patient of eligiblePatients) {
    const eligible = providers.filter((p) => isEligible(p, patient) && remaining[p.id] > 0)
    const provider = pickProvider(eligible, patient, remaining, load)

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
    load[provider.id] += 1
    assignedCount[provider.id] += 1
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
      program: patient.program || null,
      attendingRequired: requiresAttending(patient),
      trainingLevel: provider.trainingLevel || 'staff',
    })
  }

  const placed = assignments.length

  // Per-provider distribution, for equal-distribution oversight. `load` is the
  // total after this run (panel + assigned); `assigned` is just this run.
  const distribution = providers.map((p) => ({
    id: p.id,
    name: p.name,
    trainingLevel: p.trainingLevel || 'staff',
    baseLoad: baseLoad[p.id],
    assigned: assignedCount[p.id],
    load: load[p.id],
    capacity: Math.max(0, Math.floor(p.capacity) || 0),
    remaining: remaining[p.id],
  }))

  // Spread of load within each training group — a quick fairness read.
  const byGroup = {}
  for (const d of distribution) {
    const g = d.trainingLevel === 'resident' ? 'resident' : d.trainingLevel === 'attending' ? 'attending' : 'staff'
    if (!byGroup[g]) byGroup[g] = { providers: 0, assigned: 0, load: 0, min: Infinity, max: 0 }
    byGroup[g].providers += 1
    byGroup[g].assigned += d.assigned
    byGroup[g].load += d.load
    byGroup[g].min = Math.min(byGroup[g].min, d.load)
    byGroup[g].max = Math.max(byGroup[g].max, d.load)
  }
  for (const g of Object.values(byGroup)) {
    if (g.min === Infinity) g.min = 0
    g.spread = g.max - g.min // 0 = perfectly even
  }

  return {
    assignments,
    unmatched,
    distribution,
    summary: {
      patients: patients.length,
      outpatientCandidates: eligiblePatients.length,
      placed,
      unplaced: unmatched.length,
      acute: unmatched.filter((u) => u.reason === UNMATCHED.ACUTE).length,
      needStepUp: unmatched.filter((u) => u.reason === UNMATCHED.NOT_OP).length,
      capacityGap: unmatched.filter((u) => u.reason === UNMATCHED.CAPACITY).length,
      remainingCapacity: Object.values(remaining).reduce((s, c) => s + c, 0),
      totalCapacity,
      loadByGroup: byGroup,
    },
    remaining,
  }
}
