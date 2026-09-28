import { describe, it, expect } from 'vitest'
import {
  assignCaseload,
  isEligible,
  ineligibilityReason,
  reasonLabel,
  UNMATCHED,
  CREDENTIAL_ROLES,
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
