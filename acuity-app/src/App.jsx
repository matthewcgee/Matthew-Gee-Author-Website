import React, { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { theme, Icon, Toast } from './components/ui.jsx'
import { KEYS, readStorage, writeStorage } from './lib/storage.js'
import { DEFAULT_THRESHOLDS, normalizeThresholds, seedLocations, seedEntries, seedDeployments } from './lib/model.js'
import { db, STATE_DOC } from './lib/firebase.js'
import StatusBoard from './components/StatusBoard.jsx'
import ShiftEntryForm from './components/ShiftEntryForm.jsx'
import Deployments from './components/Deployments.jsx'
import Reports from './components/Reports.jsx'
import Settings from './components/Settings.jsx'
import IntroVideo from './components/IntroVideo.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const TABS = [
  { id: 'status', label: 'Region Status Board', icon: 'grid' },
  { id: 'entry', label: 'New Shift Entry', icon: 'plusCircle' },
  { id: 'deployments', label: 'Staff Deployments', icon: 'users' },
  { id: 'reports', label: 'Reports', icon: 'barChart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const INTRO_KEY = 'bhai:introSeen:v1'

export default function App() {
  const [locations, setLocations] = useState(() => readStorage(KEYS.locations, null))
  const [entries, setEntries] = useState(() => readStorage(KEYS.entries, null))
  const [deployments, setDeployments] = useState(() => readStorage(KEYS.deployments, null))
  const [thresholds, setThresholds] = useState(() => normalizeThresholds(readStorage(KEYS.thresholds, null)))
  const [tab, setTab] = useState('status')
  const [toast, setToast] = useState('')
  const [showIntro, setShowIntro] = useState(false)

  const lastSynced = useRef({})
  const stateRef = useRef({})
  stateRef.current = { locations, entries, deployments, thresholds }

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
    const finalThresholds = normalizeThresholds(oldThresholds)
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
    if (!readStorage(INTRO_KEY, false)) {
      setShowIntro(true)
    }
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

  // Live sync with Firestore so every device shares the same data
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ...STATE_DOC),
      (snap) => {
        if (!snap.exists()) {
          const { locations, entries, deployments, thresholds } = stateRef.current
          if (locations != null && entries != null && deployments != null && thresholds != null) {
            lastSynced.current = { locations, entries, deployments, thresholds }
            setDoc(doc(db, ...STATE_DOC), { locations, entries, deployments, thresholds })
          }
          return
        }

        const data = snap.data()
        if (data.locations && JSON.stringify(data.locations) !== JSON.stringify(lastSynced.current.locations)) {
          lastSynced.current.locations = data.locations
          setLocations(data.locations)
        }
        if (data.entries && JSON.stringify(data.entries) !== JSON.stringify(lastSynced.current.entries)) {
          lastSynced.current.entries = data.entries
          setEntries(data.entries)
        }
        if (data.deployments && JSON.stringify(data.deployments) !== JSON.stringify(lastSynced.current.deployments)) {
          lastSynced.current.deployments = data.deployments
          setDeployments(data.deployments)
        }
        if (data.thresholds && JSON.stringify(data.thresholds) !== JSON.stringify(lastSynced.current.thresholds)) {
          const normalized = normalizeThresholds(data.thresholds)
          lastSynced.current.thresholds = normalized
          setThresholds(normalized)
        }
      },
      (err) => console.error('Firestore sync error', err)
    )
    return unsub
  }, [])

  useEffect(() => {
    if (locations == null) return
    if (JSON.stringify(locations) === JSON.stringify(lastSynced.current.locations)) return
    lastSynced.current.locations = locations
    setDoc(doc(db, ...STATE_DOC), { locations }, { merge: true }).catch((e) => console.error('sync locations', e))
  }, [locations])

  useEffect(() => {
    if (entries == null) return
    if (JSON.stringify(entries) === JSON.stringify(lastSynced.current.entries)) return
    lastSynced.current.entries = entries
    setDoc(doc(db, ...STATE_DOC), { entries }, { merge: true }).catch((e) => console.error('sync entries', e))
  }, [entries])

  useEffect(() => {
    if (deployments == null) return
    if (JSON.stringify(deployments) === JSON.stringify(lastSynced.current.deployments)) return
    lastSynced.current.deployments = deployments
    setDoc(doc(db, ...STATE_DOC), { deployments }, { merge: true }).catch((e) => console.error('sync deployments', e))
  }, [deployments])

  useEffect(() => {
    if (thresholds == null) return
    if (JSON.stringify(thresholds) === JSON.stringify(lastSynced.current.thresholds)) return
    lastSynced.current.thresholds = thresholds
    setDoc(doc(db, ...STATE_DOC), { thresholds }, { merge: true }).catch((e) => console.error('sync thresholds', e))
  }, [thresholds])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const closeIntro = () => {
    writeStorage(INTRO_KEY, true)
    setShowIntro(false)
  }

  if (locations == null || entries == null || deployments == null) {
    return (
      <div style={{ padding: 24, color: theme.sub, fontSize: 13 }}>Loading…</div>
    )
  }

  return (
    <div className="app-shell" style={{ background: theme.bg, color: theme.text }}>
      <aside
        className="app-sidebar"
        style={{
          background: theme.navy,
          color: '#ffffff',
          padding: '22px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="sparkle" size={20} />
          </div>
          <div>
            <div style={{ fontFamily: theme.display, fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>
              Atrium Health
            </div>
            <div style={{ fontSize: 11.5, color: '#9fc2bb', letterSpacing: 0.4 }}>
              Behavioral Health Acuity Index
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="nav-item btn-press"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13.5,
                  fontWeight: 600,
                  background: active ? theme.accent : 'transparent',
                  color: active ? '#ffffff' : '#cfe3df',
                }}
              >
                <Icon name={t.icon} size={17} />
                {t.label}
              </button>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <button
            onClick={() => setShowIntro(true)}
            className="btn-press"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.06)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon name="play" size={15} />
            Watch the Story
          </button>
          <div style={{ fontSize: 10.5, color: '#82a39c', marginTop: 10, textAlign: 'center' }}>
            Patent Pending &mdash; &copy; Matthew C. Gee
          </div>
        </div>
      </aside>

      <div className="app-main">
        <main style={{ padding: '24px 28px', maxWidth: 1240, margin: '0 auto' }}>
          <ErrorBoundary key={tab}>
          <div className="fade-in">
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
                  if (data.thresholds) setThresholds(normalizeThresholds(data.thresholds))
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
          </div>
          </ErrorBoundary>
        </main>
      </div>

      {showIntro && <IntroVideo onClose={closeIntro} />}
      <Toast message={toast} />
    </div>
  )
}
