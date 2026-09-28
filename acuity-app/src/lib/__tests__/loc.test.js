import { describe, it, expect } from 'vitest'
import {
  DIMENSIONS,
  LEVELS,
  LEVEL_BY_ID,
  anchorsFor,
  normalizeScores,
  screenLevelOfCare,
  emptyScores,
  SAFETY_RULES,
} from '../loc.js'

// Helper: full score map with everything at `base`, overridden per key.
function scores(base, over = {}) {
  return { ...Object.fromEntries(DIMENSIONS.map((d) => [d, base])), ...over }
}

describe('anchors', () => {
  it('has 5 anchors for every dimension in both populations', () => {
    for (const pop of ['adult', 'adolescent']) {
      const a = anchorsFor(pop)
      for (const d of DIMENSIONS) {
        expect(a[d].anchors).toHaveLength(5)
        expect(a[d].label).toBeTruthy()
      }
    }
  })

  it('frames adolescent anchors through family/school', () => {
    const text = JSON.stringify(anchorsFor('adolescent'))
    expect(text).toMatch(/family|school|caregiver|youth/i)
  })

  it('falls back to adult anchors for an unknown population', () => {
    expect(anchorsFor('nonsense')).toBe(anchorsFor('adult'))
  })
})

describe('normalizeScores', () => {
  it('clamps out-of-range values into 1..5', () => {
    const n = normalizeScores({ risk: 9, function: 0, comorbidity: -3, stress: 3.4, support: 2, engagement: 'x' })
    expect(n.risk).toBe(5)
    expect(n.function).toBe(1)
    expect(n.comorbidity).toBe(1)
    expect(n.stress).toBe(3)
    expect(n.support).toBe(2)
    expect(n.engagement).toBe(1) // non-numeric → minimal
  })

  it('defaults missing dimensions to the minimum', () => {
    const n = normalizeScores({ risk: 4 })
    expect(n.function).toBe(1)
    expect(Object.keys(n).sort()).toEqual([...DIMENSIONS].sort())
  })
})

describe('composite → level mapping', () => {
  it('puts an all-minimal patient below outpatient', () => {
    const r = screenLevelOfCare(scores(1))
    expect(r.total).toBe(6)
    expect(r.level.id).toBe('self')
    expect(r.opClassification).toBe('below-outpatient')
    expect(r.opAppropriate).toBe(false)
  })

  it('recommends routine outpatient for mild-moderate presentation', () => {
    // total 12 → OP band, no safety floors (risk kept at 2)
    const r = screenLevelOfCare(scores(2))
    expect(r.total).toBe(12)
    expect(r.level.id).toBe('op')
    expect(r.opAppropriate).toBe(true)
    expect(r.flags).toHaveLength(0)
  })

  it('escalates monotonically as scores rise', () => {
    let prev = -1
    for (let base = 1; base <= 5; base++) {
      // hold risk low so the ladder reflects the composite, not the safety net
      const r = screenLevelOfCare(scores(base, { risk: Math.min(base, 3) }))
      expect(r.level.order).toBeGreaterThanOrEqual(prev)
      prev = r.level.order
    }
  })

  it('puts an all-severe patient at the top level', () => {
    const r = screenLevelOfCare(scores(5))
    expect(r.total).toBe(30)
    expect(r.level.id).toBe('inpatient')
    expect(r.opAppropriate).toBe(false)
    expect(r.opClassification).toBe('exceeds-outpatient')
  })

  it('classifies IOP as still within the outpatient continuum', () => {
    // total 15 → IOP band; keep risk at 3 so no floor jumps it
    const r = screenLevelOfCare(scores(3, { risk: 3, comorbidity: 2, stress: 2 }))
    expect(r.level.id === 'iop' || r.level.id === 'op').toBe(true)
    expect(r.opAppropriate).toBe(true)
  })
})

