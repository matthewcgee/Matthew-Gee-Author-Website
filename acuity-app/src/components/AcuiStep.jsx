import React, { useMemo, useState } from 'react'
import { Card, Button, Field, theme, grid } from './ui.jsx'
import { can } from '../lib/roles.js'
import { anchorsFor, DIMENSIONS } from '../lib/loc.js'
import {
  screenIop, emptyIntake, OPTIONS, CONCERNS, REFERRAL_SOURCES, SOURCE_BY_ID, STATUSES, STATUS_BY_ID,
  DISPOSITIONS, programCensus, daysWaiting, POPULATION_LABEL,
} from '../lib/iop.js'
import { useIopData, intakeRecord } from '../lib/iopData.js'

/* ------------------------------------------------------------------ brand */

const TONE = {
  good: { fg: '#11795a', bg: '#e3f4ec', line: '#9fd8bf' },
  warn: { fg: '#9a5b00', bg: '#fbf0dc', line: '#ecc983' },
  stop: { fg: '#b23a2e', bg: '#fbe7e4', line: '#eab0a8' },
  info: { fg: '#2f5f9e', bg: '#e6eef9', line: '#adc4e6' },
}
const SEV_TONE = { stop: 'stop', exclude: 'stop', fix: 'warn', note: 'info' }
const SEV_LABEL = { stop: 'Step up', exclude: 'Barrier', fix: 'Resolve', note: 'Note' }
// Census mix: each verdict its own colour (the two 'stop' verdicts differ here).
const MIX_COLOR = { eligible: '#5fbf96', conditional: '#e5b85a', higher: '#d9786c', lower: '#8fb0de', alternative: '#a9b4b1' }

/** The AcuiStep™ mark: a rising stair that lands on a point, in the Acuitas gradient. */
export function AcuiStepMark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="AcuiStep" style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id="acuistep-g" x1="8" y1="40" x2="40" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1295a3" /><stop offset=".55" stopColor="#1aa7a6" /><stop offset="1" stopColor="#67cfae" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="12" fill={theme.navy} />
      <path d="M9 37h8v-8h8v-8h8v-8" fill="none" stroke="url(#acuistep-g)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="37.5" cy="11" r="4.2" fill="#67cfae" stroke={theme.navy} strokeWidth="1.6" />
    </svg>
  )
}

/* --------------------------------------------------------------- controls */

function Segmented({ options, value, onChange, label, small }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)}
            style={{
              padding: small ? '5px 10px' : '7px 12px', borderRadius: 8, fontSize: small ? 12 : 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer',
              border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentSoft : '#fff', color: on ? '#0b5a54' : theme.text,
            }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '8px 10px', borderRadius: 8, border: `1px solid ${checked ? theme.accent : theme.border}`, background: checked ? theme.accentSoft : '#fff' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span style={{ fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 11.5, color: theme.sub, marginTop: 2 }}>{hint}</span>}
      </span>
    </label>
  )
}

function Pill({ tone = 'info', children }) {
  const t = TONE[tone]
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: t.fg, background: t.bg, border: `1px solid ${t.line}`, whiteSpace: 'nowrap' }}>{children}</span>
}

function Q({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: theme.text }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: theme.sub, margin: '2px 0 0' }}>{hint}</div>}
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  )
}

const inputStyle = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13.5, color: theme.text, background: '#fff', fontFamily: 'inherit' }

/* ---------------------------------------------------------------- verdict */

function Criteria({ criteria }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {criteria.map((c) => {
        const mark = c.met === true ? { s: '✓', tone: 'good' } : c.met === false ? { s: '✕', tone: 'stop' } : { s: '?', tone: 'warn' }
        const t = TONE[mark.tone]
        return (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8, alignItems: 'start', fontSize: 12.5 }} title={c.detail || ''}>
            <span aria-label={c.met === true ? 'met' : c.met === false ? 'not met' : 'to confirm'} style={{ width: 20, height: 20, borderRadius: 6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: t.fg, background: t.bg, border: `1px solid ${t.line}` }}>{mark.s}</span>
            <span><span style={{ fontWeight: 600 }}>{c.label}</span>{c.detail && <span style={{ display: 'block', color: theme.sub, fontSize: 11.5 }}>{c.detail}</span>}</span>
          </div>
        )
      })}
    </div>
  )
}

