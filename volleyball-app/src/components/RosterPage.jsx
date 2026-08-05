import React, { useState } from 'react'
import { useAppState } from '../lib/AppStateContext.jsx'
import { addPlayer, updatePlayer, removePlayer, setMyPlayer } from '../lib/storage.js'
import { Card, Button, EmptyState } from './ui.jsx'

export default function RosterPage() {
  const { state, update } = useAppState()
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editNumber, setEditNumber] = useState('')
  const [editName, setEditName] = useState('')

  function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    update((s) => addPlayer(s, { number, name }))
    setNumber('')
    setName('')
  }

  function startEdit(p) {
    setEditingId(p.id)
    setEditNumber(p.number)
    setEditName(p.name)
  }

  function saveEdit(id) {
    update((s) => updatePlayer(s, id, { number: editNumber.trim(), name: editName.trim() }))
    setEditingId(null)
  }

  function handleRemove(p) {
    if (!window.confirm(`Remove ${p.name} from the roster? Their saved stats stay recorded, but they'll no longer appear in pickers.`)) return
    update((s) => removePlayer(s, p.id))
  }

  return (
    <>
      <Card eyebrow="Team Roster" title="Add a player">
        <form onSubmit={handleAdd}>
          <div className="row">
            <div className="field" style={{ flex: '0 0 90px' }}>
              <label htmlFor="number">Number</label>
              <input id="number" inputMode="numeric" placeholder="#" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" placeholder="Player name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <Button type="submit" block>+ Add Player</Button>
        </form>
      </Card>

      <Card eyebrow={`${state.players.length} on roster`} title="Players">
        {state.players.length === 0 ? (
          <EmptyState>Add your player above to get started &mdash; e.g. Payton.</EmptyState>
        ) : (
          state.players.map((p) => (
            <div className="player-row" key={p.id}>
              {editingId === p.id ? (
                <>
                  <input
                    style={{ width: 56 }}
                    className="player-number"
                    value={editNumber}
                    inputMode="numeric"
                    onChange={(e) => setEditNumber(e.target.value)}
                  />
                  <input
                    style={{
                      flex: 1,
                      background: 'var(--navy-900)',
                      border: '1px solid var(--navy-500)',
                      color: 'var(--white)',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Button variant="primary" onClick={() => saveEdit(p.id)}>Save</Button>
                </>
              ) : (
                <>
                  <span className="player-number">{p.number || '—'}</span>
                  <span className="player-name">{p.name}</span>
                  <button
                    className={`star-btn${state.settings.myPlayerId === p.id ? ' active' : ''}`}
                    title="Set as my player"
                    onClick={() => update((s) => setMyPlayer(s, p.id))}
                  >
                    {state.settings.myPlayerId === p.id ? '★' : '☆'}
                  </button>
                  <button className="icon-btn" style={{ width: 36, height: 36, fontSize: 15 }} onClick={() => startEdit(p)} aria-label="Edit">
                    &#9998;
                  </button>
                  <button className="icon-btn" style={{ width: 36, height: 36, fontSize: 15 }} onClick={() => handleRemove(p)} aria-label="Remove">
                    &times;
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </Card>

      <p className="footer-note" style={{ padding: '0 4px 8px' }}>
        Tap the star to set your player as the default in the Live Tracker. You can add
        teammates too so the whole team's stats live in one place on this device.
      </p>
    </>
  )
}
