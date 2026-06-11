import React from 'react'
import { Card, Badge, theme, grid } from './ui.jsx'
import { computeEntryValue, entryStage, thresholdsFor, STAGE_COLORS } from '../lib/model.js'

const SHIFT_ORDER = { AM: 0, PM: 1 }

function latestEntryFor(locId, entries) {
  const list = entries.filter((e) => e.locId === locId)
  if (!list.length) return null
  return list.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return (SHIFT_ORDER[b.shift] || 0) - (SHIFT_ORDER[a.shift] || 0)
  })[0]
}

export default function StatusBoard({ locations, entries, thresholds }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>Region Status Board</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
          Most recent acuity reading per location, with census vs. nursing-driven census caps.
        </div>
      </div>

      {locations.length === 0 && (
        <Card>
          <div style={{ fontSize: 13, color: theme.sub }}>No locations yet. Add one in Settings.</div>
        </Card>
      )}

      <div style={grid(3)}>
        {locations.map((loc) => {
          const latest = latestEntryFor(loc.id, entries)
          const value = latest ? computeEntryValue(latest, loc, thresholds) : null
          const stage = latest ? entryStage(latest, loc, thresholds) : 'NONE'
          const th = thresholdsFor(loc, thresholds)
          const isEd = loc.type === 'ed'

          return (
            <Card
              key={loc.id}
              title={loc.name}
              sub={loc.facility}
              right={<Badge color={STAGE_COLORS[stage]}>{stage}</Badge>}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, fontFamily: theme.display }}>
                    {value != null ? value.toFixed(isEd ? 0 : 2) : '—'}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.sub }}>{th.unit}</div>
                </div>
                {!isEd && loc.censusCap != null && latest && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {latest.census ?? '—'} / {loc.censusCap}
                    </div>
                    <div style={{ fontSize: 11.5, color: theme.sub }}>
                      Census vs. nursing cap
                      {latest.census != null && latest.census > loc.censusCap && (
                        <span style={{ color: STAGE_COLORS.RED, fontWeight: 700 }}> · over cap</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {latest ? (
                <div style={{ fontSize: 12, color: theme.sub }}>
                  {latest.date} · {latest.shift} shift
                  {!isEd && <> · {latest.staff} staff, {latest.points} points</>}
                  {isEd && <> · {latest.points} points</>}
                  {latest.addStaffNext != null && latest.addStaffNext !== '' && (
                    <div style={{ marginTop: 4 }}>Recommend adding {latest.addStaffNext} staff next shift</div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: theme.sub }}>No shift entries yet.</div>
              )}

              <div style={{ fontSize: 11, color: theme.sub, marginTop: 10, opacity: 0.8 }}>
                {loc.market} · {loc.region}
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
