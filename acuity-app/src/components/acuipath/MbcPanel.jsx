import React, { useMemo, useState } from 'react'
import { Card, Field, Button, StatCard, Icon, theme, grid } from '../ui.jsx'
import { uid, today } from '../../lib/storage.js'
import { INSTRUMENTS, RESPONSE_OPTIONS, scoreAssessment, caseloadMbc } from '../../lib/mbc.js'

const TRIGGER_COLOR = { urgent: '#e0584a', review: '#e0b341', due: '#8a9a96' }
const BAND_COLOR = {
  minimal: '#3fb37f', mild: '#9bbf5a', moderate: '#e0b341', 'moderately-severe': '#e08a41', severe: '#e0584a',
}

function Spark({ series, max }) {
  if (!series || series.length < 2) return null
  const w = 84
  const h = 26
  const x = (i) => 2 + (i * (w - 4)) / (series.length - 1)
  const y = (v) => h - 2 - (v / max) * (h - 4)
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ')
  const last = series[series.length - 1]
  return (
    <svg width={w} height={h} aria-hidden="true" style={{ display: 'block' }}>
      {/* dashed line: the moderate cutoff (10 on both PHQ-9 and GAD-7) */}
      <line x1="2" x2={w - 2} y1={y(10)} y2={y(10)} stroke={theme.border} strokeDasharray="2 3" />
      <path d={d} fill="none" stroke={theme.accent} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(series.length - 1)} cy={y(last.total)} r="2.8" fill={theme.accent} />
    </svg>
  )
}

function ScoreCell({ trend, id }) {
  if (!trend) return <span style={{ fontSize: 11.5, color: theme.sub }}>—</span>
  const sev = trend.severity
  const ch = trend.count > 1 ? trend.change : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
          {trend.latest.total}<span style={{ fontSize: 10.5, color: theme.sub, fontWeight: 600 }}> /{INSTRUMENTS[id].max}</span>
        </div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: BAND_COLOR[sev.id] }}>{sev.label}</div>
      </div>
      <Spark series={trend.series} max={INSTRUMENTS[id].max} />
      {ch != null && (
        <div style={{ fontSize: 10.5, color: ch < 0 ? '#1f7a54' : ch > 0 ? '#a5342a' : theme.sub, fontWeight: 700 }}>
          {ch > 0 ? '+' : ''}{ch} from baseline
          {trend.remission && <div style={{ color: '#1f7a54' }}>Remission</div>}
          {!trend.remission && trend.response && <div style={{ color: '#1f7a54' }}>Response</div>}
        </div>
      )}
    </div>
  )
}

