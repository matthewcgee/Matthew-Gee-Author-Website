import React, { useState } from 'react'
import { AppStateProvider, useAppState } from './lib/AppStateContext.jsx'
import { PvcLogo } from './components/ui.jsx'
import SchedulePage from './components/SchedulePage.jsx'
import RosterPage from './components/RosterPage.jsx'
import TrackerPage from './components/TrackerPage.jsx'
import StatsPage from './components/StatsPage.jsx'

const TABS = [
  { key: 'tracker', label: 'Live Tracker' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'stats', label: 'Season Stats' },
  { key: 'roster', label: 'Roster' },
]

function Shell() {
  const { state } = useAppState()
  const [tab, setTab] = useState(state.players.length === 0 ? 'roster' : 'tracker')

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <PvcLogo />
          <div className="app-title">
            <h1>Piedmont Volleyball Club</h1>
            <p>Stat Tracker</p>
          </div>
        </div>
        <nav className="tab-nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab-btn${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {tab === 'tracker' && <TrackerPage />}
        {tab === 'schedule' && <SchedulePage />}
        {tab === 'stats' && <StatsPage />}
        {tab === 'roster' && <RosterPage />}
      </main>

      <p className="footer-note">
        Stats are saved on this device only. Season Stats has an Export CSV button if you want
        to back them up or send them to a coach or recruiter.
      </p>
    </div>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}
