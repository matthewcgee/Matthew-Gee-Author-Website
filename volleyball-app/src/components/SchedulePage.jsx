import React, { useMemo, useState } from 'react'
import { useAppState } from '../lib/AppStateContext.jsx'
import { eventsForGame, setManualResult } from '../lib/storage.js'
import { deriveGameState, finalResultFromSets } from '../lib/model.js'
import { Card, Button } from './ui.jsx'

const MONTH_DAY = { month: 'short', day: 'numeric' }
const DOW = { weekday: 'short' }

function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getGameResult(state, game) {
  const tracked = eventsForGame(state, game.id)
  if (tracked.length > 0) {
    const derived = deriveGameState(tracked)
    if (derived.completedSets.length > 0) {
      return { ...finalResultFromSets(derived.completedSets), source: 'tracked' }
    }
    return { source: 'in-progress' }
  }
  if (game.manualResult?.sets?.length) {
    return { ...finalResultFromSets(game.manualResult.sets), source: 'manual' }
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

function ScoreEditor({ game, onClose }) {
  const { update } = useAppState()
  const initial = game.manualResult?.sets || []
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
    update((s) => setManualResult(s, game.id, cleaned.length ? cleaned : null))
    onClose()
  }

  function clear() {
    update((s) => setManualResult(s, game.id, null))
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

  const games = useMemo(
    () => [...state.games].sort((a, b) => a.date.localeCompare(b.date)),
    [state.games]
  )

  const record = useMemo(() => {
    let w = 0, l = 0
    for (const g of games) {
      const r = getGameResult(state, g)
      if (r?.outcome === 'W') w++
      else if (r?.outcome === 'L') l++
    }
    return { w, l }
  }, [games, state])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      const key = parseDate(g.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()]
  }, [games])

  return (
    <>
      <Card eyebrow="2026 Season" title="Home of the Eagles" right={<span className="eyebrow">{record.w}-{record.l}</span>}>
        <p style={{ margin: 0, color: 'var(--silver)', fontSize: 13 }}>
          Tap any match to enter or edit the final score. Matches tracked live in the Stat
          Tracker fill in automatically.
        </p>
      </Card>

      {grouped.map(([month, list]) => (
        <Card key={month} title={month}>
          {list.map((g) => {
            const date = parseDate(g.date)
            const result = getGameResult(state, g)
            const isOpen = openId === g.id
            const isTracked = result?.source === 'tracked' || result?.source === 'in-progress'
            return (
              <div key={g.id}>
                <div
                  className="game-row"
                  onClick={() => !isTracked && setOpenId(isOpen ? null : g.id)}
                  style={{ cursor: isTracked ? 'default' : 'pointer' }}
                >
                  <div className="game-date">
                    <span className="dow">{date.toLocaleDateString('en-US', DOW)}</span>
                    {date.toLocaleDateString('en-US', MONTH_DAY)}
                  </div>
                  <div className="game-info">
                    <div className="game-opp">{g.opponent}</div>
                    <div className="game-meta">
                      <span className={`pill ${g.site === 'Home' ? 'pill-home' : 'pill-away'}`}>{g.site}</span>
                      {g.varsityTime && <> &nbsp;JV {g.jvTime} &middot; V {g.varsityTime}</>}
                    </div>
                  </div>
                  <ResultBadge result={result} />
                </div>
                {isOpen && <ScoreEditor game={g} onClose={() => setOpenId(null)} />}
              </div>
            )
          })}
        </Card>
      ))}

      <p className="footer-note" style={{ padding: '0 4px 8px' }}>
        Home games at EFHS &mdash; 900 Building Main Gym. Schedule subject to change; confirm
        updates with the team.
      </p>
    </>
  )
}