describe('safety net — the property that matters most', () => {
  it('sends an imminent-risk patient to inpatient even if everything else is minimal', () => {
    const r = screenLevelOfCare(scores(1, { risk: 5 }))
    // composite is low, but the floor overrides
    expect(r.compositeLevel.order).toBeLessThan(LEVEL_BY_ID.inpatient.order)
    expect(r.level.id).toBe('inpatient')
    expect(r.overridden).toBe(true)
    expect(r.flags.map((f) => f.id)).toContain('imminent-risk')
    expect(r.opAppropriate).toBe(false)
  })

  it('keeps an actively-at-risk patient out of routine outpatient', () => {
    const r = screenLevelOfCare(scores(1, { risk: 4 }))
    expect(r.level.order).toBeGreaterThanOrEqual(LEVEL_BY_ID.php.order)
    expect(r.opAppropriate).toBe(false)
    expect(r.flags.map((f) => f.id)).toContain('acute-risk')
  })

  it('requires a medically supervised level for an acute co-occurring crisis', () => {
    const r = screenLevelOfCare(scores(1, { comorbidity: 5 }))
    expect(r.level.order).toBeGreaterThanOrEqual(LEVEL_BY_ID.php.order)
    expect(r.flags.map((f) => f.id)).toContain('acute-comorbidity')
  })

  it('adds structure when the environment is unsafe', () => {
    const r = screenLevelOfCare(scores(1, { stress: 5 }))
    expect(r.level.order).toBeGreaterThanOrEqual(LEVEL_BY_ID.iop.order)
    expect(r.flags.map((f) => f.id)).toContain('unsafe-environment')
  })

  it('steps up an impaired, unsupported patient beyond routine OP', () => {
    const r = screenLevelOfCare(scores(1, { support: 5, function: 4 }))
    expect(r.level.order).toBeGreaterThanOrEqual(LEVEL_BY_ID.iop.order)
    expect(r.flags.map((f) => f.id)).toContain('isolated-and-impaired')
  })

  it('does not fire the isolation rule when the patient is supported', () => {
    const r = screenLevelOfCare(scores(1, { support: 2, function: 4 }))
    expect(r.flags.map((f) => f.id)).not.toContain('isolated-and-impaired')
  })

  it('never recommends below the composite band — floors only raise', () => {
    // High composite, low risk: safety net must not lower it.
    const r = screenLevelOfCare(scores(5, { risk: 1 }))
    expect(r.level.order).toBeGreaterThanOrEqual(r.compositeLevel.order)
    expect(r.overridden).toBe(false)
  })

  it('takes the most intensive floor when several fire', () => {
    const r = screenLevelOfCare(scores(1, { risk: 5, stress: 5, comorbidity: 5 }))
    expect(r.level.id).toBe('inpatient') // imminent-risk floor (5) wins
    expect(r.flags.length).toBeGreaterThanOrEqual(3)
  })
})

describe('glass-box output', () => {
  it('contributions cover every dimension and sum to the composite', () => {
    const r = screenLevelOfCare(scores(3, { risk: 2 }))
    expect(r.contributions).toHaveLength(DIMENSIONS.length)
    const sum = r.contributions.reduce((s, c) => s + c.score, 0)
    expect(sum).toBe(r.total)
  })

  it('orders contributions by severity so the drivers are on top', () => {
    const r = screenLevelOfCare(scores(2, { comorbidity: 5, stress: 4 }))
    expect(r.contributions[0].id).toBe('comorbidity')
    const orders = r.contributions.map((c) => c.score)
    expect(orders).toEqual([...orders].sort((a, b) => b - a))
  })

  it('weights sum to 1', () => {
    const r = screenLevelOfCare(scores(3))
    const w = r.contributions.reduce((s, c) => s + c.weight, 0)
    expect(w).toBeCloseTo(1, 9)
  })

  it('gives each contribution the anchor text for its score', () => {
    const r = screenLevelOfCare(scores(1, { risk: 4 }), { population: 'adult' })
    const risk = r.contributions.find((c) => c.id === 'risk')
    expect(risk.detail).toBe(anchorsFor('adult').risk.anchors[3])
  })
})

describe('populations', () => {
  it('threads the population through and scores identically for the same numbers', () => {
    const a = screenLevelOfCare(scores(3), { population: 'adult' })
    const b = screenLevelOfCare(scores(3), { population: 'adolescent' })
    expect(a.level.id).toBe(b.level.id)
    expect(b.population).toBe('adolescent')
    // but the shown anchor text differs
    const ra = a.contributions.find((c) => c.id === 'risk').detail
    const rb = b.contributions.find((c) => c.id === 'risk').detail
    expect(ra).not.toBe(rb)
  })
})

describe('level ladder integrity', () => {
  it('is strictly ordered and uniquely keyed', () => {
    const orders = LEVELS.map((l) => l.order)
    expect(orders).toEqual([0, 1, 2, 3, 4, 5])
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length)
  })

  it('emptyScores is a valid all-minimal screen', () => {
    const r = screenLevelOfCare(emptyScores())
    expect(r.total).toBe(6)
    expect(r.flags).toHaveLength(0)
  })

  it('every safety rule references a real floor level', () => {
    for (const rule of SAFETY_RULES) {
      expect(LEVELS.some((l) => l.order === rule.floor)).toBe(true)
      expect(rule.label).toBeTruthy()
    }
  })
})
