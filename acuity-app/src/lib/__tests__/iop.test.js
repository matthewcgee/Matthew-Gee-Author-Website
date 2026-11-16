import { describe, it, expect } from 'vitest'
import {
  screenIop, emptyIntake, matchTrack, programCensus, normalizeTracks, DEFAULT_IOP_TRACKS, daysWaiting, DISPOSITIONS,
} from '../iop.js'

// A typical IOP candidate: moderate need (composite 15 → IOP band), willing,
// covered, baseline PHQ-9 recorded.
const iopScores = { risk: 2, function: 3, comorbidity: 2, stress: 3, support: 2, engagement: 3 }
const candidate = (over = {}) => ({
  ...emptyIntake(),
  caseLabel: 'Case 101',
  referralDate: '2026-11-01',
  concerns: ['depression', 'anxiety'],
  scores: iopScores,
  phq9: 16,
  gad7: 12,
  ...over,
})
const T = { today: '2026-11-01T12:00:00' }

describe('AcuiStep disposition', () => {
  it('a moderate, willing, covered referral is eligible with every criterion met', () => {
    const r = screenIop(candidate(), T)
    expect(r.loc.total).toBe(15)
    expect(r.disposition).toBe('eligible')
    expect(r.criteriaMet).toBe(8)
    expect(r.findings.filter((f) => f.sev === 'stop' || f.sev === 'exclude' || f.sev === 'fix')).toHaveLength(0)
    expect(r.track.id).toBe('mood')
    expect(r.plan.hoursPerWeek).toBeGreaterThanOrEqual(9)
  })

  it('missing baseline PHQ-9 makes it conditional, with the fix named', () => {
    const r = screenIop(candidate({ phq9: '' }), T)
    expect(r.disposition).toBe('conditional')
    expect(r.findings.find((f) => f.id === 'phq9-missing').fix).toBe('Baseline PHQ-9')
  })

  it('every hard stop sends the referral up, regardless of a low composite', () => {
    const low = { risk: 1, function: 1, comorbidity: 1, stress: 1, support: 1, engagement: 1 }
    const cases = [
      [{ ideation: 'plan' }, 'inpatient'],
      [{ violence: 'imminent' }, 'inpatient'],
      [{ recentAttempt: true, safetyPlan: false }, 'php'],
      [{ mania: 'acute' }, 'inpatient'],
      [{ psychosis: 'active' }, 'php'],
      [{ substance: 'withdrawal' }, 'withdrawal'],
      [{ medical: 'unstable' }, 'inpatient'],
    ]
    for (const [over, level] of cases) {
      const r = screenIop(candidate({ scores: low, ...over }), T)
      expect(r.disposition, JSON.stringify(over)).toBe('higher')
      expect(r.higherLevel.id).toBe(level)
      expect(r.plan).toBeNull()
      expect(r.tasks.map((t) => t.id)).toContain('rescreen')
    }
  })

  it('the most intensive stop wins when several fire', () => {
    const r = screenIop(candidate({ psychosis: 'active', ideation: 'plan' }), T)
    expect(r.higherLevel.id).toBe('inpatient')
  })

  it('a recent attempt with a safety plan stays IOP-eligible, with weekly review', () => {
    const r = screenIop(candidate({ recentAttempt: true, safetyPlan: true }), T)
    expect(r.disposition).toBe('eligible')
    expect(r.findings.some((f) => f.id === 'attempt-plan')).toBe(true)
    expect(r.tasks.map((t) => t.id)).toContain('safety-plan')
    expect(r.targetStart.days).toBe(7)
  })

  it('active ideation without a safety plan is conditional on writing one', () => {
    const r = screenIop(candidate({ ideation: 'active', safetyPlan: false }), T)
    expect(r.disposition).toBe('conditional')
    expect(r.criteria.find((c) => c.id === 'safe').met).toBe(false)
  })

  it('composite in the PHP band steps up a new referral but not a step-down', () => {
    const php = { risk: 3, function: 4, comorbidity: 3, stress: 4, support: 3, engagement: 3 } // 20
    expect(screenIop(candidate({ scores: php, referralSource: 'outpatient' }), T).disposition).toBe('higher')
    const down = screenIop(candidate({ scores: php, referralSource: 'inpatient' }), T)
    expect(down.disposition).toBe('eligible')
    expect(down.findings.some((f) => f.id === 'intensity-php-stepdown')).toBe(true)
    expect(down.targetStart.days).toBe(7)
    expect(down.tasks.map((t) => t.id)).toContain('handoff')
  })

  it('low need is routed to routine outpatient, unless it is a step-down', () => {
    const low = { risk: 1, function: 2, comorbidity: 2, stress: 2, support: 2, engagement: 2 } // 11
    expect(screenIop(candidate({ scores: low }), T).disposition).toBe('lower')
    expect(screenIop(candidate({ scores: low, referralSource: 'php' }), T).disposition).toBe('eligible')
  })

  it('declining, or being unable to take part in groups, is an alternative, not a failure', () => {
    expect(screenIop(candidate({ willing: 'no' }), T).disposition).toBe('alternative')
    expect(screenIop(candidate({ cognition: 'unable' }), T).disposition).toBe('alternative')
  })

  it('logistics and coverage make it conditional, never change the clinical answer', () => {
    for (const over of [{ auth: 'pending' }, { auth: 'denied' }, { transport: 'help' }, { schedule: 'help' }, { willing: 'ambivalent' }, { cognition: 'limited' }]) {
      expect(screenIop(candidate(over), T).disposition, JSON.stringify(over)).toBe('conditional')
    }
  })

  it('cannot attend in person becomes conditional when a virtual track exists, an alternative when not', () => {
    expect(screenIop(candidate({ schedule: 'no', telehealthOk: true }), T).disposition).toBe('conditional')
    expect(screenIop(candidate({ schedule: 'no', telehealthOk: false }), T).disposition).toBe('alternative')
    const noVirtual = DEFAULT_IOP_TRACKS.map((t) => ({ ...t, telehealth: false }))
    expect(screenIop(candidate({ schedule: 'no', telehealthOk: true }), { ...T, tracks: noVirtual }).disposition).toBe('alternative')
  })

  it('Medicare adds the physician certification task', () => {
    const r = screenIop(candidate({ payer: 'medicare' }), T)
    expect(r.tasks.map((t) => t.id)).toContain('cert')
    expect(r.findings.some((f) => f.id === 'medicare')).toBe(true)
  })

  it('every disposition has a label and the summary names it', () => {
    const r = screenIop(candidate(), T)
    expect(Object.keys(DISPOSITIONS)).toContain(r.disposition)
    expect(r.summary).toContain('eligible for iop')
    expect(r.summary).toContain('Decision support only')
    expect(r.summary).not.toMatch(/undefined|null/)
  })

  it('target start is 14 days for routine referrals and 7 for step-downs or safety', () => {
    expect(screenIop(candidate(), T).targetStart).toMatchObject({ days: 14, date: '2026-11-15' })
    expect(screenIop(candidate({ ideation: 'passive' }), T).targetStart.days).toBe(7)
  })
})

