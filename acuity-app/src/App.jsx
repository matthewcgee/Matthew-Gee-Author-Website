import React, { useEffect, useRef, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, increment, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { theme, Icon, Toast } from './components/ui.jsx'
import AcuitasLogo from './components/AcuitasLogo.jsx'
import { KEYS, readStorage, writeStorage, today, uid } from './lib/storage.js'
import { DEFAULT_THRESHOLDS, normalizeThresholds, seedLocations, seedEntries, seedDeployments } from './lib/model.js'
import { db, STATE_DOC } from './lib/firebase.js'
import StatusBoard from './components/StatusBoard.jsx'
import ShiftEntryForm from './components/ShiftEntryForm.jsx'
import Deployments from './components/Deployments.jsx'
import Reports from './components/Reports.jsx'
import AcuityCalculator from './components/AcuityCalculator.jsx'
import HelpGuide from './components/HelpGuide.jsx'
import Settings from './components/Settings.jsx'
import SettingsLock from './components/SettingsLock.jsx'
import IntroVideo from './components/IntroVideo.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const TABS = [
  { id: 'status', label: 'Region Status Board', icon: 'grid' },
  { id: 'entry', label: 'New Shift Entry', icon: 'plusCircle' },
  { id: 'deployments', label: 'Staff Deployments', icon: 'users' },
  { id: 'reports', label: 'Reports', icon: 'barChart' },
  { id: 'calculator', label: 'AcuiCalc™', icon: 'sparkle' },
  { id: 'help', label: 'Help & Training', icon: 'help' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

const INTRO_KEY = 'bhai:introSeen:v1'
const DATA_CLEAR_KEY = 'bhai:cleared:v1'
const SCRUB_KEY = 'bhai:scrubbed:v1'

export default function App() {
  const [locations, setLocations] = useState(() => readStorage(KEYS.locations, null))
  const [entries, setEntries] = useState(() => readStorage(KEYS.entries, null))
  const [deployments, setDeployments] = useState(() => readStorage(KEYS.deployments, null))
  const [thresholds, setThresholds] = useState(() => normalizeThresholds(readStorage(KEYS.thresholds, null)))
  const [caps, setCaps] = useState({})
  const [tab, setTab] = useState('status')
  const [toast, setToast] = useState('')
  const [showIntro, setShowIntro] = useState(false)
  const [settingsUnlocked, setSettingsUnlocked] = useState(() => sessionStorage.getItem('bhai:settingsUnlocked') === 'true')

  const lastSynced = useRef({})
  const remoteLoaded = useRef(false)
  const stateRef = useRef({})
  stateRef.current = { locations, entries, deployments, thresholds }

  const migrationDone = useRef(false)
  const entriesSnapRef = useRef(null)
  const deploymentsSnapRef = useRef(null)
  const legacyRef = useRef({ entries: null, deployments: null, loaded: false })
  const scrubDone = useRef(false)

  // One-time move of legacy array-based entries/deployments into their own
  // per-document collections, where concurrent edits can't clobber each other
  function tryMigrateCollections() {
    if (migrationDone.current) return
    if (entriesSnapRef.current == null || deploymentsSnapRef.current == null || !legacyRef.current.loaded) return
    migrationDone.current = true

    // Skip migration permanently once the one-time data clear has been requested
    if (readStorage(DATA_CLEAR_KEY, false)) return

    if (entriesSnapRef.current.length === 0) {
      const source = (legacyRef.current.entries && legacyRef.current.entries.length)
        ? legacyRef.current.entries
        : seedEntries()
      source.forEach((e) => setDoc(doc(db, 'entries', e.id), e).catch((err) => console.error('migrate entry', err)))
    }
    if (deploymentsSnapRef.current.length === 0 && legacyRef.current.deployments && legacyRef.current.deployments.length) {
      legacyRef.current.deployments.forEach((d) => setDoc(doc(db, 'deployments', d.id), d).catch((err) => console.error('migrate deployment', err)))
    }
  }

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

  // One-time scrub: strip facility, market, and region from every location
  // stored in Firestore so no identifying names appear in the live app.
  // Runs after Firestore locations have been loaded (remoteLoaded guard via
  // locations dependency), then writes cleaned locations back to state so the
  // existing locations-sync effect pushes them to Firestore automatically.
  useEffect(() => {
    if (!locations || !remoteLoaded.current) return
    if (scrubDone.current || readStorage(SCRUB_KEY, false)) {
      scrubDone.current = true
      return
    }
    const needsScrub = locations.some((l) => l.facility || l.market || l.region)
    scrubDone.current = true
    writeStorage(SCRUB_KEY, true)
    if (!needsScrub) return
    setLocations(locations.map((l) => ({ ...l, facility: '', market: '', region: '' })))
  }, [locations])

  // One-time clear of all pilot/seed entries and deployments from Firestore.
  // Write the guard key SYNCHRONOUSLY first so tryMigrateCollections (which
  // runs concurrently) cannot race ahead and re-populate the empty collections.
  useEffect(() => {
    if (readStorage(DATA_CLEAR_KEY, false)) return
    writeStorage(DATA_CLEAR_KEY, true)
    Promise.all([
      getDocs(collection(db, 'entries')).then((snap) => {
        if (snap.empty) return
        const batch = writeBatch(db)
        snap.docs.forEach((d) => batch.delete(d.ref))
        return batch.commit()
      }),
      getDocs(collection(db, 'deployments')).then((snap) => {
        if (snap.empty) return
        const batch = writeBatch(db)
        snap.docs.forEach((d) => batch.delete(d.ref))
        return batch.commit()
      }),
    ]).catch((e) => console.error('data clear failed', e))
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

  // Live sync of locations & thresholds via a single shared document
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ...STATE_DOC),
      (snap) => {
        if (!snap.exists()) {
          const { locations, thresholds } = stateRef.current
          if (locations != null && thresholds != null) {
            lastSynced.current.locations = locations
            lastSynced.current.thresholds = thresholds
            setDoc(doc(db, ...STATE_DOC), { locations, thresholds })
          }
          legacyRef.current.entries = null
          legacyRef.current.deployments = null
        } else {
          const data = snap.data()
          if (data.locations && JSON.stringify(data.locations) !== JSON.stringify(lastSynced.current.locations)) {
            lastSynced.current.locations = data.locations
            setLocations(data.locations)
          }
          if (data.thresholds && JSON.stringify(data.thresholds) !== JSON.stringify(lastSynced.current.thresholds)) {
            const normalized = normalizeThresholds(data.thresholds)
            lastSynced.current.thresholds = normalized
            setThresholds(normalized)
          }
          // Older versions stored entries/deployments as arrays on this doc;
          // hang onto them so they can be migrated into their own collections
          legacyRef.current.entries = data.entries || null
          legacyRef.current.deployments = data.deployments || null
        }
        remoteLoaded.current = true
        legacyRef.current.loaded = true
        tryMigrateCollections()
      },
      (err) => {
        console.error('Firestore sync error', err)
        remoteLoaded.current = true
        legacyRef.current.loaded = true
        tryMigrateCollections()
      }
    )
    return unsub
  }, [])

  // Live sync of shift entries — each entry is its own document, so two
  // units submitting at the same time never overwrite each other
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'entries'),
      (snap) => {
        const arr = snap.docs.map((d) => d.data())
        entriesSnapRef.current = arr
        setEntries(arr)
        tryMigrateCollections()
      },
      (err) => {
        console.error('Firestore entries sync error', err)
        entriesSnapRef.current = []
        tryMigrateCollections()
      }
    )
    return unsub
  }, [])

  // Live sync of staff deployments, same per-document approach as entries
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'deployments'),
      (snap) => {
        const arr = snap.docs.map((d) => d.data())
        deploymentsSnapRef.current = arr
        setDeployments(arr)
        tryMigrateCollections()
      },
      (err) => {
        console.error('Firestore deployments sync error', err)
        deploymentsSnapRef.current = []
        tryMigrateCollections()
      }
    )
    return unsub
  }, [])

  // Live sync of nursing-driven census caps — one document per location, so
  // charge nurses on different units can update their cap independently
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'locationCaps'),
      (snap) => {
        const next = {}
        snap.docs.forEach((d) => {
          next[d.id] = d.data().censusCap
        })
        setCaps(next)
      },
      (err) => console.error('Firestore caps sync error', err)
    )
    return unsub
  }, [])

  useEffect(() => {
    if (locations == null || !remoteLoaded.current) return
    if (JSON.stringify(locations) === JSON.stringify(lastSynced.current.locations)) return
    lastSynced.current.locations = locations
    setDoc(doc(db, ...STATE_DOC), { locations }, { merge: true }).catch((e) => console.error('sync locations', e))
  }, [locations])

  useEffect(() => {
    if (thresholds == null || !remoteLoaded.current) return
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

  const updateCap = (locId, censusCap) => setDoc(doc(db, 'locationCaps', locId), { censusCap }).catch((e) => console.error('update cap', e))

  const addEntry = (entry) => setDoc(doc(db, 'entries', entry.id), entry).catch((e) => console.error('add entry', e))
  const removeEntry = (id) => deleteDoc(doc(db, 'entries', id)).catch((e) => console.error('remove entry', e))
  const addDeployment = (dep) => setDoc(doc(db, 'deployments', dep.id), dep).catch((e) => console.error('add deployment', e))
  const removeDeployment = (id) => deleteDoc(doc(db, 'deployments', id)).catch((e) => console.error('remove deployment', e))

  async function pushAcuityToED(locId, shift, points) {
    const todayStr = today()
    const list = entries.filter((e) => e.locId === locId && e.date === todayStr && e.shift === shift)
    const existing = list[list.length - 1]
    if (existing) {
      await updateDoc(doc(db, 'entries', existing.id), { points: increment(points) }).catch((e) => console.error('push acuity', e))
    } else {
      const entry = {
        id: uid(),
        locId,
        date: todayStr,
        shift,
        census: null,
        points,
        staff: null,
        notes: 'Added via Patient Acuity Calculator',
        pilot: false,
        createdAt: Date.now(),
      }
      await setDoc(doc(db, 'entries', entry.id), entry).catch((e) => console.error('push acuity', e))
    }
  }

  async function replaceCollection(name, items) {
    const snap = await getDocs(collection(db, name))
    const batch = writeBatch(db)
    snap.docs.forEach((d) => batch.delete(d.ref))
    items.forEach((item) => batch.set(doc(db, name, item.id), item))
    await batch.commit()
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
        <AcuitasLogo size={36} dark showWordmark />

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
              <StatusBoard locations={locations} entries={entries} thresholds={thresholds} caps={caps} onUpdateCap={updateCap} />
            )}
            {tab === 'entry' && (
              <ShiftEntryForm
                locations={locations}
                thresholds={thresholds}
                onAdd={(entry) => {
                  addEntry(entry)
                  setToast('Shift entry saved')
                }}
              />
            )}
            {tab === 'deployments' && (
              <Deployments
                locations={locations}
                deployments={deployments}
                onAdd={(dep) => {
                  addDeployment(dep)
                  setToast('Deployment logged')
                }}
                onRemove={(id) => {
                  removeDeployment(id)
                  setToast('Deployment removed')
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
                  removeEntry(id)
                  setToast('Entry removed')
                }}
              />
            )}
            {tab === 'calculator' && (
              <AcuityCalculator
                locations={locations}
                onPushToED={(locId, shift, points) => {
                  pushAcuityToED(locId, shift, points)
                  setToast('Pushed to ED acuity')
                }}
              />
            )}
            {tab === 'help' && <HelpGuide />}
            {tab === 'settings' && !settingsUnlocked && (
              <SettingsLock
                onUnlock={() => {
                  sessionStorage.setItem('bhai:settingsUnlocked', 'true')
                  setSettingsUnlocked(true)
                }}
              />
            )}
            {tab === 'settings' && settingsUnlocked && (
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
                onImport={async (data) => {
                  if (data.locations) setLocations(data.locations)
                  if (data.thresholds) setThresholds(normalizeThresholds(data.thresholds))
                  if (data.entries) await replaceCollection('entries', data.entries)
                  if (data.deployments) await replaceCollection('deployments', data.deployments)
                  setToast('Data imported')
                }}
                onClear={async () => {
                  const freshLocations = seedLocations()
                  setLocations(freshLocations)
                  setThresholds(DEFAULT_THRESHOLDS)
                  await replaceCollection('entries', [])
                  await replaceCollection('deployments', [])
                  setToast('All data cleared')
                }}
                getExportData={() => ({ locations, entries, deployments, thresholds })}
              />
            )}
          </div>
          </ErrorBoundary>

          <div
            style={{
              marginTop: 40,
              paddingTop: 16,
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <AcuitasLogo size={22} dark={false} showWordmark />
            <div style={{ fontSize: 10.5, color: theme.sub }}>
              Patent Pending &mdash; &copy; Matthew C. Gee
            </div>
          </div>
        </main>
      </div>

      {showIntro && <IntroVideo onClose={closeIntro} />}
      <Toast message={toast} />
    </div>
  )
}
