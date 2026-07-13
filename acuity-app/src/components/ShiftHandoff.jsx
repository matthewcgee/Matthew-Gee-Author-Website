import React, { useMemo } from 'react'
import { Badge, Button, Icon, theme } from './ui.jsx'
import {
  computeEntryValue,
  entryStage,
  thresholdsFor,
  detectTrend,
  staffingRatioRecommendation,
  STAGE_COLORS,
} from '../lib/model.js'
import { today } from '../lib/storage.js'
import AcuitasLogo from './AcuitasLogo.jsx'

const SHIFT_ORD = { AM: 0, PM: 1 }
const TREND_ARROW = { up: '↑', down: '↓', stable: '→' }
const TREND_COLOR = { up: STAGE_COLORS.RED, down: STAGE_COLORS.GREEN, stable: theme.sub }

export default function ShiftHandoff({ locations, entries, thresholds, caps, onClose }) {
  const todayStr = today()

  const now = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const summaries = useMemo(
    () =>
      locations.map((loc) => {
        const list = entries
          .filter((e) => e.locId === loc.id)
          .slice()
          .sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? -1 : 1
            return (SHIFT_ORD[a.shift] || 0) - (SHIFT_ORD[b.shift] || 0)
          })
        const todayEntries = list.filter((e) => e.date === todayStr)
        const latest = todayEntries[todayEntries.length - 1] || null
        const value = latest ? computeEntryValue(latest, loc, thresholds) : null
        const stage = latest ? entryStage(latest, loc, thresholds) : 'NONE'
        const cap = caps[loc.id] !== undefined ? caps[loc.id] : loc.censusCap
        const trend = detectTrend(loc.id, entries, loc, thresholds)
        const staffRec = latest ? staffingRatioRecommendation(latest, loc, thresholds) : null
        const th = thresholdsFor(loc, thresholds)
        return { loc, latest, value, stage, cap, trend, staffRec, th }
      }),
    [locations, entries, thresholds, caps, todayStr]
  )

  const redCount = summaries.filter((s) => s.stage === 'RED').length
  const yellowCount = summaries.filter((s) => s.stage === 'YELLOW').length
  const escalations = summaries.filter(
    (s) => s.stage === 'RED' || (s.trend?.direction === 'up' && s.stage !== 'NONE')
  )

  const capLocations = summaries.filter((s) => s.cap != null && s.latest)
  const totalCensus = capLocations.reduce((sum, s) => sum + (s.latest?.census || 0), 0)
  const totalCap = capLocations.reduce((sum, s) => sum + s.cap, 0)

  return (
    <div
      className="print-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(11,45,77,0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          background: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: '28px 32px',
          width: '100%',
          maxWidth: 780,
          boxShadow: '0 20px 60px rgba(11,45,77,0.28)',
        }}
      >
        {/* Controls — hidden when printing */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginBottom: 18,
          }}
        >
          <Button variant="primary" onClick={() => window.print()}>
            <Icon name="printer" size={14} />
            Print / Save PDF
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <Icon name="close" size={14} />
            Close
          </Button>
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 18,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <AcuitasLogo size={32} dark={false} showWordmark />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: theme.display, fontSize: 17, fontWeight: 700 }}>
              Shift Handoff Report
            </div>
            <div style={{ fontSize: 12, color: theme.sub, marginTop: 3 }}>{now}</div>
          </div>
        </div>

        {/* Summary bar */}
        <div
          style={{
            background: theme.panelAlt,
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 18,
            fontSize: 13,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            alignItems: 'center',
          }}
        >
          <span>
            <strong>{locations.length}</strong> units
          </span>
          {totalCap > 0 && (
            <span>
              Census: <strong>{totalCensus} / {totalCap}</strong>
            </span>
          )}
          {redCount > 0 && (
            <span style={{ color: STAGE_COLORS.RED, fontWeight: 700 }}>
              {redCount} CRITICAL
            </span>
          )}
          {yellowCount > 0 && (
            <span style={{ color: STAGE_COLORS.YELLOW, fontWeight: 700 }}>
              {yellowCount} elevated
            </span>
          )}
        </div>

        {/* Main unit table */}
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  borderBottom: `2px solid ${theme.border}`,
                  color: theme.sub,
                  textAlign: 'left',
                }}
              >
                <th style={{ padding: '6px 8px' }}>Unit</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Stage</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Acuity</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Census / Cap</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Staff</th>
                <th style={{ padding: '6px 8px', textAlign: 'center' }}>Trend</th>
                <th style={{ padding: '6px 8px' }}>Staffing Guidance</th>
                <th style={{ padding: '6px 8px' }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ loc, latest, value, stage, cap, trend, staffRec }) => {
                const isEd = loc.type === 'ed'
                const overCap = !isEd && cap != null && (latest?.census || 0) > cap
                const stageColor = STAGE_COLORS[stage]

                return (
                  <tr key={loc.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{loc.name}</td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      <Badge color={stageColor} pulse={stage === 'RED'}>{stage}</Badge>
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        fontWeight: 700,
                        color: stageColor,
                      }}
                    >
                      {value != null ? value.toFixed(isEd ? 0 : 2) : '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        color: overCap ? STAGE_COLORS.RED : undefined,
                        fontWeight: overCap ? 700 : 400,
                      }}
                    >
                      {latest?.census ?? '—'}
                      {cap != null ? ` / ${cap}` : ''}
                      {overCap ? ' ⚠' : ''}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'center' }}>
                      {latest?.staff ?? '—'}
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: 15,
                        color: TREND_COLOR[trend.direction],
                      }}
                    >
                      {TREND_ARROW[trend.direction]}
                    </td>
                    <td
                      style={{
                        padding: '8px',
                        fontSize: 12,
                        fontWeight: staffRec ? 600 : 400,
                        color: staffRec?.color || theme.sub,
                      }}
                    >
                      {staffRec?.label || '—'}
                      {staffRec?.recommended != null ? ` (${staffRec.recommended} staff)` : ''}
                    </td>
                    <td style={{ padding: '8px', fontSize: 12, color: theme.sub, maxWidth: 160 }}>
                      {latest?.notes || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Escalation notes */}
        {escalations.length > 0 && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 10,
              background: `${STAGE_COLORS.RED}0a`,
              border: `1px solid ${STAGE_COLORS.RED}33`,
              marginBottom: 18,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              Escalation Notes
            </div>
            {escalations.map(({ loc, latest, stage, staffRec, trend }) => (
              <div
                key={loc.id}
                style={{
                  fontSize: 12.5,
                  padding: '6px 10px',
                  marginBottom: 6,
                  borderRadius: 7,
                  background: `${STAGE_COLORS[stage]}12`,
                  borderLeft: `3px solid ${STAGE_COLORS[stage]}`,
                }}
              >
                <strong>{loc.name}</strong>
                {stage === 'RED' && (
                  <span style={{ color: STAGE_COLORS.RED, fontWeight: 700 }}>
                    {' '}— CRITICAL
                  </span>
                )}
                {stage !== 'RED' && trend.direction === 'up' && (
                  <span style={{ color: STAGE_COLORS.YELLOW, fontWeight: 700 }}>
                    {' '}— Trending up
                  </span>
                )}
                {staffRec && <span style={{ color: theme.sub }}>{' '}· {staffRec.label}</span>}
                {latest?.notes && (
                  <span style={{ color: theme.sub }}>{' '}· {latest.notes}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            paddingTop: 12,
            borderTop: `1px solid ${theme.border}`,
            fontSize: 11,
            color: theme.sub,
            textAlign: 'center',
          }}
        >
          Acuitas™ — Shift Handoff Report — Patent Pending — © Matthew C. Gee
        </div>
      </div>
    </div>
  )
}
