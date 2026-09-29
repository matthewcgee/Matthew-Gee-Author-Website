import React, { useMemo, useState } from 'react'
import { Card, Field, Button, Badge, StatCard, Icon, theme, grid } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'
import { readStorage, writeStorage, uid } from '../lib/storage.js'
import {
  POPULATIONS, DIMENSIONS, SCORE_MIN, SCORE_MAX,
  anchorsFor, screenLevelOfCare, emptyScores,
  DEFAULT_AP_THRESHOLDS, normalizeApThresholds,
} from '../lib/loc.js'
import { assignCaseload, requiresAttending, TRAINING_LEVELS } from '../lib/opmatch.js'
import { SYMPTOMS, recommendProgram } from '../lib/programs.js'
import { DEFAULT_TIER1_TRIGGERS, evaluateTier1, directPlacementDefaults } from '../lib/tier1.js'
import { buildSampleOutpatient } from '../lib/demoData.js'

const PT_KEY = 'bhai:opPatients'
const PROV_KEY = 'bhai:opProviders'
const PROG_KEY = 'bhai:opPrograms'
const TH_KEY = 'bhai:apThresholds'
const TRIG_KEY = 'bhai:apTier1Triggers'
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

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `t_${Math.random().toString(36).slice(2, 6)}`

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

/* --------------------------------------------------------- shared sub-blocks */

// Presenting symptoms — drive the clinic / program recommendation. Shared by
// both screening tiers.
function SymptomPicker({ symptoms, onToggle }) {
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>Current symptoms</div>
      <div style={{ fontSize: 11, color: theme.sub, marginBottom: 8 }}>
        Check the presenting symptoms — these drive the recommended clinic / program on the right.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SYMPTOMS.map((s) => {
          const on = symptoms.includes(s.id)
          return (
            <button key={s.id} type="button" onClick={() => onToggle(s.id)} title={s.label}
              style={{ padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentSoft : theme.panel, color: on ? theme.accent : theme.sub }}>
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// The routing fields both tiers collect before saving to the caseload.
function CaseFields({ name, setName, urgencyDays, setUrgencyDays, needs, setNeeds, telehealthOnly, setTelehealthOnly, specialties, setSpecialties }) {
  const toggleSpecialty = (s) =>
    setSpecialties((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>Add to caseload</div>
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
    </div>
  )
}

// Recommended clinic / program — the prominent routing output, shared by both
// tiers. Clinic routing is symptom-driven and never blocked by acuity.
function RoutingPanel({ programs, recommendation, activeProgram, onSelect, programTouched, footer }) {
  return (
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
            onChange={(e) => onSelect(e.target.value)}
            style={{ fontFamily: theme.display, fontSize: 19, fontWeight: 800, color: theme.accent, width: '100%', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: 8, background: theme.panel }}
          >
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {!programTouched && recommendation.source === 'symptoms' && (
            <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6, lineHeight: 1.45 }}>
              Suggested from symptoms: <strong style={{ color: theme.text }}>{recommendation.rationale.join(', ')}</strong>
              {recommendation.prescriberHint && <> · medication management typically indicated</>}
            </div>
          )}
          {!programTouched && recommendation.source === 'needs' && (
            <div style={{ fontSize: 11, color: theme.sub, marginTop: 4 }}>
              No symptoms checked yet — suggested from service needs. Add symptoms for a targeted recommendation.
            </div>
          )}
          {programTouched && (
            <div style={{ fontSize: 11, color: theme.sub, marginTop: 4 }}>Clinician-selected.</div>
          )}

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
      {footer}
    </div>
  )
}

/* --------------------------------------------------------------- result panel */

// Operational output of the in-depth screen: primary-physician level (attending
// vs resident) and any advisories. Clinic routing is shown above this panel.
function ResultPanel({ result }) {
  const att = result.attending
  return (
    <div>
      {/* Attending vs resident — the second operational decision. */}
      <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>
        Primary physician
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
        background: att.required ? '#e0b34120' : '#3fb37f18',
        color: att.required ? '#8a6a10' : '#1f7a54', fontWeight: 800, fontSize: 15,
      }}>
        <Icon name="shield" size={16} />
        {att.required ? 'Attending required' : 'Resident-eligible'}
      </div>
      {att.required && att.reasons.length > 0 && (
        <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6, lineHeight: 1.45 }}>
          Because: {att.reasons.join('; ')}.
        </div>
      )}
      {!att.required && (
        <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6 }}>
          Complexity is below the attending threshold — a resident may be the primary treating physician.
        </div>
      )}

      {/* Advisories: acute-safety and PHP/IOP consideration. */}
      {result.acuteSafety.flag && (
        <div style={{ marginTop: 12, display: 'flex', gap: 7, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 9, background: '#e0584a16', color: '#a5342a', fontSize: 11.5, fontWeight: 700, lineHeight: 1.45 }}>
          <Icon name="alert" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{result.acuteSafety.reason}</span>
        </div>
      )}
      {result.phpIop.consider && (
        <div style={{ marginTop: 10, display: 'flex', gap: 7, alignItems: 'flex-start', padding: '9px 11px', borderRadius: 9, background: '#e0b34118', color: '#8a6a10', fontSize: 11.5, fontWeight: 600, lineHeight: 1.45 }}>
          <Icon name="layers" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{result.phpIop.reason} <em>(advisory — clinic routing still applies)</em></span>
        </div>
      )}

      {/* composite + glass-box contributions */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: theme.sub, marginBottom: 5 }}>
          <span>Acuity composite</span>
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
          Screening decides the clinic and the primary-physician level. It does not place into PHP/IOP — that is only an
          advisory when the composite crosses the set threshold.
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- screener view */

