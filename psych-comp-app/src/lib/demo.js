// Hypothetical demo data built from the plan's own worked examples.
// No real faculty, salary or production figures.
import { DEFAULT_SETTINGS, DEFAULT_FUNDS, DEFAULT_CONTROLS, blankFaculty } from './engine.js'

export function demoState() {
  const f = (id, o) => ({ ...blankFaculty(id), academicGoals: 4, committee: true, ...o })
  return {
    period: 'Stub',
    settings: { ...DEFAULT_SETTINGS, baseTargetPerCFTE: 5400 },
    funds: { ...DEFAULT_FUNDS, budgetedResidual: 100000, aboveBudget: 50000, rampUpSupport: 20000, psa: 5000, academicReserve: 5000, ccfActual: 2400000, cfOpening: 50000 },
    controls: { ...DEFAULT_CONTROLS, planApproved: true, aprCapConfirmed: true, financeConfirmed: true },
    faculty: [
      f('F001', { name: 'Physician A', rank: 'Associate Professor', annualClinicalSalary: 300000, clinicalFTE: 1, wrvuQ1: 1500, wrvuStub: 3300, comparable2026: 320000 }),
      f('F002', { name: 'Physician B', rank: 'Professor', annualClinicalSalary: 330000, clinicalFTE: 1, wrvuQ1: 1800, wrvuStub: 3600 }),
      f('F003', { name: 'Physician C', rank: 'Assistant Professor', annualClinicalSalary: 275000, clinicalFTE: 0.8, wrvuQ1: 1050, wrvuStub: 2160 }),
      f('F004', { name: 'Physician D', rank: 'Assistant Professor', annualClinicalSalary: 270000, clinicalFTE: 1, wrvuQ1: 1250, wrvuStub: 2450, committee: false }),
      f('F005', { name: 'Physician E', rank: 'Associate Professor', annualClinicalSalary: 290000, clinicalFTE: 0.55, guarantee: true, wrvuQ1: 800, wrvuStub: 1650 }),
      f('F006', { name: 'Physician F (new)', rank: 'Assistant Professor', annualClinicalSalary: 265000, startDate: '2027-04-01', priorAPR: false, academicGoals: 0, wrvuQ1: 0, wrvuStub: 1400 }),
      f('F007', { name: 'Psychologist G', category: 'PhD', rank: 'Associate Professor', annualClinicalSalary: 150000, annualTarget: 2600, wrvuQ1: 700, wrvuStub: 1450, committee: false }),
      f('F008', { name: 'Faculty H (non-primary)', category: 'NonPrimary', rank: 'Assistant Professor', annualClinicalSalary: 120000, clinicalFTE: 0.3, priorAPR: false, academicGoals: 0, committee: false, wrvuQ1: 450, wrvuStub: 950 }),
    ],
    payments: [
      { id: 'L001', facultyId: 'F001', pool: 'Regular', period: 'Q1', payDate: '2027-05-15', c1: 5000, c2: 4000, redist: 0, acad: 500, cit: 1000 },
      { id: 'L002', facultyId: 'F002', pool: 'Regular', period: 'Q1', payDate: '2027-05-15', c1: 5000, c2: 9000, redist: 0, acad: 500, cit: 250 },
    ],
  }
}
