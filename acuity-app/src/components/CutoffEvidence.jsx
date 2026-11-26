import React, { useMemo } from 'react'
import { Card, Badge, theme } from './ui.jsx'
import { STAGE_COLORS } from '../lib/model.js'
import { ZONE_SETS, ZONE_SET_IDS, INSTRUMENT_NAME, versionLabel } from '../lib/calibration.js'
import { cutoffEvidence, kappaLabel, MIN_PER_GROUP, SHIFT_RATINGS } from '../lib/cutoffEvidence.js'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const num = (x) => (x == null ? '—' : String(x))

function Reading({ b, minRated, rated }) {
  if (!b.enough) {
    return (
      <span style={{ color: theme.sub }}>
        Not enough yet: {rated} of {minRated} rated shifts, {MIN_PER_GROUP}+ on each side
      </span>
    )
  }
  return b.supported
    ? <span style={{ color: STAGE_COLORS.GREEN, fontWeight: 700 }}>Supported by nurses&rsquo; ratings</span>
    : <span style={{ color: '#9b2c22', fontWeight: 700 }}>Review: ratings point to {b.suggested}</span>
}

function ZoneSetEvidence({ ev }) {
  const th = (b) => (b.enough ? `${b.suggested} (${b.ciLow}–${b.ciHigh})` : '—')
  const cell = { padding: '6px 8px', borderBottom: `1px solid ${theme.border}`, fontSize: 12.5, textAlign: 'left', verticalAlign: 'top' }
  const head = { ...cell, fontSize: 11.5, color: theme.sub, fontWeight: 700 }
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ZONE_SETS[ev.zoneSet].label}</div>
        <div style={{ fontSize: 11.5, color: theme.sub }}>
          {ev.rated} rated shift{ev.rated === 1 ? '' : 's'} · {ev.units} unit{ev.units === 1 ? '' : 's'}{ev.unrated ? ` · ${ev.unrated} without a rating` : ''}
        </div>
      </div>
      <div style={{ fontSize: 12.5, marginBottom: 8 }}>
        {ev.kappa == null
          ? 'No rated shifts yet.'
          : <>Zones shown matched the nurse&rsquo;s own rating on <b>{pct(ev.agreement)}</b> of shifts; weighted kappa <b>{ev.kappa}</b> ({kappaLabel(ev.kappa)} agreement).</>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={head}>Boundary</th>
              <th style={head}>In use</th>
              <th style={head}>Ratings support (95% CI)</th>
              <th style={head}>Sensitivity / specificity</th>
              <th style={head}>AUC</th>
              <th style={head}>Reading</th>
            </tr>
          </thead>
          <tbody>
            {[['GREEN → YELLOW', ev.greenYellow], ['YELLOW → RED', ev.yellowRed]].map(([name, b]) => (
              <tr key={name}>
                <td style={cell}>{name}</td>
                <td style={cell}>{num(b.current)}</td>
                <td style={cell}>{th(b)}</td>
                <td style={cell}>{b.enough ? `${pct(b.sensitivity)} / ${pct(b.specificity)}` : '—'}</td>
                <td style={cell}>{b.enough ? b.auc : '—'}</td>
                <td style={cell}><Reading b={b} minRated={ev.minRated} rated={ev.rated} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ev.rated > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: theme.sub }}>Zone shown vs nurse&rsquo;s rating (shift counts)</summary>
          <table style={{ borderCollapse: 'collapse', marginTop: 6 }}>
            <thead>
              <tr>
                <th style={head}>Zone shown</th>
                {SHIFT_RATINGS.map((r) => <th key={r.id} style={head}>{r.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {['GREEN', 'YELLOW', 'RED'].map((z) => (
                <tr key={z}>
                  <td style={cell}><Badge color={STAGE_COLORS[z]}>{z}</Badge></td>
                  {SHIFT_RATINGS.map((r) => <td key={r.id} style={cell}>{ev.crosstab[z][r.id]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}

/**
 * Cutoff evidence: how well the GREEN / YELLOW / RED cutoffs in use match the
 * charge nurses' own blinded ratings of the same shifts, by the same
 * contrasting-groups method for every setting. Read-only: suggestions are never
 * applied automatically; an Administrator proposes any change through the
 * governed AcuiCalc™ calibration.
 */
export default function CutoffEvidence({ entries, locations, thresholds, calibration }) {
  const results = useMemo(
    () => ZONE_SET_IDS.map((zoneSet) => cutoffEvidence({ entries, locations, thresholds, zoneSet })).filter((ev) => ev.units > 0),
    [entries, locations, thresholds]
  )
  return (
    <Card
      title="Cutoff evidence"
      sub={`Do the GREEN / YELLOW / RED cutoffs in ${INSTRUMENT_NAME} calibration ${versionLabel(calibration)} match how charge nurses rate the same shifts?`}
    >
      <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.5, marginBottom: 12 }}>
        On every shift entry the charge nurse rates the shift Manageable, Strained or Unsafe before Acuitas shows its
        zone. For each boundary, the contrasting-groups method finds the score at which a shift is equally likely to be
        rated on either side, with a 95% bootstrap confidence interval. The same method applies to every setting; only the
        unit of the score differs. When a cutoff in use falls outside its interval, bring the evidence to the staffing
        committee. Any change is made by an Administrator through the calibration, with a written reason and the
        reviewing nurses. Nothing here changes a cutoff by itself.
      </div>
      {results.length === 0
        ? <div style={{ fontSize: 13, color: theme.sub }}>No units yet.</div>
        : results.map((ev) => <ZoneSetEvidence key={ev.zoneSet} ev={ev} />)}
    </Card>
  )
}
