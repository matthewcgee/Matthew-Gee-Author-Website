import React, { useState } from 'react'
import { Card, Field, Button, Badge, theme, grid } from './ui.jsx'
import { ADULT_ACUITY_CRITERIA, PEDIATRIC_MODIFIER_GROUPS, scorePediatricModifiers } from '../lib/model.js'
import { uid } from '../lib/storage.js'
import AcuitasLogo from './AcuitasLogo.jsx'

const emptySelections = (criteria) => {
  const sel = {}
  criteria.forEach((g) => g.items.forEach((item) => { sel[item.id] = false }))
  return sel
}

function scoreFor(criteria, selections) {
  let total = 0
  criteria.forEach((g) => g.items.forEach((item) => {
    if (selections[item.id]) total += item.points
  }))
  return total
}

export default function AcuityCalculator({ locations, onPushToED }) {
  const [mode, setMode] = useState('scoring')
  const [initials, setInitials] = useState('')
  const [selections, setSelections] = useState(() => emptySelections(ADULT_ACUITY_CRITERIA))
  const [pedsBase, setPedsBase] = useState('')
  const [pedsBasePushed, setPedsBasePushed] = useState(false)
  const [pedsMods, setPedsMods] = useState([])
  const [patients, setPatients] = useState([])

  const edLocations = locations.filter((l) => l.type === 'ed')
  const [edLocId, setEdLocId] = useState('')
  const [edShift, setEdShift] = useState('AM')

  const score = scoreFor(ADULT_ACUITY_CRITERIA, selections)

  const pedsModScore = scorePediatricModifiers(pedsMods)
  const pedsBaseNum = Number(pedsBase) || 0
  const pedsTotal = pedsBaseNum + pedsModScore.total

  const toggle = (id) => setSelections((s) => ({ ...s, [id]: !s[id] }))
  const togglePedsMod = (id) =>
    setPedsMods((mods) => (mods.includes(id) ? mods.filter((m) => m !== id) : [...mods, id]))

  const addPatient = () => {
    if (!initials.trim()) return
    setPatients((list) => [...list, { id: uid(), initials: initials.trim().toUpperCase(), score, mode: 'adult' }])
    setInitials('')
    setSelections(emptySelections(ADULT_ACUITY_CRITERIA))
  }

  const pushToPeds = () => {
    setPedsBase(String(score))
    setPedsBasePushed(true)
    setPedsMods([])
    setSelections(emptySelections(ADULT_ACUITY_CRITERIA))
    setMode('peds')
  }

  const addPedsPatient = () => {
    if (!initials.trim()) return
    setPatients((list) => [...list, { id: uid(), initials: initials.trim().toUpperCase(), score: pedsTotal, mode: 'peds' }])
    setInitials('')
    setPedsBase('')
    setPedsBasePushed(false)
    setPedsMods([])
  }

  const removePatient = (id) => setPatients((list) => list.filter((p) => p.id !== id))

  const pushPatient = (p) => {
    if (!edLocId) return
    onPushToED(edLocId, edShift, p.score)
    removePatient(p.id)
  }

  const totalPending = patients.reduce((sum, p) => sum + p.score, 0)

  return (
    <div style={{ marginTop: 8 }}>
      <div className="fade-in-up" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>AcuiCalc&#8482; &mdash; Acuity Calculator&#8482;</div>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>
          Score an individual patient's acuity, then push the total directly to ED acuity points.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <Button variant={mode === 'scoring' ? 'primary' : 'ghost'} onClick={() => setMode('scoring')}>Step 1 — Acuity Scoring</Button>
        <Button variant={mode === 'peds' ? 'primary' : 'ghost'} onClick={() => setMode('peds')}>Step 2 — Peds Modifiers</Button>
      </div>
      <div style={{ fontSize: 11.5, color: theme.sub, marginBottom: 16 }}>
        Step 1 for all patients. Adult patients stop here. Pediatric patients continue to Step 2.
      </div>

      {mode === 'peds' ? (
        <Card title="Step 2 — Pediatric Modifiers" sub="Apply modifier points on top of the base acuity score from Step 1">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14, maxWidth: 420 }}>
            <Field label="Patient Initials">
              <input
                type="text"
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                placeholder="e.g. J.D."
                maxLength={8}
              />
            </Field>
            <Field label="Base Acuity Score" hint={pedsBasePushed ? '✓ Carried from Step 1 — Acuity Scoring' : 'Score from Step 1, or enter manually'}>
              <input
                type="number"
                min="0"
                value={pedsBase}
                onChange={(e) => { setPedsBase(e.target.value); setPedsBasePushed(false) }}
                placeholder="0"
                style={pedsBasePushed ? { borderColor: theme.accent } : undefined}
              />
            </Field>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: theme.text }}>Pediatric Modifiers</div>
          <div style={grid(3)}>
            {PEDIATRIC_MODIFIER_GROUPS.map((group) => (
              <div key={group.group}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: theme.text }}>{group.group}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map((item) => {
                    const checked = pedsMods.includes(item.id)
                    const governed = checked && pedsModScore.governedOut.some((g) => g.id === item.id)
                    return (
                      <label
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 8,
                          fontSize: 12.5,
                          color: governed ? theme.sub : theme.sub,
                          cursor: 'pointer',
                          opacity: governed ? 0.55 : 1,
                        }}
                        title={governed ? 'Observation cluster: highest single modifier governs — this one is not added.' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePedsMod(item.id)}
                          style={{ marginTop: 2 }}
                        />
                        <span style={{ textDecoration: governed ? 'line-through' : 'none' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: theme.sub, marginRight: 4 }}>{item.id}</span>
                          {item.label} <span style={{ fontWeight: 700, color: theme.accent }}>(+{item.points})</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {pedsModScore.governedOut.length > 0 && (
            <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 10 }}>
              Observation cluster: {pedsModScore.governedOut.map((g) => g.id).join(', ')} not added — the
              highest single observation modifier governs.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
            <div>
              <div style={{ fontSize: 11.5, color: theme.sub }}>Total Score</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: theme.display }}>{pedsTotal}</div>
              <div style={{ fontSize: 11, color: theme.sub }}>
                base {pedsBaseNum} + modifiers {pedsModScore.total}
              </div>
            </div>
            <Button onClick={addPedsPatient} disabled={!initials.trim()}>Add to List</Button>
          </div>
        </Card>
      ) : (
        <Card title="Step 1 — Acuity Scoring" sub="Check all criteria that apply. Add to list for adult patients, or push score to Peds Modifiers for pediatric patients.">
          <div style={{ marginBottom: 14, maxWidth: 240 }}>
            <Field label="Patient Initials">
              <input
                type="text"
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                placeholder="e.g. J.D."
                maxLength={8}
              />
            </Field>
          </div>

          <div style={grid(3)}>
            {ADULT_ACUITY_CRITERIA.map((group) => (
              <div key={group.group}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: theme.text }}>{group.group}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map((item) => (
                    <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: theme.sub, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!selections[item.id]}
                        onChange={() => toggle(item.id)}
                        style={{ marginTop: 2 }}
                      />
                      <span>
                        {item.label} <span style={{ fontWeight: 700, color: theme.accent }}>(+{item.points})</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
            <div>
              <div style={{ fontSize: 11.5, color: theme.sub }}>Total Score</div>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: theme.display }}>{score}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button
                variant="ghost"
                onClick={pushToPeds}
                disabled={!initials.trim()}
                style={{ fontSize: 13 }}
              >
                Push to Peds →
              </Button>
              <Button onClick={addPatient} disabled={!initials.trim()}>
                Add Adult to List
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Scored Patients" sub={`${patients.length} pending · ${totalPending} total point${totalPending === 1 ? '' : 's'}`}>
        {edLocations.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Field label="Push to ED Location">
              <select value={edLocId} onChange={(e) => setEdLocId(e.target.value)}>
                <option value="">Select ED…</option>
                {edLocations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} — {l.facility}</option>
                ))}
              </select>
            </Field>
            <Field label="Shift">
              <select value={edShift} onChange={(e) => setEdShift(e.target.value)}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </Field>
          </div>
        )}

        {patients.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No patients scored yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {patients.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: theme.panelAlt,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700 }}>{p.initials}</span>
                  <Badge color={theme.accentSoft}>{p.score} pts</Badge>
                  {p.mode === 'peds' && <Badge color={theme.accentSoft}>Peds</Badge>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="primary"
                    onClick={() => pushPatient(p)}
                    disabled={!edLocId}
                    style={{ fontSize: 12 }}
                  >
                    Push to ED Acuity
                  </Button>
                  <Button variant="danger" onClick={() => removePatient(p.id)} style={{ fontSize: 12 }}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
