// Acuitas™ downtime kit: printable pages for when the system is unavailable.
//
//   Zone card       — the active AcuiCalc™ calibration on one page: version,
//                     GREEN / YELLOW / RED cutoffs for each zone set, the zone
//                     responses, and the full scoring sheet with calibrated
//                     points, so patients can be scored on paper.
//   Shift worksheet — one page per unit with the same fields as New Shift
//                     Entry, the unit's cutoffs printed on it, and a column to
//                     tick once the shift has been entered in Acuitas.
//
// Both are plain HTML documents built here (no network, no scripts) and printed
// by the browser. Neither ever carries a patient name, initials or MRN.

import { MASS_ESCALATION, PEDIATRIC_MODIFIER_GROUPS, PEDIATRIC_OBSERVATION_GOVERNS, zoneSetFor } from './model.js'
import {
  INSTRUMENT_NAME, ZONE_SETS, ZONE_SET_IDS, ZONE_STAGES,
  calibratedCriteria, calibratedThresholds, orgScopedLocation, versionLabel, zoneResponse,
} from './calibration.js'

export const WORKSHEET_ROWS = 14 // one week of AM and PM shifts

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))

const STYLE = `
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10.5pt; margin: 0; }
  h1 { font-family: Georgia, serif; font-size: 17pt; margin: 0 0 2px; }
  h2 { font-size: 11.5pt; margin: 14px 0 5px; border-bottom: 1.5px solid #111; padding-bottom: 2px; }
  .sub { font-size: 9.5pt; color: #333; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 8px; }
  th, td { border: 1px solid #555; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #e9e9e9; font-size: 9.5pt; }
  td.num { text-align: center; }
  .write td { height: 34px; }
  .note { font-size: 9pt; color: #333; margin: 4px 0; }
  .warn { border: 1.5px solid #111; padding: 6px 8px; font-size: 9.5pt; margin: 8px 0; }
  .page { page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .cols { display: flex; gap: 14px; } .cols > div { flex: 1; }
`

