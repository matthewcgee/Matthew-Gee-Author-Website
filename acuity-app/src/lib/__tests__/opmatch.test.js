import { describe, it, expect } from 'vitest'
import {
  assignCaseload,
  isEligible,
  ineligibilityReason,
  reasonLabel,
  UNMATCHED,
  CREDENTIAL_ROLES,
  requiresAttending,
  ATTENDING_RISK_THRESHOLD,
} from '../opmatch.js'

function patient(over = {}) {
  return {
    id: 'p1',
    name: 'Patient',
    population: 'adult',
    level: 'op',
    opAppropriate: true,
    needs: { prescriber: false, therapy: true },
    specialties: [],
    telehealthOnly: false,
    urgencyDays: 0,
    riskScore: 1,
    ...over,
  }
}

function provider(over = {}) {
  return {
    id: 'dr1',
    name: 'Dr. One',
    credential: 'therapist',
    population: 'adult',
    specialties: [],
    telehealth: true,
    capacity: 3,
    ...over,
  }
}

describe('eligibility', () => {
  it('requires the provider to serve the patient population', () => {
    expect(isEligible(provider({ population: 'adolescent' }), patient({ population: 'adult' }))).toBe(false)
    expect(isEligible(provider({ population: 'both' }), patient({ population: 'adult' }))).toBe(true)
    expect(ineligibilityReason(provider({ population: 'adolescent' }), patient())).toBe(UNMATCHED.POPULATION)
  })

  it('requires the provider to cover the required role', () => {
    const needsMed = patient({ needs: { prescriber: true, therapy: false } })
    expect(isEligible(provider({ credential: 'therapist' }), needsMed)).toBe(false)
    expect(isEligible(provider({ credential: 'prescriber' }), needsMed)).toBe(true)
    expect(isEligible(provider({ credential: 'both' }), needsMed)).toBe(true)
    expect(ineligibilityReason(provider({ credential: 'therapist' }), needsMed)).toBe(UNMATCHED.CREDENTIAL)
  })

  it('requires every needed specialty to be present', () => {
    const trauma = patient({ specialties: ['trauma'] })
    expect(isEligible(provider({ specialties: [] }), trauma)).toBe(false)
    expect(isEligible(provider({ specialties: ['trauma'] }), trauma)).toBe(true)
    expect(ineligibilityReason(provider({ specialties: ['sud'] }), trauma)).toBe(UNMATCHED.SPECIALTY)
  })

  it('honors telehealth-only patients', () => {
    const tele = patient({ telehealthOnly: true })
    expect(isEligible(provider({ telehealth: false }), tele)).toBe(false)
    expect(isEligible(provider({ telehealth: true }), tele)).toBe(true)
    expect(ineligibilityReason(provider({ telehealth: false }), tele)).toBe(UNMATCHED.TELEHEALTH)
  })

  it('prescriber role is the primary need when a patient needs both', () => {
    const both = patient({ needs: { prescriber: true, therapy: true } })
    expect(isEligible(provider({ credential: 'therapist' }), both)).toBe(false) // primary is prescriber
    expect(isEligible(provider({ credential: 'prescriber' }), both)).toBe(true)
  })

  it('credential-role table is coherent', () => {
    expect(CREDENTIAL_ROLES.both).toEqual(['prescriber', 'therapy'])
    expect(CREDENTIAL_ROLES.prescriber).toEqual(['prescriber'])
  })
})

