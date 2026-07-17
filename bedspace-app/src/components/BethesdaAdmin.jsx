import React, { useState } from 'react'
import { Card, Field, Button, Badge, Icon, theme, grid } from './ui.jsx'
import { SCREEN_RESULT } from '../lib/model.js'

const RESULT_META = {
  [SCREEN_RESULT.ACCEPTED]: { label: 'Accepted', color: theme.green, bg: theme.greenSoft },
  [SCREEN_RESULT.NOT_ACCEPTED]: { label: 'Not Accepted', color: theme.red, bg: theme.redSoft },
  [SCREEN_RESULT.POSSIBLE_MATCH]: { label: 'Possible Match', color: theme.amber, bg: theme.amberSoft },
}

export default function BethesdaAdmin({ disallowedList, screeningLog, staffName, onAddDisallowed, onRemoveDisallowed, onResolveScreening }) {
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')

  const pending = screeningLog.filter((l) => l.result === SCREEN_RESULT.POSSIBLE_MATCH && !l.resolvedAs)
  const recent = [...screeningLog].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20)

  function addEntry(e) {
    e.preventDefault()
    if (!name.trim()) return
    onAddDisallowed(name.trim(), reason.trim(), staffName)
    setName('')
    setReason('')
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 22 }}>Bethesda Center Admin</div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>
          Manage the confidential disallowed-resident list and review screening activity. Not visible to hospital staff.
        </div>
      </div>

      {pending.length > 0 && (
        <Card title="Verification Queue" sub={`${pending.length} possible match${pending.length === 1 ? '' : 'es'} awaiting your review`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', background: theme.amberSoft, borderRadius: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.queriedName}</div>
                  <div style={{ fontSize: 11.5, color: theme.sub }}>
                    Screened by {l.screenedBy} — {new Date(l.createdAt).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="ghost"
                    onClick={() => onResolveScreening(l.id, SCREEN_RESULT.ACCEPTED)}
                  >
                    Clear as Accepted
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => onResolveScreening(l.id, SCREEN_RESULT.NOT_ACCEPTED)}
                  >
                    Confirm Not Accepted
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ ...grid(2, 16), alignItems: 'start' }}>
        <Card title="Add to Disallowed List" sub="Only Bethesda Center staff can view or edit this list">
          <form onSubmit={addEntry} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" />
            </Field>
            <Field label="Reason (internal use only, never shown to hospital staff)">
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} style={{ resize: 'vertical' }} />
            </Field>
            <div>
              <Button type="submit" disabled={!name.trim()}>
                <Icon name="plus" size={15} /> Add to List
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Disallowed List" sub={`${disallowedList.length} resident${disallowedList.length === 1 ? '' : 's'}`}>
          {disallowedList.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>No entries yet.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
            {disallowedList.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{entry.name}</div>
                  {entry.reason && <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 2 }}>{entry.reason}</div>}
                  <div style={{ fontSize: 10.5, color: theme.sub, opacity: 0.8, marginTop: 2 }}>
                    Added by {entry.addedBy} — {new Date(entry.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => onRemoveDisallowed(entry.id)}
                  title="Remove from list"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.sub, padding: 4 }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Recent Screening Activity" sub="Most recent 20 screenings run by hospital staff">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recent.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>No screenings yet.</div>}
          {recent.map((l) => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
              <span>{l.queriedName} <span style={{ color: theme.sub }}>· {l.screenedBy}</span></span>
              <Badge bg={RESULT_META[l.result].bg} color={RESULT_META[l.result].color}>
                {l.resolvedAs ? `Resolved: ${RESULT_META[l.resolvedAs].label}` : RESULT_META[l.result].label}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
