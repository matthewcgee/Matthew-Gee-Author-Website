import { describe, it, expect } from 'vitest'
import { fuhStatus, fuhRates, fuhWorklist, dischargeToOpPatient, FUH_STATUS } from '../fuh.js'
import { assignCaseload } from '../opmatch.js'

const D = (id, dischargeDate, extra = {}) => ({ id, caseLabel: `Case ${id}`, dischargeDate, ...extra })

describe('follow-up status for one discharge', () => {
  it('counts a visit on days 1–7 toward the 7-day window', () => {
    expect(fuhStatus(D('a', '2026-03-01', { followUpCompleted: '2026-03-08' }), '2026-03-20').status).toBe(FUH_STATUS.MET_7)
  })

  it('counts a day 8–30 visit toward the 30-day window only', () => {
    expect(fuhStatus(D('a', '2026-03-01', { followUpCompleted: '2026-03-09' }), '2026-03-20').status).toBe(FUH_STATUS.MET_30)
  })

  it('does not count a visit on the discharge day itself unless configured to', () => {
    const d = D('a', '2026-03-01', { followUpCompleted: '2026-03-01' })
    expect(fuhStatus(d, '2026-03-03').status).toBe(FUH_STATUS.OPEN_7)
    expect(fuhStatus(d, '2026-03-03', { sameDayCounts: true }).status).toBe(FUH_STATUS.MET_7)
  })

  it('moves through open, missed-7, and missed as time passes without a visit', () => {
    const d = D('a', '2026-03-01')
    expect(fuhStatus(d, '2026-03-05').status).toBe(FUH_STATUS.OPEN_7)
    expect(fuhStatus(d, '2026-03-05').daysLeft7).toBe(3)
    expect(fuhStatus(d, '2026-03-12').status).toBe(FUH_STATUS.MISSED_7_OPEN_30)
    expect(fuhStatus(d, '2026-04-05').status).toBe(FUH_STATUS.MISSED)
  })

  it('honors exclusions', () => {
    expect(fuhStatus(D('a', '2026-03-01', { excluded: true }), '2026-04-30').status).toBe(FUH_STATUS.EXCLUDED)
  })

  it('knows whether a scheduled visit lands inside the 7-day window', () => {
    expect(fuhStatus(D('a', '2026-03-01', { followUpScheduled: '2026-03-06' }), '2026-03-02').scheduledInside7).toBe(true)
    expect(fuhStatus(D('a', '2026-03-01', { followUpScheduled: '2026-03-12' }), '2026-03-02').scheduledInside7).toBe(false)
  })
})

describe('FUH-7 and FUH-30 rates', () => {
  const asOf = '2026-05-01'
  const discharges = [
    D('a', '2026-03-01', { followUpCompleted: '2026-03-04' }), // met 7
    D('b', '2026-03-01', { followUpCompleted: '2026-03-20' }), // met 30 only
    D('c', '2026-03-01'),                                       // missed
    D('d', '2026-03-01', { excluded: true }),                   // excluded
    D('e', '2026-04-29'),                                       // window still open → not in either denominator
  ]

  it('includes only closed windows and drops exclusions', () => {
    const r = fuhRates(discharges, asOf)
    expect(r.fuh7.denominator).toBe(3)
    expect(r.fuh7.numerator).toBe(1)
    expect(r.fuh30.denominator).toBe(3)
    expect(r.fuh30.numerator).toBe(2)
    expect(r.excluded).toBe(1)
    expect(r.open7).toBe(1)
  })

  it('returns null rates rather than zero when no window has closed', () => {
    const r = fuhRates([D('x', '2026-04-30')], asOf)
    expect(r.fuh7.rate).toBeNull()
    expect(r.fuh30.rate).toBeNull()
  })
})

describe('follow-up worklist', () => {
  it('puts unscheduled 7-day cases first, soonest deadline first, then late-scheduled, then missed-7', () => {
    const asOf = '2026-03-10'
    const list = fuhWorklist([
      D('late', '2026-03-05', { followUpScheduled: '2026-03-20' }), // open 7, scheduled outside
      D('soon', '2026-03-04'),                                      // open 7, 1 day left, unscheduled
      D('fresh', '2026-03-09'),                                     // open 7, 6 days left, unscheduled
      D('missed', '2026-03-01'),                                    // missed 7, open 30
      D('done', '2026-03-05', { followUpCompleted: '2026-03-07' }),  // met → not on list
    ], asOf)
    expect(list.map((r) => r.discharge.id)).toEqual(['soon', 'fresh', 'late', 'missed'])
    expect(list[0].action).toMatch(/Not scheduled/)
    expect(list[2].action).toMatch(/move inside 7 days/)
  })
})

describe('bridging a discharge into AcuiPath', () => {
  it('creates a routable post-discharge case, attending-led when marked complex', () => {
    const p = dischargeToOpPatient(D('a', '2026-03-01', { complex: true, program: 'Medication management' }))
    expect(p.bridge).toBe(true)
    expect(p.tier).toBe('bridge')
    expect(p.requiresAttending).toBe(true)
    expect(p.routableOutpatient).toBe(true)
    expect(p.program).toBe('Medication management')
  })

  it('is placed ahead of routine referrals when capacity is scarce', () => {
    const routine = { id: 'r', name: 'R', population: 'adult', level: 'op', routableOutpatient: true, riskScore: 2, needs: { therapy: true }, specialties: [], urgencyDays: 40 }
    const bridge = dischargeToOpPatient(D('b', '2026-03-01'), { id: 'b' })
    bridge.needs = { therapy: true }
    const providers = [{ id: 'p1', name: 'P', credential: 'therapist', population: 'adult', specialties: [], telehealth: true, capacity: 1 }]
    const res = assignCaseload([routine, bridge], providers)
    expect(res.assignments).toHaveLength(1)
    expect(res.assignments[0].patientId).toBe('b')
  })
})
