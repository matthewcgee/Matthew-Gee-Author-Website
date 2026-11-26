import React, { useEffect, useMemo, useRef, useState } from 'react'
import { theme, Icon, Toast } from './components/ui.jsx'
import AcuitasLogo from './components/AcuitasLogo.jsx'
import { KEYS, readStorage, writeStorage, today, uid } from './lib/storage.js'
import { normalizeThresholds, seedLocations, seedEntries, seedDeployments } from './lib/model.js'
import { buildSampleData } from './lib/demoData.js'
import {
  BACKEND, LOCAL_MODE, SAVE_FAILED_EVENT, deleteRecord, increment, listRecords, replaceCollection as replaceRemote,
  setRecord, updateRecord, watchCollection, watchDoc,
} from './lib/backend/index.js'
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
import CommandCenter from './components/CommandCenter.jsx'
import LevelOfCare from './components/LevelOfCare.jsx'
import AcuiStep from './components/AcuiStep.jsx'
import Outcomes from './components/Outcomes.jsx'
import CapacitySafety from './components/CapacitySafety.jsx'
import { AccessPanel, AuditLogPanel, FhirImport } from './components/Governance.jsx'
import CalibrationPanel from './components/CalibrationPanel.jsx'
import DowntimeKit from './components/DowntimeKit.jsx'
import CutoffEvidence from './components/CutoffEvidence.jsx'
import {
  activeCalibration, calibrationByVersion, calibrationState, calibratedThresholds, locationChanges,
  orgScopedLocation, proposeCalibration, resetCalibration, stampEntry, withLegacyStamps,
} from './lib/calibration.js'
import { IdentityPicker, SignInScreen } from './components/IdentityGate.jsx'
import PasswordGate, { EXPECTED_HASH } from './components/PasswordGate.jsx'
import { ROLES, can, canSeeTab } from './lib/roles.js'
import {
  AUTH_MODE, AUTH_PROVIDER_ID, SIGN_IN_URL, readLocalIdentity, writeLocalIdentity, loadGatewayIdentity, loadFirebaseAuth,
} from './lib/identity.js'
import { useCollection, useConfigValue, setAuditSink, audit } from './lib/store.js'
import { makeAuditEntry } from './lib/audit.js'
import { useOutpatientData, loadOutpatientSample, clearOutpatientData } from './lib/opData.js'
import { useIopData, loadIopSample, clearIopData } from './lib/iopData.js'

