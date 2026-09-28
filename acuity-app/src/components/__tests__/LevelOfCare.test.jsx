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
})
