import React, { useMemo, useState } from 'react'
import { useAppState } from '../lib/AppStateContext.jsx'
import { addEvent, undoLastEvent, eventsForGame, addCustomGame, clearGameEvents } from '../lib/storage.js'
import { deriveGameState, STAT_GROUPS } from '../lib/model.js'
import { Card, Button, EmptyState } from './ui.jsx'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function GamePicker({ games, gameId, setGameId }) {
  const { update } = useAppState()
  const [adding, setAdding] = useState(false)
  const [opponent, setOpponent] = useState('')
  const [site, setSite] = useState('Home')
  const [date, setDate] = useState(todayISO())

  function handleAdd(e) {
    e.preventDefault()
    if (!opponent.trim()) return
    update((s) => {
      const next = addCustomGame(s, { date, opponent, site })
      const created = next.games[next.games.length - 1]
      setGameId(created.id)
      return next
    })
    setAdding(false)
    setOpponent('')
  }

  return (
    <div className="field">
      <label htmlFor="game">Match</label>
      <select id="game" value={gameId || ''} onChange={(e) => setGameId(e.target.value)}>
        <option value="" disabled>Select a match&hellip;</option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.date} &middot; {g.site === 'Home' ? 'vs' : '@'} {g.opponent}
          </option>
        ))}
      </select>
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{ background: 'none', border: 'none', color: 'var(--gold)', fontSize: 12.5, textAlign: 'left', padding: '6px 0 0', cursor: 'pointer' }}
        >
          + Add a scrimmage / practice match
        </button>
      ) : (
        <form onSubmit={handleAdd} style={{ marginTop: 8 }}>
          <div className="row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <select value={site} onChange={(e) => setSite(e.target.value)}>
              <option>Home</option>
              <option>Away</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <input placeholder="Opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
            <Button type="submit" variant="primary">Add</Button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function TrackerPage() {
  const { state, update } = useAppState()
  const [gameId, setGameId] = useState(() => pickDefaultGame(state))
  const [playerId, setPlayerId] = useState(state.settings.myPlayerId || state.players[0]?.id || '')
  const [flashKey, setFlashKey] = useState(null)

  const games = useMemo(() => [...state.games].sort((a, b) => a.date.localeCompare(b.date)), [state.games])
  const game = state.games.find((g) => g.id === gameId)

  const events = gameId ? eventsForGame(state, gameId) : []
  const derived = useMemo(() => deriveGameState(events), [events])

  if (state.players.length === 0) {
    return (
      <Card eyebrow="Live Tracker" title="Add a player first">
        <EmptyState>
          Head to the <strong>Roster</strong> tab and add your player &mdash; you'll pick them
          here before every match.
        </EmptyState>
      </Card>
    )
  }

  function tapScore(side) {
    if (!gameId) return
    update((s) => addEvent(s, { gameId, type: 'score', side }))
  }

  function endSet() {
    if (!gameId) return
    if (!window.confirm(`End Set ${derived.setNumber} at ${derived.currentSet.us}-${derived.currentSet.them}?`)) return
    update((s) => addEvent(s, { gameId, type: 'endSet' }))
  }

  function tapStat(statKey) {
    if (!gameId || !playerId) return
    update((s) => addEvent(s, { gameId, type: 'stat', playerId, statKey }))
    setFlashKey(statKey)
  }

  function undo() {
    if (!gameId) return
    update((s) => undoLastEvent(s, gameId))
  }

  function resetMatch() {
    if (!gameId) return
    if (!window.confirm('Clear all score and stat taps for this match? This cannot be undone.')) return
    update((s) => clearGameEvents(s, gameId))
  }

  const player = state.players.find((p) => p.id === playerId)
  const playerTotals = playerId ? derived.statTotals[playerId] : null

  return (
    <>
      <Card eyebrow="Live Stat Tracker" title={game ? `${game.site === 'Home' ? 'vs' : '@'} ${game.opponent}` : 'Pick a match'}>
        <GamePicker games={games} gameId={gameId} setGameId={setGameId} />

        <div className="field" style={{ marginTop: 4 }}>
          <label htmlFor="player">Tracking Player</label>
          <select id="player" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            {state.players.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number || '—'} {p.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {!gameId ? (
        <Card>
          <EmptyState>Select or add a match above to start tracking.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="player-select-bar">
            <span className="player-number">{player?.number || '—'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{player?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--silver)' }}>Set {derived.setNumber} &middot; Sets {derived.setsWonUs}-{derived.setsWonThem}</div>
            </div>
          </div>

          {derived.completedSets.length > 0 && (
            <div className="sets-strip">
              {derived.completedSets.map((s) => (
                <span key={s.setNumber}>Set {s.setNumber}: {s.us}-{s.them}</span>
              ))}
            </div>
          )}

          <div className="scoreboard">
            <div className="score-side us">
              <div className="score-label">Eagles</div>
              <div className="score-value">{derived.currentSet.us}</div>
              <div className="score-btns">
                <button className="icon-btn" onClick={() => tapScore('us')} aria-label="Add point Eagles">+</button>
              </div>
            </div>
            <div className="score-side">
              <div className="score-label">Opponent</div>
              <div className="score-value">{derived.currentSet.them}</div>
              <div className="score-btns">
                <button className="icon-btn" onClick={() => tapScore('them')} aria-label="Add point opponent">+</button>
              </div>
            </div>
          </div>

          <div className="tracker-toolbar">
            <Button variant="ghost" onClick={undo}>&#8630; Undo Last</Button>
            <Button variant="ghost" onClick={endSet}>End Set {derived.setNumber}</Button>
          </div>

          {STAT_GROUPS.map((group) => (
            <div key={group.key}>
              <div className="stat-group-title">{group.label}</div>
              <div className="stat-grid">
                {group.stats.map((stat) => {
                  const positive = !stat.key.toLowerCase().includes('error')
                  return (
                    <button
                      key={stat.key}
                      className={`stat-btn ${positive ? 'positive' : 'negative'}${flashKey === stat.key ? ' flash' : ''}`}
                      onClick={() => tapStat(stat.key)}
                      onAnimationEnd={() => setFlashKey(null)}
                      title={stat.hint}
                    >
                      <span>{stat.label}</span>
                      <span className="count">{(playerTotals && playerTotals[stat.key]) || 0}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="tracker-toolbar">
            <Button variant="danger" onClick={resetMatch}>Reset This Match</Button>
          </div>
        </>
      )}
    </>
  )
}

function pickDefaultGame(state) {
  const today = todayISO()
  const upcoming = [...state.games].sort((a, b) => a.date.localeCompare(b.date)).find((g) => g.date >= today)
  return upcoming?.id || state.games[0]?.id || ''
}
