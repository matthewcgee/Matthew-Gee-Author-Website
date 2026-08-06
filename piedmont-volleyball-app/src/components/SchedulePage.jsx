import React, { useMemo, useState } from 'react'
import { useAppState } from '../lib/AppStateContext.jsx'
import { eventsForMatch, setManualResult } from '../lib/storage.js'
import { deriveMatchState, finalResultFromSets, formatDateRange } from '../lib/model.js'
import { Card, Button, EmptyState } from './ui.jsx'

const MONTH_DAY = { month: 'short', day: 'numeric' }
const DOW = { weekday: 'short' }

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getMatchResult(state, match) {
  const tracked = eventsForMatch(state, match.id)
  if (tracked.length > 0) {
    const derived = deriveMatchState(tracked)
    if (derived.completedSets.length > 0) {
      return { ...finalResultFromSets(derived.completedSets), source: 'tracked' }
    }
    return { source: 'in-progress' }
  }
  if (match.manualResult?.sets?.length) {
    return { ...finalResultFromSets(match.manualResult.sets), source: 'manual' }
  }
  return null
}

function ResultBadge({ result }) {
  if (!result) return <span className="result-badge result-pending">—</span>
  if (result.source === 'in-progress') return <span className="result-badge result-pending">Live</span>
  if (!result.outcome) return <span className="result-badge result-pending">{result.setsWonUs}-{result.setsWonThem}</span>
  return (
    <span className={`result-badge ${result.outcome === 'W' ? 'result-w' : 'result-l'}`}>
      {result.outcome} {result.setsWonUs}-{result.setsWonThem}
    </span>
  )
}

function ScoreEditor({ match, onClose }) {
  const { update } = useAppState()
  const initial = match.manualResult?.sets || []
  const [sets, setSets] = useState(() => {
    const rows = [0, 1, 2, 3, 4].map((i) => initial[i] || { us: '', them: '' })
    return rows
  })

  function setVal(i, side, val) {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, [side]: val } : s)))
  }

  function save() {
    const cleaned = sets
      .filter((s) => s.us !== '' && s.them !== '')
      .map((s) => ({ us: Number(s.us), them: Number(s.them) }))
    update((s) => setManualResult(s, match.id, cleaned.length ? cleaned : null))
    onClose()
  }

  function clear() {
    update((s) => setManualResult(s, match.id, null))
    onClose()
  }

  return (
    <div style={{ padding: '10px 0 4px' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Enter Set Scores</div>
      {sets.map((s, i) => (
        <div className="row" key={i} style={{ marginBottom: 6, alignItems: 'center' }}>
          <span style={{ width: 46, color: 'var(--silver)', fontSize: 12 }}>Set {i + 1}</span>
          <input
            inputMode="numeric"
            placeholder="Us"
            value={s.us}
            onChange={(e) => setVal(i, 'us', e.target.value.replace(/\D/g, ''))}
          />
          <input
            inputMode="numeric"
            placeholder="Opp"
            value={s.them}
            onChange={(e) => setVal(i, 'them', e.target.value.replace(/\D/g, ''))}
          />
        </div>
      ))}
      <div className="row" style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={clear}>Clear</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save}>Save</Button>
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const { state } = useAppState()
  const [openId, setOpenId] = useState(null)

  const tournaments = useMemo(
    () => [...state.tournaments].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [state.tournaments]
  )
  const tournamentById = useMemo(() => Object.fromEntries(state.tournaments.map((t) => [t.id, t])), [state.tournaments])

  const matches = useMemo(() => [...state.matches].sort((a, b) => a.date.localeCompare(b.date)), [state.matches])

  const record = useMemo(() => {
    let w = 0, l = 0
    for (const m of matches) {
      const r = getMatchResult(state, m)
      if (r?.outcome === 'W') w++
      else if (r?.outcome === 'L') l++
    }
    return { w, l }
  }, [matches, state])

  return (
    <>
      <Card eyebrow="2027 Season" title="Piedmont Volleyball Club" right={<span className="eyebrow">{record.w}-{record.l}</span>}>
        <p style={{ margin: 0, color: 'var(--silver)', fontSize: 13 }}>
          The tournament calendar below is from the club. Individual matches (created in the Live
          Tracker) are listed further down &mdash; tap any of them to enter or edit the final score.
        </p>
      </Card>

      <Card eyebrow={`${tournaments.length} events`} title="Tournament Calendar">
        {tournaments.map((t) => (
          <div className="tournament-row" key={t.id}>
            <div className="tournament-dates">{formatDateRange(t.startDate, t.endDate)}</div>
            <div className="tournament-info">
              <div className="tournament-name">{t.name}</div>
              <div className="tournament-meta">{t.location}</div>
            </div>
            {t.status && <span className="pill pill-tbd">{t.status}</span>}
          </div>
        ))}
      </Card>

      <Card eyebrow={`${matches.length} logged`} title="Matches">
        {matches.length === 0 ? (
          <EmptyState>
            No matches yet &mdash; add one from the <strong>Live Tracker</strong> tab when you're
            ready to track (or record) a match.
          </EmptyState>
        ) : (
          matches.map((m) => {
            const date = parseDate(m.date)
            const result = getMatchResult(state, m)
            const isOpen = openId === m.id
            const isTracked = result?.source === 'tracked' || result?.source === 'in-progress'
            const tournament = m.tournamentId ? tournamentById[m.tournamentId] : null
            return (
              <div key={m.id}>
                <div
                  className="game-row"
                  onClick={() => !isTracked && setOpenId(isOpen ? null : m.id)}
                  style={{ cursor: isTracked ? 'default' : 'pointer' }}
                >
                  <div className="game-date">
                    <span className="dow">{date.toLocaleDateString('en-US', DOW)}</span>
                    {date.toLocaleDateString('en-US', MONTH_DAY)}
                  </div>
                  <div className="game-info">
                    <div className="game-opp">vs {m.opponent}</div>
                    <div className="game-meta">{tournament ? tournament.name : 'Other match'}</div>
                  </div>
                  <ResultBadge result={result} />
                </div>
                {isOpen && <ScoreEditor match={m} onClose={() => setOpenId(null)} />}
              </div>
            )
          })
        )}
      </Card>
    </>
  )
}