function Verdict({ r, compact }) {
  const d = DISPOSITIONS[r.disposition]
  const t = TONE[d.tone]
  return (
    <div>
      <div style={{ borderRadius: 12, padding: '14px 16px', background: t.bg, border: `1px solid ${t.line}` }}>
        <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 700, color: t.fg }}>AcuiStep verdict</div>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 21, color: theme.text, marginTop: 4, lineHeight: 1.15 }}>{d.label}</div>
        <div style={{ fontSize: 12.5, color: '#34504a', marginTop: 4 }}>{d.blurb}</div>
        {r.higherLevel && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: t.fg }}>Recommend: {r.higherLevel.label}</div>}
        {r.track && (r.disposition === 'eligible' || r.disposition === 'conditional') && (
          <div style={{ marginTop: 8, fontSize: 12.5 }}>
            <span style={{ fontWeight: 700 }}>Track: {r.track.name}</span>
            <span style={{ display: 'block', color: theme.sub }}>{r.track.schedule} · about {r.track.weeks} weeks · {r.track.why}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '12px 0 4px', fontSize: 12.5, color: theme.sub }}>
        <span><b style={{ color: theme.text, fontSize: 15 }}>{r.criteriaMet}/{r.criteria.length}</b> criteria met</span>
        <span><b style={{ color: theme.text, fontSize: 15 }}>{r.loc.total}/30</b> overall need</span>
        {(r.disposition === 'eligible' || r.disposition === 'conditional') && <span>Start by <b style={{ color: theme.text }}>{r.targetStart.date}</b></span>}
      </div>
      <IntensityMeter total={r.loc.total} stepDown={r.stepDown} />
      <div style={{ marginTop: 12 }}><Criteria criteria={r.criteria} /></div>
      {!compact && r.findings.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {r.findings.slice(0, 6).map((f) => (
            <div key={f.id} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <Pill tone={SEV_TONE[f.sev]}>{SEV_LABEL[f.sev]}</Pill><span>{f.text}</span>
            </div>
          ))}
          {r.findings.length > 6 && <div style={{ fontSize: 11.5, color: theme.sub }}>+ {r.findings.length - 6} more on the review step</div>}
        </div>
      )}
    </div>
  )
}

// Where the composite sits among the level bands: outpatient, IOP, PHP, 24-hour.
function IntensityMeter({ total, stepDown }) {
  const bands = [
    { from: 6, to: 13, label: 'Outpatient', c: '#cfe4f5' },
    { from: 14, to: 17, label: 'IOP', c: '#9fd8bf' },
    { from: 18, to: 22, label: 'PHP', c: '#ecc983' },
    { from: 23, to: 30, label: '24-hour', c: '#eab0a8' },
  ]
  const x = (v) => ((v - 6) / 24) * 100
  return (
    <div aria-label={`Overall need ${total} of 30`} style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 14, display: 'flex', borderRadius: 7, overflow: 'hidden' }}>
        {bands.map((b) => <div key={b.label} style={{ width: `${x(b.to + 1) - x(b.from)}%`, background: b.c }} />)}
        <div style={{ position: 'absolute', top: -3, left: `calc(${x(Math.min(30, Math.max(6, total)) + 0.5)}% - 2px)`, width: 4, height: 20, background: theme.navy, borderRadius: 2 }} />
      </div>
      <div style={{ display: 'flex', fontSize: 10.5, color: theme.sub, marginTop: 3 }}>
        {bands.map((b) => <span key={b.label} style={{ width: `${x(b.to + 1) - x(b.from)}%`, textAlign: 'center' }}>{b.label}</span>)}
      </div>
      {stepDown && <div style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>Step-down referral: IOP can be right even when need has fallen into the outpatient band.</div>}
    </div>
  )
}

/* ------------------------------------------------------------- intake form */

const STEPS = [
  { id: 'referral', label: 'Referral' },
  { id: 'safety', label: 'Safety' },
  { id: 'stability', label: 'Stability' },
  { id: 'need', label: 'Need' },
  { id: 'readiness', label: 'Readiness' },
  { id: 'review', label: 'Review' },
]

