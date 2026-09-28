import { describe, it, expect } from 'vitest'
import {
  SYMPTOMS,
  CONCEPTS,
  matchProgram,
  recommendProgram,
} from '../programs.js'

const PROGRAMS = ['Therapy only', 'Medication management', 'Neuromodulation', 'Substance use program', 'Eating disorders program']

describe('symptom catalog', () => {
  it('every symptom points at a defined concept', () => {
    for (const s of SYMPTOMS) {
      expect(CONCEPTS[s.concept]).toBeTruthy()
      expect(s.label).toBeTruthy()
    }
  })
})

describe('matchProgram', () => {
  it('matches a concept to a configured program by keyword', () => {
    expect(matchProgram('neuromodulation', PROGRAMS)).toBe('Neuromodulation')
    expect(matchProgram('substance', PROGRAMS)).toBe('Substance use program')
    expect(matchProgram('eating', PROGRAMS)).toBe('Eating disorders program')
    expect(matchProgram('therapy', PROGRAMS)).toBe('Therapy only')
  })

  it('matches renamed clinics by keyword, not exact string', () => {
    expect(matchProgram('neuromodulation', ['TMS / ECT Clinic'])).toBe('TMS / ECT Clinic')
    expect(matchProgram('neuromodulation', ['Interventional Psychiatry'])).toBe('Interventional Psychiatry')
    expect(matchProgram('substance', ['Dual Diagnosis Track'])).toBe('Dual Diagnosis Track')
  })

  it('returns null when no configured program fits the concept', () => {
    expect(matchProgram('neuromodulation', ['Therapy only'])).toBeNull()
    expect(matchProgram('nonsense', PROGRAMS)).toBeNull()
  })
})

describe('recommendProgram from symptoms', () => {
  it('recommends neuromodulation for treatment-resistant depression', () => {
    const r = recommendProgram({ symptoms: ['trd'], programs: PROGRAMS })
    expect(r.concept).toBe('neuromodulation')
    expect(r.program).toBe('Neuromodulation')
    expect(r.matched).toBe(true)
    expect(r.rationale).toContain('Treatment-resistant depression (≥2 failed adequate trials)')
    expect(r.prescriberHint).toBe(true)
    expect(r.source).toBe('symptoms')
  })

  it('routes disordered eating to the eating program', () => {
    const r = recommendProgram({ symptoms: ['eating'], programs: PROGRAMS })
    expect(r.concept).toBe('eating')
    expect(r.program).toBe('Eating disorders program')
  })

  it('routes active substance use to the substance program', () => {
    const r = recommendProgram({ symptoms: ['substance'], programs: PROGRAMS })
    expect(r.program).toBe('Substance use program')
  })

  it('sends plain depression/anxiety to therapy', () => {
    const r = recommendProgram({ symptoms: ['depression', 'anxiety'], programs: PROGRAMS })
    expect(r.concept).toBe('therapy')
    expect(r.program).toBe('Therapy only')
  })

  it('lets the most specialized concept win when several are present', () => {
    // depression (therapy 20) + substance (65) + TRD (neuromodulation 90)
    const r = recommendProgram({ symptoms: ['depression', 'substance', 'trd'], programs: PROGRAMS })
    expect(r.concept).toBe('neuromodulation')
    expect(r.secondary.map((s) => s.concept)).toEqual(['substance', 'therapy'])
    expect(r.secondary[0].program).toBe('Substance use program')
  })

  it('flags a prescriber hint for psychosis and mania', () => {
    expect(recommendProgram({ symptoms: ['psychosis'], programs: PROGRAMS }).prescriberHint).toBe(true)
    expect(recommendProgram({ symptoms: ['mania'], programs: PROGRAMS }).prescriberHint).toBe(true)
    expect(recommendProgram({ symptoms: ['anxiety'], programs: PROGRAMS }).prescriberHint).toBe(false)
  })

  it('says when the recommended concept has no configured program', () => {
    // TRD → neuromodulation, but the site has no neuromodulation clinic
    const r = recommendProgram({ symptoms: ['trd'], programs: ['Therapy only', 'Medication management'] })
    expect(r.concept).toBe('neuromodulation')
    expect(r.matched).toBe(false)
    expect(r.program).toBe('')
    expect(r.conceptLabel).toBe('Neuromodulation')
  })
})

describe('recommendProgram fallback', () => {
  it('falls back to needs when no symptoms are checked', () => {
    expect(recommendProgram({ symptoms: [], needs: { prescriber: true, therapy: false }, programs: PROGRAMS }).concept).toBe('medication')
    expect(recommendProgram({ symptoms: [], needs: { prescriber: false, therapy: true }, programs: PROGRAMS }).concept).toBe('therapy')
    expect(recommendProgram({ symptoms: [], needs: { prescriber: false, therapy: true }, programs: PROGRAMS }).source).toBe('needs')
  })

  it('handles no programs and no input without throwing', () => {
    const r = recommendProgram({})
    expect(r.program).toBe('')
    expect(r.source).toBe('none')
  })

  it('is deterministic', () => {
    const a = recommendProgram({ symptoms: ['depression', 'trd', 'substance'], programs: PROGRAMS })
    const b = recommendProgram({ symptoms: ['depression', 'trd', 'substance'], programs: PROGRAMS })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
