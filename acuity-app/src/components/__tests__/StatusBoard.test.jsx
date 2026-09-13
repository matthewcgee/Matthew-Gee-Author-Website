import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import StatusBoard from '../StatusBoard.jsx'
import { buildDemoScenario } from '../../lib/demoData.js'
import { DEFAULT_THRESHOLDS } from '../../lib/model.js'

// The Status Board is the screen everyone actually looks at, so the next-shift
// outlook it now carries is rendered here for real rather than assumed. Server
// rendering exercises the same JSX the browser runs, without needing a DOM.
const scenario = buildDemoScenario()

function render(props) {
  return renderToString(
    <StatusBoard
      locations={props.locations}
      entries={props.entries}
      thresholds={DEFAULT_THRESHOLDS}
      caps={props.caps || {}}
      onUpdateCap={() => {}}
    />
  )
}

describe('StatusBoard next-shift outlook', () => {
  it('renders without throwing when there is no history at all', () => {
    const html = render({ locations: scenario.locations, entries: [] })
    expect(html).toContain('Region Status Board')
    expect(html).toContain('No shift entries yet')
    // No forecast claims when there is nothing to forecast from.
    expect(html).not.toContain('Next shift')
  })

  it('renders without throwing when there are no locations', () => {
    const html = render({ locations: [], entries: [] })
    expect(html).toContain('No locations yet')
  })

  it('shows a next-shift prediction once a unit has enough history', () => {
    const html = render({ locations: scenario.locations, entries: scenario.entries, caps: scenario.caps })
    expect(html).toContain('Next shift')
    expect(html).toContain('1 South A')
  })

  it('surfaces breach risk on a unit heading for RED', () => {
    const html = render({ locations: scenario.locations, entries: scenario.entries, caps: scenario.caps })
    expect(html).toMatch(/chance of RED/)
  })

  it('stays silent about prediction for a unit with too little history', () => {
    // The new unit has four shifts; it must not get a predicted value.
    const newUnit = scenario.locations.filter((l) => l.id === 'demo_new')
    const html = render({ locations: newUnit, entries: scenario.entries })
    expect(html).toContain('6 North (new unit)')
    expect(html).not.toContain('Next shift')
  })

  it('keeps the current reading and the prediction consistent for the same unit', () => {
    const oneUnit = scenario.locations.filter((l) => l.id === 'demo_2n')
    const html = render({ locations: oneUnit, entries: scenario.entries, caps: scenario.caps })
    expect(html).toContain('2 North')
    expect(html).toContain('Next shift')
    // A stable green unit should not be advertised as likely to go RED.
    expect(html).not.toMatch(/9[0-9]% chance of RED/)
  })
})