function IntakeForm({ io, role, identity, editing, onDone }) {
  const [a, setA] = useState(() => (editing ? { ...emptyIntake(), ...editing } : emptyIntake()))
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState(false)
  // A case sent from AcuiPath arrives with safety, stability and readiness
  // unconfirmed. Opening each of those steps is the clinician confirming it.
  React.useEffect(() => {
    const sec = STEPS[step].id
    if ((a.pendingSections || []).includes(sec)) setA((p) => ({ ...p, pendingSections: p.pendingSections.filter((x) => x !== sec) }))
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => screenIop(a, { tracks: io.tracks }), [a, io.tracks])
  const set = (k) => (v) => setA((p) => ({ ...p, [k]: v }))
  const setScore = (d, v) => setA((p) => ({ ...p, scores: { ...p.scores, [d]: v } }))
  const anchors = anchorsFor(a.population)
  const canSave = can(role, 'op-screen')

  const save = async () => {
    const rec = intakeRecord(a, {
      id: editing?.id, tracks: io.tracks, by: identity?.name || null, createdAt: editing?.createdAt,
      status: editing?.status, tasksDone: editing?.tasksDone,
    })
    await io.intakesApi.upsert(rec)
    onDone(rec.id)
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.summary); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setCopied(false) }
  }

  const body = (() => {
    switch (STEPS[step].id) {
      case 'referral': return (
        <>
          <div style={grid(2)}>
            <Field label="Case label" hint="A case or referral number only. Never a name or MRN.">
              <input value={a.caseLabel} onChange={(e) => set('caseLabel')(e.target.value)} placeholder="e.g. IOP-2413" style={inputStyle} />
            </Field>
            <Field label="Referral date">
              <input type="date" value={a.referralDate} onChange={(e) => set('referralDate')(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <div style={{ height: 14 }} />
          <Q title="Population"><Segmented label="Population" options={[{ id: 'adult', label: 'Adult' }, { id: 'adolescent', label: 'Adolescent' }]} value={a.population} onChange={set('population')} /></Q>
          <Q title="Referred from" hint="Step-downs from inpatient or PHP are judged for continuity, and start within 7 days.">
            <Segmented label="Referral source" options={REFERRAL_SOURCES} value={a.referralSource} onChange={set('referralSource')} small />
          </Q>
          <Q title="Presenting concerns" hint="Select all that apply. These drive the track match.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {CONCERNS.map((c) => {
                const on = a.concerns.includes(c.id)
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => set('concerns')(on ? a.concerns.filter((x) => x !== c.id) : [...a.concerns, c.id])}
                    style={{ padding: '6px 11px', borderRadius: 999, fontSize: 12.5, cursor: 'pointer', border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accent : '#fff', color: on ? '#fff' : theme.text, fontWeight: on ? 700 : 500 }}>{c.label}</button>
                )
              })}
            </div>
          </Q>
        </>
      )
      case 'safety': return (
        <>
          <Q title="Suicidal ideation (current)"><Segmented label="Suicidal ideation" options={OPTIONS.ideation} value={a.ideation} onChange={set('ideation')} small /></Q>
          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            <Toggle checked={a.recentAttempt} onChange={set('recentAttempt')} label="Suicide attempt or preparatory behavior in the past 3 months" />
            <Toggle checked={a.selfHarm} onChange={set('selfHarm')} label="Recent non-suicidal self-harm" />
            <Toggle checked={a.safetyPlan} onChange={set('safetyPlan')} label="Can collaborate on a written safety plan and reach crisis support between sessions" hint="If not, IOP needs one before start, or a more structured level first." />
          </div>
          <Q title="Violence risk"><Segmented label="Violence risk" options={OPTIONS.violence} value={a.violence} onChange={set('violence')} small /></Q>
        </>
      )
      case 'stability': return (
        <>
          <Q title="Psychotic symptoms"><Segmented label="Psychosis" options={OPTIONS.psychosis} value={a.psychosis} onChange={set('psychosis')} small /></Q>
          <Q title="Manic symptoms"><Segmented label="Mania" options={OPTIONS.mania} value={a.mania} onChange={set('mania')} small /></Q>
          <Q title="Substance use"><Segmented label="Substance use" options={OPTIONS.substance} value={a.substance} onChange={set('substance')} small /></Q>
          <Q title="Medical status"><Segmented label="Medical status" options={OPTIONS.medical} value={a.medical} onChange={set('medical')} small /></Q>
          <Q title="Group participation" hint="IOP is built around 3-hour group days."><Segmented label="Group participation" options={OPTIONS.cognition} value={a.cognition} onChange={set('cognition')} small /></Q>
        </>
      )
      case 'need': return (
        <>
          <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 12 }}>The same six dimensions as the AcuiPath level-of-care screen (1 = minimal, 5 = severe). The total places the referral against the outpatient, IOP and PHP bands.</div>
          {DIMENSIONS.map((d) => (
            <Q key={d} title={anchors[d].label} hint={anchors[d].detail}>
              <Segmented label={anchors[d].label} options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: String(n) }))} value={a.scores[d]} onChange={(v) => setScore(d, v)} small />
              <div style={{ fontSize: 12, color: theme.text, marginTop: 6, background: theme.panelAlt, borderRadius: 8, padding: '6px 10px' }}>{anchors[d].anchors[a.scores[d] - 1]}</div>
            </Q>
          ))}
          <div style={grid(2)}>
            <Field label="PHQ-9 (0–27)" hint="Baseline for measurement-based care."><input type="number" min="0" max="27" value={a.phq9} onChange={(e) => set('phq9')(e.target.value)} style={inputStyle} /></Field>
            <Field label="GAD-7 (0–21)"><input type="number" min="0" max="21" value={a.gad7} onChange={(e) => set('gad7')(e.target.value)} style={inputStyle} /></Field>
          </div>
        </>
      )
      case 'readiness': return (
        <>
          <Q title="Willingness"><Segmented label="Willingness" options={OPTIONS.willing} value={a.willing} onChange={set('willing')} small /></Q>
          <Q title="Schedule"><Segmented label="Schedule" options={OPTIONS.schedule} value={a.schedule} onChange={set('schedule')} small /></Q>
          <Q title="Transport"><Segmented label="Transport" options={OPTIONS.transport} value={a.transport} onChange={set('transport')} small /></Q>
          <div style={{ marginBottom: 16 }}><Toggle checked={a.telehealthOk} onChange={set('telehealthOk')} label="Open to a virtual (telehealth) track" hint="Has a device, a private space and a connection." /></div>
          <Q title="Payer"><Segmented label="Payer" options={OPTIONS.payer} value={a.payer} onChange={set('payer')} small /></Q>
          <Q title="Authorization"><Segmented label="Authorization" options={OPTIONS.auth} value={a.auth} onChange={set('auth')} small /></Q>
          <Field label="Clinical notes" hint="Optional. Kept with the intake and never copied into the audit log.">
            <textarea value={a.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </Field>
        </>
      )
      default: return <Review r={r} onCopy={copy} copied={copied} />
    }
  })()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }} className="acuistep-grid">
      <Card title={editing ? `Edit intake ${editing.caseLabel || ''}` : 'New IOP intake'} sub="Six short steps. The verdict updates as you go." style={{ marginBottom: 0 }}>
        <div role="tablist" aria-label="Intake steps" style={{ display: 'flex', gap: 4, marginBottom: 18, flexWrap: 'wrap' }}>
          {STEPS.map((s, k) => {
            const on = k === step, done = k < step
            return (
              <button key={s.id} role="tab" aria-selected={on} type="button" onClick={() => setStep(k)}
                style={{ flex: '1 1 90px', padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: on ? 700 : 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accent : done ? theme.accentSoft : '#fff', color: on ? '#fff' : theme.text }}>
                <span style={{ width: 18, height: 18, borderRadius: 9, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'rgba(255,255,255,.25)' : done ? theme.accent : theme.panelAlt, color: on || done ? '#fff' : theme.sub }}>{done ? '✓' : k + 1}</span>
                {s.label}
              </button>
            )
          })}
        </div>
        {a.fromAcuiPath && (a.pendingSections || []).length > 0 && (
          <div style={{ fontSize: 12.5, background: theme.accentSoft, color: '#0b5a54', borderRadius: 8, padding: '8px 12px', marginBottom: 14 }}>
            Sent from <b>AcuiPath</b>: case label, concerns, the six dimension scores and any PHQ-9 / GAD-7 carried over. Open <b>{a.pendingSections.map((s) => s[0].toUpperCase() + s.slice(1)).join(', ')}</b> to confirm the rest.
          </div>
        )}
        {body}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
            {editing && <Button variant="ghost" onClick={() => onDone(editing.id)}>Cancel</Button>}
          </div>
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep((s) => s + 1)}>Next: {STEPS[step + 1].label}</Button>
            : <Button onClick={save} disabled={!canSave || !a.caseLabel.trim()}>{editing ? 'Save changes' : 'Save intake'}</Button>}
        </div>
        {step === STEPS.length - 1 && !a.caseLabel.trim() && <div style={{ fontSize: 12, color: TONE.warn.fg, marginTop: 8, textAlign: 'right' }}>Add a case label on the Referral step to save.</div>}
      </Card>
      <div style={{ position: 'sticky', top: 12 }}>
        <Card title="Live verdict" sub="Decision support; the clinician decides." style={{ marginBottom: 0 }}>
          <Verdict r={r} compact={step === STEPS.length - 1} />
        </Card>
      </div>
    </div>
  )
}

