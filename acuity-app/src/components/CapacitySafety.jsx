import React, { useMemo, useState } from 'react'
import { Card, Field, Button, StatCard, Icon, Badge, theme, grid } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'
import { STAGE_COLORS } from '../lib/model.js'
import { forecastLocation } from '../lib/forecast.js'
import { assessForecast } from '../lib/risk.js'
import { capacityOutlook, boardingHistory, CAPACITY_LABEL } from '../lib/capacity.js'
import {
  eventRatesByStage, unitEventRisks, eventCounts, SAFETY_EVENT_TYPES, SAFETY_TYPE_LABEL, VIOLENCE_TYPES,
} from '../lib/safety.js'
import { useCollection } from '../lib/store.js'
import { can } from '../lib/roles.js'
import { uid, today } from '../lib/storage.js'
import { dayIndex, dateFromDayIndex } from '../lib/forecast.js'
import { PairedBars, StageBars, MiniBars, Legend, SERIES } from './charts.jsx'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const STATUS_COLOR = { ok: '#1f7a54', tight: '#8a6a10', boarding: '#a5342a' }
const HORIZON = 6

const emptyEvent = (locId) => ({ locId, date: today(), shift: 'AM', type: 'restraint', severity: 1 })

export default function CapacitySafety({ locations, entries, thresholds, caps, role = 'admin' }) {
  const [events, eventsApi] = useCollection('safetyEvents', { localKey: 'bhai:safetyEvents', auditAs: 'safetyEvents' })
  const [filter, setFilter] = useState('violence')
  const [form, setForm] = useState(() => emptyEvent(locations.find((l) => l.type !== 'ed')?.id || locations[0]?.id || ''))
  const canLog = can(role, 'safety-log')

  const outlook = useMemo(
    () => capacityOutlook({ locations, entries, thresholds, caps, horizon: HORIZON }),
    [locations, entries, thresholds, caps]
  )
  const history = useMemo(() => boardingHistory(entries, locations, thresholds, { days: 14 }), [entries, locations, thresholds])

  const types = filter === 'violence' ? VIOLENCE_TYPES : null
  const rates = useMemo(
    () => eventRatesByStage({ events, entries, locations, thresholds, types }),
    [events, entries, locations, thresholds, types]
  )
  const units = useMemo(
    () => locations.map((loc) => ({ loc, assessment: assessForecast(forecastLocation(entries, loc, thresholds, { horizon: 2 }), loc, thresholds) })),
    [locations, entries, thresholds]
  )
  const risks = useMemo(() => unitEventRisks(units, rates), [units, rates])
  const from30 = dateFromDayIndex(dayIndex(today()) - 29)
  const counts30 = useMemo(() => eventCounts(events, { from: from30 }), [events, from30])
  const recent = useMemo(() => events.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0))).slice(0, 10), [events])
  const unitName = (id) => locations.find((l) => l.id === id)?.name || '—'

  const next = outlook.ok ? outlook.horizons[0] : null
  const submit = (e) => {
    e.preventDefault()
    if (!form.locId) return
    eventsApi.add({ id: uid(), ...form, severity: Number(form.severity), createdAt: Date.now() })
    setForm((f) => emptyEvent(f.locId))
  }

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Capacity &amp; Safety</div>
          <Badge color={theme.accent}>PREDICTIVE</Badge>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub, maxWidth: 820 }}>
          Will the region have beds for the behavioral health patients waiting in the ED, and where is the next
          assault or staff injury most likely? Both are forecast from your own logged history and shown with their
          working.
        </div>
      </div>

      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="Open beds next shift" value={next ? next.openBeds.toFixed(1) : '—'}
          sub={outlook.ok ? `across ${outlook.beds.length} units with a census cap` : 'needs census caps and history'} icon="bed" color={theme.accent} />
        <StatCard label="ED boarders next shift" value={next ? next.boarders.toFixed(1) : '—'}
          sub={next ? `${pct(next.pBoarding)} chance demand exceeds open beds` : 'needs ED boarding history'} icon="building"
          color={next && next.status === 'boarding' ? STAGE_COLORS.RED : theme.navy} />
        <StatCard label="Boarding expected" value={outlook.ok ? (outlook.shiftsToBoarding ? `in ${outlook.shiftsToBoarding} shift${outlook.shiftsToBoarding === 1 ? '' : 's'}` : 'None') : '—'}
          sub={outlook.ok ? `${Math.round(outlook.expectedBoardingHours)} boarding hours forecast over ${HORIZON} shifts` : ''} icon="clock"
          color={outlook.ok && outlook.shiftsToBoarding ? STAGE_COLORS.RED : STAGE_COLORS.GREEN} />
        <StatCard label="Safety events, 30 days" value={counts30.total}
          sub={rates.byStage.RED.relativeRisk ? `${rates.byStage.RED.relativeRisk.toFixed(1)}× as likely on a RED shift as GREEN` : 'logged by unit, date, shift and type'} icon="alert"
          color={counts30.total ? '#e08a41' : theme.navy} />
      </div>

      <Card title="Beds against ED boarding demand" sub={`Projected open inpatient beds and BH patients boarding in the ED, next ${HORIZON} shifts`}
        right={<Legend items={[{ label: 'Open inpatient beds', color: SERIES.a }, { label: 'ED boarders', color: SERIES.b }]} />}>
        {!outlook.ok ? (
          <div style={{ fontSize: 13, color: theme.sub }}>
            {outlook.reason === 'no-boarding-history'
              ? 'No ED boarding history yet. Log BH boarders and boarding hours on ED shift entries, and the forecast appears after about a week.'
              : 'No inpatient census forecast yet. Set census caps on the Status Board and log census on shift entries.'}
          </div>
        ) : (
          <>
            <PairedBars
              points={outlook.horizons.map((h) => ({
                label: `${h.date.slice(5)} ${h.shift}`,
                title: `${h.date} ${h.shift} shift`,
                a: h.openBeds,
                b: h.boarders,
                extra: [`Chance of boarding: ${pct(h.pBoarding)}`, `Boarding hours: ${Math.round(h.boardingHours)}`, CAPACITY_LABEL[h.status]],
                status: h.status,
              }))}
              aLabel="Open beds" bLabel="ED boarders"
              statusFor={(p) => ({ color: STATUS_COLOR[p.status], text: p.status === 'boarding' ? 'Boarding' : p.status === 'tight' ? 'Tight' : 'OK' })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, marginTop: 10 }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                      <th style={{ padding: '5px 6px' }}>Shift</th>
                      <th style={{ padding: '5px 6px', textAlign: 'right' }}>Open beds</th>
                      <th style={{ padding: '5px 6px', textAlign: 'right' }}>Boarders</th>
                      <th style={{ padding: '5px 6px', textAlign: 'right' }}>P(boarding)</th>
                      <th style={{ padding: '5px 6px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outlook.horizons.map((h) => (
                      <tr key={h.horizon} style={{ borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }}>
                        <td style={{ padding: '5px 6px' }}>{h.date} {h.shift}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{h.openBeds.toFixed(1)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{h.boarders.toFixed(1)}</td>
                        <td style={{ padding: '5px 6px', textAlign: 'right' }}>{pct(h.pBoarding)}</td>
                        <td style={{ padding: '5px 6px', color: STATUS_COLOR[h.status], fontWeight: 700 }}>{CAPACITY_LABEL[h.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>ED boarding hours, last 14 days</div>
                <MiniBars label="Daily ED boarding hours" points={history.map((d) => ({ key: d.date, label: d.date.slice(5), value: d.boardingHours }))} format={(v) => `${Math.round(v)} hours`} />
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 6, lineHeight: 1.5 }}>
                  Open beds are each unit&rsquo;s census cap minus its forecast census. Boarding demand comes from the ED&rsquo;s own
                  logged history; the chance of boarding uses that forecast&rsquo;s measured error.
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      <div style={{ ...grid(2, 16), marginTop: 16 }}>
        <Card title="Safety events by acuity stage" sub="Events per unit-shift, matched to the reading for that same shift"
          right={(
            <div role="group" aria-label="Event types" style={{ display: 'flex', gap: 4 }}>
              <Button variant={filter === 'violence' ? 'primary' : 'ghost'} onClick={() => setFilter('violence')} style={{ padding: '4px 9px', fontSize: 11.5 }}>Violence &amp; restraint</Button>
              <Button variant={filter === 'all' ? 'primary' : 'ghost'} onClick={() => setFilter('all')} style={{ padding: '4px 9px', fontSize: 11.5 }}>All events</Button>
            </div>
          )}>
          {rates.totalShifts === 0 || rates.totalEvents === 0 ? (
            <div style={{ fontSize: 13, color: theme.sub }}>No events logged yet. Rates appear once events are logged against shifts that have acuity readings.</div>
          ) : (
            <>
              <StageBars
                format={(v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`}
                rows={['GREEN', 'YELLOW', 'RED'].map((st) => ({
                  label: st,
                  value: rates.byStage[st].rate,
                  color: STAGE_COLORS[st],
                  lines: [
                    `${rates.byStage[st].events} events over ${rates.byStage[st].shifts} shifts`,
                    rates.byStage[st].relativeRisk ? `${rates.byStage[st].relativeRisk.toFixed(1)}× the GREEN rate` : 'baseline',
                  ],
                }))}
              />
              <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6, lineHeight: 1.5 }}>
                {rates.matchedEvents} events matched across {rates.totalShifts} unit-shifts.
                {rates.unmatched > 0 && ` ${rates.unmatched} could not be matched to a logged shift and are left out.`}
              </div>
            </>
          )}
        </Card>

        <Card title="Next-shift safety risk by unit" sub="Forecast stage probabilities × the event rate for each stage">
          {risks.length === 0 || rates.totalEvents === 0 ? (
            <div style={{ fontSize: 13, color: theme.sub }}>Appears once units have forecasts and events have been logged.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {risks.map((r) => (
                <div key={r.loc.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 46px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 600 }}>{r.loc.name}
                    <span style={{ color: theme.sub, fontWeight: 400 }}> · RED {pct(r.probs.RED)}</span>
                  </span>
                  <div style={{ height: 8, background: theme.panelAlt, borderRadius: 999, overflow: 'hidden' }} title={`${r.expectedEvents.toFixed(2)} expected events`}>
                    <div style={{ width: `${Math.min(100, r.pAtLeastOne * 100 * 2.5)}%`, height: '100%', background: r.pAtLeastOne >= 0.15 ? STAGE_COLORS.RED : r.pAtLeastOne >= 0.08 ? STAGE_COLORS.YELLOW : STAGE_COLORS.GREEN, borderRadius: 999 }} />
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{pct(r.pAtLeastOne)}</span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: theme.sub, marginTop: 4, lineHeight: 1.5 }}>
                Chance of at least one {filter === 'violence' ? 'violence or restraint' : 'safety'} event next shift. Units most
                likely to go RED rank highest. Staffing them ahead of the shift is the lever the Command Center plan already pulls.
              </div>
            </div>
          )}
        </Card>
      </div>

      <div style={{ ...grid(2, 16), marginTop: 16 }}>
        {canLog && (
          <Card title="Log a safety event" sub="Unit, date, shift and type only — no patient or staff names">
            <form onSubmit={submit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <Field label="Unit">
                  <select id="evt-unit" value={form.locId} onChange={(e) => setForm((f) => ({ ...f, locId: e.target.value }))}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select id="evt-type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    {SAFETY_EVENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Date"><input id="evt-date" type="date" value={form.date} max={today()} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} /></Field>
                <Field label="Shift">
                  <select id="evt-shift" value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}>
                    <option value="AM">AM</option><option value="PM">PM</option>
                  </select>
                </Field>
                <Field label="Severity">
                  <select id="evt-sev" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                    <option value={1}>No or minor injury</option>
                    <option value={2}>Injury needing treatment</option>
                    <option value={3}>Serious injury</option>
                  </select>
                </Field>
              </div>
              <Button type="submit"><Icon name="plusCircle" size={15} />Log event</Button>
            </form>
          </Card>
        )}

        <Card title="Recent events" sub={`${events.length} logged in total`}>
          {recent.length === 0 ? (
            <div style={{ fontSize: 13, color: theme.sub }}>None logged.</div>
          ) : (
            <div style={{ display: 'grid', gap: 5 }}>
              {recent.map((e) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12, padding: '6px 9px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  <span><strong>{SAFETY_TYPE_LABEL[e.type] || e.type}</strong> <span style={{ color: theme.sub }}>· {unitName(e.locId)} · {e.date} {e.shift}{e.severity >= 2 ? ' · injury' : ''}</span></span>
                  {can(role, 'remove-records') && (
                    <Button variant="danger" onClick={() => eventsApi.remove(e.id)} style={{ padding: '3px 8px', fontSize: 11 }}>Remove</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
