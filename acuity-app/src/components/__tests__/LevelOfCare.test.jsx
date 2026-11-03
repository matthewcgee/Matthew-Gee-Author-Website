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

  it('opens on the Tier 1 nurse chart review', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Tier 1 — nurse chart review')
    // a fresh, unchecked chart review is a clean review — eligible for a direct
    // placement and offering the escalation path.
    expect(html).toContain('Eligible for direct placement')
    expect(html).toContain('Continue to in-depth screen')
  })

  it('shows the prominent recommended clinic / program on the Tier 1 view', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Recommended clinic / program')
  })

  it('lists the editable Tier 1 red-flag triggers on the entry view', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Chart-review red flags')
    // a couple of the default triggers by their wording
    expect(html).toMatch(/Active substance use or withdrawal risk/)
    expect(html).toMatch(/Forensic, court-ordered, or guardianship/)
  })

  it('shows a current-symptoms checklist that drives the program recommendation', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Current symptoms')
    expect(html).toMatch(/Treatment-resistant depression/)
    expect(html).toMatch(/Disordered eating/)
  })
})
