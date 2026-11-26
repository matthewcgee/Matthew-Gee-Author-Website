import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { zoneCardHtml, shiftWorksheetHtml, escapeHtml, WORKSHEET_ROWS } from '../downtime.js'
import {
  SHIPPED_POINTS, SHIPPED_RESPONSES, SHIPPED_ZONES, activeCalibration, calibrationState, proposeCalibration,
} from '../calibration.js'
import DowntimeKit from '../../components/DowntimeKit.jsx'
import HelpGuide from '../../components/HelpGuide.jsx'

const v1 = activeCalibration(calibrationState(null))
const v2 = proposeCalibration(calibrationState(null), {
  points: { ...SHIPPED_POINTS, obs_1to1: 6 },
  zones: { ...SHIPPED_ZONES, ed: { greenMax: 20, yellowMax: 26 } },
  responses: { ...SHIPPED_RESPONSES, RED: 'Call the house supervisor now' },
}, { actor: 'A', role: 'admin', reason: 'Matching how our nurses describe work', reviewers: ['Charge RN'], at: Date.UTC(2026, 9, 1) }).version

const IP = { id: 'u1', name: '4 West', type: 'inpatient' }
const ED = { id: 'e1', name: 'Main ED', type: 'ed' }
const PEDS = { id: 'e2', name: 'Peds ED', type: 'ed', zoneSet: 'pedsEd' }
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/\s+/g, ' ')

describe('downtime zone card', () => {
  it('prints the active version, every zone set, the responses and the calibrated points', () => {
    const t = text(zoneCardHtml(v2))
    expect(t).toContain('zone card calibration v2')
    expect(t).toContain('Emergency departments 20 or less above 20 to 26 above 26')
    expect(t).toContain('Inpatient units 1.5 or less above 1.5 to 2.5 above 2.5')
    expect(t).toContain('Pediatric emergency departments 53 or less above 53 to 71 above 71')
    expect(t).toContain('Call the house supervisor now')
    expect(t).toMatch(/Constant Observation \(1:1\) 6 /)
    expect(t).toContain('MASS ≥10')
    expect(t).toContain('Observation cluster')
  })

  it('matches the shipped defaults on v1', () => {
    const t = text(zoneCardHtml(v1))
    expect(t).toContain('calibration v1')
    expect(t).toContain('Emergency departments 24 or less above 24 to 40 above 40')
    expect(t).toMatch(/Constant Observation \(1:1\) 5 /)
    expect(t).toContain('shipped defaults')
  })

  it('asks for bed numbers only, never identifiers', () => {
    expect(text(zoneCardHtml(v1))).toContain('never a name, initials or MRN')
    expect(zoneCardHtml(v1)).not.toMatch(/undefined|NaN|\[object/)
  })
})

describe('downtime shift worksheet', () => {
  it('prints one page per unit with that unit\'s own cutoffs', () => {
    const html = shiftWorksheetHtml([IP, ED, PEDS], v2)
    expect((html.match(/class="page"/g) || []).length).toBe(3)
    const t = text(html)
    expect(t).toContain('Unit: 4 West Inpatient')
    expect(t).toContain('GREEN 1.5 or less')
    expect(t).toContain('Unit: Main ED Emergency department')
    expect(t).toContain('GREEN 20 or less')
    expect(t).toContain('Unit: Peds ED')
    expect(t).toContain('GREEN 53 or less')
  })

  it('uses ED columns for an ED and inpatient columns otherwise', () => {
    const ed = text(shiftWorksheetHtml([ED], v1))
    expect(ed).toContain('Boarding hours')
    expect(ed).not.toContain('Staff on shift')
    const ip = text(shiftWorksheetHtml([IP], v1))
    expect(ip).toContain('Staff on shift')
    expect(ip).toContain('Patients on 1:1')
    expect(ip).toContain('Your rating M / S / U')
  })

  it('has a week of AM and PM rows and a blank page when there are no units', () => {
    const html = shiftWorksheetHtml([IP], v1)
    expect((html.match(/<td>AM<\/td>/g) || []).length).toBe(WORKSHEET_ROWS / 2)
    expect((html.match(/<td>PM<\/td>/g) || []).length).toBe(WORKSHEET_ROWS / 2)
    const blank = shiftWorksheetHtml([], v1)
    expect((blank.match(/class="page"/g) || []).length).toBe(1)
    expect(text(blank)).toContain('Unit: ____')
  })

  it('escapes unit names', () => {
    expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;')
    const html = shiftWorksheetHtml([{ ...IP, name: '<script>x</script>' }], v1)
    expect(html).not.toContain('<script>')
  })
})

describe('downtime kit on screen', () => {
  it('offers both printouts, labelled with the active version', () => {
    const html = renderToString(<DowntimeKit locations={[IP, ED]} calibration={v2} />).replace(/<!-- -->/g, '')
    expect(html).toContain('Downtime kit')
    expect(html).toContain('Print zone card (v2)')
    expect(html).toContain('Print shift worksheets (2 pages)')
  })

  it('appears in Help & Training for every role', () => {
    const html = renderToString(<HelpGuide locations={[IP]} calibration={v1} />)
    expect(html).toContain('Downtime kit')
    expect(renderToString(<HelpGuide />)).not.toContain('Downtime kit')
  })
})
