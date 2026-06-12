import React, { useState } from 'react'
import { Card, Field, Button, Badge, theme } from './ui.jsx'
import { uid, today } from '../lib/storage.js'
import { computeEntryValue, computeStage, thresholdsFor, STAGE_COLORS } from '../lib/model.js'

const emptyForm = (locId) => ({
  locId,
  date: today(),
  shift: 'AM',
  census: '',
  points: '',
  staff: '',
  notes: '',
})

export default function ShiftEntryForm({ locations, thresholds, onAdd }) {
  const [form, setForm] = useState(() => emptyForm(locations[0]?.id || ''))

  const loc = locations.find((l) => l.id === form.locId)
  const isEd = loc?.type === 'ed'

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const previewEntry = {
    points: Number(form.points) || 0,
    staff: Number(form.staff) || 0,
    census: Number(form.census) || 0,
  }
  const previewValue = loc ? computeEntryValue(previewEntry, loc, thresholds) : null
  const previewTh = loc ? thresholdsFor(loc, thresholds) : null
  const previewStage = loc ? computeStage(previewValue, previewTh) : 'NONE'

  const submit = (e) => {
    e.preventDefault()
    if (!loc) return
    const entry = {
      id: uid(),
      locId: form.locId,
      date: form.date,
      shift: form.shift,
      census: form.census === '' ? null : Number(form.census),
      points: Number(form.points) || 0,
      staff: isEd ? null : Number(form.staff) || 0,
      notes: form.notes,
      pilot: false,
      createdAt: Date.now(),
    }
    onAdd(entry)
    setForm((f) => emptyForm(f.locId))
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>New Shift Entry</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
          Log census, acuity points, and staffing for a shift.
        </div>
      </div>

      <Card>
        {locations.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>Add a location in Settings before logging a shift.</div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
              <Field label="Location">
                <select value={form.locId} onChange={set('locId')}>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} — {l.facility}</option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input type="date" value={form.date} onChange={set('date')} required />
              </Field>
              <Field label="Shift">
                <select value={form.shift} onChange={set('shift')}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
              {!isEd && (
                <Field label="Census" hint={loc?.censusCap != null ? `Nursing cap: ${loc.censusCap}` : undefined}>
                  <input type="number" min="0" value={form.census} onChange={set('census')} />
                </Field>
              )}
              <Field label={isEd ? 'Behavioral Health Points' : 'Acuity Points'}>
                <input type="number" min="0" step="0.1" value={form.points} onChange={set('points')} required />
              </Field>
              {!isEd && (
                <Field label="Staff on Shift">
                  <input type="number" min="0" step="0.1" value={form.staff} onChange={set('staff')} required />
                </Field>
              )}
            </div>

            <Field label="Notes" hint="Optional">
              <textarea rows={2} value={form.notes} onChange={set('notes')} />
            </Field>

            {loc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, color: theme.sub }}>Computed:</span>
                <span style={{ fontWeight: 700 }}>{previewValue.toFixed(isEd ? 0 : 2)}</span>
                <span style={{ fontSize: 12, color: theme.sub }}>{previewTh.unit}</span>
                <Badge color={STAGE_COLORS[previewStage]}>{previewStage}</Badge>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <Button type="submit">Save Entry</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}
