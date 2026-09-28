import React, { useMemo, useState } from 'react'
import { Card, Field, Button, Badge, StatCard, Icon, theme, grid } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'
import { readStorage, writeStorage, uid } from '../lib/storage.js'
import {
  POPULATIONS, DIMENSIONS, SCORE_MIN, SCORE_MAX,
  anchorsFor, screenLevelOfCare, emptyScores, LEVELS,
} from '../lib/loc.js'
import { assignCaseload, reasonLabel, requiresAttending, TRAINING_LEVELS } from '../lib/opmatch.js'
import { SYMPTOMS, recommendProgram } from '../lib/programs.js'
import { buildSampleOutpatient } from '../lib/demoData.js'

const PT_KEY = 'bhai:opPatients'
const PROV_KEY = 'bhai:opProviders'
const PROG_KEY = 'bhai:opPrograms'
const SPECIALTIES = ['general', 'trauma', 'sud', 'adolescent', 'eating-disorders']
const SPECIALTY_LABEL = {
  general: 'General', trauma: 'Trauma', sud: 'Substance use',
  adolescent: 'Child / adolescent', 'eating-disorders': 'Eating disorders',
}

// The clinic / program list is org-configurable — edited in the Caseload view
// and persisted. These are only the starting defaults.
const DEFAULT_PROGRAMS = [
  'Therapy only', 'Medication management', 'Neuromodulation',
  'Substance use program', 'Eating disorders program',
]
const TRAINING_LABEL = { attending: 'Attending', fellow: 'Fellow', staff: 'Staff (non-trainee)', resident: 'Resident' }

// Transparent default suggestion, always chosen from the current program list so
// it works with whatever clinics an org has configured. The clinician can change
// it — the tool never locks a program in.
function suggestProgram(needs, programs) {
  if (!programs.length) return ''
  const find = (name) => programs.find((p) => p.toLowerCase() === name)
  if (needs.prescriber && !needs.therapy) return find('medication management') || programs[0]
  if (needs.therapy && !needs.prescriber) return find('therapy only') || programs[0]
  return find('medication management') || programs[0]
}

// Colour a level by how far up the continuum it sits — green while it is within
// the outpatient continuum, amber at the step-up boundary, red above it.
function levelColor(level) {
  if (!level) return theme.sub
  if (level.setting === 'below-op') return theme.sub
  if (level.setting === 'outpatient' || level.setting === 'outpatient-intensive') return '#3fb37f'
  if (level.setting === 'step-up') return '#e0b341'
  return '#e0584a'
}

const num = (v, d = 0) => (v == null ? '—' : Number(v).toFixed(d))

/* ------------------------------------------------------------- score control */

