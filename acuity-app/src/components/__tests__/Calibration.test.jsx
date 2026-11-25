import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import StatusBoard from '../StatusBoard.jsx'
import AcuityCalculator from '../AcuityCalculator.jsx'
import CalibrationPanel from '../CalibrationPanel.jsx'
import Settings from '../Settings.jsx'
import { today } from '../../lib/storage.js'
import {
  SHIPPED_POINTS,
  SHIPPED_RESPONSES,
  SHIPPED_ZONES,
  activeCalibration,
  calibratedThresholds,
  calibrationState,
  proposeCalibration,
  stampEntry,
} from '../../lib/calibration.js'

// React marks text boundaries with empty comments; drop them to match text.
const render = (el) => renderToString(el).replace(/<!-- -->/g, '')

const ADMIN = { actor: 'Admin One', role: 'admin', reason: 'Matching how our nurses describe 1:1 workload', reviewers: ['4 West charge RN'], at: Date.UTC(2026, 9, 20) }

const v2State = proposeCalibration(calibrationState(null), {
  points: { ...SHIPPED_POINTS, obs_1to1: 6 },
  responses: { ...SHIPPED_RESPONSES, RED: 'Call the house supervisor now' },
}, ADMIN).state
const v2 = activeCalibration(v2State)

const IP = { id: 'ip1', name: '4 West', facility: 'Main', region: 'R1', market: 'M', type: 'inpatient', thresholds: null }
const ED = { id: 'ed1', name: 'Main ED', facility: 'Main', region: 'R1', market: 'M', type: 'ed', thresholds: null }

describe('7. the active calibration version is visible', () => {
  it('shows on the Region Status Board, with the calibrated zone responses', () => {
    const entries = [
      stampEntry({ id: 'a', locId: 'ip1', date: today(), shift: 'AM', points: 30, staff: 10, census: 12, createdAt: 1 }, IP, v2), // 3.0 RED
      stampEntry({ id: 'b', locId: 'ed1', date: today(), shift: 'AM', points: 10, createdAt: 1 }, ED, v2), // GREEN
    ]
    const html = render(
      <StatusBoard locations={[IP, ED]} entries={entries} thresholds={calibratedThresholds(v2)} caps={{}} onUpdateCap={() => {}} calibration={v2} />
    )
    expect(html).toContain('Region Status Board')
    expect(html).toContain('AcuiCalc™ calibration v2')
    expect(html).toContain('Call the house supervisor now')
    expect(html).toContain(SHIPPED_RESPONSES.GREEN)
  })

  it('shows on the AcuiCalc™ scoring screen, with the calibrated point values', () => {
    const html = render(<AcuityCalculator locations={[ED]} onPushToED={() => {}} calibration={v2} />)
    expect(html).toContain('AcuiCalc™ calibration v2')
    expect(html).toMatch(/Constant Observation \(1:1\)\s*<span[^>]*>\(\+6\)/)
    expect(html).not.toContain('Acuity Calculator')
  })

  it('still renders the shipped point values when no calibration is passed', () => {
    const html = render(<AcuityCalculator locations={[ED]} onPushToED={() => {}} />)
    expect(html).toMatch(/Constant Observation \(1:1\)\s*<span[^>]*>\(\+5\)/)
  })

  it('gives administrators a read-only history of every version', () => {
    const html = render(<CalibrationPanel state={v2State} onPropose={() => ({ ok: true })} onReset={() => ({ ok: true })} />)
    expect(html).toContain('Calibration history')
    expect(html).toMatch(/<b>v2<\/b> \(active\)/)
    expect(html).toContain('<b>v1</b>')
    expect(html).toContain('Shipped defaults')
    expect(html).toContain(ADMIN.reason)
    expect(html).toContain('4 West charge RN')
    // The history section holds no inputs: it can't be edited.
    const history = html.slice(html.indexOf('Calibration history'))
    expect(history).not.toMatch(/<input|<textarea|<select/)
  })

  it('shows the locked domains as labels, not editable fields', () => {
    const html = render(<CalibrationPanel state={v2State} onPropose={() => ({ ok: true })} onReset={() => ({ ok: true })} />)
    expect(html).toContain('Observation Status')
    expect(html).toContain('🔒 locked')
    expect(html).toContain('allowed 3.75–6.25')
    // Only point values, zone cutoffs, responses and change control are inputs:
    // 17 items + 3 sets × 2 cutoffs = 23 number inputs, 3 responses + 2 change-control fields.
    const editor = html.slice(0, html.indexOf('Calibration history'))
    expect((editor.match(/<input/g) || []).length).toBe(23)
    expect((editor.match(/<textarea/g) || []).length).toBe(5)
  })
})

describe('4. no single-unit overrides in Settings', () => {
  it('has no per-unit threshold fields, only the system zone set for an ED', () => {
    const html = render(
      <Settings locations={[IP, { ...ED, zoneSet: 'pedsEd' }]} onChangeLocations={() => {}} onImport={() => {}} onClear={() => {}} onLoadSample={() => {}} getExportData={() => ({})} />
    )
    expect(html).not.toContain('Custom Green Max')
    expect(html).not.toContain('Default Thresholds')
    expect(html).toContain('Zone set')
    expect(html).toContain('Pediatric Emergency Department')
    expect(SHIPPED_ZONES.pedsEd.greenMax).toBe(53)
  })
})
