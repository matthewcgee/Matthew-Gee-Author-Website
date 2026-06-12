import React from 'react'
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'
import { Card, Badge, ProgressBar, StatCard, theme, grid } from './ui.jsx'
import { computeEntryValue, entryStage, thresholdsFor, staffNeededForNextThreshold, STAGE_COLORS } from '../lib/model.js'

const SHIFT_ORDER = { AM: 0, PM: 1 }

function sortedEntriesFor(locId, entries) {
  return entries
    .filter((e) => e.locId === locId)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (SHIFT_ORDER[a.shift] || 0) - (SHIFT_ORDER[b.shift] || 0)
    })
}

export default function StatusBoard({ locations, entries, thresholds }) {
  const summaries = locations.map((loc) => {
    const list = sortedEntriesFor(loc.id, entries)
    const latest = list[list.length - 1] || null
    const value = latest ? computeEntryValue(latest, loc, thresholds) : null
    const stage = latest ? entryStage(latest, loc, thresholds) : 'NONE'
    const trend = list.slice(-8).map((e, i) => ({
      i,
      value: computeEntryValue(e, loc, thresholds),
    }))
    const staffToAdd = latest ? staffNeededForNextThreshold(latest, loc, thresholds) : null
    return { loc, latest, value, stage, trend, staffToAdd }
  })

  const greenCount = summaries.filter((s) => s.stage === 'GREEN').length
  const yellowCount = summaries.filter((s) => s.stage === 'YELLOW').length
  const redCount = summaries.filter((s) => s.stage === 'RED').length

  const capLocations = summaries.filter((s) => s.loc.censusCap != null && s.latest)
  const totalCensus = capLocations.reduce((sum, s) => sum + (s.latest.census || 0), 0)
  const totalCap = capLocations.reduce((sum, s) => sum + s.loc.censusCap, 0)
  const overCapCount = capLocations.filter((s) => s.latest.census > s.loc.censusCap).length

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Region Status Board</div>
        <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
          Most recent acuity reading per location, with census vs. nursing-driven census caps.
        </div>
      </div>

      <div style={{ ...grid(4), marginBottom: 20 }}>
        <StatCard label="Locations Tracked" value={locations.length} icon="grid" color={theme.navy} />
        <StatCard
          label="At / Below Target"
          value={greenCount}
          sub={`${yellowCount} elevated · ${redCount} critical`}
          icon="shield"
          color={STAGE_COLORS.GREEN}
        />
        <StatCard
          label="System Census"
          value={totalCap ? `${totalCensus} / ${totalCap}` : '—'}
          sub={overCapCount ? `${overCapCount} unit${overCapCount === 1 ? '' : 's'} over cap` : 'Within nursing caps'}
          icon="building"
          color={overCapCount ? STAGE_COLORS.RED : theme.accent}
        />
        <StatCard
          label="Critical Units"
          value={redCount}
          sub={redCount ? 'Needs attention now' : 'All clear'}
          icon="sparkle"
          color={redCount ? STAGE_COLORS.RED : STAGE_COLORS.GREEN}
        />
      </div>

      {locations.length === 0 && (
        <Card>
          <div style={{ fontSize: 13, color: theme.sub }}>No locations yet. Add one in Settings.</div>
        </Card>
      )}

      <div style={grid(3)}>
        {summaries.map(({ loc, latest, value, stage, trend, staffToAdd }, idx) => {
          const th = thresholdsFor(loc, thresholds)
          const isEd = loc.type === 'ed'
          const overCap = !isEd && loc.censusCap != null && latest?.census != null && latest.census > loc.censusCap

          return (
            <Card
              key={loc.id}
              interactive
              className="fade-in-up"
              style={{ animationDelay: `${idx * 60}ms` }}
              title={loc.name}
              sub={loc.facility}
              right={<Badge color={STAGE_COLORS[stage]} pulse={stage === 'RED'}>{stage}</Badge>}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 800, fontFamily: theme.display, color: STAGE_COLORS[stage] !== STAGE_COLORS.NONE ? theme.text : theme.text }}>
                    {value != null ? value.toFixed(isEd ? 0 : 2) : '—'}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.sub }}>{th.unit}</div>
                </div>

                {trend.length > 1 && (
                  <div style={{ width: 110, height: 44 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trend} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id={`spark-${loc.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={STAGE_COLORS[stage]} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={STAGE_COLORS[stage]} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <YAxis hide domain={['dataMin', 'dataMax']} />
                        <Area type="monotone" dataKey="value" stroke={STAGE_COLORS[stage]} strokeWidth={2} fill={`url(#spark-${loc.id})`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {!isEd && loc.censusCap != null && latest && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: theme.sub, marginBottom: 4 }}>
                    <span>Census vs. nursing cap</span>
                    <span style={{ fontWeight: 700, color: overCap ? STAGE_COLORS.RED : theme.text }}>
                      {latest.census ?? '—'} / {loc.censusCap}
                      {overCap && ' · over cap'}
                    </span>
                  </div>
                  <ProgressBar
                    value={latest.census ?? 0}
                    max={loc.censusCap}
                    color={overCap ? STAGE_COLORS.RED : theme.accent}
                  />
                </div>
              )}

              {latest ? (
                <div style={{ fontSize: 12, color: theme.sub }}>
                  {latest.date} · {latest.shift} shift
                  {!isEd && <> · {latest.staff} staff, {latest.points} points</>}
                  {isEd && <> · {latest.points} points</>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: theme.sub }}>No shift entries yet.</div>
              )}

              {!isEd && latest && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    background: staffToAdd > 0 ? `${STAGE_COLORS[stage]}1a` : theme.panelAlt,
                    color: staffToAdd > 0 ? STAGE_COLORS[stage] : theme.sub,
                  }}
                >
                  {staffToAdd > 0
                    ? `Deploy ${staffToAdd} more staff to reach ${stage === 'RED' ? 'YELLOW' : 'GREEN'}`
                    : 'Staffing is at target for current acuity'}
                </div>
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
