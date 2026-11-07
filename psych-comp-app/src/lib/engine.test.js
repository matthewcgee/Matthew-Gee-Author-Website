import { describe, it, expect } from 'vitest'
import { compute, buildPool, eligibleFraction, blankFaculty, DEFAULT_SETTINGS, DEFAULT_FUNDS, DEFAULT_CONTROLS } from './engine.js'

const base = (over = {}) => ({
  settings: { ...DEFAULT_SETTINGS, ...(over.settings || {}) },
  funds: { ...DEFAULT_FUNDS, ...(over.funds || {}) },
  controls: { ...DEFAULT_CONTROLS, planApproved: true, aprCapConfirmed: true, financeConfirmed: true, ...(over.controls || {}) },
  faculty: over.faculty || [],
  payments: over.payments || [],
  period: over.period || 'Stub',
  bench: over.bench || null,
})
const fac = (id, o) => ({ ...blankFaculty(id), academicGoals: 4, committee: true, ...o })
const byId = (r, id) => r.people.find((p) => p.f.id === id)

describe('Example 1 — six-month salary proration', () => {
  it('prorates opportunity, guaranteed and variable pay', () => {
    const r = compute(base({ funds: { budgetedResidual: 0 }, faculty: [fac('A', { annualClinicalSalary: 300000, annualTarget: 6000 })] }))
    const a = byId(r, 'A')
    expect(a.opp).toBe(150000)
    expect(a.guaranteed).toBe(127500)
    expect(a.variableBudget).toBe(22500)
  })
  it('three months of eligible service halves the stub opportunity', () => {
    expect(eligibleFraction('2027-04-01', '', 'Stub')).toBe(0.5)
    const r = compute(base({ faculty: [fac('A', { annualClinicalSalary: 300000, startDate: '2027-04-01' })] }))
    expect(byId(r, 'A').opp).toBe(75000)
  })
})

describe('Example 2 & 9 — net distributable pool', () => {
  const funds = { budgetedResidual: 100000, aboveBudget: 50000, rampUpSupport: 20000, psa: 5000, academicReserve: 5000, ccfActual: 100000, cfOpening: 50000 }
  it('builds the $100,000 pool and refills carryforward to $80,000', () => {
    const p = buildPool(DEFAULT_SETTINGS, { ...DEFAULT_FUNDS, ...funds }, DEFAULT_CONTROLS, 'Stub')
    expect(p.pool).toBe(100000)
    expect(p.carryforward.refill).toBe(30000)
    expect(p.carryforward.ending).toBe(80000)
    expect(p.checks.some((c) => c.level === 'hold')).toBe(false)
  })
  it('deducts approved moonlighting from budgeted funds first → $80,000', () => {
    const p = buildPool(DEFAULT_SETTINGS, { ...DEFAULT_FUNDS, ...funds, moonlighting: 20000 }, { ...DEFAULT_CONTROLS, moonlightingApproved: true }, 'Stub')
    expect(p.pool).toBe(80000)
    expect(p.carryforward.refill).toBe(30000)
  })
  it('does not deduct unapproved moonlighting', () => {
    const p = buildPool(DEFAULT_SETTINGS, { ...DEFAULT_FUNDS, ...funds, moonlighting: 20000 }, DEFAULT_CONTROLS, 'Stub')
    expect(p.pool).toBe(100000)
  })
  it('flags a reserve over 5%', () => {
    const p = buildPool(DEFAULT_SETTINGS, { ...DEFAULT_FUNDS, ...funds, ccfActual: 50000 }, DEFAULT_CONTROLS, 'Stub')
    expect(p.checks.some((c) => c.level === 'hold')).toBe(true)
  })
})

const ex4 = () =>
  base({
    funds: { budgetedResidual: 100000 },
    faculty: [
      fac('A', { annualTarget: 6000, wrvuStub: 3300 }),
      fac('B', { annualTarget: 6000, wrvuStub: 3700 }),
      fac('C', { annualTarget: 6000, wrvuStub: 3000 }),
    ],
  })

describe('Examples 3 & 4 — allocate a $100,000 pool', () => {
  it('splits 40/40/15/5 and computes the individual award', () => {
    const r = compute(ex4())
    expect(r.comp).toEqual({ c1: 40000, c2: 40000, acad: 15000, cit: 5000 })
    const a = byId(r, 'A')
    expect(a.attain).toBeCloseTo(1.1)
    expect(a.earned.c1).toBe(13333.33)
    expect(a.earned.c2).toBe(12000)
    expect(a.earned.acad).toBe(5000)
    expect(a.earned.cit).toBe(1666.66)
    expect(a.earned.total).toBe(31999.99)
  })
})

describe('Example 5 — academic per-recipient cap', () => {
  it('caps each award at 5% of the academic pool when < 80% qualify', () => {
    const s = ex4()
    s.faculty[2].academicGoals = 2
    const r = compute(s)
    expect(r.academic.rate).toBeCloseTo(2 / 3)
    expect(byId(r, 'A').earned.acad).toBe(750)
    expect(byId(r, 'C').earned.acad).toBe(0)
  })
})

