import React, { useMemo, useState } from 'react'
import { useAppState } from '../lib/AppStateContext.jsx'
import { addEvent, undoLastEvent, eventsForMatch, addMatch, clearMatchEvents } from '../lib/storage.js'
import { deriveMatchState, STAT_GROUPS } from '../lib/model.js'
import { Card, Button, EmptyState } from './ui.jsx'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function AddMatchForm({ onCreated, onCancel }) {
  const { state, update } = useAppState()
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState(todayISO())
  const [tournamentId, setTournamentId] = useState('')

  const upcomingTournaments = useMemo(
    () => [...state.tournaments].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [state.tournaments]
  )

  function handleAdd(e) {
    e.preventDefault()
    if (!opponent.trim()) return
    update((s) => {
      const next = addMatch(s, { date, opponent, tournamentId: tournamentId || null })
      const created = next.matches[next.matches.length - 1]
      onCreated(created.id)
      return next
    })
    setOpponent('')
  }

  return (
    <form onSubmit={handleAdd}>
      <div className="field">
        <label htmlFor="tournament">Tournament (optional)</label>
        <select id="tournament" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
          <option value="">Other / not on the calendar</option>
          {upcomingTournaments.map((t) => (
            <option key={t.id} value={t.id}>{t.name} &mdash; {t.location}</option>
          ))}
        </select>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="date">Date</label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="opponent">Opponent</label>
          <input id="opponent" placeholder="Opponent club/team" value={opponent} onChange={(e) => setOpponent(e.target.value)} />
        </div>
      </div>
      <div className="row">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary">+ Add Match</Button>
      </div>
    </form>
  )
}

function MatchPicker({ matches, matchId, setMatchId }) {
  const [adding, setAdding] = useState(matches.length === 0)

  if (adding) {
    return (
      <div className="field">
        <label>New Match</label>
        <AddMatchForm
          onCreated={(id) => { setMatchId(id); setAdding(false) }}
          onCancel={matches.length > 0 ? () => setAdding(false) : null}
        />
      </div>
    )
  }

  return (
    <div className="field">
      <label htmlFor="match">Match</label>
      <select id="match" value={matchId || ''} onChange={(e) => setMatchId(e.target.value)}>
        <option value="" disabled>Select a match&hellip;</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {m.date} &middot; vs {m.opponent}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAdding(true)}
        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12.5, textAlign: 'left', padding: '6px 0 0', cursor: 'pointer' }}
      >
        + Add a new match
      </button>
    </div>
  )
}

export default function TrackerPage() {
  const { state, update } = useAppState()
  const [matchId, setMatchId] = useState(() => pickDefaultMatch(state))
  const [playerId, setPlayerId] = useState(state.settings.myPlayerId || state.players[0]?.id || '')
  const [flashKey, setFlashKey] = useState(null)

  const matches = useMemo(() => [...state.matches].sort((a, b) => b.date.localeCompare(a.date)), [state.matches])
  const match = state.matches.find((m) => m.id === matchId)
  const tournament = match?.tournamentId ? state.tournaments.find((t) => t.id === match.tournamentId) : null

  const events = matchId ? eventsForMatch(state, matchId) : []
  const derived = useMemo(() => deriveMatchState(events), [events])

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
    if (!matchId) return
    update((s) => addEvent(s, { matchId, type: 'score', side }))
  }

  function endSet() {
    if (!matchId) return
    if (!window.confirm(`End Set ${derived.setNumber} at ${derived.currentSet.us}-${derived.currentSet.them}?`)) return
    update((s) => addEvent(s, { matchId, type: 'endSet' }))
  }

  function tapStat(statKey) {
    if (!matchId || !playerId) return
    update((s) => addEvent(s, { matchId, type: 'stat', playerId, statKey }))
    setFlashKey(statKey)
  }

  function undo() {
    if (!matchId) return
    update((s) => undoLastEvent(s, matchId))
  }

  function resetMatch() {
    if (!matchId) return
    if (!window.confirm('Clear all score and stat taps for this match? This cannot be undone.')) return
    update((s) => clearMatchEvents(s, matchId))
  }

  const player = state.players.find((p) => p.id === playerId)
  const playerTotals = playerId ? derived.statTotals[playerId] : null

  return (
    <>
      <Card
        eyebrow="Live Stat Tracker"
        title={match ? `vs ${match.opponent}` : 'Pick or add a match'}
      >
        <MatchPicker matches={matches} matchId={matchId} setMatchId={setMatchId} />

        {state.players.length > 0 && (
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
        )}
      </Card>

      {!matchId ? (
        <Card>
          <EmptyState>Add a match above to start tracking.</EmptyState>
        </Card>
      ) : (
        <>
          <div className="player-select-bar">
            <span className="player-number">{player?.number || '—'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{player?.name}</div>
              <div style={{ fontSize: 11, color: 'var(--silver)' }}>
                Set {derived.setNumber} &middot; Sets {derived.setsWonUs}-{derived.setsWonThem}
                {tournament && <> &middot; {tournament.name}</>}
              </div>
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
              <div className="score-label">Piedmont</div>
              <div className="score-value">{derived.currentSet.us}</div>
              <div className="score-btns">
                <button className="icon-btn" onClick={() => tapScore('us')} aria-label="Add point Piedmont">+</button>
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

function pickDefaultMatch(state) {
  if (state.matches.length === 0) return ''
  const sorted = [...state.matches].sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0]?.id || ''
}
