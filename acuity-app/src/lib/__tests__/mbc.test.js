import { describe, it, expect } from 'vitest'
import { INSTRUMENTS, scoreAssessment, severityOf, instrumentTrend, rescreenTriggers, caseloadMbc } from '../mbc.js'

const phq = (date, items) => ({ patientId: 'p1', instrument: 'PHQ-9', date, items, ...scoreAssessment('PHQ-9', items) })
const gad = (date, items) => ({ patientId: 'p1', instrument: 'GAD-7', date, items, ...scoreAssessment('GAD-7', items) })
const fill = (n, v) => Array.from({ length: n }, () => v)

describe('scoring', () => {
  it('has the published item counts', () => {
    expect(INSTRUMENTS['PHQ-9'].items).toHaveLength(9)
    expect(INSTRUMENTS['GAD-7'].items).toHaveLength(7)
  })

  it('sums items and assigns the published severity bands', () => {
    expect(scoreAssessment('PHQ-9', fill(9, 0)).severity.id).toBe('minimal')
    expect(severityOf('PHQ-9', 9).id).toBe('mild')
    expect(severityOf('PHQ-9', 10).id).toBe('moderate')
    expect(severityOf('PHQ-9', 15).id).toBe('moderately-severe')
    expect(severityOf('PHQ-9', 20).id).toBe('severe')
    expect(severityOf('GAD-7', 15).id).toBe('severe')
    expect(scoreAssessment('GAD-7', fill(7, 3)).total).toBe(21)
  })

  it('refuses to score an incomplete or out-of-range sheet', () => {
    expect(scoreAssessment('PHQ-9', fill(8, 1)).complete).toBe(false)
    expect(scoreAssessment('PHQ-9', [...fill(8, 1), 4]).total).toBeNull()
  })

  it('flags any positive answer on PHQ-9 item 9', () => {
    expect(scoreAssessment('PHQ-9', [...fill(8, 0), 1]).selfHarmFlag).toBe(true)
    expect(scoreAssessment('PHQ-9', fill(9, 1).map((v, i) => (i === 8 ? 0 : v))).selfHarmFlag).toBe(false)
  })
})

describe('trends', () => {
  it('detects response and remission from a meaningful baseline', () => {
    const t = instrumentTrend([phq('2026-01-01', fill(9, 2)), phq('2026-02-01', [1, 1, 0, 0, 0, 0, 0, 0, 0])], 'PHQ-9')
    expect(t.baseline.total).toBe(18)
    expect(t.latest.total).toBe(2)
    expect(t.response).toBe(true)
    expect(t.remission).toBe(true)
    expect(t.worsening).toBe(false)
  })

  it('detects meaningful worsening against the previous measure', () => {
    const t = instrumentTrend([phq('2026-01-01', fill(9, 1)), phq('2026-02-01', [2, 2, 2, 2, 2, 1, 1, 2, 0])], 'PHQ-9')
    expect(t.changeFromPrevious).toBe(5)
    expect(t.worsening).toBe(true)
  })

  it('returns null with no scores', () => {
    expect(instrumentTrend([], 'GAD-7')).toBeNull()
  })
})

describe('re-screen triggers', () => {
  it('puts a self-harm flag first, as urgent', () => {
    const list = [phq('2026-01-01', fill(9, 1)), phq('2026-02-01', [2, 2, 2, 2, 2, 1, 1, 2, 1])]
    const t = rescreenTriggers(list, { asOf: '2026-02-02' })
    expect(t[0].id).toBe('self-harm')
    expect(t[0].severity).toBe('urgent')
    expect(t.map((x) => x.id)).toContain('worse-PHQ-9')
  })

  it('asks for a baseline when nothing is on file, and a repeat when the last measure is stale', () => {
    expect(rescreenTriggers([], { asOf: '2026-02-01' })[0].id).toBe('no-baseline')
    const t = rescreenTriggers([gad('2026-01-01', fill(7, 1))], { asOf: '2026-03-15', staleDays: 30 })
    expect(t.map((x) => x.id)).toContain('stale')
  })

  it('flags a severe score even without a prior measure', () => {
    const t = rescreenTriggers([gad('2026-03-01', fill(7, 3))], { asOf: '2026-03-02' })
    expect(t.map((x) => x.id)).toContain('severe-GAD-7')
  })

  it('orders a caseload most urgent first', () => {
    const patients = [{ id: 'calm', name: 'A' }, { id: 'p1', name: 'B' }]
    const assessments = [
      { ...phq('2026-03-01', [...fill(8, 0), 2]) },
      { ...phq('2026-03-01', fill(9, 0)), patientId: 'calm' },
    ]
    const rows = caseloadMbc(patients, assessments, { asOf: '2026-03-02' })
    expect(rows[0].patient.id).toBe('p1')
    expect(rows[0].top).toBe('urgent')
    expect(rows[1].triggers).toEqual([])
  })
})
