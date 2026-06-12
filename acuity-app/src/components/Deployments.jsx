import React, { useState } from 'react'
import { Card, Field, Button, theme } from './ui.jsx'
import { uid, today } from '../lib/storage.js'

const emptyForm = () => ({
  date: today(),
  shift: 'AM',
  staffName: '',
  role: '',
  fromLocId: '',
  toLocId: '',
  hours: '',
  reason: '',
  notes: '',
})

function locName(locations, id) {
  const l = locations.find((loc) => loc.id === id)
  return l ? l.name : (id ? '—' : 'Float pool / off-unit')
}

export default function Deployments({ locations, deployments, onAdd, onRemove }) {
  const [form, setForm] = useState(emptyForm)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    if (!form.staffName || !form.toLocId) return
    const deployment = {
      id: uid(),
      date: form.date,
      shift: form.shift,
      staffName: form.staffName,
      role: form.role,
      fromLocId: form.fromLocId || null,
      toLocId: form.toLocId,
      hours: form.hours === '' ? null : Number(form.hours),
      reason: form.reason,
      notes: form.notes,
      createdAt: Date.now(),
    }
    onAdd(deployment)
    setForm((f) => emptyForm())
  }

  const remove = (id) => {
    onRemove(id)
  }

  const sorted = deployments.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>Staff Deployments</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
          Track who was deployed where and when to offset acuity, for budgeting and reporting.
        </div>
      </div>

      <Card title="Log a Deployment">
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Field label="Date">
              <input type="date" value={form.date} onChange={set('date')} required />
            </Field>
            <Field label="Shift">
              <select value={form.shift} onChange={set('shift')}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </Field>
            <Field label="Staff Name">
              <input type="text" value={form.staffName} onChange={set('staffName')} placeholder="e.g. J. Alvarez, RN" required />
            </Field>
            <Field label="Role" hint="Optional">
              <input type="text" value={form.role} onChange={set('role')} placeholder="e.g. RN, BHT, MHT" />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Field label="Deployed From" hint="Optional — leave blank for float pool">
              <select value={form.fromLocId} onChange={set('fromLocId')}>
                <option value="">Float pool / off-unit</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} — {l.facility}</option>
                ))}
              </select>
            </Field>
            <Field label="Deployed To">
              <select value={form.toLocId} onChange={set('toLocId')} required>
                <option value="">Select a location…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} — {l.facility}</option>
                ))}
              </select>
            </Field>
            <Field label="Hours" hint="Optional">
              <input type="number" min="0" step="0.5" value={form.hours} onChange={set('hours')} />
            </Field>
            <Field label="Reason" hint="Optional">
              <input type="text" value={form.reason} onChange={set('reason')} placeholder="e.g. acuity surge, census cap" />
            </Field>
          </div>

          <Field label="Notes" hint="Optional">
            <textarea rows={2} value={form.notes} onChange={set('notes')} />
          </Field>

          <div style={{ marginTop: 14 }}>
            <Button type="submit">Log Deployment</Button>
          </div>
        </form>
      </Card>

      <Card title="Deployment Log" sub={`${sorted.length} record${sorted.length === 1 ? '' : 's'}`}>
        {sorted.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No deployments logged yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '6px 8px' }}>Date</th>
                  <th style={{ padding: '6px 8px' }}>Shift</th>
                  <th style={{ padding: '6px 8px' }}>Staff</th>
                  <th style={{ padding: '6px 8px' }}>Role</th>
                  <th style={{ padding: '6px 8px' }}>From</th>
                  <th style={{ padding: '6px 8px' }}>To</th>
                  <th style={{ padding: '6px 8px' }}>Hours</th>
                  <th style={{ padding: '6px 8px' }}>Reason</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '6px 8px' }}>{d.date}</td>
                    <td style={{ padding: '6px 8px' }}>{d.shift}</td>
                    <td style={{ padding: '6px 8px' }}>{d.staffName}</td>
                    <td style={{ padding: '6px 8px' }}>{d.role || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{locName(locations, d.fromLocId)}</td>
                    <td style={{ padding: '6px 8px' }}>{locName(locations, d.toLocId)}</td>
                    <td style={{ padding: '6px 8px' }}>{d.hours ?? '—'}</td>
                    <td style={{ padding: '6px 8px' }}>{d.reason || '—'}</td>
                    <td style={{ padding: '6px 8px' }}>
                      <Button variant="danger" onClick={() => remove(d.id)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