// Two-tier screening. Tier 1 is a nurse chart review (no patient contact): a
// clean review can be placed directly into a clinic and bypass the deeper
// screen; any red flag escalates to Tier 2, the in-depth screen with a phone
// screen / patient discussion. Tier 2 produces the full operational output —
// clinic, attending-vs-resident, and the acute / PHP-IOP advisories.
function Screener({ onSave, programs, thresholds, triggers }) {
  const [step, setStep] = useState('tier1')
  // shared across both tiers
  const [population, setPopulation] = useState('adult')
  const [symptoms, setSymptoms] = useState([])
  const [name, setName] = useState('')
  const [needs, setNeeds] = useState({ prescriber: false, therapy: true })
  const [specialties, setSpecialties] = useState([])
  const [telehealthOnly, setTelehealthOnly] = useState(false)
  const [urgencyDays, setUrgencyDays] = useState('')
  const [program, setProgram] = useState('')
  const [programTouched, setProgramTouched] = useState(false)
  // tier 1
  const [tier1Checked, setTier1Checked] = useState([])
  // tier 2
  const [scores, setScores] = useState(emptyScores)
  const [complexityFlag, setComplexityFlag] = useState(false)

  const anchors = anchorsFor(population)
  const t1 = useMemo(() => evaluateTier1(tier1Checked, triggers), [tier1Checked, triggers])
  const result = useMemo(
    () => screenLevelOfCare(scores, { population, thresholds, complexityFlag }),
    [scores, population, thresholds, complexityFlag]
  )
  const recommendation = useMemo(
    () => recommendProgram({ symptoms, needs, programs }),
    [symptoms, needs, programs]
  )
  const suggestedProgram = recommendation.program || programs[0] || ''
  const activeProgram = programTouched && program ? program : suggestedProgram

  const setScore = (dim, n) => setScores((s) => ({ ...s, [dim]: n }))
  const toggleSymptom = (id) =>
    setSymptoms((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const toggleTrigger = (id) =>
    setTier1Checked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const selectProgram = (v) => { setProgram(v); setProgramTouched(true) }

  const resetAll = () => {
    setStep('tier1')
    setSymptoms([]); setName(''); setNeeds({ prescriber: false, therapy: true })
    setSpecialties([]); setTelehealthOnly(false); setUrgencyDays('')
    setProgram(''); setProgramTouched(false)
    setTier1Checked([]); setScores(emptyScores()); setComplexityFlag(false)
  }

  const baseRecord = () => {
    const id = uid()
    return {
      id,
      name: name.trim() || `Case ${id.slice(0, 4).toUpperCase()}`,
      population,
      needs,
      specialties,
      symptoms,
      program: activeProgram,
      telehealthOnly,
      urgencyDays: urgencyDays === '' ? 0 : Number(urgencyDays),
      createdAt: Date.now(),
    }
  }

  // Tier 1 direct placement — a clean chart review, resident-eligible, routine
  // outpatient. No dimension scoring; the clinic comes from symptoms.
  const saveDirect = () => {
    const d = directPlacementDefaults()
    onSave({
      ...baseRecord(),
      tier: d.tier,
      requiresAttending: d.requiresAttending,
      routableOutpatient: d.routableOutpatient,
      level: 'op',
      levelLabel: 'Outpatient',
      opAppropriate: true,
      riskScore: 0,
      tier1Triggers: [],
    })
    resetAll()
  }

  // Tier 2 in-depth screen — full operational output stored on the record.
  const saveFull = () => {
    onSave({
      ...baseRecord(),
      tier: '2-full',
      scores,
      complexityFlag,
      level: result.level.id,
      levelLabel: result.level.label,
      opAppropriate: result.opAppropriate,
      riskScore: scores.risk,
      requiresAttending: result.attending.required,
      attendingReasons: result.attending.reasons,
      routableOutpatient: result.routableOutpatient,
      phpIopConsider: result.phpIop.consider,
      acuteSafety: result.acuteSafety.flag,
      tier1Triggers: t1.triggered.map((t) => t.id),
    })
    resetAll()
  }

  /* --------------------------------------------------------------- Tier 1 UI */
  if (step === 'tier1') {
    return (
      <div style={grid(2, 18)}>
        <Card title="Tier 1 — nurse chart review" sub="Chart review only, no patient contact. Check any red flag found in the chart.">
          <Field label="Population">
            <select value={population} onChange={(e) => setPopulation(e.target.value)}>
              {Object.values(POPULATIONS).map((p) => (
                <option key={p.id} value={p.id}>{p.label} · {p.framework}</option>
              ))}
            </select>
          </Field>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>Chart-review red flags</div>
            <div style={{ fontSize: 11, color: theme.sub, marginBottom: 8 }}>
              Any one flag routes the case to the in-depth Tier 2 screen. A completely clean review can be placed
              directly. Edit this list in the Caseload tab.
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              {triggers.map((t) => {
                const on = tier1Checked.includes(t.id)
                return (
                  <label key={t.id} style={{
                    display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer',
                    padding: '8px 10px', borderRadius: 8, lineHeight: 1.4, fontSize: 12,
                    border: `1px solid ${on ? '#e0b341' : theme.border}`,
                    background: on ? '#e0b34112' : theme.panel,
                  }}>
                    <input type="checkbox" checked={on} onChange={() => toggleTrigger(t.id)} style={{ marginTop: 2 }} />
                    <span style={{ color: on ? '#8a6a10' : theme.text, fontWeight: on ? 700 : 400 }}>{t.label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <SymptomPicker symptoms={symptoms} onToggle={toggleSymptom} />
          <CaseFields
            name={name} setName={setName} urgencyDays={urgencyDays} setUrgencyDays={setUrgencyDays}
            needs={needs} setNeeds={setNeeds} telehealthOnly={telehealthOnly} setTelehealthOnly={setTelehealthOnly}
            specialties={specialties} setSpecialties={setSpecialties}
          />

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button onClick={saveDirect} disabled={t1.escalate}>
              <Icon name="plusCircle" size={15} />Place directly
            </Button>
            <Button variant={t1.escalate ? 'primary' : 'ghost'} onClick={() => setStep('tier2')}>
              Continue to in-depth screen <Icon name="route" size={15} />
            </Button>
          </div>
        </Card>

        <Card>
          <RoutingPanel
            programs={programs} recommendation={recommendation} activeProgram={activeProgram}
            onSelect={selectProgram} programTouched={programTouched}
          />
          {/* Tier 1 disposition */}
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5 }}>
            Tier 1 disposition
          </div>
          {t1.escalate ? (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                background: '#e0b34120', color: '#8a6a10', fontWeight: 800, fontSize: 15,
              }}>
                <Icon name="route" size={16} />
                Escalate to in-depth screen
              </div>
              <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 8, lineHeight: 1.5 }}>
                {t1.count} red flag{t1.count === 1 ? '' : 's'} found on chart review — a Tier 2 screen (with a phone
                screen / patient discussion) is needed before placement.
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 11.5, color: theme.text, lineHeight: 1.5 }}>
                {t1.triggered.map((t) => <li key={t.id}>{t.label}</li>)}
              </ul>
            </>
          ) : (
            <>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
                background: '#3fb37f18', color: '#1f7a54', fontWeight: 800, fontSize: 15,
              }}>
                <Icon name="shield" size={16} />
                Eligible for direct placement
              </div>
              <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 8, lineHeight: 1.5 }}>
                Clean chart review — no red flags. The case can be placed directly into the recommended clinic as
                <strong> resident-eligible, routine outpatient</strong>, bypassing the in-depth screen. You may still
                continue to a full screen if you want the deeper look.
              </div>
            </>
          )}
        </Card>
      </div>
    )
  }

  /* --------------------------------------------------------------- Tier 2 UI */
  return (
    <div style={grid(2, 18)}>
      <Card
        title="Tier 2 — in-depth screen"
        sub="Full six-dimension screen with a phone screen / patient discussion. Rate each dimension 1 (minimal) to 5 (severe)."
      >
        <div style={{ marginBottom: 12 }}>
          <Button variant="ghost" onClick={() => setStep('tier1')}>← Back to chart review</Button>
        </div>

        <Field label="Population">
          <select value={population} onChange={(e) => setPopulation(e.target.value)}>
            {Object.values(POPULATIONS).map((p) => (
              <option key={p.id} value={p.id}>{p.label} · {p.framework}</option>
            ))}
          </select>
        </Field>

        {t1.count > 0 && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: '#8a6a10', background: '#e0b34114', borderRadius: 8, padding: '8px 10px', lineHeight: 1.45 }}>
            Escalated from Tier 1 for: {t1.triggered.map((t) => t.label).join('; ')}.
          </div>
        )}

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

        {/* Manual complexity flag — feeds the attending-required rule. */}
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', fontSize: 12.5, lineHeight: 1.4,
            padding: '9px 11px', borderRadius: 8, border: `1px solid ${complexityFlag ? '#e0b341' : theme.border}`, background: complexityFlag ? '#e0b34112' : theme.panel }}>
            <input type="checkbox" checked={complexityFlag} onChange={(e) => setComplexityFlag(e.target.checked)} style={{ marginTop: 2 }} />
            <span style={{ color: complexityFlag ? '#8a6a10' : theme.text, fontWeight: complexityFlag ? 700 : 400 }}>
              Diagnostic / treatment complexity — clinician judgment that this case needs an attending as primary
              physician, independent of the scored dimensions.
            </span>
          </label>
        </div>

        <SymptomPicker symptoms={symptoms} onToggle={toggleSymptom} />
        <CaseFields
          name={name} setName={setName} urgencyDays={urgencyDays} setUrgencyDays={setUrgencyDays}
          needs={needs} setNeeds={setNeeds} telehealthOnly={telehealthOnly} setTelehealthOnly={setTelehealthOnly}
          specialties={specialties} setSpecialties={setSpecialties}
        />

        <div style={{ marginTop: 16 }}>
          <Button onClick={saveFull}><Icon name="plusCircle" size={15} />Save to caseload</Button>
        </div>
      </Card>

      <Card>
        <RoutingPanel
          programs={programs} recommendation={recommendation} activeProgram={activeProgram}
          onSelect={selectProgram} programTouched={programTouched}
        />
        <ResultPanel result={result} />
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------- provider form */

