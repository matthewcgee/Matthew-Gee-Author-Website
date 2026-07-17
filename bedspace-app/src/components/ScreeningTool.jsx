import React, { useMemo, useState } from 'react'
import { Card, Field, Button, Icon, theme } from './ui.jsx'
import { screenName, SCREEN_RESULT } from '../lib/model.js'

const RESULT_META = {
  [SCREEN_RESULT.ACCEPTED]: {
    label: 'Accepted', color: theme.green, bg: theme.greenSoft, icon: 'checkCircle',
    detail: 'No match found on the Bethesda Center list. This resident may proceed with placement.',
  },
  [SCREEN_RESULT.NOT_ACCEPTED]: {
    label: 'Not Accepted', color: theme.red, bg: theme.redSoft, icon: 'xCircle',
    detail: 'This name matches the Bethesda Center disallowed list. Placement cannot proceed — contact Bethesda leadership with questions.',
  },
  [SCREEN_RESULT.POSSIBLE_MATCH]: {
    label: 'Possible Match — Verify with Bethesda', color: theme.amber, bg: theme.amberSoft, icon: 'alertTriangle',
    detail: 'A close (but not exact) match was found. A Bethesda Center representative must verify identity before placement.',
  },
}

export default function ScreeningTool({ disallowedList, staffName, onLogScreening }) {
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState(null)
  const [history, setHistory] = useState([])

  const preview = useMemo(() => {
    if (name.trim().length < 2) return null
    return screenName(name, disallowedList)
  }, [name, disallowedList])

  function runScreen(e) {
    e.preventDefault()
    if (!preview) return
    onLogScreening({
      queriedName: name.trim(),
      result: preview.result,
      matchedEntryId: preview.matchedEntryId,
      screenedBy: staffName,
    })
    setSubmitted({ name: name.trim(), result: preview.result, at: Date.now() })
    setHistory((h) => [{ name: name.trim(), result: preview.result, at: Date.now() }, ...h].slice(0, 8))
    setName('')
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 22 }}>Resident Screening</div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>
          Cross-reference a name against the Bethesda Center's confidential list. You will only ever see
          an accepted / not-accepted outcome — never the underlying list.
        </div>
      </div>

      <Card>
        <form onSubmit={runScreen} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Patient / Resident Name">
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setSubmitted(null) }}
              placeholder="First and last name"
              autoFocus
            />
          </Field>
          <div>
            <Button type="submit" disabled={!preview}>
              <Icon name="search" size={15} /> Screen Name
            </Button>
          </div>
        </form>

        {submitted && (
          <div
            className="fade-in-up"
            style={{
              marginTop: 16, padding: '14px 16px', borderRadius: 12,
              background: RESULT_META[submitted.result].bg, color: RESULT_META[submitted.result].color,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, marginBottom: 4 }}>
              <Icon name={RESULT_META[submitted.result].icon} size={19} />
              {RESULT_META[submitted.result].label}
            </div>
            <div style={{ fontSize: 12.5, color: theme.text, opacity: 0.85 }}>
              {RESULT_META[submitted.result].detail}
            </div>
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card title="This Session" sub="Screenings you've run since opening BedSpace — not visible to other staff">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{h.name}</span>
                <span style={{ color: RESULT_META[h.result].color, fontWeight: 700, fontSize: 12 }}>{RESULT_META[h.result].label}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
