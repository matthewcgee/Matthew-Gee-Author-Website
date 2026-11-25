import React, { useMemo, useState } from 'react'
import { Card, Field, Button, Badge, theme, grid } from './ui.jsx'
import { STAGE_COLORS } from '../lib/model.js'
import {
  INSTRUMENT_NAME,
  LOCKED_CORE,
  WEIGHT_LIMIT_PCT,
  ZONE_SETS,
  ZONE_SET_IDS,
  ZONE_STAGES,
  activeCalibration,
  pointLimits,
  versionLabel,
  zoneBands,
} from '../lib/calibration.js'

const fmtDate = (at) => (at ? new Date(at).toLocaleString() : '—')

const KIND_LABEL = {
  shipped: 'Shipped defaults',
  migrated: 'Carried forward',
  update: 'Calibration change',
  reset: 'Reset to shipped defaults',
}

/** Small badge naming the calibration a screen is scoring under. */
export function CalibrationBadge({ calibration }) {
  if (!calibration) return null
  return (
    <span
      title={`${INSTRUMENT_NAME} calibration ${versionLabel(calibration)} — ${KIND_LABEL[calibration.kind] || ''}`}
      data-calibration-version={calibration.version}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 700, background: theme.accentSoft, color: theme.accent, whiteSpace: 'nowrap',
      }}
    >
      {INSTRUMENT_NAME} calibration {versionLabel(calibration)}
    </span>
  )
}

function draftFrom(cal) {
  return {
    points: Object.fromEntries(Object.entries(cal.points).map(([k, v]) => [k, String(v)])),
    zones: Object.fromEntries(ZONE_SET_IDS.map((s) => [s, { greenMax: String(cal.zones[s].greenMax), yellowMax: String(cal.zones[s].yellowMax) }])),
    responses: { ...cal.responses },
  }
}

const bandText = (b) => {
  if (b.max === Infinity) return `above ${b.min}`
  if (b.min === 0) return `0 – ${b.max}`
  return `above ${b.min} – ${b.max}`
}

/**
 * Administrator-only editor for the system-wide calibration, plus the
 * read-only version history. Validation and role checks run in
 * calibration.js; this component only collects the draft and shows errors.
 */