function ProviderForm({ onAdd, programs }) {
  const empty = { name: '', credential: 'therapist', population: 'adult', trainingLevel: 'staff', telehealth: true, capacity: 3, panelLoad: 0 }
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
      telehealth: f.telehealth, capacity: Number(f.capacity) || 0, panelLoad: Number(f.panelLoad) || 0,
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
        <Field label="Current panel" hint="Patients already on this provider — balances distribution"><input type="number" min="0" value={f.panelLoad} onChange={set('panelLoad')} /></Field>
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

/* --------------------------------------------------------------- editors */

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

// Editable red-flag trigger list for Tier 1. Removing / adding here changes what
// the chart-review checklist offers and what escalates.
function Tier1TriggersEditor({ triggers, onAdd, onRemove, onReset }) {
  const [label, setLabel] = useState('')
  const add = (e) => {
    e.preventDefault()
    const v = label.trim()
    if (!v) return
    let id = slug(v)
    const existing = new Set(triggers.map((t) => t.id))
    while (existing.has(id)) id = `${id}_x`
    onAdd({ id, label: v })
    setLabel('')
  }
  return (
    <Card title="Tier 1 red-flag triggers" sub="Chart-review flags — any one escalates a case to the in-depth screen">
      <div style={{ display: 'grid', gap: 5, marginBottom: 12 }}>
        {triggers.length === 0 && <div style={{ fontSize: 12.5, color: theme.sub }}>No triggers — every case would place directly. Add at least one.</div>}
        {triggers.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12, padding: '7px 9px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
            <span style={{ lineHeight: 1.4 }}>{t.label}</span>
            <button type="button" onClick={() => onRemove(t.id)} aria-label={`Remove ${t.label}`}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#a5342a', lineHeight: 1, padding: '0 4px', fontSize: 16, flexShrink: 0 }}>×</button>
          </div>
        ))}
      </div>
      <form onSubmit={add} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Active eating-disorder medical instability" style={{ flex: 1 }} />
        <Button type="submit" variant="ghost"><Icon name="plusCircle" size={15} />Add</Button>
      </form>
      <Button variant="ghost" onClick={onReset}>Reset to defaults</Button>
    </Card>
  )
}