// The scale is self-documenting: every level's definition is shown, with the
// selected one emphasized, so a rater can see exactly what makes a reading a 4
// versus a 3 on each standard. Each button also carries its definition as a
// hover tooltip.
function ScoreScale({ value, onChange, anchors }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={active}
              title={`${n} — ${anchors[n - 1]}`}
              style={{
                flex: 1,
                padding: '7px 0',
                borderRadius: 7,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                background: active ? theme.accent : theme.panel,
                color: active ? '#fff' : theme.text,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
        {anchors.map((text, i) => {
          const n = i + 1
          const active = value === n
          return (
            <div
              key={n}
              onClick={() => onChange(n)}
              style={{
                display: 'grid', gridTemplateColumns: '1.1rem 1fr', gap: 6, alignItems: 'start',
                fontSize: 11, lineHeight: 1.35, cursor: 'pointer',
                color: active ? theme.text : theme.sub,
                fontWeight: active ? 700 : 400,
                background: active ? theme.accentSoft : 'transparent',
                borderRadius: 5, padding: active ? '3px 5px' : '3px 5px',
              }}
            >
              <span style={{ fontWeight: 700, color: active ? theme.accent : theme.sub, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              <span>{text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- result panel */

function ResultPanel({ result }) {
  const level = result.level
  const color = levelColor(level)
  const opBadge =
    result.opClassification === 'outpatient-appropriate'
      ? { label: 'OUTPATIENT APPROPRIATE', color: '#3fb37f' }
      : result.opClassification === 'below-outpatient'
        ? { label: 'BELOW OP THRESHOLD', color: theme.sub }
        : { label: 'EXCEEDS OUTPATIENT — STEP UP', color: '#e0584a' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Recommended level of care
        </div>
        <Badge color={opBadge.color}>{opBadge.label}</Badge>
      </div>
      <div style={{ fontFamily: theme.display, fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>
        {level.label}
      </div>
      <div style={{ fontSize: 12, color: theme.sub, marginTop: 3 }}>{level.detail}</div>

      {result.overridden && (
        <div style={{ fontSize: 11.5, color: '#a5342a', fontWeight: 700, marginTop: 8 }}>
          Raised above the score-based band by a safety rule below.
        </div>
      )}

      {result.flags.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {result.flags.map((f) => (
            <div
              key={f.id}
              style={{
                display: 'flex', gap: 7, alignItems: 'flex-start',
                padding: '8px 10px', borderRadius: 8,
                background: `${'#e0584a'}14`, color: '#a5342a',
                fontSize: 11.5, fontWeight: 600, lineHeight: 1.4,
              }}
            >
              <Icon name="alert" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* composite + glass-box contributions */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: theme.sub, marginBottom: 5 }}>
          <span>Composite score</span>
          <span style={{ fontWeight: 700, color: theme.text }}>{result.total} / {result.maxTotal}</span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {result.contributions.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '9rem 1fr auto', gap: 8, alignItems: 'center', fontSize: 11.5 }}>
              <span style={{ color: theme.text }}>{c.label}</span>
              <div style={{ height: 6, background: theme.panelAlt, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  width: `${(c.score / SCORE_MAX) * 100}%`, height: '100%', borderRadius: 999,
                  background: c.score >= 4 ? '#e0584a' : c.score === 3 ? '#e0b341' : theme.accent,
                }} />
              </div>
              <span style={{ fontWeight: 700, color: theme.sub, fontVariantNumeric: 'tabular-nums' }}>{c.score}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 8, lineHeight: 1.5 }}>
          The recommendation is the more intensive of this score band and any safety rule above it — nothing is hidden.
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- screener view */

function Screener({ onSave, programs }) {
  const [population, setPopulation] = useState('adult')
  const [scores, setScores] = useState(emptyScores)
  const [symptoms, setSymptoms] = useState([])
  const [name, setName] = useState('')
  const [needs, setNeeds] = useState({ prescriber: false, therapy: true })
  const [specialties, setSpecialties] = useState([])
  const [telehealthOnly, setTelehealthOnly] = useState(false)
  const [urgencyDays, setUrgencyDays] = useState('')
  const [program, setProgram] = useState('')
  // Whether the clinician has hand-picked a program; until then it tracks the
  // symptom-driven recommendation so it stays sensible as symptoms/needs change.
  const [programTouched, setProgramTouched] = useState(false)

  const anchors = anchorsFor(population)
  const result = useMemo(() => screenLevelOfCare(scores, { population }), [scores, population])
  const recommendation = useMemo(
    () => recommendProgram({ symptoms, needs, programs }),
    [symptoms, needs, programs]
  )
  // Fall back to the first configured program when the recommended concept has
  // no matching clinic, so the selector always holds a valid option; the "no
  // clinic configured" note below still surfaces the gap.
  const suggestedProgram = recommendation.program || programs[0] || ''
  const activeProgram = programTouched && program ? program : suggestedProgram
  const needsAttending = requiresAttending({ riskScore: scores.risk })

  const setScore = (dim, n) => setScores((s) => ({ ...s, [dim]: n }))
  const toggleSpecialty = (s) =>
    setSpecialties((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  const toggleSymptom = (id) =>
    setSymptoms((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const save = () => {
    // No patient-identifying information is required. If no case label is
    // entered, generate a non-identifying reference so the caseload is usable
    // without ever holding a name or MRN.
    const id = uid()
    onSave({
      id,
      name: name.trim() || `Case ${id.slice(0, 4).toUpperCase()}`,
      population,
      scores,
      level: result.level.id,
      levelLabel: result.level.label,
      opAppropriate: result.opAppropriate,
      riskScore: scores.risk,
      needs,
      specialties,
      symptoms,
      program: activeProgram,
      telehealthOnly,
      urgencyDays: urgencyDays === '' ? 0 : Number(urgencyDays),
      createdAt: Date.now(),
    })
    // reset for the next patient, keep population
    setScores(emptyScores())
    setSymptoms([])
    setName('')
    setNeeds({ prescriber: false, therapy: true })
    setSpecialties([])
    setTelehealthOnly(false)
    setUrgencyDays('')
    setProgram('')
    setProgramTouched(false)
  }

  return (
    <div style={grid(2, 18)}>
      <Card title="Screen a patient" sub="Rate each dimension 1 (minimal) to 5 (severe)">
        <Field label="Population">
          <select value={population} onChange={(e) => setPopulation(e.target.value)}>
            {Object.values(POPULATIONS).map((p) => (
              <option key={p.id} value={p.id}>{p.label} · {p.framework}</option>
            ))}
          </select>
        </Field>

        <div style={{ marginTop: 14, display: 'grid', gap: 16 }}>
          {DIMENSIONS.map((dim) => (
            <div key={dim}>
              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 1 }}>{anchors[dim].label}</div>
              <div style={{ fontSize: 11, color: theme.sub, marginBottom: 6 }}>{anchors[dim].detail}</div>
              <ScoreScale
                value={scores[dim]}
                onChange={(n) => setScore(dim, n)}
                anchors={anchors[dim].anchors}
              />
            </div>
          ))}
        </div>

        {/* Current symptoms — drive the clinic / program recommendation. */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>Current symptoms</div>
          <div style={{ fontSize: 11, color: theme.sub, marginBottom: 8 }}>
            Check the presenting symptoms — these drive the recommended clinic / program on the right.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SYMPTOMS.map((s) => {
              const on = symptoms.includes(s.id)
              return (
                <button key={s.id} type="button" onClick={() => toggleSymptom(s.id)} title={s.label}
                  style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentSoft : theme.panel, color: on ? theme.accent : theme.sub }}>
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Add to caseload (optional)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <Field label="Case label (optional)" hint="No names or MRNs — use a case number. Left blank, one is generated.">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Case 12" />
            </Field>
            <Field label="Days waiting" hint="For prioritization"><input type="number" min="0" value={urgencyDays} onChange={(e) => setUrgencyDays(e.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10, fontSize: 12.5 }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={needs.prescriber} onChange={(e) => setNeeds((n) => ({ ...n, prescriber: e.target.checked }))} />
              Needs prescriber
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={needs.therapy} onChange={(e) => setNeeds((n) => ({ ...n, therapy: e.target.checked }))} />
              Needs therapy
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={telehealthOnly} onChange={(e) => setTelehealthOnly(e.target.checked)} />
              Telehealth only
            </label>
          </div>
          <div style={{ fontSize: 11.5, color: theme.sub, marginBottom: 6 }}>Required specialties</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {SPECIALTIES.map((s) => {
              const on = specialties.includes(s)
              return (
                <button key={s} type="button" onClick={() => toggleSpecialty(s)}
                  style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${on ? theme.accent : theme.border}`,
                    background: on ? theme.accentSoft : theme.panel, color: on ? theme.accent : theme.sub,
                  }}>
                  {SPECIALTY_LABEL[s]}
                </button>
              )
            })}
          </div>
          <Button onClick={save}><Icon name="plusCircle" size={15} />Save to caseload</Button>
        </div>
      </Card>

      <Card>
        {/* Recommended clinic / program — the prominent routing output. */}
        <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>
            Recommended clinic / program
          </div>
          {programs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: theme.sub }}>
              No programs configured. Add clinics in the Caseload tab.
            </div>
          ) : (
            <>
              <select
                value={activeProgram}
                onChange={(e) => { setProgram(e.target.value); setProgramTouched(true) }}
                style={{ fontFamily: theme.display, fontSize: 19, fontWeight: 800, color: theme.accent, width: '100%', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.panel }}
              >
                {programs.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* Why this program — the symptom evidence behind the suggestion. */}
              {!programTouched && recommendation.source === 'symptoms' && (
                <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6, lineHeight: 1.45 }}>
                  Suggested from symptoms: <strong style={{ color: theme.text }}>{recommendation.rationale.join(', ')}</strong>
                  {recommendation.prescriberHint && <> · medication management typically indicated</>}
                </div>
              )}
              {!programTouched && recommendation.source === 'needs' && (
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 4 }}>
                  No symptoms checked yet — suggested from service needs. Add symptoms above for a targeted recommendation.
                </div>
              )}
              {programTouched && (
                <div style={{ fontSize: 11, color: theme.sub, marginTop: 4 }}>Clinician-selected.</div>
              )}

              {/* The engine has a strong suggestion but the site hasn't named a
                  matching clinic — say so rather than silently pick another. */}
              {!programTouched && recommendation.source === 'symptoms' && !recommendation.matched && (
                <div style={{ fontSize: 11.5, color: '#8a6a10', background: '#e0b34118', borderRadius: 7, padding: '7px 9px', marginTop: 8, lineHeight: 1.45 }}>
                  Symptoms point to <strong>{recommendation.conceptLabel}</strong>, but no clinic by that name is
                  configured. Add one in the Caseload tab, or pick the closest fit above.
                </div>
              )}
              {!programTouched && recommendation.secondary.length > 0 && (
                <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 6 }}>
                  Also consider: {recommendation.secondary.map((s) => s.program || s.label).join(', ')}
                </div>
              )}
            </>
          )}
          {needsAttending && (
            <div style={{
              marginTop: 10, display: 'inline-flex', gap: 6, alignItems: 'center',
              padding: '5px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
              background: '#e0b34122', color: '#8a6a10',
            }}>
              <Icon name="shield" size={13} />
              Acuity requires an attending — not a resident alone
            </div>
          )}
        </div>
        <ResultPanel result={result} />
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- provider form */

function ProviderForm({ onAdd, programs }) {
  const empty = { name: '', credential: 'therapist', population: 'adult', trainingLevel: 'staff', telehealth: true, capacity: 3 }
  const [f, setF] = useState(empty)
  const [specialties, setSpecialties] = useState(['general'])
  const [progs, setProgs] = useState([])
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const toggle = (s) => setSpecialties((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s]))
  const toggleProg = (p) => setProgs((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))

  const submit = (e) => {
    e.preventDefault()
    if (!f.name.trim()) return
    onAdd({
      id: uid(), name: f.name.trim(), credential: f.credential, population: f.population,
      trainingLevel: f.trainingLevel, specialties, programs: progs,
      telehealth: f.telehealth, capacity: Number(f.capacity) || 0,
    })
    setF(empty); setSpecialties(['general']); setProgs([])
  }

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 10 }}>
        <Field label="Name"><input type="text" value={f.name} onChange={set('name')} placeholder="e.g. Dr. Rivera" required /></Field>
        <Field label="Role">
          <select value={f.credential} onChange={set('credential')}>
            <option value="prescriber">Prescriber</option>
            <option value="therapist">Therapist</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="Population">
          <select value={f.population} onChange={set('population')}>
            <option value="adult">Adult</option>
            <option value="adolescent">Adolescent</option>
            <option value="both">Both</option>
          </select>
        </Field>
        <Field label="Training level" hint="Residents are barred from acute patients">
          <select value={f.trainingLevel} onChange={set('trainingLevel')}>
            {TRAINING_LEVELS.map((t) => <option key={t} value={t}>{TRAINING_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Open slots"><input type="number" min="0" value={f.capacity} onChange={set('capacity')} /></Field>
      </div>
      {programs.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, color: theme.sub, marginBottom: 5 }}>Clinics / programs staffed</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {programs.map((p) => {
              const on = progs.includes(p)
              return (
                <button key={p} type="button" onClick={() => toggleProg(p)}
                  style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentSoft : theme.panel, color: on ? theme.accent : theme.sub }}>
                  {p}
                </button>
              )
            })}
          </div>
        </>
      )}
      <div style={{ fontSize: 11.5, color: theme.sub, marginBottom: 5 }}>Specialties (clinical focus)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {SPECIALTIES.map((s) => {
          const on = specialties.includes(s)
          return (
            <button key={s} type="button" onClick={() => toggle(s)}
              style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentSoft : theme.panel, color: on ? theme.accent : theme.sub }}>
              {SPECIALTY_LABEL[s]}
            </button>
          )
        })}
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 }}>
          <input type="checkbox" checked={f.telehealth} onChange={(e) => setF((p) => ({ ...p, telehealth: e.target.checked }))} />
          Telehealth
        </label>
      </div>
      <Button type="submit" variant="ghost"><Icon name="plusCircle" size={15} />Add provider</Button>
    </form>
  )
}

/* ------------------------------------------------------------- caseload view */

function ProgramsEditor({ programs, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const add = (e) => {
    e.preventDefault()
    const v = name.trim()
    if (v && !programs.includes(v)) onAdd(v)
    setName('')
  }
  return (
    <Card title="Clinics / programs" sub="The routing options offered on the screen — edit freely">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {programs.length === 0 && <div style={{ fontSize: 12.5, color: theme.sub }}>No programs yet — add one.</div>}
        {programs.map((p) => (
          <span key={p} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 6px 4px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: theme.accentSoft, color: theme.accent }}>
            {p}
            <button type="button" onClick={() => onRemove(p)} aria-label={`Remove ${p}`}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: theme.accent, lineHeight: 1, padding: 0, fontSize: 14 }}>×</button>
          </span>
        ))}
      </div>
      <form onSubmit={add} style={{ display: 'flex', gap: 8 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neuromodulation, Perinatal, First-episode" style={{ flex: 1 }} />
        <Button type="submit" variant="ghost"><Icon name="plusCircle" size={15} />Add</Button>
      </form>
    </Card>
  )
}

function Caseload({ patients, providers, programs, onAddProvider, onRemoveProvider, onRemovePatient, onAddProgram, onRemoveProgram, onLoadSample, onClear }) {
  const result = useMemo(() => assignCaseload(patients, providers), [patients, providers])
  const providerById = Object.fromEntries(providers.map((p) => [p.id, p]))
  const patientById = Object.fromEntries(patients.map((p) => [p.id, p]))

  return (
    <div>
      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="On the caseload" value={patients.length} icon="users" color={theme.navy} />
        <StatCard label="Outpatient-appropriate" value={result.summary.outpatientCandidates}
          sub={`${result.summary.needStepUp} need a step-up`} icon="route" color="#3fb37f" />
        <StatCard label="Matched" value={result.summary.placed}
          sub={`${result.summary.unplaced} unplaced`} icon="shield" color={theme.accent} />
        <StatCard label="Open slots left" value={`${result.summary.remainingCapacity} / ${result.summary.totalCapacity}`}
          sub={result.summary.capacityGap ? `${result.summary.capacityGap} blocked by capacity` : 'No capacity gap'}
          icon="building" color={result.summary.capacityGap ? '#e0584a' : theme.accent} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onLoadSample}><Icon name="play" size={14} />Load sample caseload</Button>
        {(patients.length > 0 || providers.length > 0) && (
          <Button variant="danger" onClick={onClear}>Clear caseload</Button>
        )}
      </div>

      <Card title="Recommended assignments" sub="Most urgent patients placed first, within each provider's open slots">
        {result.assignments.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>
            No assignments yet. Screen patients into the caseload and add providers, or load the sample caseload above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '6px 8px' }}>Case</th>
                  <th style={{ padding: '6px 8px' }}>Level</th>
                  <th style={{ padding: '6px 8px' }}>Clinic / program</th>
                  <th style={{ padding: '6px 8px' }}>→ Provider</th>
                  <th style={{ padding: '6px 8px' }}>Role</th>
                  <th style={{ padding: '6px 8px' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {result.assignments.map((a) => {
                  const p = patientById[a.patientId]
                  return (
                    <tr key={a.patientId} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{p?.name}</td>
                      <td style={{ padding: '6px 8px' }}>{p?.level?.toUpperCase()}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700 }}>{a.program || '—'}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: theme.accent }}>
                        {a.provider?.name}
                        {a.attendingRequired && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#8a6a10', marginLeft: 5 }}>
                            {TRAINING_LABEL[a.trainingLevel] || a.trainingLevel} · attending req’d
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{a.role === 'prescriber' ? 'Prescriber' : 'Therapy'}</td>
                      <td style={{ padding: '6px 8px', color: a.unmetRole ? '#a5342a' : theme.sub, fontWeight: a.unmetRole ? 700 : 400 }}>
                        {a.unmetRole ? `also needs ${a.unmetRole}` : (a.specialtyMatched.length ? a.specialtyMatched.map((s) => SPECIALTY_LABEL[s]).join(', ') : 'primary match')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {result.unmatched.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Not placed ({result.unmatched.length}) — where the gaps are</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {result.unmatched.map((u) => (
                <div key={u.patientId} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                  padding: '8px 10px', borderRadius: 8,
                  background: u.reason === 'not-appropriate-for-outpatient' ? '#e0b34118' : '#e0584a12',
                  fontSize: 11.5,
                }}>
                  <span style={{ fontWeight: 700 }}>{patientById[u.patientId]?.name} · {patientById[u.patientId]?.level?.toUpperCase()}</span>
                  <span style={{ color: theme.sub }}>{u.reasonLabel}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div style={grid(2, 16)}>
        <Card title="Providers" sub={`${providers.length} in the panel`}>
          {providers.length === 0 && <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 10 }}>No providers yet.</div>}
          <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
            {providers.map((p) => {
              const used = (result.summary.totalCapacity && result.remaining) ? (p.capacity - (result.remaining[p.id] ?? p.capacity)) : 0
              return (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12, padding: '7px 9px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                    <span style={{ color: theme.sub }}> · {p.credential} · {TRAINING_LABEL[p.trainingLevel] || 'Staff'} · {p.population}{p.telehealth ? ' · telehealth' : ''}</span>
                    <div style={{ fontSize: 11, color: theme.sub }}>
                      {(p.programs || []).join(', ') || 'no programs'}
                      {(p.specialties || []).length ? ` · ${(p.specialties).map((s) => SPECIALTY_LABEL[s] || s).join(', ')}` : ''} · {used}/{p.capacity} slots used
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => onRemoveProvider(p.id)}>Remove</Button>
                </div>
              )
            })}
          </div>
          <ProviderForm onAdd={onAddProvider} programs={programs} />
        </Card>

        <Card title="Screened patients" sub={`${patients.length} on the caseload`}>
          {patients.length === 0 ? (
            <div style={{ fontSize: 12.5, color: theme.sub }}>No patients yet. Use the Screen tab to add some.</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {patients.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12, padding: '7px 9px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                  <div>
                    <span style={{ fontWeight: 700 }}>{p.name}</span>
                    <Badge color={p.opAppropriate ? '#3fb37f' : '#e0584a'}>{(p.level || '').toUpperCase()}</Badge>
                    {requiresAttending(p) && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#8a6a10', marginLeft: 6 }}>attending req’d</span>
                    )}
                    <div style={{ fontSize: 11, color: theme.sub, marginTop: 2 }}>
                      {p.program ? <strong style={{ color: theme.accent }}>{p.program}</strong> : 'no program'} · {p.population} · {[p.needs?.prescriber && 'prescriber', p.needs?.therapy && 'therapy'].filter(Boolean).join(' + ') || 'no role set'}
                      {p.specialties?.length ? ` · ${p.specialties.map((s) => SPECIALTY_LABEL[s] || s).join(', ')}` : ''}
                      {p.telehealthOnly ? ' · telehealth only' : ''} · waiting {p.urgencyDays}d
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => onRemovePatient(p.id)}>Remove</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <ProgramsEditor programs={programs} onAdd={onAddProgram} onRemove={onRemoveProgram} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------- screen */

export default function LevelOfCare() {
  const [view, setView] = useState('screen')
  const [patients, setPatients] = useState(() => readStorage(PT_KEY, []))
  const [providers, setProviders] = useState(() => readStorage(PROV_KEY, []))
  const [programs, setPrograms] = useState(() => readStorage(PROG_KEY, DEFAULT_PROGRAMS))

  const persistPatients = (next) => { setPatients(next); writeStorage(PT_KEY, next) }
  const persistProviders = (next) => { setProviders(next); writeStorage(PROV_KEY, next) }
  const persistPrograms = (next) => { setPrograms(next); writeStorage(PROG_KEY, next) }

  const addPatient = (pt) => persistPatients([...patients, pt])
  const removePatient = (id) => persistPatients(patients.filter((p) => p.id !== id))
  const addProvider = (pv) => persistProviders([...providers, pv])
  const removeProvider = (id) => persistProviders(providers.filter((p) => p.id !== id))
  const addProgram = (name) => persistPrograms([...programs, name])
  const removeProgram = (name) => persistPrograms(programs.filter((p) => p !== name))

  const loadSample = () => {
    const { providers: sp, patients: raw, programs: pr } = buildSampleOutpatient()
    if (pr && pr.length) persistPrograms(pr)
    // Re-screen each sample patient so the stored level/appropriateness always
    // matches the current engine rather than a hardcoded value.
    const screened = raw.map((r) => {
      const res = screenLevelOfCare(r.scores, { population: r.population })
      return {
        id: r.id, name: r.name, population: r.population, scores: r.scores,
        level: res.level.id, levelLabel: res.level.label, opAppropriate: res.opAppropriate,
        riskScore: r.scores.risk, needs: r.needs, specialties: r.specialties, symptoms: r.symptoms,
        program: r.program, telehealthOnly: r.telehealthOnly, urgencyDays: r.urgencyDays, createdAt: r.createdAt,
      }
    })
    persistPatients(screened)
    persistProviders(sp)
  }

  const clearAll = () => {
    if (window.confirm('Clear the outpatient caseload and provider panel?')) {
      persistPatients([])
      persistProviders([])
    }
  }

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>AcuiPath&trade;</div>
          <Badge color={theme.accent}>OUTPATIENT</Badge>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <Button variant={view === 'screen' ? 'primary' : 'ghost'} onClick={() => setView('screen')}>Screen a patient</Button>
            <Button variant={view === 'caseload' ? 'primary' : 'ghost'} onClick={() => setView('caseload')}>Caseload &amp; assignment</Button>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub, maxWidth: 780 }}>
          Level-of-care screening and outpatient routing: whether the outpatient setting fits, which clinic or program
          the patient should go to, and which provider — by role, program, specialty, supervision level, capacity and
          urgency.
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start',
        padding: '10px 13px', marginBottom: 16, borderRadius: 10,
        background: '#e0b34115', border: `1px solid #e0b341`, fontSize: 11.5, lineHeight: 1.5,
      }}>
        <Icon name="alert" size={15} style={{ color: '#8a6a10', marginTop: 1, flexShrink: 0 }} />
        <span>
          <strong>Decision support — not a determination.</strong> This organizes the clinical dimensions a level-of-care
          decision turns on and recommends a level for a licensed clinician to confirm or override. It is aligned to the
          concepts behind LOCUS, CASII and ASAM but is an original, unvalidated scale — not those instruments, and not a
          substitute for them where a payer or regulation requires the real tool.
          {' '}<strong>No patient-identifying information is required</strong> — use a case number, never a name or MRN.
        </span>
      </div>

      {view === 'screen'
        ? <Screener onSave={addPatient} programs={programs} />
        : <Caseload
            patients={patients} providers={providers} programs={programs}
            onAddProvider={addProvider} onRemoveProvider={removeProvider}
            onRemovePatient={removePatient} onAddProgram={addProgram} onRemoveProgram={removeProgram}
            onLoadSample={loadSample} onClear={clearAll}
          />}
    </div>
  )
}
