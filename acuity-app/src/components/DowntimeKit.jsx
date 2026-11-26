import React from 'react'
import { Card, Button, Icon, theme } from './ui.jsx'
import { printHtml, shiftWorksheetHtml, zoneCardHtml } from '../lib/downtime.js'
import { INSTRUMENT_NAME, versionLabel } from '../lib/calibration.js'

/**
 * Printable pages for when Acuitas is unavailable: the AcuiCalc™ zone card for
 * the active calibration, and a Shift Acuity Worksheet for every unit.
 */
export default function DowntimeKit({ locations, calibration }) {
  return (
    <Card
      title="Downtime kit"
      sub={`Print these before you need them. Reprint the zone card whenever the ${INSTRUMENT_NAME} calibration changes.`}
    >
      <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.5, marginBottom: 12 }}>
        If Acuitas is unavailable, charge nurses record each shift on the worksheet, and the house supervisor uses the
        zone card&rsquo;s cutoffs and zone responses. Enter the paper shifts in New Shift Entry when the system returns.
        Neither page carries patient names, initials or MRNs.
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button onClick={() => printHtml(zoneCardHtml(calibration))}>
          <Icon name="shield" size={14} /> Print zone card ({versionLabel(calibration)})
        </Button>
        <Button variant="ghost" onClick={() => printHtml(shiftWorksheetHtml(locations, calibration))}>
          Print shift worksheets ({(locations || []).length || 1} page{(locations || []).length === 1 ? '' : 's'})
        </Button>
      </div>
    </Card>
  )
}