describe('assignment', () => {
  it('places a simple caseload within capacity', () => {
    const patients = [patient({ id: 'a' }), patient({ id: 'b' }), patient({ id: 'c' })]
    const r = assignCaseload(patients, [provider({ capacity: 3 })])
    expect(r.summary.placed).toBe(3)
    expect(r.summary.unplaced).toBe(0)
    expect(r.assignments.every((x) => x.providerId === 'dr1')).toBe(true)
  })

  it('never exceeds a provider’s capacity', () => {
    const patients = [patient({ id: 'a' }), patient({ id: 'b' }), patient({ id: 'c' })]
    const r = assignCaseload(patients, [provider({ capacity: 2 })])
    expect(r.summary.placed).toBe(2)
    const perProvider = r.assignments.filter((x) => x.providerId === 'dr1').length
    expect(perProvider).toBeLessThanOrEqual(2)
    expect(r.summary.capacityGap).toBe(1)
    expect(r.unmatched[0].reason).toBe(UNMATCHED.CAPACITY)
  })

  it('routes non-outpatient patients to a step-up instead of matching them', () => {
    const patients = [patient({ id: 'op1' }), patient({ id: 'php1', opAppropriate: false, level: 'php' })]
    const r = assignCaseload(patients, [provider({ capacity: 5 })])
    expect(r.summary.placed).toBe(1)
    expect(r.summary.needStepUp).toBe(1)
    const stepup = r.unmatched.find((u) => u.patientId === 'php1')
    expect(stepup.reason).toBe(UNMATCHED.NOT_OP)
  })

  it('gives the most urgent patient first pick of scarce specialty capacity', () => {
    // One trauma slot. The higher-risk trauma patient should get it.
    const low = patient({ id: 'low', specialties: ['trauma'], riskScore: 1 })
    const high = patient({ id: 'high', specialties: ['trauma'], riskScore: 4 })
    const providers = [provider({ id: 'trauma-doc', specialties: ['trauma'], capacity: 1 })]
    const r = assignCaseload([low, high], providers)
    expect(r.assignments).toHaveLength(1)
    expect(r.assignments[0].patientId).toBe('high')
    expect(r.unmatched[0].patientId).toBe('low')
  })

  it('breaks an acuity tie by who has waited longest', () => {
    const soon = patient({ id: 'soon', riskScore: 2, urgencyDays: 2 })
    const waiting = patient({ id: 'waiting', riskScore: 2, urgencyDays: 40 })
    const r = assignCaseload([soon, waiting], [provider({ capacity: 1 })])
    expect(r.assignments[0].patientId).toBe('waiting')
  })

  it('prefers a specialty-matched provider over a generalist', () => {
    const trauma = patient({ specialties: ['trauma'] })
    const providers = [
      provider({ id: 'generalist', specialties: [], capacity: 5 }),
      provider({ id: 'specialist', specialties: ['trauma'], capacity: 5 }),
    ]
    const r = assignCaseload([trauma], providers)
    expect(r.assignments[0].providerId).toBe('specialist')
    expect(r.assignments[0].specialtyMatched).toEqual(['trauma'])
  })

  it('load-balances across equally-suitable providers', () => {
    // Four identical patients, two identical providers with capacity 2 each →
    // should split 2 and 2 rather than pile onto one.
    const patients = [1, 2, 3, 4].map((i) => patient({ id: `p${i}` }))
    const providers = [provider({ id: 'x', capacity: 2 }), provider({ id: 'y', capacity: 2 })]
    const r = assignCaseload(patients, providers)
    const onX = r.assignments.filter((a) => a.providerId === 'x').length
    const onY = r.assignments.filter((a) => a.providerId === 'y').length
    expect(onX).toBe(2)
    expect(onY).toBe(2)
  })

  it('flags therapy as unmet when a both-needs patient gets a prescriber-only provider', () => {
    const both = patient({ needs: { prescriber: true, therapy: true } })
    const r = assignCaseload([both], [provider({ id: 'md', credential: 'prescriber', capacity: 1 })])
    expect(r.assignments[0].role).toBe('prescriber')
    expect(r.assignments[0].unmetRole).toBe('therapy')
  })

  it('leaves no unmet role when one clinician covers both', () => {
    const both = patient({ needs: { prescriber: true, therapy: true } })
    const r = assignCaseload([both], [provider({ id: 'np', credential: 'both', capacity: 1 })])
    expect(r.assignments[0].unmetRole).toBeNull()
  })

  it('reports the true blocker in the gap report, not whichever provider was last', () => {
    // A trauma patient; providers exist but none has trauma → SPECIALTY, not POPULATION
    const trauma = patient({ specialties: ['trauma'] })
    const providers = [provider({ specialties: ['sud'] }), provider({ id: 'p2', specialties: ['general'] })]
    const r = assignCaseload([trauma], providers)
    expect(r.unmatched[0].reason).toBe(UNMATCHED.SPECIALTY)
    expect(reasonLabel(r.unmatched[0].reason)).toMatch(/specialty/i)
  })

  it('summary numbers reconcile', () => {
    const patients = [
      patient({ id: 'a' }),
      patient({ id: 'b' }),
      patient({ id: 'php', opAppropriate: false }),
      patient({ id: 'c', specialties: ['trauma'] }), // no trauma provider
    ]
    const r = assignCaseload(patients, [provider({ capacity: 1 })])
    expect(r.summary.patients).toBe(4)
    expect(r.summary.outpatientCandidates).toBe(3)
    expect(r.summary.placed + r.summary.unplaced).toBe(4)
    expect(r.summary.placed).toBe(1)
  })

  it('handles empty inputs without throwing', () => {
    expect(assignCaseload([], []).summary.placed).toBe(0)
    expect(assignCaseload([patient()], []).unmatched[0].reason).toBe(UNMATCHED.POPULATION)
  })

  it('is deterministic across runs', () => {
    const patients = [1, 2, 3, 4, 5].map((i) => patient({ id: `p${i}`, riskScore: (i % 3) + 1, specialties: i % 2 ? ['trauma'] : [] }))
    const providers = [
      provider({ id: 'a', specialties: ['trauma'], capacity: 2 }),
      provider({ id: 'b', specialties: [], capacity: 2 }),
    ]
    const one = assignCaseload(patients, providers)
    const two = assignCaseload(patients, providers)
    expect(JSON.stringify(one.assignments.map((a) => [a.patientId, a.providerId])))
      .toBe(JSON.stringify(two.assignments.map((a) => [a.patientId, a.providerId])))
  })
})