function Review({ r, onCopy, copied }) {
  const groups = ['stop', 'exclude', 'fix', 'note'].map((sev) => ({ sev, items: r.findings.filter((f) => f.sev === sev) })).filter((g) => g.items.length)
  return (
    <div>
      {groups.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>No concerns found. Every criterion is met.</div>}
      {groups.map((g) => (
        <div key={g.sev} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: TONE[SEV_TONE[g.sev]].fg, textTransform: 'uppercase', letterSpacing: 1 }}>{{ stop: 'Needs a higher level', exclude: 'Barriers', fix: 'Resolve before start', note: 'For the treatment team' }[g.sev]}</div>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.5 }}>{g.items.map((f) => <li key={f.id}>{f.text}</li>)}</ul>
        </div>
      ))}
      {r.plan && (
        <div style={{ marginTop: 6, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
          <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 15 }}>Treatment path</div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>{r.plan.schedule} · {r.plan.hoursPerWeek} hours a week · about {r.plan.weeks} weeks. {r.plan.minimumNote}</div>
          <ul style={{ margin: '8px 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.5 }}>{r.plan.components.map((c) => <li key={c}>{c}</li>)}</ul>
          <div style={{ ...grid(3, 10), marginTop: 10, fontSize: 12 }}>
            <div style={{ background: theme.panelAlt, borderRadius: 8, padding: 10 }}><b>Review</b><div style={{ color: theme.sub, marginTop: 2 }}>{r.plan.reviewEvery}</div></div>
            <div style={{ background: theme.panelAlt, borderRadius: 8, padding: 10 }}><b>Step up if</b><div style={{ color: theme.sub, marginTop: 2 }}>{r.plan.stepUpIf}</div></div>
            <div style={{ background: theme.panelAlt, borderRadius: 8, padding: 10 }}><b>Step down to</b><div style={{ color: theme.sub, marginTop: 2 }}>{r.plan.stepDownTo}</div></div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 14, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 15 }}>Intake tasks</div>
        <ol style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.55 }}>{r.tasks.map((t) => <li key={t.id}>{t.label}{t.why && <span style={{ color: theme.sub }}> — {t.why}</span>}</li>)}</ol>
      </div>
      <div style={{ marginTop: 14, borderTop: `1px solid ${theme.border}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 15 }}>Summary for the chart</div>
          <Button variant="ghost" onClick={onCopy}>{copied ? 'Copied' : 'Copy summary'}</Button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.55, background: theme.panelAlt, borderRadius: 8, padding: 12, margin: '8px 0 0' }}>{r.summary}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ queue */

const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, k) => [s.id, k]))

function Queue({ io, role, onEdit, openId, setOpenId }) {
  const [filter, setFilter] = useState('active')
  const today = new Date()
  const rows = useMemo(() => io.intakes
    .map((x) => ({ x, r: screenIop(x, { tracks: io.tracks }) }))
    .filter(({ x }) => filter === 'all' || (filter === 'active' ? ['screening', 'pending', 'scheduled'].includes(x.status) : x.status === filter))
    .sort((p, q) => (STATUS_ORDER[p.x.status] - STATUS_ORDER[q.x.status]) || String(p.r.targetStart.date).localeCompare(String(q.r.targetStart.date))), [io.intakes, io.tracks, filter])
  const canEdit = can(role, 'op-screen')

  const all = io.intakes
  const recent = all.filter((x) => daysWaiting(x, today) <= 30)
  const admittedDays = all.filter((x) => x.status === 'admitted' && x.admittedOn).map((x) => Math.max(0, Math.round((Date.parse(`${x.admittedOn}T12:00:00`) - Date.parse(`${x.referralDate}T12:00:00`)) / 864e5))).sort((p, q) => p - q)
  const median = admittedDays.length ? admittedDays[Math.floor(admittedDays.length / 2)] : null
  const stats = [
    { label: 'Referrals, last 30 days', value: recent.length },
    { label: 'IOP-eligible', value: all.filter((x) => x.disposition === 'eligible' || x.disposition === 'conditional').length, sub: 'eligible or conditional' },
    { label: 'Waiting to start', value: all.filter((x) => ['screening', 'pending', 'scheduled'].includes(x.status)).length },
    { label: 'Stepped up at screening', value: all.filter((x) => x.disposition === 'higher').length, sub: 'caught before IOP' },
    { label: 'Median days to admission', value: median == null ? '—' : median, sub: median == null ? 'recorded when admitted' : 'referral to admission' },
  ]

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 22, color: theme.navy }}>{s.value}</div>
            <div style={{ fontSize: 12, color: theme.sub, marginTop: 2 }}>{s.label}{s.sub && <span style={{ display: 'block', fontSize: 11 }}>{s.sub}</span>}</div>
          </div>
        ))}
      </div>
      <Card title="Intake queue" sub="Every referral, ordered by status and target start. Overdue starts are flagged."
        right={<Segmented small label="Filter" value={filter} onChange={setFilter} options={[{ id: 'active', label: 'Active' }, { id: 'admitted', label: 'Admitted' }, { id: 'referred', label: 'Referred' }, { id: 'all', label: 'All' }]} />}>
        {rows.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>No intakes here yet. Start one under New intake, or load sample data in Settings.</div>}
        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: theme.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {['Case', 'From', 'Waiting', 'Verdict', 'Track', 'Tasks', 'Start by', 'Status'].map((h) => <th key={h} style={{ padding: '6px 8px', borderBottom: `1.5px solid ${theme.text}`, fontWeight: 600 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(({ x, r }) => {
                  const done = r.tasks.filter((t) => x.tasksDone?.[t.id]).length
                  const overdue = ['screening', 'pending', 'scheduled'].includes(x.status) && (r.disposition === 'eligible' || r.disposition === 'conditional') && r.targetStart.date < today.toISOString().slice(0, 10)
                  const open = openId === x.id
                  return (
                    <React.Fragment key={x.id}>
                      <tr onClick={() => setOpenId(open ? null : x.id)} style={{ cursor: 'pointer', background: open ? theme.panelAlt : undefined }}>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}`, fontWeight: 700 }}>{x.caseLabel}<span style={{ display: 'block', fontWeight: 400, color: theme.sub, fontSize: 11 }}>{POPULATION_LABEL[x.population]}{x.fromAcuiPath ? ' · from AcuiPath' : ''}{(x.pendingSections || []).length ? ' · screen not finished' : ''}</span></td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}>{SOURCE_BY_ID[x.referralSource]?.label}</td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}>{daysWaiting(x, today)} d</td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}><Pill tone={DISPOSITIONS[r.disposition].tone}>{DISPOSITIONS[r.disposition].label}</Pill></td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}>{r.higherLevel ? <span style={{ color: TONE.stop.fg }}>{r.higherLevel.label}</span> : (r.track?.name || '—')}</td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }}>{done}/{r.tasks.length}</td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap', color: overdue ? TONE.stop.fg : theme.text, fontWeight: overdue ? 700 : 400 }}>{r.disposition === 'eligible' || r.disposition === 'conditional' ? r.targetStart.date : '—'}{overdue && ' · overdue'}</td>
                        <td style={{ padding: '8px', borderBottom: `1px solid ${theme.border}` }}>{STATUS_BY_ID[x.status]?.label}</td>
                      </tr>
                      {open && (
                        <tr><td colSpan={8} style={{ padding: 0, borderBottom: `1px solid ${theme.border}` }}>
                          <IntakeDetail x={x} r={r} io={io} canEdit={canEdit} onEdit={() => onEdit(x)} />
                        </td></tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}

function IntakeDetail({ x, r, io, canEdit, onEdit }) {
  const toggleTask = (id) => io.intakesApi.update(x.id, { tasksDone: { ...(x.tasksDone || {}), [id]: !x.tasksDone?.[id] }, updatedAt: Date.now() })
  const setStatus = (status) => io.intakesApi.update(x.id, { status, updatedAt: Date.now(), ...(status === 'admitted' && !x.admittedOn ? { admittedOn: new Date().toISOString().slice(0, 10) } : {}) })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, padding: 14, background: theme.panelAlt }} className="acuistep-grid">
      <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: `1px solid ${theme.border}` }}>
        <Verdict r={r} />
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 15 }}>Intake tasks</div>
          {canEdit && <select aria-label="Status" value={x.status} onChange={(e) => setStatus(e.target.value)} style={{ ...inputStyle, padding: '5px 8px', fontSize: 12.5 }}>{STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
        </div>
        <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
          {r.tasks.map((t) => (
            <label key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: canEdit ? 'pointer' : 'default', opacity: x.tasksDone?.[t.id] ? 0.6 : 1 }}>
              <input type="checkbox" disabled={!canEdit} checked={!!x.tasksDone?.[t.id]} onChange={() => toggleTask(t.id)} style={{ marginTop: 3 }} />
              <span style={{ textDecoration: x.tasksDone?.[t.id] ? 'line-through' : 'none' }}>{t.label}{t.why && <span style={{ display: 'block', fontSize: 11.5, color: theme.sub }}>{t.why}</span>}</span>
            </label>
          ))}
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: theme.sub, background: theme.panelAlt, borderRadius: 8, padding: 10, marginTop: 12 }}>{r.summary}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {canEdit && <Button variant="ghost" onClick={onEdit}>Edit answers</Button>}
          {canEdit && <Button variant="danger" onClick={() => { if (window.confirm(`Remove intake ${x.caseLabel}?`)) io.intakesApi.remove(x.id) }}>Remove</Button>}
          <span style={{ fontSize: 11.5, color: theme.sub, alignSelf: 'center' }}>{x.by ? `Screened by ${x.by}` : ''}</span>
        </div>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- census */

