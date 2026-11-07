import React, { useEffect, useMemo, useState } from 'react'
import { compute, DEFAULT_SETTINGS, DEFAULT_FUNDS, DEFAULT_CONTROLS, PERIODS, money } from './lib/engine.js'
import { exportScenario, importScenario } from './lib/io.js'
import { demoState } from './lib/demo.js'
import { Ico, FileButton, useToast } from './components/ui.jsx'
import FundsPage from './components/FundsPage.jsx'
import FacultyPage from './components/FacultyPage.jsx'
import PaymentsPage from './components/PaymentsPage.jsx'
import ResultsPage from './components/ResultsPage.jsx'
import BenchmarksPage from './components/BenchmarksPage.jsx'
import GuidePage from './components/GuidePage.jsx'

const KEY = 'psychComp.v1'
const BENCH_KEY = 'psychComp.bench.v1'
const fresh = () => ({ period: 'Stub', settings: { ...DEFAULT_SETTINGS }, funds: { ...DEFAULT_FUNDS }, controls: { ...DEFAULT_CONTROLS }, faculty: [], payments: [] })

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (s) return { ...fresh(), ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings, weights: { ...DEFAULT_SETTINGS.weights, ...(s.settings?.weights || {}) } }, funds: { ...DEFAULT_FUNDS, ...s.funds }, controls: { ...DEFAULT_CONTROLS, ...s.controls } }
  } catch {}
  return fresh()
}
function loadBench() {
  try {
    return JSON.parse(localStorage.getItem(BENCH_KEY) || 'null')
  } catch {
    return null
  }
}

const TABS = [
  { key: 'funds', label: 'Funds & Setup', icon: 'funds', step: 1 },
  { key: 'faculty', label: 'Faculty', icon: 'people', step: 2 },
  { key: 'payments', label: 'Prior Payments', icon: 'ledger', step: 3 },
  { key: 'results', label: 'Results & Payroll', icon: 'results', step: 4 },
  { key: 'bench', label: 'Benchmarks', icon: 'bench' },
  { key: 'guide', label: 'How It Works', icon: 'guide' },
]

export default function App() {
  const [state, setState] = useState(load)
  const [bench, setBench] = useState(loadBench)
  const [tab, setTab] = useState(() => (load().faculty.length ? 'results' : 'funds'))
  const [toast, notify] = useToast()

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {}
  }, [state])
  useEffect(() => {
    try {
      if (bench) localStorage.setItem(BENCH_KEY, JSON.stringify(bench))
      else localStorage.removeItem(BENCH_KEY)
    } catch {}
  }, [bench])

  const result = useMemo(() => compute({ ...state, bench }), [state, bench])

  const set = (patch) => setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  const setIn = (section) => (k, v) => setState((s) => ({ ...s, [section]: { ...s[section], [k]: v } }))
  const api = {
    state,
    bench,
    setBench,
    result,
    set,
    setFunds: setIn('funds'),
    setSettings: setIn('settings'),
    setControls: setIn('controls'),
    notify,
    go: setTab,
  }

  const done = {
    funds: result.pool > 0,
    faculty: state.faculty.length > 0,
    payments: state.payments.length > 0 || state.period === 'Q1',
    results: result.totals.release > 0,
  }
  const holds = result.people.filter((p) => p.hold).length

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <Ico name="results" size={24} stroke={2.4} />
            </div>
            <div className="brand-divider" />
            <div className="brand-text">
              <div className="brand-title">Psychiatry Compensation Calculator</div>
              <div className="brand-sub">Department of Psychiatry · January–June 2027 stub plan</div>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="segmented" role="tablist" aria-label="Distribution">
              {Object.entries(PERIODS).map(([k, p]) => (
                <button key={k} className={state.period === k ? 'on' : ''} onClick={() => set({ period: k })}>
                  {k === 'Stub' ? 'Six-month stub' : k === 'Q1' ? 'Q1' : 'Quality'}
                  <small>{k === 'Q1' ? 'Jan–Mar' : k === 'Stub' ? 'Jan–Jun' : 'Feb 2028'}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <nav className="nav">
        <div className="nav-inner">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.step ? <span className={`step-dot ${done[t.key] ? 'done' : ''}`}>{done[t.key] ? <Ico name="check" size={12} stroke={3} /> : t.step}</span> : <Ico name={t.icon} size={16} />}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="summary">
        <div className="summary-inner">
          <div className="kpi">
            <div className="k">Net variable pool</div>
            <div className="v teal">{money(result.pool, { whole: true })}</div>
          </div>
          <div className="kpi">
            <div className="k">Earned this {state.period === 'Q1' ? 'quarter' : 'period'}</div>
            <div className="v">{money(result.totals.earned, { whole: true })}</div>
          </div>
          <div className="kpi">
            <div className="k">Ready for payroll</div>
            <div className="v green">{money(result.totals.release, { whole: true })}</div>
          </div>
          <div className="kpi">
            <div className="k">Undistributed</div>
            <div className="v">{money(result.undistributed, { whole: true })}</div>
          </div>
          <div className="kpi">
            <div className="k">Faculty · holds</div>
            <div className={`v ${holds ? 'amber' : ''}`}>
              {state.faculty.length} · {holds}
            </div>
          </div>
        </div>
      </div>

      <main className="main">
        {tab === 'funds' && <FundsPage {...api} />}
        {tab === 'faculty' && <FacultyPage {...api} />}
        {tab === 'payments' && <PaymentsPage {...api} />}
        {tab === 'results' && <ResultsPage {...api} />}
        {tab === 'bench' && <BenchmarksPage {...api} />}
        {tab === 'guide' && <GuidePage {...api} />}
      </main>

      <footer className="foot">
        <span>
          Calculations run entirely in this browser. Nothing you enter is uploaded — it is saved only on this device.
        </span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm ghost" onClick={() => exportScenario(state)}>
            <Ico name="save" size={14} /> Save scenario
          </button>
          <FileButton
            className="btn sm ghost"
            accept=".json"
            onFile={async (f) => {
              try {
                const d = await importScenario(f)
                setState({ ...fresh(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings }, funds: { ...DEFAULT_FUNDS, ...d.funds }, controls: { ...DEFAULT_CONTROLS, ...d.controls } })
                notify('Scenario loaded')
              } catch (e) {
                notify(e.message)
              }
            }}
          >
            <Ico name="upload" size={14} /> Open scenario
          </FileButton>
          <button
            className="btn sm ghost"
            onClick={() => {
              setState(demoState())
              setTab('results')
              notify('Loaded hypothetical demo data')
            }}
          >
            <Ico name="spark" size={14} /> Load demo data
          </button>
          <button
            className="btn sm ghost danger"
            onClick={() => {
              if (confirm('Clear all funds, faculty and payments on this device? Benchmarks are kept.')) {
                setState(fresh())
                setTab('funds')
              }
            }}
          >
            <Ico name="trash" size={14} /> Start over
          </button>
        </span>
      </footer>
      {toast}
    </>
  )
}
