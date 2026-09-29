import { describe, it, expect } from 'vitest'
import { DEFAULT_TIER1_TRIGGERS, evaluateTier1, directPlacementDefaults } from '../tier1.js'

describe('Tier 1 chart-review triage', () => {
  it('has a non-empty default trigger list with ids and labels', () => {
    expect(DEFAULT_TIER1_TRIGGERS.length).toBeGreaterThan(5)
    for (const t of DEFAULT_TIER1_TRIGGERS) {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
    }
    expect(new Set(DEFAULT_TIER1_TRIGGERS.map((t) => t.id)).size).toBe(DEFAULT_TIER1_TRIGGERS.length)
  })

  it('escalates when any red flag is present', () => {
    const r = evaluateTier1(['substance'])
    expect(r.escalate).toBe(true)
    expect(r.disposition).toBe('escalate')
    expect(r.triggered.map((t) => t.id)).toEqual(['substance'])
    expect(r.count).toBe(1)
  })

  it('allows a direct placement only on a completely clean review', () => {
    const r = evaluateTier1([])
    expect(r.escalate).toBe(false)
    expect(r.disposition).toBe('direct')
    expect(r.triggered).toEqual([])
  })

  it('lists every triggered flag, not just the first', () => {
    const r = evaluateTier1(['risk', 'substance', 'forensic'])
    expect(r.count).toBe(3)
    expect(r.triggered.map((t) => t.id).sort()).toEqual(['forensic', 'risk', 'substance'])
  })

  it('ignores unknown ids', () => {
    const r = evaluateTier1(['not-a-real-trigger'])
    expect(r.escalate).toBe(false)
    expect(r.disposition).toBe('direct')
  })

  it('works with a customized trigger list', () => {
    const custom = [{ id: 'x', label: 'Custom flag' }]
    expect(evaluateTier1(['x'], custom).escalate).toBe(true)
    expect(evaluateTier1(['risk'], custom).escalate).toBe(false) // 'risk' not in custom list
  })

  it('direct placement defaults are resident-eligible, routine outpatient', () => {
    const d = directPlacementDefaults()
    expect(d.requiresAttending).toBe(false)
    expect(d.routableOutpatient).toBe(true)
    expect(d.tier).toBe('1-direct')
  })
})