export default function CalibrationPanel({ state, onPropose, onReset }) {
  const active = activeCalibration(state)
  const [draft, setDraft] = useState(() => draftFrom(active))
  const [draftVersion, setDraftVersion] = useState(active.version)
  const [reason, setReason] = useState('')
  const [reviewers, setReviewers] = useState('')
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState('')

  // A new version arrived (saved here or by another administrator): start over from it.
  if (draftVersion !== active.version) {
    setDraftVersion(active.version)
    setDraft(draftFrom(active))
  }

  const setPoint = (id, v) => setDraft((d) => ({ ...d, points: { ...d.points, [id]: v } }))
  const setZone = (set, k, v) => setDraft((d) => ({ ...d, zones: { ...d.zones, [set]: { ...d.zones[set], [k]: v } } }))
  const setResponse = (stage, v) => setDraft((d) => ({ ...d, responses: { ...d.responses, [stage]: v } }))

  const finish = (result) => {
    if (!result?.ok) {
      setErrors(result?.errors || ['The change could not be saved.'])
      setSaved('')
      return
    }
    setErrors([])
    setReason('')
    setReviewers('')
    setSaved(`Saved as ${versionLabel(result.version)}.`)
  }

  const save = () => finish(onPropose(draft, { reason, reviewers }))
  const reset = () => {
    if (!window.confirm(`Restore the shipped ${INSTRUMENT_NAME} defaults? This is saved as a new version; earlier versions and every saved score stay as they are.`)) return
    finish(onReset({ reason, reviewers }))
  }

  const history = useMemo(() => [...(state?.versions || [])].sort((a, b) => b.version - a.version), [state])
  const pct = Math.round(WEIGHT_LIMIT_PCT * 100)

  return (
    <div>
      <Card
        title={`${INSTRUMENT_NAME} calibration`}
        sub="One calibration for the whole health system. Every unit and ED uses it."
        right={<CalibrationBadge calibration={active} />}
      >
        <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.5, marginBottom: 14 }}>
          Acuitas is an operational staffing tool, not a diagnostic test. You can tune point values (within ±{pct}% of
          the shipped default), zone cutoffs and zone responses so scores match how your nurses describe acuity.
          The four domains and the wording of every score level are locked. Each save becomes a new version, is
          written to the audit log, and applies to new scores only. Scores already saved keep the version they were
          calculated under.
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>Point values</div>
        <div style={grid(2)}>
          {LOCKED_CORE.map((g) => (
            <div key={g.group} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{g.group}</div>
                <span style={{ fontSize: 10.5, color: theme.sub }} title="Domains and level descriptions can't be edited">🔒 locked</span>
              </div>
              {g.note && <div style={{ fontSize: 11, color: theme.sub, marginBottom: 6 }}>{g.note}</div>}
              {g.items.map((i) => {
                const lim = pointLimits(i.id)
                return (
                  <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1fr 84px', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                    <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                      {i.label}
                      <div style={{ fontSize: 10.5, color: theme.sub }}>default {lim.default} · allowed {lim.min}–{lim.max}</div>
                    </div>
                    <input
                      type="number"
                      step="0.25"
                      min={lim.min}
                      max={lim.max}
                      aria-label={`${i.label} points`}
                      value={draft.points[i.id]}
                      onChange={(e) => setPoint(i.id, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, margin: '18px 0 8px' }}>Zone cutoffs</div>
        <div style={grid(3)}>
          {ZONE_SET_IDS.map((set) => {
            const z = draft.zones[set]
            const g = Number(z.greenMax)
            const y = Number(z.yellowMax)
            const valid = Number.isFinite(g) && Number.isFinite(y) && g > 0 && y > g
            return (
              <div key={set} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ZONE_SETS[set].label}</div>
                <div style={{ fontSize: 10.5, color: theme.sub, marginBottom: 8 }}>{ZONE_SETS[set].unit}</div>
                <div style={grid(2, 8)}>
                  <Field label="GREEN up to">
                    <input type="number" step={ZONE_SETS[set].step} value={z.greenMax} onChange={(e) => setZone(set, 'greenMax', e.target.value)} />
                  </Field>
                  <Field label="YELLOW up to">
                    <input type="number" step={ZONE_SETS[set].step} value={z.yellowMax} onChange={(e) => setZone(set, 'yellowMax', e.target.value)} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, fontSize: 11 }}>
                  {valid
                    ? zoneBands({ greenMax: g, yellowMax: y }).map((b) => (
                      <span key={b.stage}><Badge color={STAGE_COLORS[b.stage]}>{b.stage}</Badge> {bandText(b)}</span>
                    ))
                    : <span style={{ color: STAGE_COLORS.RED }}>GREEN must be above 0 and below YELLOW.</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, margin: '18px 0 8px' }}>Zone responses</div>
        <div style={grid(3)}>
          {ZONE_STAGES.map((stage) => (
            <Field key={stage} label={`${stage} — action this zone triggers`}>
              <textarea rows={2} value={draft.responses[stage]} onChange={(e) => setResponse(stage, e.target.value)} />
            </Field>
          ))}
        </div>

        <div style={{ fontWeight: 700, fontSize: 13.5, margin: '18px 0 8px' }}>Change control</div>
        <div style={grid(2)}>
          <Field label="Reason for this change" hint="Required. Written to the audit log.">
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Frontline nurses who reviewed it" hint="Required. Names or roles, separated by commas.">
            <textarea rows={3} value={reviewers} onChange={(e) => setReviewers(e.target.value)} placeholder="e.g. 4 West night charge RN, ED staff RN" />
          </Field>
        </div>

        {errors.length > 0 && (
          <div role="alert" style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#fde8e6', border: `1px solid ${STAGE_COLORS.RED}`, fontSize: 12.5, color: '#9b2c22' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Not saved</div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        {saved && <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 700, color: theme.accent }}>{saved}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          <Button onClick={save}>Save as {versionLabel({ version: Math.max(...(state?.versions || [active]).map((v) => v.version)) + 1 })}</Button>
          <Button variant="ghost" onClick={() => { setDraft(draftFrom(active)); setErrors([]) }}>Discard edits</Button>
          <Button variant="danger" onClick={reset}>Restore shipped defaults</Button>
        </div>
      </Card>

      <Card title="Calibration history" sub="Read-only. Every version ever saved for this health system.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map((v) => (
            <details key={v.version} style={{ border: `1px solid ${theme.border}`, borderRadius: 9, padding: '8px 12px' }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>
                <b>{versionLabel(v)}</b>{v.version === active.version ? ' (active)' : ''} · {KIND_LABEL[v.kind] || v.kind} · {fmtDate(v.at)}
                {v.actor ? ` · ${v.actor}` : ''}
              </summary>
              <div style={{ fontSize: 12, color: theme.sub, marginTop: 8, lineHeight: 1.5 }}>
                <div><b>Reason:</b> {v.reason || '—'}</div>
                <div><b>Reviewed by:</b> {v.reviewers?.length ? v.reviewers.join(', ') : '—'}</div>
                <div><b>Zones:</b> {ZONE_SET_IDS.map((s) => `${ZONE_SETS[s].label} GREEN ≤ ${v.zones[s].greenMax}, YELLOW ≤ ${v.zones[s].yellowMax}`).join(' · ')}</div>
                <div><b>Points:</b> {LOCKED_CORE.flatMap((g) => g.items).map((i) => `${i.label} ${v.points[i.id]}`).join(' · ')}</div>
                <div><b>Responses:</b> {ZONE_STAGES.map((s) => `${s}: ${v.responses[s]}`).join(' · ')}</div>
              </div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  )
}
