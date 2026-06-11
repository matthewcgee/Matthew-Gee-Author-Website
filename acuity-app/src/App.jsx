import React, { useEffect, useState } from 'react'
import { theme, Button, Toast } from './components/ui.jsx'
import { KEYS, readStorage, writeStorage } from './lib/storage.js'
import { DEFAULT_THRESHOLDS, seedLocations, seedEntries, seedDeployments } from './lib/model.js'
import StatusBoard from './components/StatusBoard.jsx'
import ShiftEntryForm from './components/ShiftEntryForm.jsx'
import Deployments from './components/Deployments.jsx'
import Reports from './components/Reports.jsx'
import Settings from './components/Settings.jsx'

const TABS = [
  { id: 'status', label: 'Region Status Board' },
  { id: 'entry', label: 'New Shift Entry' },
  { id: 'deployments', label: 'Staff Deployments' },
  { id: 'reports', label: 'Reports' },
  { id: 'settings', label: 'Settings' },
]

export default function App() {
  const [locations, setLocations] = useState(() => readStorage(KEYS.locations, null))
  const [entries, setEntries] = useState(() => readStorage(KEYS.entries, null))
  const [deployments, setDeployments] = useState(() => readStorage(KEYS.deployments, null))
  const [thresholds, setThresholds] = useState(() => readStorage(KEYS.thresholds, null) || DEFAULT_THRESHOLDS)
  const [tab, setTab] = useState('status')
  const [toast, setToast] = useState('')

  // Seed / migrate on first load
  useEffect(() => {
    const seeded = readStorage(KEYS.seed, false)
    if (seeded) {
      if (locations == null) setLocations(readStorage(KEYS.locations, []))
      if (entries == null) setEntries(readStorage(KEYS.entries, []))
      if (deployments == null) setDeployments(readStorage(KEYS.deployments, []))
      return
    }

    // Try to migrate data saved by the previous version of the dashboard
    const oldLocations = readStorage('bhai:locations', null)
    const oldEntries = readStorage('bhai:entries', null)
    const oldThresholds = readStorage('bhai:thresholds', null)

    const finalLocations = oldLocations && oldLocations.length ? oldLocations : seedLocations()
    const finalEntries = oldEntries && oldEntries.length ? oldEntries : seedEntries()
    const finalThresholds = oldThresholds || DEFAULT_THRESHOLDS
    const finalDeployments = seedDeployments()

    // Make sure migrated locations have a censusCap field for the new feature
    const migratedLocations = finalLocations.map((l) => ({ censusCap: null, ...l }))

    setLocations(migratedLocations)
    setEntries(finalEntries)
    setThresholds(finalThresholds)
    setDeployments(finalDeployments)

    writeStorage(KEYS.locations, migratedLocations)
    writeStorage(KEYS.entries, finalEntries)
    writeStorage(KEYS.thresholds, finalThresholds)
    writeStorage(KEYS.deployments, finalDeployments)
    writeStorage(KEYS.seed, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (locations != null) writeStorage(KEYS.locations, locations)
  }, [locations])

  useEffect(() => {
    if (entries != null) writeStorage(KEYS.entries, entries)
  }, [entries])

  useEffect(() => {
    if (deployments != null) writeStorage(KEYS.deployments, deployments)
  }, [deployments])

  useEffect(() => {
    if (thresholds != null) writeStorage(KEYS.thresholds, thresholds)
  }, [thresholds])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  if (locations == null || entries == null || deployments == null) {
    return (
      <div style={{ padding: 24, color: theme.sub, fontSize: 13 }}>Loading…</div>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: theme.bg, color: theme.text }}>
      <header
        style={{
          borderBottom: `1px solid ${theme.border}`,
          padding: '18px 22px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontFamily: theme.display, fontSize: 22, fontWeight: 700 }}>BH Acuity Index</div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>Regional Command Center</div>
        </div>
        <nav style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? 'primary' : 'ghost'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </nav>
      </header>

      <main style={{ padding: 22, maxWidth: 1180, margin: '0 auto' }}>
        {tab === 'status' && (
          <StatusBoard locations={locations} entries={entries} thresholds={thresholds} />
        )}
        {tab === 'entry' && (
          <ShiftEntryForm
            locations={locations}
            thresholds={thresholds}
            onAdd={(entry) => {
              setEntries((prev) => [entry, ...prev])
              setToast('Shift entry saved')
            }}
          />
        )}
        {tab === 'deployments' && (
          <Deployments
            locations={locations}
            deployments={deployments}
            onChange={(next) => {
              setDeployments(next)
              setToast('Deployment log updated')
            }}
          />
        )}
        {tab === 'reports' && (
          <Reports
            locations={locations}
            entries={entries}
            deployments={deployments}
            thresholds={thresholds}
            onDeleteEntry={(id) => {
              setEntries((prev) => prev.filter((e) => e.id !== id))
              setToast('Entry removed')
            }}
          />
        )}
        {tab === 'settings' && (
          <Settings
            locations={locations}
            thresholds={thresholds}
            onChangeLocations={(next) => {
              setLocations(next)
              setToast('Locations updated')
            }}
            onChangeThresholds={(next) => {
              setThresholds(next)
              setToast('Thresholds updated')
            }}
            onImport={(data) => {
              if (data.locations) setLocations(data.locations)
              if (data.entries) setEntries(data.entries)
              if (data.deployments) setDeployments(data.deployments)
              if (data.thresholds) setThresholds(data.thresholds)
              setToast('Data imported')
            }}
            onClear={() => {
              const freshLocations = seedLocations()
              setLocations(freshLocations)
              setEntries([])
              setDeployments([])
              setThresholds(DEFAULT_THRESHOLDS)
              setToast('All data cleared')
            }}
            getExportData={() => ({ locations, entries, deployments, thresholds })}
          />
        )}
      </main>

      <Toast message={toast} />
    </div>
  )
}