const TABS = [
  { id: 'status', label: 'Region Status Board', icon: 'grid' },
  { id: 'command', label: 'Command Center', icon: 'trendUp' },
  { id: 'outcomes', label: 'Outcomes & ROI', icon: 'loop' },
  { id: 'capacity', label: 'Capacity & Safety', icon: 'bed' },
  { id: 'levelofcare', label: 'AcuiPath™', icon: 'route' },
  { id: 'acuistep', label: 'AcuiStep™ IOP', icon: 'steps' },
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
const AUTH_KEY = 'bhai:auth:v1'

export default function App() {
  // The shared access password is the gate for local (evaluation) builds only;
  // single-sign-on builds rely on the organization's sign-in instead.
  const [authed, setAuthed] = useState(() => AUTH_MODE !== 'local' || readStorage(AUTH_KEY, '') === EXPECTED_HASH)
  const [identity, setIdentity] = useState(() => (AUTH_MODE === 'local' ? readLocalIdentity() : null))
  const [identityState, setIdentityState] = useState(AUTH_MODE === 'local' ? 'ready' : 'loading')
  const firebaseAuth = useRef(null)
  const [locations, setLocations] = useState(() => readStorage(KEYS.locations, null))
  const [entries, setEntries] = useState(() => readStorage(KEYS.entries, null))
  const [deployments, setDeployments] = useState(() => readStorage(KEYS.deployments, null))
  const [thresholds, setThresholds] = useState(() => normalizeThresholds(readStorage(KEYS.thresholds, null)))
  const [caps, setCaps] = useState(() => (LOCAL_MODE ? readStorage(KEYS.caps, {}) : {}))
  const [tab, setTab] = useState('status')
  const [iopFocus, setIopFocus] = useState(null)
  const [toast, setToast] = useState('')
  const [showIntro, setShowIntro] = useState(false)
  const [settingsUnlocked, setSettingsUnlocked] = useState(() => sessionStorage.getItem('bhai:settingsUnlocked') === 'true')

  const role = identity?.role || 'viewer'

  // New collections, synced like entries and deployments.
  const [auditEntries, auditApi] = useCollection('auditLog', { localKey: 'bhai:audit', audited: false })
  const [planLog, planLogApi] = useCollection('planLog', { localKey: 'bhai:planLog', auditAs: 'planLog' })
  const [safetyEvents, safetyApi] = useCollection('safetyEvents', { localKey: 'bhai:safetyEvents', auditAs: 'safetyEvents' })
  const [censusPrefill, setCensusPrefill] = useConfigValue('censusPrefill', { localKey: 'bhai:censusPrefill', initial: {} })

  // AcuiCalc™ calibration: one per health system, versioned. Writes go through
  // saveCalibration below, which records its own detailed audit entry.
  const [storedCalibration, setStoredCalibration] = useConfigValue('acuiCalibration', { localKey: 'acuitas:calibration', initial: null, audited: false })
  // Thresholds saved by builds older than calibration only seed v1 in this
  // browser (local mode) or the original Firestore pilot. A data-service
  // deployment always starts from the shipped defaults, so nothing outside the
  // governed calibration can move a cutoff.
  const calState = useMemo(() => calibrationState(storedCalibration, BACKEND === 'api' ? null : thresholds), [storedCalibration, thresholds])
  const calibration = useMemo(() => activeCalibration(calState), [calState])
  const baselineCalibration = useMemo(() => calibrationByVersion(calState, 1) || calibration, [calState, calibration])
  const scoringThresholds = useMemo(() => calibratedThresholds(calibration), [calibration])
  // Every unit and ED reads the system-wide calibration; no per-unit overrides.
  const orgLocations = useMemo(() => (locations ? locations.map(orgScopedLocation) : locations), [locations])
  // Scores saved before calibration existed are read as v1, never re-scored.
  const scoredEntries = useMemo(() => withLegacyStamps(entries, locations, baselineCalibration), [entries, locations, baselineCalibration])
  const op = useOutpatientData()
  const iop = useIopData()

  // Identity from the sign-in gateway or Firebase, when configured.
  useEffect(() => {
    if (AUTH_MODE === 'gateway') {
      loadGatewayIdentity()
        .then((id) => { setIdentity(id); setIdentityState(id ? 'ready' : 'signin') })
        .catch(() => setIdentityState('error'))
    }
    if (AUTH_MODE === 'firebase') {
      let unsub = null
      loadFirebaseAuth().then((m) => {
        if (!m) return
        firebaseAuth.current = m
        unsub = m.startFirebaseAuth((id) => { setIdentity(id); setIdentityState(id ? 'ready' : 'signin') })
      })
      return () => unsub && unsub()
    }
    return undefined
  }, [])

  // Audit sink: every change made anywhere in the app becomes a hash-chained
  // entry attributed to the signed-in person. Appends are serialized so each
  // entry links to the one written just before it.
  const auditRef = useRef({ entries: [], last: null, queue: Promise.resolve() })
  auditRef.current.entries = auditEntries
  const identityRef = useRef(identity)
  identityRef.current = identity
  useEffect(() => {
    setAuditSink((action, target, detail) => {
      const a = auditRef.current
      const at = Date.now()
      a.queue = a.queue.then(async () => {
        const fromStore = a.entries.reduce((m, e) => (!m || e.seq > m.seq ? e : m), null)
        let prev = a.last && (!fromStore || a.last.seq >= fromStore.seq) ? a.last : fromStore
        const who = identityRef.current
        for (let attempt = 0; ; attempt++) {
          const entry = await makeAuditEntry(prev, { actor: who?.name || 'unknown', role: who?.role || 'unknown', action, target, detail, at })
          if (BACKEND !== 'api') {
            a.last = entry
            await auditApi.add(entry)
            return
          }
          // The data service keeps one strict sequence: if someone else's entry
          // landed first, it returns the latest entry and this one is rebuilt
          // on top of it.
          try {
            await setRecord('auditLog', entry.id, entry)
            a.last = entry
            return
          } catch (e) {
            if (e.status === 409 && e.payload?.head && attempt < 10) { prev = e.payload.head; continue }
            throw e
          }
        }
      }).catch((e) => console.error('audit append', e))
    })
    return () => setAuditSink(null)
  }, [auditApi])

  const chooseIdentity = (id) => {
    const switching = !!identityRef.current
    writeLocalIdentity(id)
    identityRef.current = id
    setIdentity(id)
    audit(switching ? 'identity.switch' : 'identity.signin', id.name, { role: id.role })
  }

  // Sign-ins through the gateway or Firebase are recorded once per person.
  useEffect(() => {
    if (AUTH_MODE !== 'local' && identity) audit('identity.signin', identity.name, { role: identity.role, source: identity.source })
  }, [identity?.name]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // per-document collections, where concurrent edits can't clobber each other.
  // Only for databases created by the original Firestore pilot; a new shared
  // database (the data service) never had the old layout.
  function tryMigrateCollections() {
    if (BACKEND !== 'firebase') return
    if (migrationDone.current) return
    if (entriesSnapRef.current == null || deploymentsSnapRef.current == null || !legacyRef.current.loaded) return
    migrationDone.current = true

    // Skip migration permanently once the one-time data clear has been requested
    if (readStorage(DATA_CLEAR_KEY, false)) return

    if (entriesSnapRef.current.length === 0) {
      const source = (legacyRef.current.entries && legacyRef.current.entries.length)
        ? legacyRef.current.entries
        : seedEntries()
      source.forEach((e) => setRecord('entries', e.id, e).catch((err) => console.error('migrate entry', err)))
    }
    if (deploymentsSnapRef.current.length === 0 && legacyRef.current.deployments && legacyRef.current.deployments.length) {
      legacyRef.current.deployments.forEach((d) => setRecord('deployments', d.id, d).catch((err) => console.error('migrate deployment', err)))
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
  // Original Firestore pilot only: on a shared database run by the data
  // service, location names are the organization's to keep.
  useEffect(() => {
    if (BACKEND !== 'firebase') return
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

  // One-time clear of all pilot/seed entries and deployments from the original
  // Firestore pilot. It runs once per browser, so it must never run against a
  // database in real use: the data service backend skips it entirely.
  // Write the guard key SYNCHRONOUSLY first so tryMigrateCollections (which
  // runs concurrently) cannot race ahead and re-populate the empty collections.
  useEffect(() => {
    if (BACKEND !== 'firebase') return
    if (readStorage(DATA_CLEAR_KEY, false)) return
    writeStorage(DATA_CLEAR_KEY, true)
    Promise.all(['entries', 'deployments'].map((name) =>
      listRecords(name).then((items) => (items.length ? replaceRemote(name, []) : undefined))
    )).catch((e) => console.error('data clear failed', e))
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

  // Census caps live in their own collection remotely; with no remote they
  // need persisting here or they would reset on every reload.
  useEffect(() => {
    if (LOCAL_MODE) writeStorage(KEYS.caps, caps)
  }, [caps])

  // Live sync of locations & thresholds via a single shared document
  useEffect(() => {
    if (LOCAL_MODE) return
    const unsub = watchDoc(
      'appState',
      'main',
      (data) => {
        if (!data) {
          const { locations, thresholds } = stateRef.current
          if (locations != null && thresholds != null) {
            lastSynced.current.locations = locations
            lastSynced.current.thresholds = thresholds
            setRecord('appState', 'main', { locations, thresholds }).catch((e) => console.error('create shared state', e))
          }
          legacyRef.current.entries = null
          legacyRef.current.deployments = null
        } else {
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
        console.error('Shared state sync error', err)
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
    if (LOCAL_MODE) return
    const unsub = watchCollection(
      'entries',
      (items) => {
        const arr = items.map((it) => it.data)
        entriesSnapRef.current = arr
        setEntries(arr)
        tryMigrateCollections()
      },
      (err) => {
        console.error('Entries sync error', err)
        entriesSnapRef.current = []
        tryMigrateCollections()
      }
    )
    return unsub
  }, [])

  // Live sync of staff deployments, same per-document approach as entries
  useEffect(() => {
    if (LOCAL_MODE) return
    const unsub = watchCollection(
      'deployments',
      (items) => {
        const arr = items.map((it) => it.data)
        deploymentsSnapRef.current = arr
        setDeployments(arr)
        tryMigrateCollections()
      },
      (err) => {
        console.error('Deployments sync error', err)
        deploymentsSnapRef.current = []
        tryMigrateCollections()
      }
    )
    return unsub
  }, [])

  // Live sync of nursing-driven census caps — one document per location, so
  // charge nurses on different units can update their cap independently
  useEffect(() => {
    if (LOCAL_MODE) return
    const unsub = watchCollection(
      'locationCaps',
      (items) => {
        const next = {}
        items.forEach((it) => {
          next[it.id] = it.data.censusCap
        })
        setCaps(next)
      },
      (err) => console.error('Caps sync error', err)
    )
    return unsub
  }, [])

  useEffect(() => {
    if (LOCAL_MODE || locations == null || !remoteLoaded.current) return
    if (JSON.stringify(locations) === JSON.stringify(lastSynced.current.locations)) return
    lastSynced.current.locations = locations
    setRecord('appState', 'main', { locations }, { merge: true }).catch((e) => console.error('sync locations', e))
  }, [locations])

  useEffect(() => {
    if (LOCAL_MODE || thresholds == null || !remoteLoaded.current) return
    if (JSON.stringify(thresholds) === JSON.stringify(lastSynced.current.thresholds)) return
    lastSynced.current.thresholds = thresholds
    setRecord('appState', 'main', { thresholds }, { merge: true }).catch((e) => console.error('sync thresholds', e))
  }, [thresholds])

  // A save the shared database refused or could not receive is shown, so the
  // person can re-enter it rather than assume it was kept.
  useEffect(() => {
    if (LOCAL_MODE) return undefined
    const onFail = (e) => {
      const { status } = e.detail || {}
      setToast(status === 403
        ? 'Not saved: your role does not allow that change.'
        : status === 401
          ? 'Not saved: your sign-in has expired. Reload the page to sign in again.'
          : 'Not saved: the shared database could not be reached. Please try again.')
    }
    window.addEventListener(SAVE_FAILED_EVENT, onFail)
    return () => window.removeEventListener(SAVE_FAILED_EVENT, onFail)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const closeIntro = () => {
    writeStorage(INTRO_KEY, true)
    setShowIntro(false)
  }

  const updateCap = (locId, censusCap) => {
    audit('cap.update', locId, { censusCap })
    if (LOCAL_MODE) return setCaps((prev) => ({ ...prev, [locId]: censusCap }))
    setRecord('locationCaps', locId, { censusCap }).catch((e) => console.error('update cap', e))
  }

  // In local mode these update React state directly; the existing effects
  // persist that state to the browser, so the data survives a reload.
  const addEntry = (raw) => {
    const entry = stampEntry(raw, (locations || []).find((l) => l.id === raw.locId), calibration)
    audit('entry.add', entry.id, { locId: entry.locId, date: entry.date, shift: entry.shift, points: entry.points, staff: entry.staff, oneToOne: entry.oneToOne ?? null, census: entry.census, calibrationVersion: entry.calibrationVersion, instrumentVersion: entry.instrumentVersion, nurseRating: entry.nurseRating ?? null })
    if (LOCAL_MODE) return setEntries((prev) => [...(prev || []), entry])
    setRecord('entries', entry.id, entry).catch((e) => console.error('add entry', e))
  }
  const removeEntry = (id) => {
    audit('entry.remove', id)
    if (LOCAL_MODE) return setEntries((prev) => (prev || []).filter((e) => e.id !== id))
    deleteRecord('entries', id).catch((e) => console.error('remove entry', e))
  }
  const addDeployment = (dep) => {
    audit('deployment.add', dep.id, { toLocId: dep.toLocId, fromLocId: dep.fromLocId, date: dep.date, shift: dep.shift, hours: dep.hours, source: dep.source })
    if (LOCAL_MODE) return setDeployments((prev) => [...(prev || []), dep])
    setRecord('deployments', dep.id, dep).catch((e) => console.error('add deployment', e))
  }
  const removeDeployment = (id) => {
    audit('deployment.remove', id)
    if (LOCAL_MODE) return setDeployments((prev) => (prev || []).filter((d) => d.id !== id))
    deleteRecord('deployments', id).catch((e) => console.error('remove deployment', e))
  }

  // Saving a calibration change or reset. Validation and the Administrator
  // check run in calibration.js against the signed-in role.
  function saveCalibration(result) {
    if (!result.ok) return result
    setStoredCalibration(result.state)
    audit(result.audit.action, result.audit.target, result.audit.detail)
    setToast(`${result.audit.action === 'calibration.reset' ? 'Shipped defaults restored' : 'Calibration saved'} as v${result.version.version}`)
    return result
  }
  const changeMeta = ({ reason, reviewers }) => ({ actor: identity?.name || 'unknown', role, reason, reviewers })

  // Points pushed from AcuiCalc™ add to today's ED entry for that shift. A new
  // entry is stamped with the active calibration; an existing entry keeps the
  // stamp it was created under.
  async function pushAcuityToED(locId, shift, points) {
    const todayStr = today()
    const list = entries.filter((e) => e.locId === locId && e.date === todayStr && e.shift === shift)
    const existing = list[list.length - 1]
    const loc = (locations || []).find((l) => l.id === locId)
    audit('acuicalc.push', locId, { date: todayStr, shift, points, calibrationVersion: calibration.version, addedTo: existing ? existing.id : null })
    if (LOCAL_MODE) {
      if (existing) {
        return setEntries((prev) =>
          (prev || []).map((e) => (e.id === existing.id ? { ...e, points: (e.points || 0) + points } : e))
        )
      }
      return setEntries((prev) => [
        ...(prev || []),
        stampEntry({
          id: uid(), locId, date: todayStr, shift, census: null, points, staff: null,
          notes: 'Added via AcuiCalc™', pilot: false, createdAt: Date.now(),
        }, loc, calibration),
      ])
    }
    if (existing) {
      await updateRecord('entries', existing.id, { points: increment(points) }).catch((e) => console.error('push acuity', e))
    } else {
      const entry = stampEntry({
        id: uid(),
        locId,
        date: todayStr,
        shift,
        census: null,
        points,
        staff: null,
        notes: 'Added via AcuiCalc™',
        pilot: false,
        createdAt: Date.now(),
      }, loc, calibration)
      await setRecord('entries', entry.id, entry).catch((e) => console.error('push acuity', e))
    }
  }

  // Restore a map of per-location census caps from a backup or the sample set.
  // Local mode holds them in state (persisted to the browser); a real backend
  // keeps one document per location, so write each.
  function restoreCaps(capMap) {
    if (!capMap || typeof capMap !== 'object') return
    if (LOCAL_MODE) {
      setCaps(capMap)
      return
    }
    Object.entries(capMap).forEach(([locId, censusCap]) =>
      setRecord('locationCaps', locId, { censusCap }).catch((e) => console.error('restore cap', e))
    )
  }

  // Apply a FHIR census import: update the census on entries already logged
  // for that shift, and queue a pre-fill for units that have no entry yet.
  function applyFhirCensus(plan, { date, shift }) {
    audit('fhir.import', `${date} ${shift}`, { updated: plan.updates.length, prefilled: Object.keys(plan.prefills).length })
    if (plan.updates.length) {
      if (LOCAL_MODE) {
        const byId = new Map(plan.updates.map((u) => [u.entryId, u.census]))
        setEntries((prev) => (prev || []).map((e) => (byId.has(e.id) ? { ...e, census: byId.get(e.id) } : e)))
      } else {
        plan.updates.forEach((u) => updateRecord('entries', u.entryId, { census: u.census }).catch((e) => console.error('fhir census', e)))
      }
    }
    if (Object.keys(plan.prefills).length) setCensusPrefill({ ...(censusPrefill || {}), ...plan.prefills })
    setToast('FHIR census applied')
  }

  async function replaceCollection(name, items) {
    if (LOCAL_MODE) {
      if (name === 'entries') setEntries(items)
      if (name === 'deployments') setDeployments(items)
      return
    }
    await replaceRemote(name, items.map((item) => ({ id: item.id, data: item })))
  }

  if (!authed) {
    return (
      <PasswordGate onSuccess={(hash) => {
        writeStorage(AUTH_KEY, hash)
        setAuthed(true)
      }} />
    )
  }

  if (AUTH_MODE !== 'local' && identityState !== 'ready') {
    return (
      <SignInScreen
        state={identityState}
        mode={AUTH_MODE}
        signInUrl={SIGN_IN_URL}
        onSignIn={() => firebaseAuth.current?.firebaseSignIn(AUTH_PROVIDER_ID)}
      />
    )
  }

  if (AUTH_MODE === 'local' && !identity) {
    return <IdentityPicker onDone={chooseIdentity} />
  }

  const canSettingsTab = can(role, 'settings') || can(role, 'audit-view') || can(role, 'import')
  const visibleTabs = TABS.filter((t) => (t.id === 'settings' ? canSettingsTab : canSeeTab(role, t.id)))
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id

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
          {visibleTabs.map((t) => {
            const active = activeTab === t.id
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }}>
            <Icon name="user" size={16} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{identity?.name}</div>
              <div style={{ fontSize: 10.5, color: '#9fc4bd' }}>{ROLES[role]?.label}{AUTH_MODE === 'local' ? ' · local sign-in' : ''}</div>
            </div>
            {AUTH_MODE === 'local' && (
              <button type="button" onClick={() => setIdentity(null)} className="btn-press"
                style={{ fontSize: 11, fontWeight: 700, color: '#cfe3df', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer' }}>
                Switch
              </button>
            )}
          </div>
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
          <ErrorBoundary key={activeTab}>
          <div className="fade-in">
            {activeTab === 'status' && (
              <StatusBoard locations={orgLocations} entries={scoredEntries} thresholds={scoringThresholds} caps={caps} onUpdateCap={updateCap} calibration={calibration} />
            )}
            {activeTab === 'command' && (
              <CommandCenter locations={orgLocations} entries={scoredEntries} thresholds={scoringThresholds} caps={caps} role={role} identity={identity} />
            )}
            {activeTab === 'outcomes' && (
              <>
                <Outcomes locations={orgLocations} entries={scoredEntries} deployments={deployments} thresholds={scoringThresholds} role={role} />
                <CutoffEvidence entries={scoredEntries} locations={orgLocations} thresholds={scoringThresholds} calibration={calibration} />
              </>
            )}
            {activeTab === 'capacity' && (
              <CapacitySafety locations={orgLocations} entries={scoredEntries} thresholds={scoringThresholds} caps={caps} role={role} />
            )}
            {activeTab === 'levelofcare' && <LevelOfCare role={role} locations={locations} identity={identity} onOpenAcuiStep={(id) => { setIopFocus(id); setTab('acuistep') }} />}
            {activeTab === 'acuistep' && <AcuiStep key={iopFocus || 'acuistep'} role={role} identity={identity} focusId={iopFocus} />}
            {activeTab === 'entry' && (
              <ShiftEntryForm
                locations={orgLocations}
                thresholds={scoringThresholds}
                censusPrefill={censusPrefill || {}}
                onConsumePrefill={(locId) => {
                  const next = { ...(censusPrefill || {}) }
                  delete next[locId]
                  setCensusPrefill(next)
                }}
                onAdd={(entry) => {
                  addEntry(entry)
                  setToast('Shift entry saved')
                }}
              />
            )}
            {activeTab === 'deployments' && (
              <Deployments
                locations={locations}
                deployments={deployments}
                onAdd={(dep) => {
                  addDeployment(dep)
                  setToast('Deployment logged')
                }}
                onRemove={can(role, 'remove-records') ? (id) => {
                  removeDeployment(id)
                  setToast('Deployment removed')
                } : null}
              />
            )}
            {activeTab === 'reports' && (
              <Reports
                locations={orgLocations}
                entries={scoredEntries}
                deployments={deployments}
                thresholds={scoringThresholds}
                onDeleteEntry={can(role, 'remove-records') ? (id) => {
                  removeEntry(id)
                  setToast('Entry removed')
                } : null}
              />
            )}
            {activeTab === 'calculator' && (
              <AcuityCalculator
                locations={orgLocations}
                calibration={calibration}
                onPushToED={(locId, shift, points) => {
                  pushAcuityToED(locId, shift, points)
                  setToast('Pushed to ED acuity')
                }}
              />
            )}
            {activeTab === 'help' && <HelpGuide locations={locations || []} calibration={calibration} />}
            {activeTab === 'settings' && AUTH_MODE === 'local' && !settingsUnlocked && (
              <SettingsLock
                onUnlock={() => {
                  sessionStorage.setItem('bhai:settingsUnlocked', 'true')
                  setSettingsUnlocked(true)
                }}
              />
            )}
            {activeTab === 'settings' && (AUTH_MODE !== 'local' || settingsUnlocked) && (
              <div style={{ display: 'grid', gap: 16 }}>
              {can(role, 'settings') && (
              <Settings
                locations={locations}
                onChangeLocations={(next) => {
                  audit('locations.update', null, locationChanges(locations || [], next))
                  setLocations(next)
                  setToast('Locations updated')
                }}
                onImport={async (data) => {
                  audit('data.import', null, { entries: data.entries?.length ?? 0, deployments: data.deployments?.length ?? 0 })
                  if (data.locations) setLocations(data.locations)
                  // Thresholds in a backup are not applied: scoring follows the
                  // governed AcuiCalc™ calibration, which only an Administrator
                  // changes, with a reason, in the calibration panel.
                  if (data.entries) await replaceCollection('entries', data.entries)
                  if (data.deployments) await replaceCollection('deployments', data.deployments)
                  if (data.caps) restoreCaps(data.caps)
                  if (data.planLog) await planLogApi.replace(data.planLog)
                  if (data.safetyEvents) await safetyApi.replace(data.safetyEvents)
                  if (data.outpatient) {
                    const o = data.outpatient
                    if (o.patients) await op.patientsApi.replace(o.patients)
                    if (o.providers) await op.providersApi.replace(o.providers)
                    if (o.discharges) await op.dischargesApi.replace(o.discharges)
                    if (o.assessments) await op.assessmentsApi.replace(o.assessments)
                    if (o.outcomes) await op.outcomesApi.replace(o.outcomes)
                    if (o.programs) op.setPrograms(o.programs)
                  }
                  setToast('Data imported')
                }}
                onClear={async () => {
                  audit('data.clear', null, null)
                  const freshLocations = seedLocations()
                  setLocations(freshLocations)
                  setCaps({})
                  await replaceCollection('entries', [])
                  await replaceCollection('deployments', [])
                  await planLogApi.replace([])
                  await safetyApi.replace([])
                  await clearOutpatientData(op)
                  await clearIopData(iop)
                  setToast('All data cleared')
                }}
                localMode={LOCAL_MODE}
                onLoadSample={async () => {
                  audit('data.sample', 'region', null)
                  const sample = buildSampleData()
                  setLocations(sample.locations)
                  setCaps(sample.caps)
                  await replaceCollection('entries', sample.entries)
                  await replaceCollection('deployments', sample.deployments)
                  await planLogApi.replace(sample.planLog)
                  await safetyApi.replace(sample.safetyEvents)
                  await loadOutpatientSample(op)
                  await loadIopSample(iop)
                  setToast('Sample data loaded')
                }}
                getExportData={() => ({
                  locations, entries, deployments, thresholds, caps, planLog, safetyEvents,
                  calibration: calState,
                  outpatient: {
                    patients: op.patients, providers: op.providers, discharges: op.discharges,
                    assessments: op.assessments, outcomes: op.outcomes, programs: op.programs,
                  },
                  iop: { intakes: iop.intakes, tracks: iop.tracks },
                })}
              />
              )}
              {can(role, 'calibrate') && (
                <CalibrationPanel
                  state={calState}
                  onPropose={(draft, meta) => saveCalibration(proposeCalibration(calState, draft, changeMeta(meta)))}
                  onReset={(meta) => saveCalibration(resetCalibration(calState, changeMeta(meta)))}
                />
              )}
              {can(role, 'calibrate') && <CutoffEvidence entries={scoredEntries} locations={orgLocations} thresholds={scoringThresholds} calibration={calibration} />}
              {can(role, 'settings') && <DowntimeKit locations={locations || []} calibration={calibration} />}
              {can(role, 'import') && <FhirImport locations={locations} entries={entries} onApply={applyFhirCensus} />}
              <AccessPanel identity={identity} authMode={AUTH_MODE} onSwitch={AUTH_MODE === 'local' ? chooseIdentity : null} />
              {can(role, 'audit-view') && <AuditLogPanel entries={auditEntries} />}
              </div>
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
