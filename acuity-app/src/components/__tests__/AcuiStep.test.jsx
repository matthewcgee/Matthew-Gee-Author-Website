import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import AcuiStep, { AcuiStepMark } from '../AcuiStep.jsx'
import { buildSampleIntakes, intakeRecord } from '../../lib/iopData.js'
import { emptyIntake, programCensus } from '../../lib/iop.js'

describe('AcuiStep renders', () => {
  it('shows its own mark, the IOP name and the decision-support disclaimer', () => {
    const html = renderToString(<AcuiStep role="admin" />)
    expect(html).toContain('AcuiStep™')
    expect(html).toContain('aria-label="AcuiStep"')
    expect(html).toContain('Decision support, not a determination')
    expect(html).toContain('never a name or MRN')
  })

  it('a screener opens on a new intake with the six steps and a live verdict', () => {
    const html = renderToString(<AcuiStep role="screener" />)
    for (const s of ['Referral', 'Safety', 'Stability', 'Need', 'Readiness', 'Review']) expect(html).toContain(s)
    expect(html).toContain('Live verdict')
    expect(html).toContain('criteria met')
  })

  it('roles without screening rights see the queue, not the intake form', () => {
    const html = renderToString(<AcuiStep role="analyst" />)
    expect(html).not.toContain('New IOP intake')
    expect(html).toContain('Intake queue')
    expect(html).not.toContain('Program setup')
  })

  it('only administrators get program setup', () => {
    expect(renderToString(<AcuiStep role="admin" />)).toContain('Program setup')
    expect(renderToString(<AcuiStep role="screener" />)).not.toContain('Program setup')
  })

  it('the mark renders standalone', () => {
    expect(renderToString(<AcuiStepMark size={32} />)).toContain('acuistep-g')
  })
})

describe('AcuiStep sample and records', () => {
  it('sample intakes cover every verdict and fill the census', () => {
    const s = buildSampleIntakes()
    expect(new Set(s.map((x) => x.disposition))).toEqual(new Set(['eligible', 'conditional', 'higher', 'lower']))
    expect(s.every((x) => x.demo && x.caseLabel && !/\s[A-Z][a-z]+ [A-Z][a-z]+/.test(x.caseLabel))).toBe(true)
    const c = programCensus(s)
    expect(c.reduce((n, t) => n + t.admitted, 0)).toBe(3)
  })

  it('a saved record keeps the answers and the headline, and sets a sensible status', () => {
    const rec = intakeRecord({ ...emptyIntake(), caseLabel: 'X-1', ideation: 'plan' })
    expect(rec.disposition).toBe('higher')
    expect(rec.status).toBe('referred')
    expect(rec.ideation).toBe('plan')
    expect(rec.id).toMatch(/^iop_/)
  })
})
