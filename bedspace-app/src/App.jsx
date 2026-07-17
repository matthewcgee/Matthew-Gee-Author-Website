import React, { useEffect, useRef, useState } from 'react'
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { theme, Icon, Toast, Modal, Field, Button } from './components/ui.jsx'
import BedSpaceLogo from './components/BedSpaceLogo.jsx'
import { KEYS, readStorage, writeStorage } from './lib/storage.js'
import {
  seedBeds, seedResidents, seedDisallowedList, seedScreeningLog,
  BED_STATUS, holdExpiresAt,
  makeResident, makeDisallowedEntry, makeScreeningLogEntry,
} from './lib/model.js'
import { db, FIREBASE_CONFIGURED } from './lib/firebase.js'
import BedBoard from './components/BedBoard.jsx'
import ScreeningTool from './components/ScreeningTool.jsx'
import Dashboard from './components/Dashboard.jsx'
import BethesdaAdmin from './components/BethesdaAdmin.jsx'
import HelpGuide from './components/HelpGuide.jsx'
import AdmitModal from './components/AdmitModal.jsx'
import ResidentDetailModal from './components/ResidentDetailModal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import PasswordGate from './components/PasswordGate.jsx'
import BethesdaLock from './components/BethesdaLock.jsx'
import RoleSelectGate from './components/RoleSelectGate.jsx'

// All auth state lives in sessionStorage (never localStorage) and is wiped
// whenever the tab is left, closed, or restored from the back/forward cache
// (see the pagehide/pageshow effect below) — the app should never stay
// signed in once someone walks away from a shared hospital workstation.
const ENTRY_ROLE_KEY = 'bedspace:entryRole'
const AUTH_KEY = 'bedspace:auth:v1'
const STAFF_NAME_KEY = 'bedspace:staffName'
const BETHESDA_UNLOCKED_KEY = 'bedspace:bethesdaUnlocked'

function clearSessionAuth() {
  sessionStorage.removeItem(ENTRY_ROLE_KEY)
  sessionStorage.removeItem(AUTH_KEY)
  sessionStorage.removeItem(STAFF_NAME_KEY)
  sessionStorage.removeItem(BETHESDA_UNLOCKED_KEY)
}

const HOSPITAL_TABS = [
  { id: 'board', label: 'Bed Board', icon: 'bed' },
  { id: 'screening', label: 'Screening', icon: 'search' },
  { id: 'dashboard', label: 'Dashboard', icon: 'barChart' },
  { id: 'help', label: 'Help & Training', icon: 'help' },
]