function AssessmentForm({ patient, instrument, onSave, onCancel }) {
  const inst = INSTRUMENTS[instrument]
  const [items, setItems] = useState(() => Array(inst.items.length).fill(null))
  const [date, setDate] = useState(today())
  const score = scoreAssessment(instrument, items)
  const answered = items.filter((v) => v != null).length
  const save = () => {
    if (!score.complete) return
    onSave({ id: uid(), patientId: patient.id, instrument, date, items, ...score, createdAt: Date.now() })
  }
  return (
    <div style={{ border: `1px solid ${theme.accent}`, borderRadius: 12, padding: 14, background: theme.panel, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 15 }}>{inst.label} — {patient.name}</div>
          <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 2, maxWidth: 620 }}>{inst.stem}</div>
        </div>
        <Field label="Date"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {inst.items.map((text, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center',
            padding: '7px 9px', borderRadius: 8, background: instrument === 'PHQ-9' && i === 8 && items[8] > 0 ? '#e0584a14' : theme.panelAlt }}>
            <div style={{ fontSize: 12, lineHeight: 1.4 }}><strong style={{ color: theme.sub }}>{i + 1}.</strong> {text}</div>
            <div role="radiogroup" aria-label={`Item ${i + 1}`} style={{ display: 'flex', gap: 3 }}>
              {RESPONSE_OPTIONS.map((o) => {
                const on = items[i] === o.value
                return (
                  <button key={o.value} type="button" role="radio" aria-checked={on} title={o.label}
                    onClick={() => setItems((cur) => cur.map((v, j) => (j === i ? o.value : v)))}
                    style={{ width: 30, padding: '5px 0', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accent : theme.panel, color: on ? '#fff' : theme.text }}>
                    {o.value}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 6 }}>
        {RESPONSE_OPTIONS.map((o) => `${o.value} = ${o.label}`).join(' · ')}
      </div>
      {instrument === 'PHQ-9' && items[8] > 0 && (
        <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 9, background: '#e0584a16', color: '#a5342a', fontSize: 12, fontWeight: 700, display: 'flex', gap: 7 }}>
          <Icon name="alert" size={14} />
          Item 9 is positive. Complete a suicide risk assessment today, before this patient leaves or the call ends.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <Button onClick={save} disabled={!score.complete}><Icon name="plusCircle" size={15} />Save {instrument}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <span style={{ fontSize: 12.5, color: theme.sub }}>
          {score.complete
            ? <>Total <strong style={{ color: theme.text }}>{score.total}</strong> · <strong style={{ color: BAND_COLOR[score.severity.id] }}>{score.severity.label}</strong></>
            : `${answered} of ${inst.items.length} answered — every item is needed to score`}
        </span>
      </div>
    </div>
  )
}

export default function MbcPanel({ patients, assessments, assessmentsApi, canEdit, onRescreen }) {
  const [form, setForm] = useState(null) // { patientId, instrument }
  const rows = useMemo(() => caseloadMbc(patients, assessments, { asOf: today() }), [patients, assessments])
  const count = (sev) => rows.filter((r) => r.triggers.some((t) => t.severity === sev)).length
  const responders = rows.filter((r) => r.phq?.response || r.gad?.response || r.phq?.remission || r.gad?.remission).length

  return (
    <div>
      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="Urgent — safety" value={count('urgent')} sub="PHQ-9 item 9 positive" icon="alert" color={count('urgent') ? '#e0584a' : '#3fb37f'} />
        <StatCard label="Re-screen recommended" value={count('review')} sub="worsening or severe score" icon="route" color={count('review') ? '#e0b341' : '#3fb37f'} />
        <StatCard label="Measure due" value={count('due')} sub="no baseline, or over 30 days old" icon="clock" color={theme.navy} />
        <StatCard label="Responding" value={responders} sub="response or remission from baseline" icon="pulse" color={theme.accent} />
      </div>

      <Card title="Measurement-based care" sub="PHQ-9 and GAD-7 over time, with the cases that need attention first">
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No patients on the caseload yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {rows.map((r) => (
              <div key={r.patient.id} style={{ border: `1px solid ${r.top === 'urgent' ? '#e0584a' : theme.border}`, borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1.5fr)', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{r.patient.name}</div>
                    <div style={{ fontSize: 11, color: theme.sub }}>{r.patient.program || 'No clinic'} · {r.patient.population}</div>
                  </div>
                  <div><div style={{ fontSize: 10, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>PHQ-9</div><ScoreCell trend={r.phq} id="PHQ-9" /></div>
                  <div><div style={{ fontSize: 10, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>GAD-7</div><ScoreCell trend={r.gad} id="GAD-7" /></div>
                </div>
                {r.triggers.length > 0 && (
                  <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                    {r.triggers.map((t) => (
                      <div key={t.id} style={{ fontSize: 11.5, padding: '5px 9px', borderRadius: 7, background: `${TRIGGER_COLOR[t.severity]}18`,
                        color: t.severity === 'urgent' ? '#a5342a' : t.severity === 'review' ? '#8a6a10' : theme.sub, fontWeight: t.severity === 'due' ? 500 : 700 }}>
                        {t.message}
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Button variant="ghost" onClick={() => setForm({ patientId: r.patient.id, instrument: 'PHQ-9' })} style={{ padding: '4px 10px', fontSize: 12 }}>Record PHQ-9</Button>
                    <Button variant="ghost" onClick={() => setForm({ patientId: r.patient.id, instrument: 'GAD-7' })} style={{ padding: '4px 10px', fontSize: 12 }}>Record GAD-7</Button>
                    {r.triggers.some((t) => t.severity !== 'due') && onRescreen && (
                      <Button variant="primary" onClick={() => onRescreen(r.patient)} style={{ padding: '4px 10px', fontSize: 12 }}>
                        <Icon name="route" size={13} />Re-screen (Tier 2)
                      </Button>
                    )}
                  </div>
                )}
                {form?.patientId === r.patient.id && (
                  <AssessmentForm
                    patient={r.patient}
                    instrument={form.instrument}
                    onCancel={() => setForm(null)}
                    onSave={(a) => { assessmentsApi.add(a); setForm(null) }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 12, lineHeight: 1.55 }}>
          PHQ-9 (Kroenke, Spitzer &amp; Williams, 2001) and GAD-7 (Spitzer et al., 2006) are reproduced as published; no
          permission is required to use them. Meaningful change is 5 points on the PHQ-9 and 4 on the GAD-7. Response
          means a 50% drop from a baseline of 10 or more; remission means a score under 5. These are screening and
          monitoring tools. They support clinical judgment; they do not diagnose and do not replace a suicide risk assessment.
        </div>
      </Card>
    </div>
  )
}
