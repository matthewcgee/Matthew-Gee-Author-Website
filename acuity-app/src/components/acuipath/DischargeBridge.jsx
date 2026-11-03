import React, { useMemo, useState } from 'react'
import { Card, Field, Button, StatCard, Icon, theme, grid } from '../ui.jsx'
import { uid, today } from '../../lib/storage.js'
import {
  fuhRates, fuhWorklist, fuhStatus, dischargeToOpPatient,
  FUH_STATUS, FUH_STATUS_LABEL, EXCLUSION_REASONS, FUH_WINDOWS,
} from '../../lib/fuh.js'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

const STATUS_COLOR = {
  'met-7': '#3fb37f',
  'met-30': '#7aa86a',
  'open-7': '#e0b341',
  'missed-7-open-30': '#e08a41',
  missed: '#e0584a',
  excluded: '#8a9a96',
}

function Chip({ color, children }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: `${color}22`, color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

const emptyForm = () => ({
  caseLabel: '', unitId: '', dischargeDate: today(), population: 'adult',
  program: '', complex: false, prescriber: true, therapy: true, bridgeNow: true,
})

export default function DischargeBridge({ discharges, dischargesApi, patientsApi, programs, locations = [], canEdit, onOpenCaseload }) {
  const asOf = today()
  const [form, setForm] = useState(emptyForm)
  const [showAll, setShowAll] = useState(false)
  const ipUnits = locations.filter((l) => l.type !== 'ed')
  const unitName = (id) => locations.find((l) => l.id === id)?.name || '—'

  const rates = useMemo(() => fuhRates(discharges, asOf), [discharges, asOf])
  const worklist = useMemo(() => fuhWorklist(discharges, asOf), [discharges, asOf])
  const all = useMemo(
    () => discharges.map((d) => ({ d, s: fuhStatus(d, asOf) })).sort((a, b) => (a.d.dischargeDate < b.d.dischargeDate ? 1 : -1)),
    [discharges, asOf]
  )

  const bridge = (d) => {
    const patient = dischargeToOpPatient(d)
    patientsApi.add(patient)
    dischargesApi.update(d.id, { bridgedPatientId: patient.id })
  }

  const submit = (e) => {
    e.preventDefault()
    const id = uid()
    const d = {
      id,
      caseLabel: form.caseLabel.trim() || `Discharge ${id.slice(0, 4).toUpperCase()}`,
      unitId: form.unitId || null,
      population: form.population,
      dischargeDate: form.dischargeDate,
      followUpScheduled: null,
      followUpCompleted: null,
      excluded: false,
      excludeReason: '',
      complex: form.complex,
      program: form.program || programs[0] || '',
      needs: { prescriber: form.prescriber, therapy: form.therapy },
      createdAt: Date.now(),
    }
    if (form.bridgeNow) {
      const patient = dischargeToOpPatient(d)
      patientsApi.add(patient)
      d.bridgedPatientId = patient.id
    }
    dischargesApi.add(d)
    setForm(emptyForm())
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div>
      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="Seen within 7 days (FUH-7)" value={pct(rates.fuh7.rate)}
          sub={`${rates.fuh7.numerator} of ${rates.fuh7.denominator} closed windows`} icon="calendar"
          color={rates.fuh7.rate == null ? theme.navy : rates.fuh7.rate >= 0.6 ? '#3fb37f' : '#e0b341'} />
        <StatCard label="Seen within 30 days (FUH-30)" value={pct(rates.fuh30.rate)}
          sub={`${rates.fuh30.numerator} of ${rates.fuh30.denominator} closed windows`} icon="calendar" color={theme.accent} />
        <StatCard label="7-day window open" value={rates.open7}
          sub={`${rates.openUnscheduled7} with no visit booked in time`} icon="clock"
          color={rates.openUnscheduled7 ? '#e0584a' : '#3fb37f'} />
        <StatCard label="Missed 7 days, 30 still open" value={rates.missed7Open30}
          sub={`${rates.excluded} excluded from both rates`} icon="alert" color="#e08a41" />
      </div>

      <Card title="Follow-up worklist" sub="Discharges that still need a qualifying visit, most urgent first"
        right={onOpenCaseload ? <Button variant="ghost" onClick={onOpenCaseload}><Icon name="route" size={14} />Open caseload</Button> : null}>
        {worklist.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>Nothing open. Every recent discharge has a qualifying visit or has been excluded.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '6px 8px' }}>Case</th>
                  <th style={{ padding: '6px 8px' }}>Discharged</th>
                  <th style={{ padding: '6px 8px' }}>Deadline</th>
                  <th style={{ padding: '6px 8px' }}>Next step</th>
                  {canEdit && <th style={{ padding: '6px 8px' }}>Update</th>}
                </tr>
              </thead>
              <tbody>
                {worklist.map((r) => {
                  const d = r.discharge
                  const open7 = r.status === FUH_STATUS.OPEN_7
                  const left = open7 ? r.daysLeft7 : r.daysLeft30
                  return (
                    <tr key={d.id} style={{ borderBottom: `1px solid ${theme.border}`, verticalAlign: 'top' }}>
                      <td style={{ padding: '7px 8px' }}>
                        <div style={{ fontWeight: 700 }}>{d.caseLabel}</div>
                        <div style={{ fontSize: 11, color: theme.sub }}>
                          {unitName(d.unitId)}{d.complex ? ' · complex' : ''}{d.bridgedPatientId ? ' · in AcuiPath' : ''}
                        </div>
                      </td>
                      <td style={{ padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {d.dischargeDate}
                        <div style={{ fontSize: 11, color: theme.sub }}>day {r.daysSince}</div>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        <Chip color={STATUS_COLOR[r.status]}>{open7 ? `${left} day${left === 1 ? '' : 's'} to day 7` : `${left} days to day 30`}</Chip>
                      </td>
                      <td style={{ padding: '7px 8px', fontWeight: 600, color: r.priority === 0 ? '#a5342a' : theme.text }}>
                        {r.action}
                        {d.followUpScheduled && <div style={{ fontSize: 11, color: theme.sub, fontWeight: 400 }}>Booked {d.followUpScheduled}</div>}
                      </td>
                      {canEdit && (
                        <td style={{ padding: '7px 8px' }}>
                          <div style={{ display: 'grid', gap: 5, minWidth: 210 }}>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: theme.sub }}>
                              Book
                              <input type="date" aria-label={`Book a visit for ${d.caseLabel}`} value={d.followUpScheduled || ''} min={d.dischargeDate}
                                onChange={(e) => dischargesApi.update(d.id, { followUpScheduled: e.target.value || null })} style={{ fontSize: 11.5, padding: '3px 5px' }} />
                            </label>
                            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: theme.sub }}>
                              Seen
                              <input type="date" aria-label={`Mark ${d.caseLabel} seen`} value={d.followUpCompleted || ''} min={d.dischargeDate} max={asOf}
                                onChange={(e) => dischargesApi.update(d.id, { followUpCompleted: e.target.value || null })} style={{ fontSize: 11.5, padding: '3px 5px' }} />
                            </label>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                              {!d.bridgedPatientId && (
                                <Button variant="ghost" onClick={() => bridge(d)} style={{ padding: '4px 9px', fontSize: 11.5 }}>
                                  <Icon name="route" size={12} />Bridge to AcuiPath
                                </Button>
                              )}
                              <select aria-label={`Exclude ${d.caseLabel}`} value="" onChange={(e) => e.target.value && dischargesApi.update(d.id, { excluded: true, excludeReason: e.target.value })}
                                style={{ fontSize: 11.5, padding: '3px 5px' }}>
                                <option value="">Exclude…</option>
                                {EXCLUSION_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ ...grid(2, 16), marginTop: 16 }}>
        {canEdit && (
          <Card title="Record a discharge" sub="De-identified. Use a case number, never a name or MRN.">
            <form onSubmit={submit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <Field label="Case label (optional)"><input id="dc-label" type="text" value={form.caseLabel} onChange={set('caseLabel')} placeholder="e.g. Discharge 41" /></Field>
                <Field label="Discharge date"><input id="dc-date" type="date" value={form.dischargeDate} max={asOf} onChange={set('dischargeDate')} required /></Field>
                <Field label="Discharging unit">
                  <select id="dc-unit" value={form.unitId} onChange={set('unitId')}>
                    <option value="">Not specified</option>
                    {ipUnits.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <Field label="Population">
                  <select id="dc-pop" value={form.population} onChange={set('population')}>
                    <option value="adult">Adult</option>
                    <option value="adolescent">Child / adolescent</option>
                  </select>
                </Field>
                <Field label="Follow-up clinic">
                  <select id="dc-program" value={form.program} onChange={set('program')}>
                    <option value="">{programs[0] || 'No clinics configured'}</option>
                    {programs.slice(1).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 12 }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.prescriber} onChange={set('prescriber')} />Needs prescriber</label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.therapy} onChange={set('therapy')} />Needs therapy</label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.complex} onChange={set('complex')} />Complex — attending required</label>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.bridgeNow} onChange={set('bridgeNow')} />Add to AcuiPath caseload now</label>
              </div>
              <Button type="submit"><Icon name="plusCircle" size={15} />Record discharge</Button>
            </form>
          </Card>
        )}

        <Card title="How follow-up is measured" sub="An operational version of HEDIS FUH">
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.text }}>
            Each discharge is tracked against two windows: a visit with a mental health provider within
            <strong> {FUH_WINDOWS.short} days</strong> and within <strong>{FUH_WINDOWS.long} days</strong>. A visit on the discharge
            day itself does not count. A discharge enters a rate only once its window has closed, so open cases
            never drag the rate down early.
            <div style={{ marginTop: 10, fontSize: 11.5, color: theme.sub }}>
              Bridged discharges go to the top of the AcuiPath caseload, ahead of routine referrals, because their clock
              is already running. This drives follow-up work. It is not a certified HEDIS submission: it applies no
              diagnosis, age or enrollment logic. Exclude readmissions, transfers and similar cases by hand.
            </div>
          </div>
        </Card>
      </div>

      <Card title="All discharges" sub={`${discharges.length} recorded`}
        right={discharges.length > 8 ? <Button variant="ghost" onClick={() => setShowAll((x) => !x)}>{showAll ? 'Show recent' : 'Show all'}</Button> : null}
        style={{ marginTop: 16 }}>
        {discharges.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No discharges recorded yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 5 }}>
            {(showAll ? all : all.slice(0, 8)).map(({ d, s }) => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, padding: '6px 9px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                <span><strong>{d.caseLabel}</strong> <span style={{ color: theme.sub }}>· {unitName(d.unitId)} · discharged {d.dischargeDate}{d.followUpCompleted ? ` · seen ${d.followUpCompleted} (day ${s.visitDay})` : ''}{d.excluded ? ` · ${d.excludeReason}` : ''}</span></span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Chip color={STATUS_COLOR[s.status]}>{FUH_STATUS_LABEL[s.status]}</Chip>
                  {canEdit && d.excluded && (
                    <Button variant="ghost" onClick={() => dischargesApi.update(d.id, { excluded: false, excludeReason: '' })} style={{ padding: '3px 8px', fontSize: 11 }}>Include</Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
