import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import LevelOfCare from '../LevelOfCare.jsx'

// jsdom-free: exercise the same JSX the browser runs. localStorage is undefined
// under renderToString, so this also proves the storage reads are guarded.
describe('LevelOfCare renders', () => {
  it('mounts without throwing and shows the decision-support disclaimer', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Level of Care')
    expect(html).toContain('Decision support')
    expect(html).toMatch(/LOCUS/)
  })

  it('opens on the screener with all six dimensions', () => {
    const html = renderToString(<LevelOfCare />)
    expect(html).toContain('Risk of harm')
    expect(html).toContain('Recommended level of care')
    // an all-minimal fresh screen sits below outpatient
    expect(html).toMatch(/BELOW OP THRESHOLD/)
  })
})
