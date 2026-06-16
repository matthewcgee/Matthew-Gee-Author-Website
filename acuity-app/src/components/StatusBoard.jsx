import React, { useEffect, useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts'
import { Card, Badge, ProgressBar, StatCard, Icon, theme, grid } from './ui.jsx'
import { computeEntryValue, entryStage, thresholdsFor, staffNeededForThresholds, STAGE_COLORS } from '../lib/model.js'
import { today } from '../lib/storage.js'

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

function CapEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  const commit = () => {
    setEditing(false)
    const num = draft === '' ? null : Number(draft)
    if (num !== value) onSave(num)
  }

  if (editing) {
    return (
      <input
        type="number"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur()
        }}
        style={{ width: 52, padding: '2px 4px', fontSize: 12.5, fontWeight: 700 }}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to update the nursing-driven census cap"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        font: 'inherit',
        fontWeight: 700,
        color: 'inherit',
      }}
    >
      {value != null ? value : 'set cap'}
      <Icon name="settings" size={11} style={{ opacity: 0.5 }} />
    </button>
  )
}

export default function StatusBoard({ locations, entries, thresholds, caps, onUpdateCap }) {
  const todayStr = today()
  const summaries = locations.map((loc) => {
    const list = sortedEntriesFor(loc.id, entries)
    const todaysEntries = list.filter((e) => e.date === todayStr)
    const latest = todaysEntries[todaysEntries.length - 1] || null
    const hasHistory = list.length > 0
    const value = latest ? computeEntryValue(latest, loc, thresholds) : null
    const stage = latest ? entryStage(latest, loc, thresholds) : 'NONE'
    const trend = list.slice(-8).map((e, i) => ({
      i,
      value: computeEntryValue(e, loc, thresholds),
    }))
    const staffNeeds = latest ? staffNeededForThresholds(latest, loc, thresholds) : null
    const cap = caps[loc.id] !== undefined ? caps[loc.id] : loc.censusCap
    return { loc, latest, value, stage, trend, staffNeeds, hasHistory, cap }
  })

  const greenCount = summaries.filter((s) => s.stage === 'GREEN').length
  const yellowCount = summaries.filter((s) => s.stage === 'YELLOW').length
  const redCount = summaries.filter((s) => s.stage === 'RED').length

  const capLocations = summaries.filter((s) => s.cap != null && s.latest)
  const totalCensus = capLocations.reduce((sum, s) => sum + (s.latest.census || 0), 0)
  const totalCap = capLocations.reduce((sum, s) => sum + s.cap, 0)
  const overCapCount = capLocations.filter((s) => s.latest.census > s.cap).length

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
        {summaries.map(({ loc, latest, value, stage, trend, staffNeeds, hasHistory, cap }, idx) => {
          const th = thresholdsFor(loc, thresholds)
          const isEd = loc.type === 'ed'
          const overCap = !isEd && cap != null && latest?.census != null && latest.census > cap
          const awaiting = !latest

          return (
            <Card
              key={loc.id}
              interactive
              className="fade-in-up"
              style={{ animationDelay: `${idx * 60}ms` }}
              title={loc.name}
              sub={loc.facility}
              right={
                awaiting
                  ? <Badge color={STAGE_COLORS.NONE}>AWAITING REPORT</Badge>
                  : <Badge color={STAGE_COLORS[stage]} pulse={stage === 'RED'}>{stage}</Badge>
              }
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

              {!isEd && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: theme.sub, marginBottom: 4 }}>
                    <span>Census vs. nursing cap</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: overCap ? STAGE_COLORS.RED : theme.text }}>
                      {latest?.census ?? '—'} / <CapEditor value={cap} onSave={(v) => onUpdateCap(loc.id, v)} />
                      {overCap && ' · over cap'}
                    </span>
                  </div>
                  {cap != null && latest && (
                    <ProgressBar
                      value={latest.census ?? 0}
                      max={cap}
                      color={overCap ? STAGE_COLORS.RED : theme.accent}
                    />
                  )}
                </div>
              )}

              {latest ? (
                <div style={{ fontSize: 12, color: theme.sub }}>
                  {latest.date} · {latest.shift} shift
                  {!isEd && <> · {latest.staff} staff, {latest.points} points</>}
                  {isEd && <> · {latest.points} points</>}
                  {latest.capInPlace && (
                    <span style={{ marginLeft: 6 }}>
                      <Badge color={STAGE_COLORS.RED}>CAP IN PLACE</Badge>
                    </span>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: theme.sub,
                    background: theme.panelAlt,
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                >
                  {hasHistory ? 'Awaiting daily report for today' : 'No shift entries yet.'}
                </div>
              )}

              {!isEd && latest && staffNeeds && (() => {
                const parts = []
                if (staffNeeds.toYellow > 0) parts.push(`${staffNeeds.toYellow} staff to YELLOW`)
                if (staffNeeds.toGreen > 0) parts.push(`${staffNeeds.toGreen} staff to GREEN`)
                const needsStaff = parts.length > 0
                return (
                  <div
                    style={{
                      marginTop: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      background: needsStaff ? `${STAGE_COLORS[stage]}1a` : theme.panelAlt,
                      color: needsStaff ? STAGE_COLORS[stage] : theme.sub,
                    }}
                  >
                    {needsStaff
                      ? `Deploy ${parts.join(', ')}`
                      : 'Staffing is at target for current acuity'}
                  </div>
                )
              })()}

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
