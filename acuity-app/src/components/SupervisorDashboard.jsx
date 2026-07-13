import React, { useMemo } from 'react'
import { Card, StatCard, Badge, Button, Icon, theme, grid } from './ui.jsx'
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

function sortedLocEntries(locId, entries) {
  return entries
    .filter((e) => e.locId === locId)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (SHIFT_ORD[a.shift] || 0) - (SHIFT_ORD[b.shift] || 0)
    })
}

const TREND_ARROW = { up: '↑', down: '↓', stable: '' }
const TREND_LABEL = { up: 'Trending ↑', down: 'Trending ↓', stable: '' }

export default function SupervisorDashboard({ locations, entries, thresholds, caps, onHandoff }) {
  const todayStr = today()

  const summaries = useMemo(
    () =>
      locations.map((loc) => {
        const list = sortedLocEntries(loc.id, entries)
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

  const redUnits = summaries.filter((s) => s.stage === 'RED')
  const yellowUnits = summaries.filter((s) => s.stage === 'YELLOW')
  const greenUnits = summaries.filter((s) => s.stage === 'GREEN')

  const capLocations = summaries.filter((s) => s.cap != null && s.latest)
  const totalCensus = capLocations.reduce((sum, s) => sum + (s.latest?.census || 0), 0)
  const totalCap = capLocations.reduce((sum, s) => sum + s.cap, 0)
  const overCapCount = capLocations.filter((s) => (s.latest?.census || 0) > s.cap).length

  const trendingUp = summaries.filter((s) => s.trend?.direction === 'up' && s.stage !== 'RED')
  const escalations = summaries.filter(
    (s) => s.stage === 'RED' || (s.trend?.direction === 'up' && s.stage !== 'GREEN' && s.stage !== 'NONE')
  )

  const now = new Date().toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  return (
    <div>
      {/* Header */}
      <div
        className="fade-in-up"
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <AcuitasLogo size={26} dark={false} showWordmark={false} />
            <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Supervisor Dashboard</div>
          </div>
          <div style={{ fontSize: 12.5, color: theme.sub }}>
            All units at a glance — {now}
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          {onHandoff && (
            <Button variant="primary" onClick={onHandoff}>
              <Icon name="clipboard" size={15} />
              Shift Handoff
            </Button>
          )}
          <Button variant="ghost" onClick={() => window.print()}>
            <Icon name="printer" size={15} />
            Print Report
          </Button>
        </div>
      </div>

      {/* Escalation alerts */}
      {escalations.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {redUnits.map((s) => (
            <div
              key={s.loc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                marginBottom: 8,
                borderRadius: 10,
                background: `${STAGE_COLORS.RED}12`,
                border: `1px solid ${STAGE_COLORS.RED}44`,
                borderLeft: `4px solid ${STAGE_COLORS.RED}`,
              }}
            >
              <Badge color={STAGE_COLORS.RED} pulse>CRITICAL</Badge>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.loc.name}</span>
              <span style={{ fontSize: 12.5, color: theme.sub }}>
                {s.value != null ? `Acuity: ${s.value.toFixed(s.loc.type === 'ed' ? 0 : 2)}` : ''}
                {s.latest?.census != null
                  ? ` · Census: ${s.latest.census}${s.cap != null ? `/${s.cap}` : ''}`
                  : ''}
              </span>
              {s.staffRec && (
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: 12,
                    fontWeight: 700,
                    color: s.staffRec.color,
                  }}
                >
                  {s.staffRec.label}
                </span>
              )}
            </div>
          ))}
          {trendingUp.map((s) => (
            <div
              key={s.loc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                marginBottom: 8,
                borderRadius: 10,
                background: `${STAGE_COLORS.YELLOW}12`,
                border: `1px solid ${STAGE_COLORS.YELLOW}44`,
                borderLeft: `4px solid ${STAGE_COLORS.YELLOW}`,
              }}
            >
              <Badge color={STAGE_COLORS.YELLOW}>TRENDING ↑</Badge>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{s.loc.name}</span>
              <span style={{ fontSize: 12.5, color: theme.sub }}>
                Acuity rising — watch for threshold breach
              </span>
              {s.staffRec && (
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: s.staffRec.color }}>
                  {s.staffRec.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{ ...grid(4), marginBottom: 20 }}>
        <StatCard
          label="Units Tracked"
          value={locations.length}
          sub={`${greenUnits.length} green · ${yellowUnits.length} yellow · ${redUnits.length} red`}
          icon="grid"
          color={theme.navy}
        />
        <StatCard
          label="Critical Units"
          value={redUnits.length}
          sub={redUnits.length ? redUnits.map((s) => s.loc.name).join(', ') : 'All clear'}
          icon="sparkle"
          color={redUnits.length ? STAGE_COLORS.RED : STAGE_COLORS.GREEN}
        />
        <StatCard
          label="System Census"
          value={totalCap ? `${totalCensus} / ${totalCap}` : '—'}
          sub={
            overCapCount
              ? `${overCapCount} unit${overCapCount !== 1 ? 's' : ''} over cap`
              : 'Within caps'
          }
          icon="building"
          color={overCapCount ? STAGE_COLORS.RED : theme.accent}
        />
        <StatCard
          label="Trending Up"
          value={trendingUp.length}
          sub={trendingUp.length ? 'Monitor closely' : 'No rising trends'}
          icon="trendUp"
          color={trendingUp.length ? STAGE_COLORS.YELLOW : STAGE_COLORS.GREEN}
        />
      </div>

      {/* Unit tiles */}
      <Card title="All Units — Current Status" sub="Real-time acuity, census, and staffing guidance">
        {locations.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No locations configured. Add one in Settings.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {summaries.map(({ loc, latest, value, stage, cap, trend, staffRec, th }) => {
              const isEd = loc.type === 'ed'
              const overCap = !isEd && cap != null && (latest?.census || 0) > cap
              const stageColor = STAGE_COLORS[stage]

              return (
                <div
                  key={loc.id}
                  className="fade-in-up"
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: `2px solid ${stageColor}`,
                    background: `${stageColor}0d`,
                    position: 'relative',
                  }}
                >
                  {/* Trend arrow */}
                  {trend.direction !== 'stable' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 12,
                        fontSize: 18,
                        fontWeight: 900,
                        color: trend.direction === 'up' ? STAGE_COLORS.RED : STAGE_COLORS.GREEN,
                        opacity: 0.85,
                        lineHeight: 1,
                      }}
                    >
                      {TREND_ARROW[trend.direction]}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 8,
                      paddingRight: trend.direction !== 'stable' ? 24 : 0,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.2 }}>{loc.name}</div>
                    <Badge color={stageColor} pulse={stage === 'RED'}>{stage}</Badge>
                  </div>

                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      fontFamily: theme.display,
                      color: stageColor,
                      lineHeight: 1,
                      marginBottom: 2,
                    }}
                  >
                    {value != null ? value.toFixed(isEd ? 0 : 2) : '—'}
                  </div>
                  <div style={{ fontSize: 10.5, color: theme.sub, marginBottom: 8 }}>{th.unit}</div>

                  {!isEd && cap != null && (
                    <div
                      style={{
                        fontSize: 12,
                        color: overCap ? STAGE_COLORS.RED : theme.sub,
                        fontWeight: overCap ? 700 : 400,
                        marginBottom: 4,
                      }}
                    >
                      Census: {latest?.census ?? '—'} / {cap}
                      {overCap && ' · OVER CAP'}
                    </div>
                  )}

                  {latest ? (
                    <div style={{ fontSize: 11, color: theme.sub, marginBottom: 6 }}>
                      {latest.date} · {latest.shift} shift
                      {!isEd && latest.staff != null ? ` · ${latest.staff} staff` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: theme.sub, fontStyle: 'italic', marginBottom: 6 }}>
                      Awaiting report
                    </div>
                  )}

                  {staffRec && stage !== 'NONE' && (
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: staffRec.color,
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: `${staffRec.color}18`,
                      }}
                    >
                      {staffRec.label}
                      {staffRec.recommended != null && ` (${staffRec.recommended} staff)`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Print footer */}
      <div
        style={{
          marginTop: 24,
          fontSize: 10.5,
          color: theme.sub,
          textAlign: 'center',
          paddingTop: 12,
          borderTop: `1px solid ${theme.border}`,
        }}
      >
        Acuitas™ — Supervisor Dashboard — Patent Pending — © Matthew C. Gee
      </div>
    </div>
  )
}
