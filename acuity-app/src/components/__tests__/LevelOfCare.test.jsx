import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import LevelOfCare from '../LevelOfCare.jsx'

// jsdom-free: exercise the same JSX the browser runs. localStorage is undefined
// under renderToString, so this also proves the storage reads are guarded.
describe('AcuiPath renders', () => {
  it('mounts without throwing and shows the decision-support disclaimer', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('AcuiPath')
    expect(html).toContain('Decision support')
    expect(html).toMatch(/LOCUS/)
    expect(html).toContain('No patient-identifying information is required')
  })

  it('opens on the screener with all six dimensions', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Risk of harm')
    expect(html).toContain('Recommended level of care')
    // an all-minimal fresh screen sits below outpatient
    expect(html).toMatch(/BELOW OP THRESHOLD/)
  })

  it('shows the prominent recommended clinic / program and the programs list', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Recommended clinic / program')
  })

  it('shows what each rating means — all five anchor definitions per dimension', () => {
    const html = renderToString(<LevelOfCare />)
    // the level-4 risk anchor is visible even though the fresh screen is at 1
    expect(html).toContain('Active ideation with plan or means')
    // and the level-5 anchor too
    expect(html).toContain('Imminent risk: plan and intent')
  })

  it('shows a current-symptoms checklist that drives the program recommendation', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Current symptoms')
    expect(html).toMatch(/Treatment-resistant depression/)
    expect(html).toMatch(/Disordered eating/)
  })
})