describe('AcuiStep track matching', () => {
  const tracks = normalizeTracks()
  it('substance plus a psychiatric concern goes to co-occurring; substance alone to SUD', () => {
    expect(matchTrack({ ...emptyIntake(), concerns: ['substance', 'depression'] }, tracks).id).toBe('cod')
    expect(matchTrack({ ...emptyIntake(), concerns: ['substance'] }, tracks).id).toBe('sud')
  })
  it('self-harm and dysregulation go to DBT; trauma to trauma-focused', () => {
    expect(matchTrack({ ...emptyIntake(), concerns: ['dysregulation'], selfHarm: true }, tracks).id).toBe('dbt')
    expect(matchTrack({ ...emptyIntake(), concerns: ['trauma'] }, tracks).id).toBe('trauma')
  })
  it('adolescents only match adolescent tracks', () => {
    expect(matchTrack({ ...emptyIntake(), population: 'adolescent', concerns: ['substance'] }, tracks).id).toBe('adolescent')
  })
  it('a disabled track is never recommended', () => {
    const off = tracks.map((t) => (t.id === 'dbt' ? { ...t, enabled: false } : t))
    expect(matchTrack({ ...emptyIntake(), concerns: ['dysregulation'] }, off).id).not.toBe('dbt')
  })
  it('the adolescent plan includes family work', () => {
    const r = screenIop(candidate({ population: 'adolescent' }), T)
    expect(r.track.id).toBe('adolescent')
    expect(r.plan.components.join(' ')).toMatch(/family/i)
    expect(r.tasks.map((t) => t.id)).toContain('family')
  })
})

describe('AcuiStep program census', () => {
  it('counts admitted, scheduled and waiting per track against capacity', () => {
    const intakes = [
      { trackId: 'mood', status: 'admitted' }, { trackId: 'mood', status: 'admitted' },
      { trackId: 'mood', status: 'scheduled' }, { trackId: 'mood', status: 'pending' },
      { trackId: 'sud', status: 'referred' },
    ]
    const c = programCensus(intakes)
    const mood = c.find((x) => x.track.id === 'mood')
    expect(mood).toMatchObject({ admitted: 2, scheduled: 1, waiting: 1, open: 9, capacity: 12 })
    expect(c.find((x) => x.track.id === 'sud').admitted).toBe(0)
  })
  it('days waiting counts from the referral date', () => {
    expect(daysWaiting({ referralDate: '2026-11-01' }, new Date('2026-11-08T12:00:00'))).toBe(7)
  })
})