function doc(title, body, { landscape = false } = {}) {
  const page = landscape ? '@page { size: letter landscape; margin: 0.45in; }' : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}${page}</style></head><body>${body}</body></html>`
}

function savedOn(cal) {
  return cal?.at ? new Date(cal.at).toLocaleDateString() : 'shipped defaults'
}

function cutoffRow(set, th) {
  const z = th[set]
  return `<tr><td>${escapeHtml(ZONE_SETS[set].label)}</td><td class="num">${fmt(z.greenMax)} or less</td><td class="num">above ${fmt(z.greenMax)} to ${fmt(z.yellowMax)}</td><td class="num">above ${fmt(z.yellowMax)}</td><td>${escapeHtml(ZONE_SETS[set].unit)}</td></tr>`
}

/** The active calibration as a one-page zone card with the paper scoring sheet. */
export function zoneCardHtml(calibration) {
  const th = calibratedThresholds(calibration)
  const criteria = calibratedCriteria(calibration)
  const v = versionLabel(calibration)
  const domains = criteria.map((g) => `
    <tr><th colspan="2">${escapeHtml(g.group)}${g.note ? `<div class="note">${escapeHtml(g.note)}</div>` : ''}</th></tr>
    ${g.items.map((i) => `<tr><td>&#9744; ${escapeHtml(i.label)}</td><td class="num">${fmt(i.points)}</td></tr>`).join('')}`).join('')
  const peds = PEDIATRIC_MODIFIER_GROUPS.map((g) => `
    <tr><th colspan="2">${escapeHtml(g.group)}</th></tr>
    ${g.items.map((i) => `<tr><td>&#9744; ${escapeHtml(i.id)} ${escapeHtml(i.label)}</td><td class="num">+${fmt(i.points)}</td></tr>`).join('')}`).join('')
  const tally = Array.from({ length: 10 }, () => '<tr><td></td><td></td><td></td></tr>').join('')
  const body = `
  <div class="page">
    <h1>${INSTRUMENT_NAME} zone card &mdash; calibration ${escapeHtml(v)}</h1>
    <div class="sub">Saved ${escapeHtml(savedOn(calibration))}. For use when Acuitas is unavailable. Reprint whenever the calibration changes, and discard older cards.</div>
    <h2>Zones</h2>
    <table><tr><th>Zone set</th><th>GREEN</th><th>YELLOW</th><th>RED</th><th>Measured as</th></tr>
      ${ZONE_SET_IDS.map((s) => cutoffRow(s, th)).join('')}
    </table>
    <div class="note">Inpatient units: acuity per staff = total AcuiCalc&#8482; points for the unit &divide; (staff on shift &minus; patients on 1:1), never less than 1, because each 1:1 takes one staff member entirely. Emergency departments: the total of AcuiCalc&#8482; points. Observation that every patient on the unit receives (for example, routine Q15) is not scored.</div>
    <h2>Zone responses</h2>
    <table>${ZONE_STAGES.map((s) => `<tr><th style="width:90px">${s}</th><td>${escapeHtml(zoneResponse(calibration, s))}</td></tr>`).join('')}</table>
    <div class="warn">${MASS_ESCALATION.map((m) => escapeHtml(m.label)).join('<br>')}</div>
  </div>
  <div class="page">
    <h1>${INSTRUMENT_NAME} scoring sheet &mdash; calibration ${escapeHtml(v)}</h1>
    <div class="sub">Step 1 for every patient: tick each criterion that applies and add the points. Step 2 for pediatric patients only: add the modifiers.</div>
    <div class="cols">
      <div><table><tr><th>Step 1 &mdash; Acuity scoring</th><th style="width:52px">Points</th></tr>${domains}</table></div>
      <div>
        <table><tr><th>Step 2 &mdash; Pediatric modifiers</th><th style="width:52px">Points</th></tr>${peds}</table>
        ${PEDIATRIC_OBSERVATION_GOVERNS ? '<div class="note">Observation cluster: when more than one observation modifier applies, count only the highest.</div>' : ''}
        <h2>Unit tally</h2>
        <div class="note">Bed number only &mdash; never a name, initials or MRN. Shred after the shift is entered in Acuitas.</div>
        <table class="write"><tr><th style="width:70px">Bed</th><th style="width:70px">Points</th><th>Notes (no identifiers)</th></tr>${tally}</table>
      </div>
    </div>
  </div>`
  return doc(`${INSTRUMENT_NAME} zone card ${v}`, body)
}

function worksheetPage(loc, calibration) {
  const th = calibratedThresholds(calibration)
  const org = loc ? orgScopedLocation(loc) : null
  const set = org ? zoneSetFor(org) : null
  const isEd = org?.type === 'ed'
  const name = loc?.name ? escapeHtml(loc.name) : '______________________'
  const zones = set
    ? `GREEN ${fmt(th[set].greenMax)} or less &middot; YELLOW above ${fmt(th[set].greenMax)} to ${fmt(th[set].yellowMax)} &middot; RED above ${fmt(th[set].yellowMax)} (${escapeHtml(ZONE_SETS[set].unit)})`
    : ZONE_SET_IDS.map((s) => `${escapeHtml(ZONE_SETS[s].label)}: GREEN &le; ${fmt(th[s].greenMax)}, YELLOW &le; ${fmt(th[s].yellowMax)}`).join(' &middot; ')
  const head = isEd
    ? ['Date', 'Shift', 'Census', 'BH points', 'BH arrivals', 'Boarders', 'Boarding hours', 'Zone G / Y / R', 'Your rating M / S / U', 'Charge RN', 'Entered in Acuitas']
    : ['Date', 'Shift', 'Census', 'Acuity points', 'Staff on shift', 'Patients on 1:1', 'Points &divide; (staff &minus; 1:1)', 'Zone G / Y / R', 'Your rating M / S / U', 'Staff moved in / out', 'Charge RN', 'Entered in Acuitas']
  const rows = Array.from({ length: WORKSHEET_ROWS }, (_, i) =>
    `<tr>${head.map((h, c) => `<td>${c === 1 ? (i % 2 ? 'PM' : 'AM') : ''}</td>`).join('')}</tr>`).join('')
  return `<div class="page">
    <h1>Shift Acuity Worksheet &mdash; downtime</h1>
    <div class="sub">Unit: <b>${name}</b>${loc ? ` &middot; ${isEd ? 'Emergency department' : 'Inpatient'}` : ''} &middot; ${INSTRUMENT_NAME} calibration ${escapeHtml(versionLabel(calibration))}</div>
    <div class="note">${zones}</div>
    <table class="write"><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows}</table>
    <div class="note">Rate the shift yourself (Manageable / Strained / Unsafe) before working out the zone; your rating never changes the zone. Record each shift within 2 hours of its start. Log staff moves in Staff Deployments when Acuitas returns, and enter every shift in New Shift Entry; then initial the last column. No patient names, initials or MRNs on this sheet.</div>
  </div>`
}

/** One worksheet page per unit (or a single blank page when no units exist). */
export function shiftWorksheetHtml(locations, calibration) {
  const list = (locations || []).length ? locations : [null]
  return doc('Shift Acuity Worksheet', list.map((l) => worksheetPage(l, calibration)).join(''), { landscape: true })
}

/** Print an HTML document from a hidden frame (no pop-up window needed). */
export function printHtml(html) {
  if (typeof document === 'undefined') return false
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = html
  frame.onload = () => {
    try {
      frame.contentWindow.focus()
      frame.contentWindow.print()
    } finally {
      setTimeout(() => frame.remove(), 60000)
    }
  }
  document.body.appendChild(frame)
  return true
}
