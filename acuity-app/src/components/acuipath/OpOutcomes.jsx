import React, { useMemo } from 'react'
import { Card, StatCard, Icon, theme, grid } from '../ui.jsx'
import {
  opOutcomeSummary, thresholdFeedback, placementSnapshot, FIRST_VISIT, FIRST_VISIT_LABEL, TIER_LABEL,
} from '../../lib/outcomes.js'
import { requiresAttending } from '../../lib/opmatch.js'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

function BreakdownTable({ title, rows, labelFor }) {
  const entries = Object.entries(rows || {})
  if (!entries.length) return null
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ padding: '5px 6px' }}>Group</th>
              <th style={{ padding: '5px 6px', textAlign: 'right' }}>Cases</th>
              <th style={{ padding: '5px 6px', textAlign: 'right' }}>Attended</th>
              <th style={{ padding: '5px 6px', textAlign: 'right' }}>Retained 30d</th>
              <th style={{ padding: '5px 6px', textAlign: 'right' }}>Stepped up</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([k, r]) => (
              <tr key={k} style={{ borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }}>
                <td style={{ padding: '5px 6px', fontWeight: 600 }}>{labelFor ? labelFor(k) : k}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{r.tracked}</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{pct(r.attendedRate)} <span style={{ color: theme.sub }}>({r.attendedN})</span></td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}>{pct(r.retainedRate)} <span style={{ color: theme.sub }}>({r.retainedN})</span></td>
                <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: (r.stepUpRate ?? 0) >= 0.2 ? '#a5342a' : theme.text }}>
                  {pct(r.stepUpRate)} <span style={{ color: theme.sub, fontWeight: 400 }}>({r.stepUpN})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const triSelect = (value) => (value === true ? 'yes' : value === false ? 'no' : '')

export default function OpOutcomes({ patients, outcomes, outcomesApi, canEdit }) {
  const summary = useMemo(() => opOutcomeSummary(patients, outcomes), [patients, outcomes])
  const prompts = useMemo(() => thresholdFeedback(summary), [summary])
  const byPatient = useMemo(() => new Map(outcomes.map((o) => [o.patientId, o])), [outcomes])
  const o = summary.overall

  const record = (p, patch) => {
    const existing = byPatient.get(p.id)
    outcomesApi.upsert({
      id: existing?.id || `out_${p.id}`,
      patientId: p.id,
      firstVisit: FIRST_VISIT.PENDING,
      retained30: null,
      steppedUp: null,
      ...existing,
      ...patch,
      placement: placementSnapshot(p),
      recordedAt: Date.now(),
    })
  }

  return (
    <div>
      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="Placements with outcomes" value={o.tracked} sub="active and closed cases" icon="loop" color={theme.navy} />
        <StatCard label="Attended first visit" value={pct(o.attendedRate)} sub={`of ${o.attendedN} first visits due`} icon="calendar" color={theme.accent} />
        <StatCard label="Still in care at 30 days" value={pct(o.retainedRate)} sub={`${o.retainedN} known`} icon="users" color="#3fb37f" />
        <StatCard label="Needed a higher level" value={pct(o.stepUpRate)} sub={`within 30 days · ${o.stepUpN} known`} icon="alert"
          color={(o.stepUpRate ?? 0) >= 0.15 ? '#e0584a' : '#3fb37f'} />
      </div>

      <Card title="What the outcomes suggest" sub="Prompts to review a threshold, shown only when the evidence clears a minimum sample">
        {prompts.length === 0 ? (
          <div style={{ fontSize: 12.5, color: theme.sub }}>
            Nothing to review. Either the outcomes give no sign that a threshold is off, or there isn&rsquo;t enough data yet
            (each comparison needs 8 or more known outcomes on both sides).
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {prompts.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10,
                background: p.severity === 'review' ? '#e0b34118' : theme.panelAlt, fontSize: 12.5, lineHeight: 1.5 }}>
                <Icon name={p.severity === 'review' ? 'alert' : 'help'} size={15} style={{ flexShrink: 0, marginTop: 2, color: p.severity === 'review' ? '#8a6a10' : theme.sub }} />
                <span>{p.message}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: theme.sub }}>
              These prompts never change a setting. A clinical leader decides, then adjusts the triggers or thresholds in the Caseload view.
            </div>
          </div>
        )}
      </Card>

      <Card title="Outcomes by how the case was placed" style={{ marginTop: 16 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <BreakdownTable title="By screening tier" rows={summary.byTier} labelFor={(k) => TIER_LABEL[k] || k} />
          <div style={grid(2, 18)}>
            <BreakdownTable title="By primary physician" rows={summary.byPhysician} labelFor={(k) => (k === 'attending' ? 'Attending required' : 'Resident-eligible')} />
            <BreakdownTable title="By clinic" rows={summary.byClinic} />
          </div>
        </div>
      </Card>

      <Card title="Record outcomes for the active caseload" sub="Each outcome stores a snapshot of how the case was placed, so it still counts after the case closes" style={{ marginTop: 16 }}>
        {patients.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No active patients.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '6px 8px' }}>Case</th>
                  <th style={{ padding: '6px 8px' }}>Placed as</th>
                  <th style={{ padding: '6px 8px' }}>First visit</th>
                  <th style={{ padding: '6px 8px' }}>In care at 30 days</th>
                  <th style={{ padding: '6px 8px' }}>Needed higher level</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const rec = byPatient.get(p.id)
                  const tier = p.tier === '1-direct' ? 'Tier 1 direct' : p.bridge ? 'Bridge' : 'Tier 2'
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p.name}</td>
                      <td style={{ padding: '6px 8px', color: theme.sub }}>
                        {tier} · {requiresAttending(p) ? 'attending' : 'resident-eligible'} · {p.program || 'no clinic'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select aria-label={`First visit for ${p.name}`} disabled={!canEdit} value={rec?.firstVisit || FIRST_VISIT.PENDING}
                          onChange={(e) => record(p, { firstVisit: e.target.value })} style={{ fontSize: 12, padding: '3px 6px' }}>
                          {Object.values(FIRST_VISIT).map((v) => <option key={v} value={v}>{FIRST_VISIT_LABEL[v]}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select aria-label={`Retained at 30 days for ${p.name}`} disabled={!canEdit} value={triSelect(rec?.retained30)}
                          onChange={(e) => record(p, { retained30: e.target.value === '' ? null : e.target.value === 'yes' })} style={{ fontSize: 12, padding: '3px 6px' }}>
                          <option value="">Not yet known</option><option value="yes">Yes</option><option value="no">No</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select aria-label={`Stepped up for ${p.name}`} disabled={!canEdit} value={triSelect(rec?.steppedUp)}
                          onChange={(e) => record(p, { steppedUp: e.target.value === '' ? null : e.target.value === 'yes' })} style={{ fontSize: 12, padding: '3px 6px' }}>
                          <option value="">Not yet known</option><option value="yes">Yes — IOP/PHP/inpatient</option><option value="no">No</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
