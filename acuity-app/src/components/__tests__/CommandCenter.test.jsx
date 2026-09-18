import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import CommandCenter from '../CommandCenter.jsx'
import { buildDemoScenario } from '../../lib/demoData.js'
import { DEFAULT_THRESHOLDS, seedLocations } from '../../lib/model.js'

const scenario = buildDemoScenario()

function render(props = {}) {
  return renderToString(
    <CommandCenter
      locations={props.locations ?? []}
      entries={props.entries ?? []}
      thresholds={DEFAULT_THRESHOLDS}
      caps={props.caps ?? {}}
    />
  )
}

describe('CommandCenter', () => {
  it('renders on a brand-new install with no data and makes no claims', () => {
    const html = render({ locations: seedLocations(), entries: [] })
    expect(html).toContain('Command Center')
    expect(html).toContain('awaiting enough history')
    expect(html).toContain('No unit projected to cross RED')
  })

  it('renders with no locations at all', () => {
    const html = render()
    expect(html).toContain('No locations yet')
  })

  it('explains itself rather than presenting numbers as oracle', () => {
    const html = render({ locations: seedLocations(), entries: [] })
    expect(html).toContain('How these predictions are made')
    expect(html).toContain('no external model service')
  })

  it('surfaces forecasts, risk, and a deployment plan on a system with history', () => {
    const html = render({ locations: scenario.locations, entries: scenario.entries, caps: scenario.caps })
    expect(html).toContain('Recommended deployment')
    expect(html).toContain('Census &amp; volume outlook')
    expect(html).toContain('Unit forecasts')
    // The drifting unit should be named as the soonest projected breach.
    expect(html).toContain('1 South A')
    expect(html).toMatch(/Projected to cross into RED/)
  })

  it('reports per-unit forecast accuracy on the card', () => {
    const html = render({ locations: scenario.locations, entries: scenario.entries, caps: scenario.caps })
    expect(html).toContain('typical error')
    expect(html).toContain('held-out shifts')
    expect(html).toMatch(/better than|worse than/)
  })

  it('says plainly when a unit has too little history instead of guessing', () => {
    const html = render({ locations: scenario.locations, entries: scenario.entries, caps: scenario.caps })
    expect(html).toContain('Too little history to forecast')
    expect(html).toContain('NOT ENOUGH HISTORY')
  })

  it('defaults to the live data path, not the demo scenario', () => {
    const html = render({ locations: seedLocations(), entries: [] })
    expect(html).not.toContain('Demonstration data')
    expect(html).toContain('Show me with demo data')
  })
})
