import React, { useRef, useState } from 'react'
import { Card, Field, Button, theme } from './ui.jsx'
import { uid } from '../lib/storage.js'

const emptyLocation = () => ({
  id: uid(),
  name: '',
  facility: '',
  market: '',
  region: '',
  type: 'inpatient',
  censusCap: '',
  thresholds: null,
})

export default function Settings({
  locations,
  thresholds,
  onChangeLocations,
  onChangeThresholds,
  onImport,
  onClear,
  getExportData,
}) {
  const [newLoc, setNewLoc] = useState(emptyLocation)
  const [thresholdDrafts, setThresholdDrafts] = useState({})
  const fileInputRef = useRef(null)

  const setNew = (key) => (e) => setNewLoc((l) => ({ ...l, [key]: e.target.value }))

  const addLocation = (e) => {
    e.preventDefault()
    if (!newLoc.name || !newLoc.facility) return
    const loc = {
      ...newLoc,
      censusCap: newLoc.censusCap === '' ? null : Number(newLoc.censusCap),
    }
    onChangeLocations([...locations, loc])
    setNewLoc(emptyLocation())
  }

  const updateLocation = (id, patch) => {
    onChangeLocations(locations.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const removeLocation = (id) => {
    onChangeLocations(locations.filter((l) => l.id !== id))
  }

  const updateLocationThreshold = (id, key, value) => {
    const loc = locations.find((l) => l.id === id)
    const type = loc.type === 'ed' ? 'ed' : 'inpatient'
    const draft = thresholdDrafts[id] || {
      greenMax: loc.thresholds?.greenMax ?? '',
      yellowMax: loc.thresholds?.yellowMax ?? '',
    }
    const nextDraft = { ...draft, [key]: value }
    setThresholdDrafts((d) => ({ ...d, [id]: nextDraft }))

    const g = nextDraft.greenMax === '' ? null : Number(nextDraft.greenMax)
    const y = nextDraft.yellowMax === '' ? null : Number(nextDraft.yellowMax)
    if (g == null && y == null) {
      updateLocation(id, { thresholds: null })
    } else if (g != null && y != null) {
      updateLocation(id, { thresholds: { unit: loc.thresholds?.unit || thresholds[type].unit, greenMax: g, yellowMax: y } })
    }
    // If only one of the two fields has a value, leave thresholds as-is —
    // the draft below keeps the typed value visible until both are filled.
  }

  const thresholdDraftValue = (loc, key) => {
    const draft = thresholdDrafts[loc.id]
    if (draft && key in draft) return draft[key]
    return loc.thresholds?.[key] ?? ''
  }

  const updateThreshold = (type, key, value) => {
    onChangeThresholds({
      ...thresholds,
      [type]: { ...thresholds[type], [key]: Number(value) },
    })
  }

  const exportAll = () => {
    const data = getExportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'acuity-data.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        onImport(data)
      } catch {
        alert('Could not read that file. Please choose a valid acuity-data.json export.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const clearAll = () => {
    if (window.confirm('Clear all locations, shift entries, deployments, and thresholds? This cannot be undone.')) {
      onClear()
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>Settings</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
          Manage locations, census caps, thresholds, and data.
        </div>
      </div>

      <Card title="Locations" sub="Includes census caps driven by nursing limitations">
        {locations.length === 0 && (
          <div style={{ fontSize: 13, color: theme.sub, marginBottom: 12 }}>No locations yet.</div>
        )}
        {locations.map((loc) => (
          <div
            key={loc.id}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
              padding: '10px 0',
              borderBottom: `1px solid ${theme.border}`,
              alignItems: 'end',
            }}
          >
            <Field label="Name">
              <input type="text" value={loc.name} onChange={(e) => updateLocation(loc.id, { name: e.target.value })} />
            </Field>
            <Field label="Facility">
              <input type="text" value={loc.facility} onChange={(e) => updateLocation(loc.id, { facility: e.target.value })} />
            </Field>
            <Field label="Market">
              <input type="text" value={loc.market} onChange={(e) => updateLocation(loc.id, { market: e.target.value })} />
            </Field>
            <Field label="Region">
              <input type="text" value={loc.region} onChange={(e) => updateLocation(loc.id, { region: e.target.value })} />
            </Field>
            <Field label="Type">
              <select value={loc.type} onChange={(e) => updateLocation(loc.id, { type: e.target.value })}>
                <option value="inpatient">Inpatient</option>
                <option value="ed">Emergency Department</option>
              </select>
            </Field>
            <Field label="Census Cap" hint="Nursing-driven limit">
              <input
                type="number"
                min="0"
                value={loc.censusCap ?? ''}
                onChange={(e) => updateLocation(loc.id, { censusCap: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder={loc.type === 'ed' ? 'N/A' : 'e.g. 18'}
                disabled={loc.type === 'ed'}
              />
            </Field>
            <Field label="Custom Green Max" hint="Blank = use default thresholds">
              <input
                type="number"
                step="0.1"
                value={thresholdDraftValue(loc, 'greenMax')}
                onChange={(e) => updateLocationThreshold(loc.id, 'greenMax', e.target.value)}
                placeholder="default"
              />
            </Field>
            <Field label="Custom Yellow Max" hint="Both fields required to override">
              <input
                type="number"
                step="0.1"
                value={thresholdDraftValue(loc, 'yellowMax')}
                onChange={(e) => updateLocationThreshold(loc.id, 'yellowMax', e.target.value)}
                placeholder="default"
              />
            </Field>
            <div>
              <Button variant="danger" onClick={() => removeLocation(loc.id)}>Remove</Button>
            </div>
          </div>
        ))}

        <form onSubmit={addLocation} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 8, fontWeight: 700 }}>Add a location</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
            <Field label="Name"><input type="text" value={newLoc.name} onChange={setNew('name')} required /></Field>
            <Field label="Facility"><input type="text" value={newLoc.facility} onChange={setNew('facility')} required /></Field>
            <Field label="Market"><input type="text" value={newLoc.market} onChange={setNew('market')} /></Field>
            <Field label="Region"><input type="text" value={newLoc.region} onChange={setNew('region')} /></Field>
            <Field label="Type">
              <select value={newLoc.type} onChange={setNew('type')}>
                <option value="inpatient">Inpatient</option>
                <option value="ed">Emergency Department</option>
              </select>
            </Field>
            <Field label="Census Cap" hint="Nursing-driven limit">
              <input type="number" min="0" value={newLoc.censusCap} onChange={setNew('censusCap')} disabled={newLoc.type === 'ed'} />
            </Field>
          </div>
          <Button type="submit">Add Location</Button>
        </form>
      </Card>

      <Card title="Default Thresholds" sub="Used when a location has no custom thresholds">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Inpatient (UAI)</div>
            <Field label="Green max">
              <input type="number" step="0.1" value={thresholds.inpatient.greenMax} onChange={(e) => updateThreshold('inpatient', 'greenMax', e.target.value)} />
            </Field>
            <div style={{ height: 8 }} />
            <Field label="Yellow max">
              <input type="number" step="0.1" value={thresholds.inpatient.yellowMax} onChange={(e) => updateThreshold('inpatient', 'yellowMax', e.target.value)} />
            </Field>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Emergency Department</div>
            <Field label="Green max">
              <input type="number" step="0.1" value={thresholds.ed.greenMax} onChange={(e) => updateThreshold('ed', 'greenMax', e.target.value)} />
            </Field>
            <div style={{ height: 8 }} />
            <Field label="Yellow max">
              <input type="number" step="0.1" value={thresholds.ed.yellowMax} onChange={(e) => updateThreshold('ed', 'yellowMax', e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Data Management">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={exportAll}>Export All Data (JSON)</Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>Import Data (JSON)</Button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImport} />
          <Button variant="danger" onClick={clearAll}>Clear All Data</Button>
        </div>
      </Card>
    </div>
  )
}