describe('Example 6 — actual nonclinical limit', () => {
  it('scales nonclinical awards to one-third of actual clinical', () => {
    const r = compute(base({ funds: { budgetedResidual: 100000 }, faculty: [fac('A', { annualTarget: 6000, wrvuStub: 3000 })] }))
    const a = byId(r, 'A')
    expect(a.earned.c1).toBe(40000)
    expect(a.earned.c2).toBe(0)
    expect(a.earned.acad).toBe(10000)
    expect(a.earned.cit).toBe(3333.33)
    expect(a.earned.total).toBe(53333.33)
  })
})

describe('Example 7 — reconcile prior quarterly payments', () => {
  it('credits each component and leaves $21,499.99', () => {
    const s = ex4()
    s.payments = [{ id: 'p1', facultyId: 'A', pool: 'Regular', period: 'Q1', c1: 5000, c2: 4000, acad: 500, cit: 1000 }]
    const r = compute(s)
    const a = byId(r, 'A')
    expect(a.balance.total).toBe(21499.99)
    expect(a.status).toBe('Ready for payroll')
  })
  it('holds release when a component is overpaid', () => {
    const s = ex4()
    s.payments = [{ id: 'p1', facultyId: 'A', pool: 'Regular', period: 'Q1', c1: 20000 }]
    const a = byId(compute(s), 'A')
    expect(a.overpaid).toEqual(['c1'])
    expect(a.status).toBe('Hold for review')
    expect(a.release.total).toBe(0)
  })
  it('does not credit Quality payments against the regular pool', () => {
    const s = ex4()
    s.payments = [{ id: 'p1', facultyId: 'A', pool: 'Quality', period: 'Quality', c1: 5000 }]
    expect(byId(compute(s), 'A').prior.total).toBe(0)
  })
})

describe('Example 8 — eligibility', () => {
  it('applies category, guarantee, floor and APR rules', () => {
    const r = compute(
      base({
        funds: { budgetedResidual: 100000 },
        faculty: [
          fac('low', { annualTarget: 6000, wrvuStub: 2800 }),
          fac('guar', { annualTarget: 6000, wrvuStub: 3500, guarantee: true }),
          fac('phd', { category: 'PhD', annualTarget: 6000, wrvuStub: 3500 }),
          fac('np', { category: 'NonPrimary', annualTarget: 6000, wrvuStub: 3500 }),
          fac('new', { annualTarget: 6000, wrvuStub: 3000, priorAPR: false }),
        ],
      }),
    )
    const low = byId(r, 'low')
    expect(low.earned.total).toBe(0)
    const g = byId(r, 'guar')
    expect(g.earned.c1).toBe(0)
    expect(g.earned.c2).toBeGreaterThan(0)
    const phd = byId(r, 'phd')
    expect(phd.earned.c1).toBe(0)
    expect(phd.earned.cit).toBe(0)
    expect(phd.earned.acad).toBeGreaterThan(0)
    const np = byId(r, 'np')
    expect(np.earned.c2).toBeGreaterThan(0)
    expect(np.earned.acad + np.earned.cit + np.earned.c1).toBe(0)
    expect(byId(r, 'new').earned.acad).toBe(0)
  })
})

describe('Pay limits and equal-share redistribution (four-physician example)', () => {
  it('withholds equal shares and redistributes to C and D', () => {
    const settings = { weights: { c1: 1, c2: 0, acad: 0, cit: 0 } }
    const mk = (id, w, other, limit) => fac(id, { annualTarget: 5400, wrvuStub: w, otherCashOverride: other, payLimitOverride: limit, academicGoals: 0, committee: false })
    const faculty = [mk('A', 2600, 170000, 175000), mk('B', 2700, 166000, 175000), mk('C', 3300, 170000, 190000), mk('D', 3100, 170000, 190000)]
    for (let i = 0; i < 6; i++) faculty.push(mk('O' + i, 2700, 100000, 175000))
    const r = compute(base({ settings, funds: { budgetedResidual: 120000 }, faculty }))
    expect(byId(r, 'O0').init.c1).toBe(12000)
    expect(byId(r, 'A').earned.c1).toBe(5000)
    expect(byId(r, 'B').earned.c1).toBe(9000)
    expect(byId(r, 'C').earned.redist).toBe(6000)
    expect(byId(r, 'D').earned.redist).toBe(4000)
    expect(byId(r, 'C').periodCash).toBe(188000)
    expect(byId(r, 'D').periodCash).toBe(186000)
    expect(r.redistLeftover).toBeLessThan(0.01)
  })
})

describe('Controls', () => {
  it('nothing is ready for payroll until plan approvals are recorded', () => {
    const s = ex4()
    s.controls.planApproved = false
    const r = compute(s)
    expect(r.controlsOK).toBe(false)
    expect(r.totals.release).toBe(0)
  })
  it('Q1 uses a quarter-year target and Q1 wRVUs', () => {
    const r = compute(base({ period: 'Q1', faculty: [fac('A', { annualTarget: 6000, wrvuQ1: 1600 })] }))
    expect(byId(r, 'A').T).toBe(1500)
    expect(byId(r, 'A').W).toBe(1600)
  })
})