export default function App() {
  const [entryRole, setEntryRole] = useState(() => sessionStorage.getItem(ENTRY_ROLE_KEY) || null)
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true')
  const [staffName, setStaffName] = useState(() => sessionStorage.getItem(STAFF_NAME_KEY) || '')
  const [bethesdaUnlocked, setBethesdaUnlocked] = useState(() => sessionStorage.getItem(BETHESDA_UNLOCKED_KEY) === 'true')
  const [showBethesdaLock, setShowBethesdaLock] = useState(false)

  // Sign out automatically when the tab is closed or navigated away from, and
  // force a fresh reload (re-running the auth check above) if the browser
  // instead restores the page from its back/forward cache — otherwise a
  // bfcache restore could show a still-authenticated in-memory app even
  // though sessionStorage has been cleared.
  useEffect(() => {
    function handlePageHide() {
      clearSessionAuth()
    }
    function handlePageShow(e) {
      if (e.persisted) window.location.reload()
    }
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  function logout() {
    clearSessionAuth()
    setEntryRole(null)
    setAuthed(false)
    setStaffName('')
    setBethesdaUnlocked(false)
  }

  const [beds, setBeds] = useState(() => readStorage(KEYS.beds, null))
  const [residents, setResidents] = useState(() => readStorage(KEYS.residents, null))
  const [disallowedList, setDisallowedList] = useState(() => readStorage(KEYS.disallowedList, null))
  const [screeningLog, setScreeningLog] = useState(() => readStorage(KEYS.screeningLog, null))

  const [tab, setTab] = useState('board')
  const [toast, setToast] = useState('')
  const [now, setNow] = useState(Date.now())
  const [admitTarget, setAdmitTarget] = useState(null)
  const [residentDetailTarget, setResidentDetailTarget] = useState(null)

  const remoteLoaded = useRef(false)

  // ---- Seed / load local state (used directly when Firebase isn't configured) ----
  useEffect(() => {
    if (FIREBASE_CONFIGURED) return
    const seeded = readStorage(KEYS.seed, false)
    if (seeded) {
      if (beds == null) setBeds(readStorage(KEYS.beds, seedBeds()))
      if (residents == null) setResidents(readStorage(KEYS.residents, seedResidents()))
      if (disallowedList == null) setDisallowedList(readStorage(KEYS.disallowedList, seedDisallowedList()))
      if (screeningLog == null) setScreeningLog(readStorage(KEYS.screeningLog, seedScreeningLog()))
      return
    }
    setBeds(seedBeds())
    setResidents(seedResidents())
    setDisallowedList(seedDisallowedList())
    setScreeningLog(seedScreeningLog())
    writeStorage(KEYS.seed, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (beds != null) writeStorage(KEYS.beds, beds) }, [beds])
  useEffect(() => { if (residents != null) writeStorage(KEYS.residents, residents) }, [residents])
  useEffect(() => { if (disallowedList != null) writeStorage(KEYS.disallowedList, disallowedList) }, [disallowedList])
  useEffect(() => { if (screeningLog != null) writeStorage(KEYS.screeningLog, screeningLog) }, [screeningLog])

  // ---- Firestore live sync (only runs once a real project is configured) ----
  useEffect(() => {
    if (!FIREBASE_CONFIGURED || !db) return
    const unsubBeds = onSnapshot(collection(db, 'beds'), (snap) => {
      if (snap.empty && !remoteLoaded.current) {
        const batch = writeBatch(db)
        seedBeds().forEach((b) => batch.set(doc(db, 'beds', b.id), b))
        batch.commit().catch((e) => console.error('seed beds', e))
      } else {
        setBeds(snap.docs.map((d) => d.data()))
      }
      remoteLoaded.current = true
    }, (e) => console.error('beds sync', e))

    const unsubResidents = onSnapshot(collection(db, 'residents'), (snap) => {
      setResidents(snap.docs.map((d) => d.data()))
    }, (e) => console.error('residents sync', e))

    const unsubDisallowed = onSnapshot(collection(db, 'disallowedList'), (snap) => {
      setDisallowedList(snap.docs.map((d) => d.data()))
    }, (e) => console.error('disallowedList sync', e))

    const unsubLog = onSnapshot(collection(db, 'screeningLog'), (snap) => {
      setScreeningLog(snap.docs.map((d) => d.data()))
    }, (e) => console.error('screeningLog sync', e))

    return () => { unsubBeds(); unsubResidents(); unsubDisallowed(); unsubLog() }
  }, [])

  // ---- Tick clock for hold countdowns + sweep expired holds back to available ----
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      setBeds((prev) => {
        if (!prev) return prev
        let changed = false
        const next = prev.map((b) => {
          if (b.status === BED_STATUS.HELD && b.hold && n >= b.hold.expiresAt) {
            changed = true
            const cleared = { ...b, status: BED_STATUS.AVAILABLE, hold: null }
            persistPatch('beds', b.id, { status: BED_STATUS.AVAILABLE, hold: null })
            return cleared
          }
          return b
        })
        return changed ? next : prev
      })
    }, 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2400)
    return () => clearTimeout(t)
  }, [toast])

  function persistDoc(collectionName, id, data) {
    if (FIREBASE_CONFIGURED && db) setDoc(doc(db, collectionName, id), data).catch((e) => console.error(collectionName, e))
  }
  function persistPatch(collectionName, id, patch) {
    if (FIREBASE_CONFIGURED && db) updateDoc(doc(db, collectionName, id), patch).catch((e) => console.error(collectionName, e))
  }
  function persistDelete(collectionName, id) {
    if (FIREBASE_CONFIGURED && db) deleteDoc(doc(db, collectionName, id)).catch((e) => console.error(collectionName, e))
  }

  // ---- Bed actions ----
  function holdBed(bedId) {
    const hold = { heldBy: staffName || 'Hospital Staff', heldAt: Date.now(), expiresAt: holdExpiresAt(), extendedBy: null }
    setBeds((prev) => prev.map((b) => (b.id === bedId ? { ...b, status: BED_STATUS.HELD, hold } : b)))
    persistPatch('beds', bedId, { status: BED_STATUS.HELD, hold })
    setToast(`Bed ${bedId} held for 2 hours`)
  }

  function releaseHold(bedId) {
    setBeds((prev) => prev.map((b) => (b.id === bedId ? { ...b, status: BED_STATUS.AVAILABLE, hold: null } : b)))
    persistPatch('beds', bedId, { status: BED_STATUS.AVAILABLE, hold: null })
    setToast(`Hold released on bed ${bedId}`)
  }

  function extendHold(bedId, note, grantedBy) {
    setBeds((prev) => prev.map((b) => {
      if (b.id !== bedId || !b.hold) return b
      const hold = { ...b.hold, expiresAt: b.hold.expiresAt + 2 * 60 * 60 * 1000, extendedBy: grantedBy || 'Bethesda Center', extendedAt: Date.now(), note: note || null }
      persistPatch('beds', bedId, { hold })
      return { ...b, hold }
    }))
    setToast(`Hold on bed ${bedId} extended`)
  }

  function toggleOutOfService(bedId, out) {
    const status = out ? BED_STATUS.OUT_OF_SERVICE : BED_STATUS.AVAILABLE
    setBeds((prev) => prev.map((b) => (b.id === bedId ? { ...b, status, hold: null } : b)))
    persistPatch('beds', bedId, { status, hold: null })
    setToast(out ? `Bed ${bedId} marked out of service` : `Bed ${bedId} returned to service`)
  }

  // ---- Screening log ----
  function logScreening({ queriedName, result, matchedEntryId, screenedBy }) {
    const entry = makeScreeningLogEntry({ queriedName, result, matchedEntryId, screenedBy })
    setScreeningLog((prev) => [...(prev || []), entry])
    persistDoc('screeningLog', entry.id, entry)
  }

  function resolveScreening(logId, resolvedAs) {
    setScreeningLog((prev) => prev.map((l) => (l.id === logId ? { ...l, resolvedAs, resolvedBy: staffName || 'Bethesda Center' } : l)))
    persistPatch('screeningLog', logId, { resolvedAs, resolvedBy: staffName || 'Bethesda Center' })
  }

  // ---- Disallowed list ----
  function addDisallowed(name, reason, addedBy) {
    const entry = makeDisallowedEntry({ name, reason, addedBy: addedBy || staffName || 'Bethesda Center' })
    setDisallowedList((prev) => [...(prev || []), entry])
    persistDoc('disallowedList', entry.id, entry)
    setToast(`${name} added to the disallowed list`)
  }

  function removeDisallowed(id) {
    setDisallowedList((prev) => prev.filter((e) => e.id !== id))
    persistDelete('disallowedList', id)
    setToast('Entry removed from the disallowed list')
  }

  // ---- Residents / admission ----
  function admitResident({ bed, name, mobility, commitments }) {
    const gender = bed.dorm
    const resident = makeResident({ name, gender, bedId: bed.id, mobility, commitments })
    setResidents((prev) => [...(prev || []), resident])
    persistDoc('residents', resident.id, resident)
    setBeds((prev) => prev.map((b) => (b.id === bed.id ? { ...b, status: BED_STATUS.OCCUPIED, residentId: resident.id, hold: null } : b)))
    persistPatch('beds', bed.id, { status: BED_STATUS.OCCUPIED, residentId: resident.id, hold: null })
    setToast(`${name} admitted to bed ${bed.id}`)
  }

  function dischargeResident(residentId) {
    setResidents((prev) => prev.map((r) => (r.id === residentId ? { ...r, dischargedAt: Date.now() } : r)))
    persistPatch('residents', residentId, { dischargedAt: Date.now() })
    const resident = residents.find((r) => r.id === residentId)
    if (resident) {
      setBeds((prev) => prev.map((b) => (b.id === resident.bedId ? { ...b, status: BED_STATUS.AVAILABLE, residentId: null } : b)))
      persistPatch('beds', resident.bedId, { status: BED_STATUS.AVAILABLE, residentId: null })
    }
    setToast('Resident discharged')
  }

  function grantExtension(residentId, days, note, grantedBy) {
    setResidents((prev) => prev.map((r) => (r.id === residentId ? {
      ...r,
      extensionDays: (r.extensionDays || 0) + Number(days || 0),
      extensionGrantedBy: grantedBy || 'Bethesda Center',
      extensionGrantedAt: Date.now(),
      extensionNote: note || null,
    } : r)))
    persistPatch('residents', residentId, {
      extensionDays: ((residents.find((r) => r.id === residentId)?.extensionDays) || 0) + Number(days || 0),
      extensionGrantedBy: grantedBy || 'Bethesda Center',
      extensionGrantedAt: Date.now(),
      extensionNote: note || null,
    })
    setToast(`Residency extended by ${days} day${days === 1 ? '' : 's'}`)
  }

  function updateCompliance(residentId, patch) {
    setResidents((prev) => prev.map((r) => (r.id === residentId ? { ...r, compliance: { ...r.compliance, ...patch } } : r)))
    const resident = residents.find((r) => r.id === residentId)
    if (resident) persistPatch('residents', residentId, { compliance: { ...resident.compliance, ...patch } })
    setToast('Compliance record updated')
  }

  if (!entryRole) {
    return (
      <RoleSelectGate onSelect={(role) => {
        sessionStorage.setItem(ENTRY_ROLE_KEY, role)
        setEntryRole(role)
      }} />
    )
  }

  if (!authed) {
    const back = () => { sessionStorage.removeItem(ENTRY_ROLE_KEY); setEntryRole(null) }
    if (entryRole === 'bethesda') {
      return (
        <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <BethesdaLock onBack={back} onUnlock={() => {
            sessionStorage.setItem(AUTH_KEY, 'true')
            sessionStorage.setItem(BETHESDA_UNLOCKED_KEY, 'true')
            setAuthed(true)
            setBethesdaUnlocked(true)
          }} />
        </div>
      )
    }
    return (
      <PasswordGate onBack={back} onSuccess={() => {
        sessionStorage.setItem(AUTH_KEY, 'true')
        setAuthed(true)
      }} />
    )
  }

  if (!staffName) {
    return <StaffNameGate onSubmit={(n) => { sessionStorage.setItem(STAFF_NAME_KEY, n); setStaffName(n) }} />
  }

  if (beds == null || residents == null || disallowedList == null || screeningLog == null) {
    return <div style={{ padding: 24, color: theme.sub, fontSize: 13 }}>Loading&hellip;</div>
  }

  const tabs = bethesdaUnlocked ? [...HOSPITAL_TABS.slice(0, 3), { id: 'admin', label: 'Bethesda Admin', icon: 'shieldLock' }, HOSPITAL_TABS[3]] : HOSPITAL_TABS
  const residentByBed = {}
  residents.forEach((r) => { if (!r.dischargedAt) residentByBed[r.bedId] = r })

  return (
    <div className="app-shell" style={{ background: theme.bg, color: theme.text }}>
      <aside className="app-sidebar" style={{ background: theme.navy, color: '#ffffff', padding: '22px 18px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <BedSpaceLogo size={34} dark showWordmark />

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tabs.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="nav-item btn-press"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                  border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13.5, fontWeight: 600,
                  background: active ? theme.accent : 'transparent', color: active ? '#ffffff' : '#e6dcc9',
                }}
              >
                <Icon name={t.icon} size={17} />
                {t.label}
              </button>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          {!bethesdaUnlocked ? (
            <button
              onClick={() => setShowBethesdaLock(true)}
              className="btn-press"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', color: '#ffffff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              <Icon name="shieldLock" size={14} /> Bethesda Center Login
            </button>
          ) : (
            <button
              onClick={() => { sessionStorage.removeItem(BETHESDA_UNLOCKED_KEY); setBethesdaUnlocked(false); if (tab === 'admin') setTab('board') }}
              className="btn-press"
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', color: '#ffffff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
            >
              <Icon name="shieldLock" size={14} /> Lock Bethesda Access
            </button>
          )}
          <button
            onClick={logout}
            className="btn-press"
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', color: '#ffffff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}
          >
            <Icon name="logOut" size={14} /> Log Out
          </button>
          <div style={{ fontSize: 10.5, color: '#a99a80', marginTop: 10, textAlign: 'center' }}>
            Signed in as {staffName}
          </div>
          {!FIREBASE_CONFIGURED && (
            <div style={{ fontSize: 10, color: '#d4a15a', marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}>
              Local-only mode — connect Firebase for multi-device sync (see HANDOFF.md)
            </div>
          )}
        </div>
      </aside>

      <div className="app-main">
        <main style={{ padding: '24px 28px', maxWidth: 1240, margin: '0 auto' }}>
          <ErrorBoundary key={tab}>
            <div className="fade-in">
              {tab === 'board' && (
                <BedBoard
                  beds={beds}
                  residents={residents}
                  now={now}
                  bethesdaUnlocked={bethesdaUnlocked}
                  staffName={staffName}
                  onHold={holdBed}
                  onReleaseHold={releaseHold}
                  onExtendHold={extendHold}
                  onToggleOutOfService={toggleOutOfService}
                  onOpenAdmit={setAdmitTarget}
                  onOpenResidentDetail={setResidentDetailTarget}
                />
              )}
              {tab === 'screening' && (
                <ScreeningTool disallowedList={disallowedList} staffName={staffName} onLogScreening={logScreening} />
              )}
              {tab === 'dashboard' && <Dashboard beds={beds} residents={residents} now={now} />}
              {tab === 'admin' && bethesdaUnlocked && (
                <BethesdaAdmin
                  disallowedList={disallowedList}
                  screeningLog={screeningLog}
                  staffName={staffName}
                  onAddDisallowed={addDisallowed}
                  onRemoveDisallowed={removeDisallowed}
                  onResolveScreening={resolveScreening}
                />
              )}
              {tab === 'help' && <HelpGuide />}
            </div>
          </ErrorBoundary>

          <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <BedSpaceLogo size={20} showTagline={false} />
            <div style={{ fontSize: 10.5, color: theme.sub }}>BedSpace &mdash; A Service of the Bethesda Center</div>
          </div>
        </main>
      </div>

      {showBethesdaLock && !bethesdaUnlocked && (
        <Modal title="Bethesda Center Login" onClose={() => setShowBethesdaLock(false)} width={460}>
          <BethesdaLock onUnlock={() => {
            sessionStorage.setItem(BETHESDA_UNLOCKED_KEY, 'true')
            setBethesdaUnlocked(true)
            setShowBethesdaLock(false)
            setTab('admin')
          }} />
        </Modal>
      )}

      {admitTarget && (
        <AdmitModal
          bed={admitTarget}
          disallowedList={disallowedList}
          bethesdaUnlocked={bethesdaUnlocked}
          staffName={staffName}
          onClose={() => setAdmitTarget(null)}
          onLogScreening={logScreening}
          onSubmit={(data) => { admitResident(data); setAdmitTarget(null) }}
        />
      )}

      {residentDetailTarget && (
        <ResidentDetailModal
          resident={residents.find((r) => r.id === residentDetailTarget.id) || residentDetailTarget}
          bed={beds.find((b) => b.id === residentDetailTarget.bedId)}
          bethesdaUnlocked={bethesdaUnlocked}
          staffName={staffName}
          now={now}
          onClose={() => setResidentDetailTarget(null)}
          onDischarge={dischargeResident}
          onGrantExtension={grantExtension}
          onUpdateCompliance={updateCompliance}
        />
      )}

      <Toast message={toast} />
    </div>
  )
}

function StaffNameGate({ onSubmit }) {
  const [value, setValue] = useState('')
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 380, width: '100%', background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 16, padding: 28, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <BedSpaceLogo size={40} />
        </div>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Welcome</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 16, lineHeight: 1.6 }}>
          Enter your name or initials. This is attached to bed holds and screenings for accountability —
          it is not a password.
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()) }}>
          <Field label="Your name or initials">
            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. J. Rivera, RN" />
          </Field>
          <div style={{ marginTop: 14 }}>
            <Button type="submit" disabled={!value.trim()}>Continue</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
