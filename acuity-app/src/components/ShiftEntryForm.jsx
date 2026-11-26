import React, { useEffect, useState } from 'react'
import { Card, Field, Button, Badge, theme } from './ui.jsx'
import { uid, today } from '../lib/storage.js'
import { computeEntryValue, computeStage, thresholdsFor, STAGE_COLORS } from '../lib/model.js'
import AcuitasLogo from './AcuitasLogo.jsx'
import { SHIFT_RATINGS } from '../lib/cutoffEvidence.js'

const emptyForm = (locId) => ({
  locId,
  date: today(),
  shift: 'AM',
  census: '',
  points: '',
  staff: '',
  capInPlace: false,
  bhArrivals: '',
  boarders: '',
  boardingHours: '',
  notes: '',
  nurseRating: '',
})

const optNum = (v) => (v === '' || v == null ? null : Number(v))

export default function ShiftEntryForm({ locations, thresholds, onAdd, censusPrefill = {}, onConsumePrefill }) {
  const [form, setForm] = useState(() => emptyForm(locations[0]?.id || ''))
  const [prefilled, setPrefilled] = useState(false)
  const [needRating, setNeedRating] = useState(false)

  // A census imported from the EHR (Settings → FHIR census import) for this
  // unit, date and shift fills the census field until the nurse changes it.
  const pre = censusPrefill?.[form.locId]
  useEffect(() => {
    if (pre && pre.date === form.date && pre.shift === form.shift && form.census === '') {
      setForm((f) => ({ ...f, census: String(pre.census) }))
      setPrefilled(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.locId, form.date, form.shift, pre?.census])

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
    if (!form.nurseRating) { setNeedRating(true); return }
    const entry = {
      id: uid(),
      locId: form.locId,
      date: form.date,
      shift: form.shift,
      census: form.census === '' ? null : Number(form.census),
      points: Number(form.points) || 0,
      staff: isEd ? null : Number(form.staff) || 0,
      capInPlace: !isEd && form.capInPlace,
      ...(isEd ? { bhArrivals: optNum(form.bhArrivals), boarders: optNum(form.boarders), boardingHours: optNum(form.boardingHours) } : {}),
      notes: form.notes,
      // The charge nurse's own judgment, given before the zone was shown: the
      // independent anchor the cutoffs are tested against (Cutoff evidence).
      nurseRating: form.nurseRating,
      pilot: false,
      createdAt: Date.now(),
    }
    onAdd(entry)
    if (prefilled && onConsumePrefill) onConsumePrefill(form.locId)
    setPrefilled(false)
    setNeedRating(false)
    setForm((f) => emptyForm(f.locId))
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>New Shift Entry</div>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>
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

            <fieldset style={{ border: `1px solid ${needRating && !form.nurseRating ? STAGE_COLORS.RED : theme.border}`, borderRadius: 10, padding: '10px 12px', margin: '0 0 12px' }}>
              <legend style={{ fontSize: 12.5, fontWeight: 700, padding: '0 4px' }}>Your judgment of this shift</legend>
              <div style={{ fontSize: 11.5, color: theme.sub, marginBottom: 8 }}>
                Answer first, before Acuitas shows its zone. Your rating does not change the zone: the zones are set
                for the whole system and stay fixed. Ratings are saved for the periodic review of those cutoffs.
              </div>
              <div role="radiogroup" aria-label="Your judgment of this shift" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SHIFT_RATINGS.map((r) => {
                  const on = form.nurseRating === r.id
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => { setForm((f) => ({ ...f, nurseRating: r.id })); setNeedRating(false) }}
                      className="btn-press"
                      style={{
                        padding: '8px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', minWidth: 150,
                        border: `1.5px solid ${on ? theme.accent : theme.border}`, background: on ? theme.accentSoft : theme.panel, color: theme.text,
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
                      <div style={{ fontSize: 11.5, color: theme.sub }}>{r.help}</div>
                    </button>
                  )
                })}
              </div>
              {needRating && !form.nurseRating && (
                <div role="alert" style={{ fontSize: 12, color: '#9b2c22', marginTop: 6 }}>Rate the shift before saving.</div>
              )}
            </fieldset>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
              {!isEd && (
                <Field label="Census" hint={prefilled ? 'Pre-filled from the FHIR census import' : (loc?.censusCap != null ? `Nursing cap: ${loc.censusCap}` : undefined)}>
                  <input type="number" min="0" value={form.census} onChange={(e) => { setPrefilled(false); set('census')(e) }} />
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

            {isEd && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>ED capacity (optional)</div>
                <div style={{ fontSize: 11.5, color: theme.sub, marginBottom: 8 }}>
                  Feeds the boarding forecast in Capacity &amp; Safety. Counts only — no patient details.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <Field label="BH arrivals this shift"><input type="number" min="0" value={form.bhArrivals} onChange={set('bhArrivals')} /></Field>
                  <Field label="BH patients boarding" hint="Awaiting an inpatient bed at shift end"><input type="number" min="0" value={form.boarders} onChange={set('boarders')} /></Field>
                  <Field label="Boarding hours this shift" hint="Total across all BH boarders"><input type="number" min="0" step="0.5" value={form.boardingHours} onChange={set('boardingHours')} /></Field>
                </div>
              </div>
            )}

            {!isEd && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: form.capInPlace ? 700 : 400 }}>
                  <input
                    type="checkbox"
                    checked={form.capInPlace}
                    onChange={(e) => setForm((f) => ({ ...f, capInPlace: e.target.checked }))}
                  />
                  Census cap in place this shift
                </label>
                {form.capInPlace && (
                  <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 3, marginLeft: 24 }}>
                    This shift will be recorded as a cap event in Reports.
                  </div>
                )}
              </div>
            )}

            <Field label="Notes" hint="Optional">
              <textarea rows={2} value={form.notes} onChange={set('notes')} />
            </Field>

            {loc && !form.nurseRating && (
              <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 14, marginBottom: 4 }}>
                Rate the shift above to see Acuitas&rsquo;s zone.
              </div>
            )}
            {loc && form.nurseRating && (
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