function Census({ io }) {
  const census = programCensus(io.intakes, io.tracks)
  const mix = Object.keys(DISPOSITIONS).map((k) => ({ k, n: io.intakes.filter((x) => x.disposition === k).length }))
  const total = mix.reduce((s, m) => s + m.n, 0)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
        {census.map((c) => {
          const used = c.admitted + c.scheduled
          const pct = c.capacity ? Math.min(100, (used / c.capacity) * 100) : 0
          const full = c.capacity && used >= c.capacity
          return (
            <Card key={c.track.id} title={c.track.name} sub={`${c.track.schedule} · ${c.track.telehealth ? 'in person or virtual' : 'in person'}`} style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 26, color: theme.navy }}>{used}<span style={{ fontSize: 15, color: theme.sub }}>/{c.capacity}</span></span>
                <span style={{ fontSize: 12, color: full ? TONE.stop.fg : theme.sub, fontWeight: full ? 700 : 400 }}>{full ? 'Full' : `${c.open} open slot${c.open === 1 ? '' : 's'}`}</span>
              </div>
              <div role="img" aria-label={`${c.admitted} admitted and ${c.scheduled} scheduled of ${c.capacity}`} style={{ height: 10, background: theme.panelAlt, borderRadius: 5, overflow: 'hidden', display: 'flex', marginTop: 8 }}>
                <div style={{ width: `${c.capacity ? (c.admitted / c.capacity) * 100 : 0}%`, background: theme.accent }} />
                <div style={{ width: `${Math.max(0, pct - (c.capacity ? (c.admitted / c.capacity) * 100 : 0))}%`, background: '#9fd8bf' }} />
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: theme.sub, marginTop: 6 }}>
                <span><b style={{ color: theme.text }}>{c.admitted}</b> admitted</span>
                <span><b style={{ color: theme.text }}>{c.scheduled}</b> starting</span>
                <span><b style={{ color: theme.text }}>{c.waiting}</b> in intake</span>
              </div>
            </Card>
          )
        })}
      </div>
      <Card title="Where referrals land" sub="Every saved screen, by verdict." style={{ marginTop: 16 }}>
        {total === 0 ? <div style={{ fontSize: 13, color: theme.sub }}>No intakes yet.</div> : (
          <>
            <div role="img" aria-label="Referrals by verdict" style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', gap: 2 }}>
              {mix.filter((m) => m.n).map((m) => <div key={m.k} title={`${DISPOSITIONS[m.k].label}: ${m.n}`} style={{ width: `${(m.n / total) * 100}%`, background: MIX_COLOR[m.k] }} />)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 10, fontSize: 12.5 }}>
              {mix.map((m) => <span key={m.k}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: MIX_COLOR[m.k], marginRight: 6 }} />{DISPOSITIONS[m.k].label}: <b>{m.n}</b></span>)}
            </div>
          </>
        )}
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ setup */

