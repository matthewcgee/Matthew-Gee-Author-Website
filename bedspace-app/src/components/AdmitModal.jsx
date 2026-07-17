import React, { useMemo, useState } from 'react'
import { Modal, Button, Field, Badge, Icon, theme } from './ui.jsx'
import { screenName, SCREEN_RESULT, defaultCommitments, commitmentsAccepted } from '../lib/model.js'

const RESULT_META = {
  [SCREEN_RESULT.ACCEPTED]: { label: 'Accepted', color: theme.green, bg: theme.greenSoft, icon: 'checkCircle' },
  [SCREEN_RESULT.NOT_ACCEPTED]: { label: 'Not Accepted', color: theme.red, bg: theme.redSoft, icon: 'xCircle' },
  [SCREEN_RESULT.POSSIBLE_MATCH]: { label: 'Possible Match — Verify with Bethesda', color: theme.amber, bg: theme.amberSoft, icon: 'alertTriangle' },
}

export default function AdmitModal({ bed, disallowedList, bethesdaUnlocked, staffName, onClose, onSubmit, onLogScreening }) {
  const [name, setName] = useState('')
  const [mobility, setMobility] = useState(bed.bottomBunk ? 'any' : 'any')
  const [commitments, setCommitments] = useState(defaultCommitments())
  const [override, setOverride] = useState(false)

  const screening = useMemo(() => {
    if (name.trim().length < 2) return null
    return screenName(name, disallowedList)
  }, [name, disallowedList])

  const mobilityBlocked = mobility === 'bottom_required' && !bed.bottomBunk
  const needsOverride = screening && screening.result !== SCREEN_RESULT.ACCEPTED
  const canSubmit =
    name.trim().length >= 2 &&
    !mobilityBlocked &&
    commitmentsAccepted(commitments) &&
    (!needsOverride || (bethesdaUnlocked && override))

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    if (screening) {
      onLogScreening({
        queriedName: name.trim(),
        result: screening.result,
        matchedEntryId: screening.matchedEntryId,
        screenedBy: staffName,
      })
    }
    onSubmit({
      bed,
      name: name.trim(),
      mobility,
      commitments,
    })
  }

  return (
    <Modal title={`Admit Resident — Bed ${bed.id}`} onClose={onClose} width={480}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Resident Name">
          <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setOverride(false) }} placeholder="First and last name" />
        </Field>

        {screening && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10,
            background: RESULT_META[screening.result].bg, color: RESULT_META[screening.result].color, fontSize: 13, fontWeight: 700,
          }}>
            <Icon name={RESULT_META[screening.result].icon} size={16} />
            {RESULT_META[screening.result].label}
          </div>
        )}

        {needsOverride && (
          bethesdaUnlocked ? (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: theme.sub }}>
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} style={{ marginTop: 2 }} />
              Bethesda Center representative confirms this resident may be admitted despite the screening result above.
            </label>
          ) : (
            <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.6 }}>
              This name did not clear automatic screening. A Bethesda Center representative must unlock the
              admin area to review and override before this resident can be admitted.
            </div>
          )
        )}

        <Field label="Bunk Requirement">
          <select value={mobility} onChange={(e) => setMobility(e.target.value)}>
            <option value="any">Can use any assigned bunk</option>
            <option value="bottom_required">Requires bottom bunk (cannot climb)</option>
          </select>
        </Field>
        {mobilityBlocked && (
          <div style={{ fontSize: 12.5, color: theme.red, fontWeight: 600 }}>
            Bed {bed.id} is a {bed.position} bunk. Choose a bottom-bunk bed on the board for this resident instead.
          </div>
        )}

        <div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 8 }}>
            Condition of residency — resident commits to:
          </div>
          {[
            ['psychAppt', 'Ongoing psychiatric care appointments'],
            ['primaryCareAppt', 'Ongoing primary care appointments'],
            ['groupTherapyWeekly', 'Weekly group therapy sessions'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={commitments[key]}
                onChange={(e) => setCommitments((c) => ({ ...c, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>

        <div style={{ fontSize: 11.5, color: theme.sub, background: theme.panelAlt, borderRadius: 8, padding: '8px 10px' }}>
          Residency is capped at 90 days unless extended by a Bethesda Center representative.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!canSubmit}>
            <Icon name="userCheck" size={15} /> Admit to Bed {bed.id}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