// Adjustable operational thresholds. These tune when an attending is required,
// when the acute-safety guard fires, and the advisory-only PHP/IOP threshold —
// without a code change.
function ThresholdsEditor({ thresholds, onChange, onReset }) {
  const th = normalizeApThresholds(thresholds)
  const set = (k, min, max) => (e) => {
    const n = Math.round(Number(e.target.value))
    if (!Number.isFinite(n)) return
    onChange({ ...th, [k]: Math.min(max, Math.max(min, n)) })
  }
  return (
    <Card title="Screening thresholds" sub="Tune the operational cut points — attending rule, acute guard, and the PHP/IOP advisory">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Field label="Attending — risk ≥" hint="Risk-of-harm score that requires an attending (1–5)">
          <input type="number" min="1" max="5" value={th.attendingRisk} onChange={set('attendingRisk', 1, 5)} />
        </Field>
        <Field label="Attending — comorbidity ≥" hint="Co-occurring complexity that requires an attending (1–5)">
          <input type="number" min="1" max="5" value={th.attendingComorbidity} onChange={set('attendingComorbidity', 1, 5)} />
        </Field>
        <Field label="Acute guard — risk ≥" hint="At/above this risk, not routine outpatient — urgent eval (1–5)">
          <input type="number" min="1" max="5" value={th.acuteRisk} onChange={set('acuteRisk', 1, 5)} />
        </Field>
        <Field label="PHP/IOP advisory — composite ≥" hint="Overall acuity (6–30) that raises the advisory only">
          <input type="number" min="6" max="30" value={th.phpIopComposite} onChange={set('phpIopComposite', 6, 30)} />
        </Field>
      </div>
      <div style={{ fontSize: 11, color: theme.sub, marginTop: 10, lineHeight: 1.5 }}>
        PHP/IOP is never an automatic placement — crossing its threshold only surfaces a recommendation for a clinician
        to weigh. Clinic routing always still applies.
      </div>
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" onClick={onReset}>Reset to defaults</Button>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------- load distribution */

const GROUP_ORDER = ['attending', 'staff', 'resident']
const GROUP_LABEL = { attending: 'Attendings', staff: 'Staff (non-trainee)', resident: 'Residents' }

// Per-provider and per-group load view, so a service can see patients are being
// distributed evenly across residents and attendings and even them out.
function LoadDistribution({ distribution, loadByGroup }) {
  if (!distribution.length) return null
  const maxLoad = Math.max(1, ...distribution.map((d) => d.load))
  const groups = GROUP_ORDER.filter((g) => loadByGroup[g])
  return (
    <Card title="Load distribution" sub="Patients per provider (current panel + newly assigned) — for equal distribution across residents and attendings">
      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        {distribution
          .slice()
          .sort((a, b) => (GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b))) || (b.load - a.load) || String(a.name).localeCompare(String(b.name)))
          .map((d) => (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '11rem 1fr auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
              <span>
                <strong>{d.name}</strong>
                <span style={{ color: theme.sub }}> · {TRAINING_LABEL[d.trainingLevel] || d.trainingLevel}</span>
              </span>
              <div style={{ height: 16, background: theme.panelAlt, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                <div title={`${d.baseLoad} on panel`} style={{ width: `${(d.baseLoad / maxLoad) * 100}%`, height: '100%', background: theme.sub, opacity: 0.5 }} />
                <div title={`${d.assigned} newly assigned`} style={{ width: `${(d.assigned / maxLoad) * 100}%`, height: '100%', background: theme.accent }} />
              </div>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: theme.sub }}>
                <strong style={{ color: theme.text }}>{d.load}</strong> total
                {d.assigned > 0 && <span style={{ color: theme.accent }}> (+{d.assigned})</span>}
                {' '}· {d.remaining}/{d.capacity} open
              </span>
            </div>
          ))}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: theme.sub }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: theme.sub, opacity: 0.5, display: 'inline-block' }} /> current panel
        </span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: theme.sub }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: theme.accent, display: 'inline-block' }} /> newly assigned
        </span>
      </div>
      {groups.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${theme.border}`, display: 'grid', gridTemplateColumns: `repeat(${groups.length}, 1fr)`, gap: 10 }}>
          {groups.map((g) => {
            const s = loadByGroup[g]
            return (
              <div key={g} style={{ fontSize: 11.5, padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 3 }}>{GROUP_LABEL[g]} · {s.providers}</div>
                <div style={{ color: theme.sub }}>{s.assigned} newly assigned</div>
                <div style={{ color: s.spread <= 1 ? '#1f7a54' : '#8a6a10', fontWeight: 600 }}>
                  spread {s.spread} {s.spread === 0 ? '· perfectly even' : s.spread <= 1 ? '· even' : '· uneven'}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function groupOf(d) {
  return d.trainingLevel === 'resident' ? 'resident' : d.trainingLevel === 'attending' ? 'attending' : 'staff'
}

/* ------------------------------------------------------------- caseload view */

function Caseload({
  patients, providers, programs, thresholds, triggers,
  onAddProvider, onRemoveProvider, onRemovePatient, onAddProgram, onRemoveProgram,
  onSetThresholds, onResetThresholds, onAddTrigger, onRemoveTrigger, onResetTriggers,
  onLoadSample, onClear,
}) {
  const result = useMemo(() => assignCaseload(patients, providers), [patients, providers])
  const patientById = Object.fromEntries(patients.map((p) => [p.id, p]))

  return (
    <div>
      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="On the caseload" value={patients.length} icon="users" color={theme.navy} />
        <StatCard label="Routable to a clinic" value={result.summary.outpatientCandidates}
          sub={`${result.summary.acute} acute — urgent eval`} icon="route" color="#3fb37f" />
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
                  background: u.reason === 'acute-urgent-evaluation' ? '#e0584a1a' : u.reason === 'not-appropriate-for-outpatient' ? '#e0b34118' : '#e0584a12',
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

      <div style={{ marginTop: 16 }}>
        <LoadDistribution distribution={result.distribution} loadByGroup={result.summary.loadByGroup} />
      </div>

      <div style={{ ...grid(2, 16), marginTop: 16 }}>
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
                      {(p.specialties || []).length ? ` · ${(p.specialties).map((s) => SPECIALTY_LABEL[s] || s).join(', ')}` : ''} · {used}/{p.capacity} slots used{p.panelLoad ? ` · ${p.panelLoad} on panel` : ''}
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
                    {p.tier === '1-direct' && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#1f7a54', marginLeft: 6 }}>Tier 1 direct</span>
                    )}
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

      <div style={{ ...grid(2, 16), marginTop: 16 }}>
        <Tier1TriggersEditor triggers={triggers} onAdd={onAddTrigger} onRemove={onRemoveTrigger} onReset={onResetTriggers} />
        <ThresholdsEditor thresholds={thresholds} onChange={onSetThresholds} onReset={onResetThresholds} />
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
  const [thresholds, setThresholds] = useState(() => normalizeApThresholds(readStorage(TH_KEY, DEFAULT_AP_THRESHOLDS)))
  const [triggers, setTriggers] = useState(() => readStorage(TRIG_KEY, DEFAULT_TIER1_TRIGGERS))

  const persistPatients = (next) => { setPatients(next); writeStorage(PT_KEY, next) }
  const persistProviders = (next) => { setProviders(next); writeStorage(PROV_KEY, next) }
  const persistPrograms = (next) => { setPrograms(next); writeStorage(PROG_KEY, next) }
  const persistThresholds = (next) => { const n = normalizeApThresholds(next); setThresholds(n); writeStorage(TH_KEY, n) }
  const persistTriggers = (next) => { setTriggers(next); writeStorage(TRIG_KEY, next) }

  const addPatient = (pt) => persistPatients([...patients, pt])
  const removePatient = (id) => persistPatients(patients.filter((p) => p.id !== id))
  const addProvider = (pv) => persistProviders([...providers, pv])
  const removeProvider = (id) => persistProviders(providers.filter((p) => p.id !== id))
  const addProgram = (name) => persistPrograms([...programs, name])
  const removeProgram = (name) => persistPrograms(programs.filter((p) => p !== name))
  const addTrigger = (t) => persistTriggers([...triggers, t])
  const removeTrigger = (id) => persistTriggers(triggers.filter((t) => t.id !== id))
  const resetTriggers = () => persistTriggers(DEFAULT_TIER1_TRIGGERS)
  const resetThresholds = () => persistThresholds(DEFAULT_AP_THRESHOLDS)

  const loadSample = () => {
    const { providers: sp, patients: raw, programs: pr } = buildSampleOutpatient()
    if (pr && pr.length) persistPrograms(pr)
    // Re-screen each sample patient so the stored level, attending determination
    // and routability always match the current engine and thresholds rather than
    // a hardcoded value.
    const screened = raw.map((r) => {
      const res = screenLevelOfCare(r.scores, { population: r.population, thresholds })
      return {
        id: r.id, name: r.name, population: r.population, scores: r.scores, tier: '2-full',
        level: res.level.id, levelLabel: res.level.label, opAppropriate: res.opAppropriate,
        riskScore: r.scores.risk, requiresAttending: res.attending.required, attendingReasons: res.attending.reasons,
        routableOutpatient: res.routableOutpatient, phpIopConsider: res.phpIop.consider, acuteSafety: res.acuteSafety.flag,
        needs: r.needs, specialties: r.specialties, symptoms: r.symptoms,
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
        <div style={{ fontSize: 12.5, color: theme.sub, maxWidth: 820 }}>
          Two-tier outpatient screening and routing. A Tier 1 nurse chart review places straightforward cases directly
          or escalates them to a Tier 2 in-depth screen. The screen decides which clinic and whether an attending must
          be the primary physician; PHP/IOP is an adjustable advisory, never an automatic placement. Assignments are
          balanced across residents and attendings.
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
        ? <Screener onSave={addPatient} programs={programs} thresholds={thresholds} triggers={triggers} />
        : <Caseload
            patients={patients} providers={providers} programs={programs} thresholds={thresholds} triggers={triggers}
            onAddProvider={addProvider} onRemoveProvider={removeProvider}
            onRemovePatient={removePatient} onAddProgram={addProgram} onRemoveProgram={removeProgram}
            onSetThresholds={persistThresholds} onResetThresholds={resetThresholds}
            onAddTrigger={addTrigger} onRemoveTrigger={removeTrigger} onResetTriggers={resetTriggers}
            onLoadSample={loadSample} onClear={clearAll}
          />}
    </div>
  )
}