function Setup({ io }) {
  const [draft, setDraft] = useState(() => io.tracks.map((t) => ({ ...t })))
  const [saved, setSaved] = useState(false)
  const upd = (k, field, v) => setDraft((ds) => ds.map((t, j) => (j === k ? { ...t, [field]: v } : t)))
  return (
    <Card title="Program setup" sub="The tracks your IOP actually runs. Disabled tracks are never recommended; capacity drives the census."
      right={<Button onClick={() => { io.setTracks(draft); setSaved(true); setTimeout(() => setSaved(false), 1800) }}>{saved ? 'Saved' : 'Save tracks'}</Button>}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: theme.sub, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {['On', 'Track name', 'For', 'Schedule', 'Hours / week', 'Weeks', 'Capacity', 'Virtual'].map((h) => <th key={h} style={{ padding: '6px', borderBottom: `1.5px solid ${theme.text}`, fontWeight: 600 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {draft.map((t, k) => (
              <tr key={t.id}>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input type="checkbox" aria-label={`Enable ${t.name}`} checked={t.enabled} onChange={(e) => upd(k, 'enabled', e.target.checked)} /></td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input aria-label="Track name" value={t.name} onChange={(e) => upd(k, 'name', e.target.value)} style={{ ...inputStyle, width: '100%', minWidth: 170 }} /></td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}`, color: theme.sub }}>{POPULATION_LABEL[t.population]}</td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input aria-label="Schedule" value={t.schedule} onChange={(e) => upd(k, 'schedule', e.target.value)} style={{ ...inputStyle, width: '100%', minWidth: 200 }} /></td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input aria-label="Hours per week" type="number" min="6" max="19" value={t.hoursPerWeek} onChange={(e) => upd(k, 'hoursPerWeek', Number(e.target.value))} style={{ ...inputStyle, width: 70 }} /></td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input aria-label="Weeks" type="number" min="1" max="26" value={t.weeks} onChange={(e) => upd(k, 'weeks', Number(e.target.value))} style={{ ...inputStyle, width: 64 }} /></td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input aria-label="Capacity" type="number" min="0" value={t.capacity} onChange={(e) => upd(k, 'capacity', Number(e.target.value))} style={{ ...inputStyle, width: 70 }} /></td>
                <td style={{ padding: 6, borderBottom: `1px solid ${theme.border}` }}><input type="checkbox" aria-label={`Virtual option for ${t.name}`} checked={t.telehealth} onChange={(e) => upd(k, 'telehealth', e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 10 }}>IOP typically runs 9–19 hours a week for adults and 6–19 for adolescents (ASAM Level 2.1). Medicare IOP requires a physician certification of at least 9 hours a week.</div>
    </Card>
  )
}

/* ------------------------------------------------------------------- root */

export default function AcuiStep({ role, identity, focusId = null }) {
  const io = useIopData()
  const views = [
    { id: 'new', label: 'New intake', ok: can(role, 'op-screen') },
    { id: 'queue', label: 'Intake queue', ok: can(role, 'op-view') },
    { id: 'census', label: 'Program census', ok: can(role, 'op-view') },
    { id: 'setup', label: 'Program setup', ok: can(role, 'op-manage') },
  ].filter((v) => v.ok)
  const [view, setView] = useState(focusId && can(role, 'op-view') ? 'queue' : (views[0]?.id || 'queue'))
  const [editing, setEditing] = useState(null)
  const [openId, setOpenId] = useState(focusId)
  const [formKey, setFormKey] = useState(0)

  return (
    <div>
      <style>{'@media (max-width: 900px){ .acuistep-grid{ grid-template-columns: 1fr !important } }'}</style>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 6 }}>
        <AcuiStepMark size={46} />
        <div>
          <h2 style={{ fontFamily: theme.display, fontSize: 24, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            AcuiStep™ <span style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: 1, background: theme.accent, color: '#fff', borderRadius: 999, padding: '3px 9px' }}>IOP</span>
          </h2>
          <div style={{ fontSize: 13, color: theme.sub, marginTop: 2 }}>Intensive outpatient screening, eligibility and intake. From referral to a clear verdict, the right track and a start date.</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#7a5a12', background: '#fbf3e2', border: '1px solid #ecd6a6', borderRadius: 10, padding: '8px 12px', margin: '12px 0' }}>
        <b>Decision support, not a determination.</b> AcuiStep organizes the criteria an IOP admission turns on and shows its reasoning. It is aligned to the concepts behind LOCUS, CASII and ASAM Level 2.1 but is not those instruments. A licensed clinician confirms the level of care. Use a case label, never a name or MRN.
      </div>
      <div role="tablist" aria-label="AcuiStep views" style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {views.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} type="button" onClick={() => { setView(v.id); setEditing(null) }}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `1px solid ${view === v.id ? theme.accent : theme.border}`, background: view === v.id ? theme.accent : '#fff', color: view === v.id ? '#fff' : theme.text }}>
            {v.label}{v.id === 'queue' && io.intakes.length > 0 && <span style={{ marginLeft: 6, opacity: 0.8 }}>{io.intakes.filter((x) => ['screening', 'pending', 'scheduled'].includes(x.status)).length}</span>}
          </button>
        ))}
      </div>
      {view === 'new' && <IntakeForm key={`new-${formKey}`} io={io} role={role} identity={identity} onDone={(id) => { setFormKey((k) => k + 1); setOpenId(id); setView('queue') }} />}
      {view === 'edit' && editing && <IntakeForm key={`edit-${editing.id}`} io={io} role={role} identity={identity} editing={editing} onDone={(id) => { setEditing(null); setOpenId(id); setView('queue') }} />}
      {view === 'queue' && <Queue io={io} role={role} openId={openId} setOpenId={setOpenId} onEdit={(x) => { setEditing(x); setView('edit') }} />}
      {view === 'census' && <Census io={io} />}
      {view === 'setup' && <Setup io={io} />}
    </div>
  )
}
