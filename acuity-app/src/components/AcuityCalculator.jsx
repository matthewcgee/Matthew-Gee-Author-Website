import React, { useState } from 'react'
import { Card, Field, Button, Badge, theme, grid } from './ui.jsx'
import { ADULT_ACUITY_CRITERIA } from '../lib/model.js'
import { uid } from '../lib/storage.js'

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
  const [mode, setMode] = useState('adult')
  const [initials, setInitials] = useState('')
  const [selections, setSelections] = useState(() => emptySelections(ADULT_ACUITY_CRITERIA))
  const [patients, setPatients] = useState([])

  const edLocations = locations.filter((l) => l.type === 'ed')
  const [edLocId, setEdLocId] = useState('')
  const [edShift, setEdShift] = useState('AM')

  const score = scoreFor(ADULT_ACUITY_CRITERIA, selections)

  const toggle = (id) => setSelections((s) => ({ ...s, [id]: !s[id] }))

  const addPatient = () => {
    if (!initials.trim()) return
    setPatients((list) => [...list, { id: uid(), initials: initials.trim().toUpperCase(), score, mode }])
    setInitials('')
    setSelections(emptySelections(ADULT_ACUITY_CRITERIA))
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
        <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Patient Acuity Calculator</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
          Score an individual patient's acuity, then push the total directly to ED acuity points.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button variant={mode === 'adult' ? 'primary' : 'ghost'} onClick={() => setMode('adult')}>Adult</Button>
        <Button variant={mode === 'peds' ? 'primary' : 'ghost'} onClick={() => setMode('peds')}>Peds</Button>
      </div>

      {mode === 'peds' ? (
        <Card>
          <div style={{ fontSize: 13, color: theme.sub }}>
            The Pediatric acuity calculator is coming soon — it will include the additional alterations for Peds scoring.
          </div>
        </Card>
      ) : (
        <>
          <Card title="Score a Patient" sub="Check all that apply, then add to the list">
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
              <Button onClick={addPatient} disabled={!initials.trim()}>Add to List</Button>
            </div>
          </Card>

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
        </>
      )}
    </div>
  )
}
