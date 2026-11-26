import { describe, it, expect } from 'vitest'
import {
  ADULT_ACUITY_CRITERIA, DEFAULT_THRESHOLDS, computeEntryValue, entryStage, staffNeededForThresholds,
  availableStaff, oneToOneCount,
} from '../model.js'
import { INSTRUMENT_VERSION, activeCalibration, calibrationState, stampEntry, withLegacyStamps } from '../calibration.js'
import { unitRisk } from '../optimize.js'
import { decomposeUai } from '../risk.js'

// AcuiCalc™ instrument 2: each patient on 1:1 takes one staff member out of
// the count, and routine observation is not scored.
const UNIT = { id: 'u1', name: 'Reference unit', type: 'inpatient' }
const ED = { id: 'ed', name: 'ED', type: 'ed' }
const th = DEFAULT_THRESHOLDS
const stage = (points, staff, oneToOne = 0) => entryStage({ points, staff, oneToOne }, UNIT, th)

describe('a 1:1 takes one staff member', () => {
  it('divides by staff on shift minus patients on 1:1', () => {
    expect(computeEntryValue({ points: 10, staff: 4, oneToOne: 2 }, UNIT)).toBe(5)
    expect(computeEntryValue({ points: 5, staff: 4, oneToOne: 1 }, UNIT)).toBeCloseTo(5 / 3)
  })

  it('reads shifts saved without a 1:1 count exactly as before', () => {
    expect(computeEntryValue({ points: 10, staff: 4 }, UNIT)).toBe(2.5)
    expect(computeEntryValue({ points: 10, staff: 4, oneToOne: 0 }, UNIT)).toBe(2.5)
  })

  it('never divides by less than one staff member', () => {
    expect(availableStaff(2, 3)).toBe(1)
    expect(computeEntryValue({ points: 15, staff: 2, oneToOne: 3 }, UNIT)).toBe(15)
    expect(stage(15, 2, 3)).toBe('RED')
    expect(availableStaff(0, 0)).toBe(0)
  })

  it('ignores the count on ED shifts and junk values', () => {
    expect(computeEntryValue({ points: 30, oneToOne: 3 }, ED)).toBe(30)
    expect(oneToOneCount({ oneToOne: -2 })).toBe(0)
    expect(oneToOneCount({ oneToOne: '2' })).toBe(2)
    expect(oneToOneCount({ oneToOne: 1.7 })).toBe(1)
  })

  it('scores the reference unit (census 18, 4–5 staff) as the cutoff standard states', () => {
    const rows = [
      // [shift, points, 1:1s, zone with 4 staff, zone with 5 staff]
      ['two patients on detox', 4, 0, 'GREEN', 'GREEN'],
      ['one 1:1', 5, 1, 'YELLOW', 'GREEN'],
      ['one 1:1 + one restraint', 9, 1, 'RED', 'YELLOW'],
      ['two 1:1s', 10, 2, 'RED', 'RED'],
      ['two 1:1s + an aggression', 14, 2, 'RED', 'RED'],
      ['routine Q15 for everyone (not scored)', 0, 0, 'GREEN', 'GREEN'],
    ]
    for (const [name, points, n, z4, z5] of rows) {
      expect([name, stage(points, 4, n), stage(points, 5, n)]).toEqual([name, z4, z5])
    }
  })

  it('counts the staff needed with 1:1 staff already committed', () => {
    // 10 points, 4 staff, 2 on 1:1: 2 free. GREEN needs 10 / 1.5 = 6.67 free, so 5 more.
    const need = staffNeededForThresholds({ points: 10, staff: 4, oneToOne: 2 }, UNIT, th)
    expect(need.stage).toBe('RED')
    expect(need.toGreen).toBe(5)
    expect(need.toYellow).toBe(2)
  })

  it('applies the same rule in the optimizer and the risk breakdown', () => {
    expect(unitRisk({ points: 10, staff: 4, th: th.inpatient, reserved: 2 }).uai).toBe(5)
    expect(unitRisk({ points: 10, staff: 4, th: th.inpatient }).uai).toBe(2.5)
    const d = decomposeUai({ points: 10, staff: 4, oneToOne: 2 }, { points: 10, staff: 5, oneToOne: 2 })
    expect(d.from).toBe(5)
    expect(d.to).toBeCloseTo(10 / 3)
  })
})

describe('routine observation is not scored', () => {
  it('defines Q15 as observation above the unit\'s routine level', () => {
    const obs = ADULT_ACUITY_CRITERIA.find((g) => g.group === 'Observation Status')
    expect(obs.items.find((i) => i.id === 'obs_q15').label).toMatch(/above the unit's routine level/)
    expect(obs.note).toMatch(/routine Q15\) are not scored/)
    expect(obs.items.find((i) => i.id === 'obs_q15').points).toBe(3)
  })
})

describe('instrument version', () => {
  it('stamps every new shift with instrument 2', () => {
    expect(INSTRUMENT_VERSION).toBe(2)
    const e = stampEntry({ id: 'a', locId: 'u1', points: 5, staff: 4, oneToOne: 1 }, UNIT, activeCalibration(calibrationState(null)))
    expect(e.instrumentVersion).toBe(2)
  })

  it('marks shifts saved before the change as instrument 1', () => {
    const [e] = withLegacyStamps([{ id: 'b', locId: 'u1', points: 5, staff: 4 }], [UNIT], activeCalibration(calibrationState(null)))
    expect(e.instrumentVersion).toBe(1)
  })
})