describe('program (clinic) routing', () => {
  it('requires the provider to staff the recommended program when one is set', () => {
    const neuro = patient({ program: 'Neuromodulation' })
    expect(isEligible(provider({ programs: [] }), neuro)).toBe(false)
    expect(isEligible(provider({ programs: ['Neuromodulation'] }), neuro)).toBe(true)
    expect(ineligibilityReason(provider({ programs: ['Therapy only'] }), neuro)).toBe(UNMATCHED.PROGRAM)
  })

  it('imposes no program constraint when the patient has none', () => {
    expect(isEligible(provider({ programs: [] }), patient({ program: undefined }))).toBe(true)
  })

  it('reports the missing program in the gap report', () => {
    const neuro = patient({ program: 'Neuromodulation' })
    const r = assignCaseload([neuro], [provider({ programs: ['Therapy only'], capacity: 3 })])
    expect(r.summary.placed).toBe(0)
    expect(r.unmatched[0].reason).toBe(UNMATCHED.PROGRAM)
  })

  it('carries the program onto the assignment record', () => {
    const p = patient({ program: 'Therapy only' })
    const r = assignCaseload([p], [provider({ programs: ['Therapy only'], capacity: 1 })])
    expect(r.assignments[0].program).toBe('Therapy only')
  })
})

describe('academic supervision model', () => {
  it('marks a patient at or above the risk threshold as needing an attending', () => {
    expect(requiresAttending(patient({ riskScore: 2 }))).toBe(false)
    expect(requiresAttending(patient({ riskScore: 3 }))).toBe(true)
    expect(requiresAttending(patient({ riskScore: 4 }))).toBe(true)
    expect(ATTENDING_RISK_THRESHOLD).toBe(3)
  })

  it('bars a resident from an acute patient but allows attending and staff', () => {
    const acute = patient({ riskScore: 3 })
    expect(isEligible(provider({ trainingLevel: 'resident' }), acute)).toBe(false)
    expect(isEligible(provider({ trainingLevel: 'attending' }), acute)).toBe(true)
    expect(isEligible(provider({ trainingLevel: 'staff' }), acute)).toBe(true)
    expect(ineligibilityReason(provider({ trainingLevel: 'resident' }), acute)).toBe(UNMATCHED.SUPERVISION)
  })

  it('treats a provider with no training level as an independent non-trainee', () => {
    // A non-academic clinic needs no extra config: undefined trainingLevel is ok.
    expect(isEligible(provider({}), patient({ riskScore: 3 }))).toBe(true)
  })

  it('lets a resident see a non-acute patient', () => {
    expect(isEligible(provider({ trainingLevel: 'resident' }), patient({ riskScore: 2 }))).toBe(true)
  })

  it('routes an acute patient to the attending, not the resident', () => {
    const acute = patient({ id: 'acute', riskScore: 3, needs: { prescriber: true, therapy: false } })
    const providers = [
      provider({ id: 'res', credential: 'prescriber', trainingLevel: 'resident', capacity: 5 }),
      provider({ id: 'att', credential: 'prescriber', trainingLevel: 'attending', capacity: 5 }),
    ]
    const r = assignCaseload([acute], providers)
    expect(r.assignments[0].providerId).toBe('att')
    expect(r.assignments[0].attendingRequired).toBe(true)
    expect(r.assignments[0].trainingLevel).toBe('attending')
  })

  it('reports the supervision gap when only residents are available for an acute patient', () => {
    const acute = patient({ riskScore: 4, needs: { prescriber: true, therapy: false } })
    const r = assignCaseload([acute], [provider({ credential: 'prescriber', trainingLevel: 'resident', capacity: 3 })])
    expect(r.summary.placed).toBe(0)
    expect(r.unmatched[0].reason).toBe(UNMATCHED.SUPERVISION)
    expect(reasonLabel(UNMATCHED.SUPERVISION)).toMatch(/attending/i)
  })
})
