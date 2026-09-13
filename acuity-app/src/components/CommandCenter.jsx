import React, { useMemo, useState } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Card, Badge, Button, Field, StatCard, ProgressBar, Icon, theme, grid } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'
import { STAGE_COLORS, thresholdsFor } from '../lib/model.js'
import { forecastLocation, buildSeries } from '../lib/forecast.js'
import { assessForecast, driftSignal, explainForecast, assessCensus, decomposeUai, riskBand } from '../lib/risk.js'
import { recommendDeployment } from '../lib/optimize.js'
import { buildDemoScenario } from '../lib/demoData.js'

const HORIZON = 6
const HISTORY_SHOWN = 16

const METHOD_LABELS = {
  'damped-trend': 'Trend + weekly pattern',
  'seasonal-naive': 'Same shift last week',
  'recent-median': 'Recent median',
}

const CONFIDENCE_LABELS = {
  high: { label: 'High confidence', color: STAGE_COLORS.GREEN },
  moderate: { label: 'Moderate confidence', color: STAGE_COLORS.YELLOW },
  low: { label: 'Low confidence', color: '#e08a41' },
  insufficient: { label: 'Not enough history', color: STAGE_COLORS.NONE },
}

const pct = (p) => (p == null ? '—' : `${Math.round(p * 100)}%`)
const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d))

function shiftLabel(n) {
  return `${n} shift${n === 1 ? '' : 's'}`
}

/* --------------------------------------------------------------------- chart */

function ForecastChart({ series, forecast, th, decimals, height = 150 }) {
  const data = useMemo(() => {
    const history = series.slice(-HISTORY_SHOWN).map((p) => ({
      label: `${p.date.slice(5)} ${p.shift}`,
      actual: p.value,
      p50: null,
      low: null,
      bandWidth: null,
    }))

    if (history.length && forecast?.ok) {
      // Anchor the forecast line to the last real reading so the dashed
      // projection visibly continues the solid history instead of floating.
      history[history.length - 1].p50 = history[history.length - 1].actual
      history[history.length - 1].low = history[history.length - 1].actual
      history[history.length - 1].bandWidth = 0
    }

    const future = (forecast?.ok ? forecast.points : []).map((p) => ({
      label: `${p.date.slice(5)} ${p.shift}`,
      actual: null,
      p50: p.p50,
      low: p.low80,
      bandWidth: Math.max(0, p.high80 - p.low80),
    }))

    return [...history, ...future]
  }, [series, forecast])

  if (!data.length) return null

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={theme.border} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: theme.sub }} interval="preserveStartEnd" tickLine={false} />
          {/* Ticks are formatted and given room explicitly: a clipped axis label
              that turns 1.35 into "35" is worse than no axis at all. */}
          <YAxis
            tick={{ fontSize: 9, fill: theme.sub }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v) => Number(v).toFixed(decimals)}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, borderRadius: 8, border: `1px solid ${theme.border}` }}
            formatter={(value, name) => {
              if (value == null) return null
              const labels = { actual: 'Logged', p50: 'Predicted', bandWidth: '80% range' }
              return [Number(value).toFixed(decimals), labels[name] || name]
            }}
          />

          {/* Threshold bands: the lines the unit must not cross. */}
          <ReferenceLine y={th.greenMax} stroke={STAGE_COLORS.GREEN} strokeDasharray="4 3" strokeWidth={1.5} />
          <ReferenceLine y={th.yellowMax} stroke={STAGE_COLORS.RED} strokeDasharray="4 3" strokeWidth={1.5} />

          {/* Stacked pair renders the prediction interval: an invisible base at
              the lower bound, with the band's width drawn on top of it. */}
          <Area dataKey="low" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area
            dataKey="bandWidth"
            stackId="band"
            stroke="none"
            fill={theme.accent}
            fillOpacity={0.16}
            isAnimationActive={false}
          />

          <Line
            dataKey="actual"
            stroke={theme.navy}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="p50"
            stroke={theme.accent}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 2, fill: theme.accent }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ---------------------------------------------------------------- unit card */

function WhyPanel({ forecast, point, decimals }) {
  const explanation = explainForecast(forecast, point)
  if (!explanation) return null

  const max = Math.max(...explanation.parts.map((p) => Math.abs(p.value)), 0.001)

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: theme.panelAlt }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>
        How {fmt(explanation.total, decimals)} was reached
      </div>
      {explanation.parts.map((part) => {
        const width = Math.min(100, (Math.abs(part.value) / max) * 100)
        const positive = part.value >= 0
        return (
          <div key={part.id} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
              <span style={{ color: theme.text }}>{part.label}</span>
              <span style={{ fontWeight: 700, color: positive ? theme.text : theme.accent }}>
                {positive && part.id !== 'baseline' ? '+' : ''}
                {fmt(part.value, decimals)}
              </span>
            </div>
            <div style={{ height: 4, background: theme.border, borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${width}%`,
                  height: '100%',
                  background: part.id === 'baseline' ? theme.navy : positive ? STAGE_COLORS.YELLOW : theme.accent,
                }}
              />
            </div>
            <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 2 }}>
              {part.detail}
              {part.evidence != null && ` · ${part.evidence} past shift${part.evidence === 1 ? '' : 's'}`}
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${theme.border}` }}>
        These three parts add up to the prediction exactly — nothing is hidden in a black box.
      </div>
    </div>
  )
}

function AccuracyFooter({ accuracy, method, decimals }) {
  if (!accuracy) return null
  const skill = accuracy.skill
  return (
    <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 10, lineHeight: 1.5 }}>
      <strong style={{ color: theme.text }}>{METHOD_LABELS[method] || method}</strong>
      {accuracy.mae != null && <> · typical error ±{fmt(accuracy.mae, decimals)}</>}
      {accuracy.samples > 0 && <> · tested on {accuracy.samples} held-out shifts</>}
      {skill != null && (
        <>
          {' · '}
          <span style={{ color: skill > 0 ? STAGE_COLORS.GREEN : '#c0392b', fontWeight: 700 }}>
            {skill > 0 ? `${Math.round(skill * 100)}% better than` : `${Math.abs(Math.round(skill * 100))}% worse than`}
          </span>{' '}
          same-shift-last-week
        </>
      )}
    </div>
  )
}

function UnitForecastCard({ unit, expanded, onToggle }) {
  const { loc, series, forecast, assessment, drift, th, isEd, latest, change } = unit
  const decimals = isEd ? 0 : 2
  const conf = CONFIDENCE_LABELS[forecast.confidence] || CONFIDENCE_LABELS.insufficient
  const next = assessment.ok ? assessment.next : null
  const current = latest ? latest.value : null

  return (
    <Card
      className="fade-in-up"
      title={loc.name}
      sub={isEd ? 'Emergency Department · behavioral health points' : 'Inpatient · acuity per staff'}
      right={<Badge color={conf.color}>{conf.label.toUpperCase()}</Badge>}
    >
      {/* Now vs next shift, side by side. */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>Now</div>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: theme.display, lineHeight: 1.1 }}>
            {fmt(current, decimals)}
          </div>
        </div>
        <div style={{ color: theme.sub, fontSize: 18, paddingBottom: 6 }}>→</div>
        <div>
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Next shift
          </div>
          {next ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: theme.display, lineHeight: 1.1, color: STAGE_COLORS[next.stage] }}>
                  {fmt(next.p50, decimals)}
                </div>
                <Badge color={STAGE_COLORS[next.stage]}>{next.stage}</Badge>
              </div>
              <div style={{ fontSize: 10.5, color: theme.sub }}>
                80% range {fmt(next.low80, decimals)}–{fmt(next.high80, decimals)}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: theme.sub, fontWeight: 600, paddingTop: 6 }}>No prediction yet</div>
          )}
        </div>

        {drift?.ok && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.5 }}>Trend</div>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: drift.signal === 'stable' ? theme.sub : drift.signal === 'falling' ? STAGE_COLORS.GREEN : '#c0392b',
              }}
            >
              {drift.signal === 'rising' && 'Rising'}
              {drift.signal === 'drifting-up' && 'Drifting up'}
              {drift.signal === 'falling' && 'Easing'}
              {drift.signal === 'stable' && 'Stable'}
            </div>
            {drift.signal !== 'stable' && (
              <div style={{ fontSize: 10, color: theme.sub }}>{fmt(drift.shiftSigmas, 1)}σ from baseline</div>
            )}
          </div>
        )}
      </div>

      {!forecast.ok ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            background: theme.panelAlt,
            fontSize: 12.5,
            color: theme.sub,
          }}
        >
          <strong style={{ color: theme.text }}>
            {forecast.reason === 'no-data' ? 'No shift entries logged yet.' : 'Too little history to forecast.'}
          </strong>{' '}
          {forecast.reason === 'thin-history' && (
            <>
              This unit has {forecast.observations} logged shift{forecast.observations === 1 ? '' : 's'} and needs at
              least {forecast.needed}. Rather than guess, Acuitas waits until a prediction would mean something.
            </>
          )}
        </div>
      ) : (
        <>
          <ForecastChart series={series} forecast={forecast} th={th} decimals={decimals} />

          {/* Breach risk across the forecast window. */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 5 }}>
              <span style={{ color: theme.sub }}>Chance of crossing into RED</span>
              <span style={{ fontWeight: 700, color: next?.band?.color }}>
                {pct(next?.pRed)} next shift · {pct(assessment.peak?.pRed)} peak
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {assessment.horizons.map((h) => (
                <div key={h.slot} style={{ flex: 1 }} title={`${h.label}: ${pct(h.pRed)} chance of RED`}>
                  <div
                    style={{
                      height: 22,
                      borderRadius: 4,
                      background: `${h.band.color}${h.pRed > 0.5 ? 'ee' : '55'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: h.pRed > 0.5 ? '#ffffff' : theme.text,
                    }}
                  >
                    {pct(h.pRed)}
                  </div>
                  <div style={{ fontSize: 9, color: theme.sub, textAlign: 'center', marginTop: 2 }}>
                    {h.shift}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(assessment.shiftsToBreach || assessment.shiftsToRisk) && (
            <div
              style={{
                marginTop: 10,
                padding: '9px 12px',
                borderRadius: 9,
                background: `${STAGE_COLORS.RED}14`,
                color: '#a5342a',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icon name="clock" size={14} />
              {assessment.shiftsToBreach
                ? `Projected to cross into RED in ${shiftLabel(assessment.shiftsToBreach)} if nothing changes`
                : `More likely than not to be RED within ${shiftLabel(assessment.shiftsToRisk)}`}
            </div>
          )}

          {change && Math.abs(change.delta) > 0.01 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: theme.sub }}>
              Since last shift: {change.delta > 0 ? 'up' : 'down'} {fmt(Math.abs(change.delta), decimals)} —{' '}
              <strong style={{ color: theme.text }}>
                {change.driver === 'acuity' ? 'acuity points' : 'staffing'} is the driver
              </strong>{' '}
              ({change.pointsChange >= 0 ? '+' : ''}
              {fmt(change.pointsChange, 1)} points, {change.staffChange >= 0 ? '+' : ''}
              {change.staffChange} staff)
            </div>
          )}

          <button
            type="button"
            onClick={onToggle}
            style={{
              marginTop: 10,
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: theme.accent,
              fontSize: 11.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Icon name="chevronRight" size={12} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            {expanded ? 'Hide the reasoning' : 'Why this prediction?'}
          </button>

          {expanded && <WhyPanel forecast={forecast} point={forecast.points[0]} decimals={decimals} />}

          <AccuracyFooter accuracy={forecast.accuracy} method={forecast.method} decimals={decimals} />
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------ deployment plan */

function MoveCard({ move, decimals = 2 }) {
  const improved = move.stageBefore !== move.stageAfter
  return (
    <div
      className="fade-in-up"
      style={{
        padding: 14,
        borderRadius: 11,
        border: `1px solid ${theme.border}`,
        background: theme.panel,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: theme.accentSoft,
            color: theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="users" size={16} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          Move {move.staff} staff · {move.fromName} → {move.toName}
        </div>
        {improved && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Badge color={STAGE_COLORS[move.stageBefore]}>{move.stageBefore}</Badge>
            <span style={{ color: theme.sub }}>→</span>
            <Badge color={STAGE_COLORS[move.stageAfter]}>{move.stageAfter}</Badge>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
        <div>
          <div style={{ color: theme.sub, fontSize: 10.5 }}>Acuity per staff</div>
          <div style={{ fontWeight: 700 }}>
            {fmt(move.uaiBefore, decimals)} → <span style={{ color: theme.accent }}>{fmt(move.uaiAfter, decimals)}</span>
          </div>
        </div>
        {move.pRedBefore != null && (
          <div>
            <div style={{ color: theme.sub, fontSize: 10.5 }}>Chance of RED</div>
            <div style={{ fontWeight: 700 }}>
              {pct(move.pRedBefore)} → <span style={{ color: theme.accent }}>{pct(move.pRedAfter)}</span>
            </div>
          </div>
        )}
        {move.fromLocId && (
          <div>
            <div style={{ color: theme.sub, fontSize: 10.5 }}>Donor after move</div>
            <div style={{ fontWeight: 700 }}>
              {move.fromName} holds{' '}
              <span style={{ color: STAGE_COLORS[move.donorStageAfter] }}>{move.donorStageAfter}</span> at{' '}
              {fmt(move.donorUaiAfter, decimals)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DeploymentPlan({ plan, mode, onModeChange, floatStaff, onFloatChange }) {
  const summary = plan?.summary

  return (
    <Card
      title="Recommended deployment"
      sub={
        mode === 'forecast'
          ? 'Optimized against next shift’s predicted acuity — move before the surge lands'
          : 'Optimized against the acuity logged right now'
      }
      right={
        <div style={{ display: 'flex', gap: 6 }}>
          <Button variant={mode === 'current' ? 'primary' : 'ghost'} onClick={() => onModeChange('current')}>
            Act on now
          </Button>
          <Button variant={mode === 'forecast' ? 'primary' : 'ghost'} onClick={() => onModeChange('forecast')}>
            Act on next shift
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ maxWidth: 190 }}>
          <Field label="Float staff available" hint="Unassigned staff you can deploy">
            <input
              type="number"
              min="0"
              max="40"
              value={floatStaff}
              onChange={(e) => onFloatChange(Math.max(0, Math.min(40, Number(e.target.value) || 0)))}
            />
          </Field>
        </div>
        {summary && (
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5 }}>
            <div>
              <div style={{ color: theme.sub, fontSize: 10.5 }}>Units in RED</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {summary.redBefore} →{' '}
                <span style={{ color: summary.redAfter < summary.redBefore ? STAGE_COLORS.GREEN : theme.text }}>
                  {summary.redAfter}
                </span>
              </div>
            </div>
            <div>
              <div style={{ color: theme.sub, fontSize: 10.5 }}>Units in YELLOW</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {summary.yellowBefore} → {summary.yellowAfter}
              </div>
            </div>
            <div>
              <div style={{ color: theme.sub, fontSize: 10.5 }}>Staff moved</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {summary.staffPlaced}
                <span style={{ fontSize: 11, fontWeight: 600, color: theme.sub }}>
                  {' '}
                  ({summary.fromFloat} float, {summary.fromUnits} reassigned)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!plan?.ok ? (
        <div style={{ fontSize: 13, color: theme.sub }}>
          {plan?.reason === 'no-staffed-units'
            ? 'No inpatient unit has a logged shift with staffing yet, so there is nothing to optimize.'
            : 'Nothing to optimize right now.'}
        </div>
      ) : plan.moves.length === 0 ? (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 10,
            background: `${STAGE_COLORS.GREEN}14`,
            color: '#1f7a54',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="shield" size={16} />
          No staff moves recommended — every unit is holding, and no move would buy more than the disruption costs.
        </div>
      ) : (
        <>
          {plan.moves.map((move, i) => (
            <MoveCard key={`${move.fromLocId || 'float'}-${move.toLocId}-${i}`} move={move} />
          ))}
          <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 4, lineHeight: 1.5 }}>
            Exact optimum across {plan.states.length} staffed unit{plan.states.length === 1 ? '' : 's'}, weighted by
            patients exposed. Donor units are only tapped when they can drop a staff member and still hold GREEN.
          </div>
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------ volume outlook */

function VolumeOutlook({ units }) {
  const rows = units.filter((u) => !u.isEd && u.censusOutlook?.ok)

  if (!rows.length) {
    return (
      <Card title="Census & volume outlook" sub="Predicted census against nursing-driven caps">
        <div style={{ fontSize: 13, color: theme.sub }}>
          Census forecasting needs a cap set on the unit and a few weeks of logged census. Set caps on the Status Board.
        </div>
      </Card>
    )
  }

  return (
    <Card
      title="Census & volume outlook"
      sub="Predicted census against nursing-driven caps, from each unit's own admission rhythm"
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ padding: '7px 8px' }}>Unit</th>
              <th style={{ padding: '7px 8px' }}>Now</th>
              <th style={{ padding: '7px 8px' }}>Next shift</th>
              <th style={{ padding: '7px 8px' }}>Cap</th>
              <th style={{ padding: '7px 8px' }}>Headroom</th>
              <th style={{ padding: '7px 8px' }}>Over cap risk</th>
              <th style={{ padding: '7px 8px' }}>Peak in {HORIZON} shifts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const c = u.censusOutlook
              const next = c.next
              const over = next.pOverCap >= 0.5
              return (
                <tr key={u.loc.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '7px 8px', fontWeight: 700 }}>{u.loc.name}</td>
                  <td style={{ padding: '7px 8px' }}>{u.latest?.census ?? '—'}</td>
                  <td style={{ padding: '7px 8px', fontWeight: 700 }}>{fmt(next.p50, 1)}</td>
                  <td style={{ padding: '7px 8px' }}>{c.cap}</td>
                  <td style={{ padding: '7px 8px', color: next.headroom < 0 ? '#c0392b' : theme.text }}>
                    {next.headroom >= 0 ? `${fmt(next.headroom, 1)} beds` : `${fmt(-next.headroom, 1)} over`}
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <span style={{ fontWeight: 700, color: next.band.color }}>{pct(next.pOverCap)}</span>
                  </td>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ flex: 1, minWidth: 54 }}>
                        <ProgressBar value={c.peakPOverCap} max={1} color={riskBand(c.peakPOverCap).color} height={6} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: theme.sub }}>{pct(c.peakPOverCap)}</span>
                    </div>
                    {c.shiftsToOverCap && (
                      <div style={{ fontSize: 10, color: '#c0392b', fontWeight: 700, marginTop: 2 }}>
                        over cap in {shiftLabel(c.shiftsToOverCap)}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 10 }}>
        Over-cap risk is the share of this unit's own past forecast errors that would have pushed census past the cap —
        measured, not assumed.
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------- screen */

export default function CommandCenter({ locations, entries, thresholds, caps }) {
  const [demo, setDemo] = useState(false)
  const [mode, setMode] = useState('forecast')
  const [floatStaff, setFloatStaff] = useState(2)
  const [expanded, setExpanded] = useState(null)

  // The demo scenario is built on demand and lives only in this component's
  // memo — it is never written to Firestore and never mixes with live entries.
  const demoScenario = useMemo(() => (demo ? buildDemoScenario() : null), [demo])

  const activeLocations = demo ? demoScenario.locations : locations
  const activeEntries = demo ? demoScenario.entries : entries
  const activeCaps = demo ? demoScenario.caps : caps

  const units = useMemo(() => {
    return (activeLocations || []).map((loc) => {
      const isEd = loc.type === 'ed'
      const th = thresholdsFor(loc, thresholds)
      const series = buildSeries(activeEntries, loc, thresholds, 'acuity')
      const forecast = forecastLocation(activeEntries, loc, thresholds, { horizon: HORIZON })
      const assessment = assessForecast(forecast, loc, thresholds)
      const drift = driftSignal(series)
      // The series already carries the resolved reading for each shift, so use
      // its last point directly rather than re-searching the raw entries — that
      // guarantees the card and the forecast agree about "now".
      const latest = series.length ? series[series.length - 1] : null

      const cap = activeCaps?.[loc.id] !== undefined ? activeCaps[loc.id] : loc.censusCap
      const censusForecast = isEd
        ? null
        : forecastLocation(activeEntries, loc, thresholds, { metric: 'census', horizon: HORIZON })
      const censusOutlook = censusForecast ? assessCensus(censusForecast, cap) : null

      // Exact attribution of the most recent move in acuity per staff.
      const prevPoint = series.length >= 2 ? series[series.length - 2] : null
      const change = !isEd && prevPoint && latest ? decomposeUai(prevPoint, latest) : null

      return { loc, isEd, th, series, forecast, assessment, drift, latest, censusOutlook, change }
    })
  }, [activeLocations, activeEntries, thresholds, activeCaps])

  const forecastsById = useMemo(
    () => Object.fromEntries(units.map((u) => [u.loc.id, u.forecast])),
    [units]
  )

  const plan = useMemo(
    () =>
      recommendDeployment({
        locations: activeLocations,
        entries: activeEntries,
        thresholds,
        forecasts: forecastsById,
        floatStaff,
        mode,
      }),
    [activeLocations, activeEntries, thresholds, forecastsById, floatStaff, mode]
  )

  // Headline numbers.
  const atRisk = units.filter((u) => u.assessment.ok && (u.assessment.peak?.pRed ?? 0) >= 0.5)
  const projectedBreaches = units
    .filter((u) => u.assessment.ok && u.assessment.shiftsToBreach)
    .sort((a, b) => a.assessment.shiftsToBreach - b.assessment.shiftsToBreach)
  const soonest = projectedBreaches[0]
  const modeled = units.filter((u) => u.forecast.ok)
  const skills = modeled.map((u) => u.forecast.accuracy?.skill).filter((s) => s != null)
  const medianSkill = skills.length ? skills.slice().sort((a, b) => a - b)[Math.floor(skills.length / 2)] : null
  const capRisk = units.filter((u) => u.censusOutlook?.ok && u.censusOutlook.peakPOverCap >= 0.5)

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Command Center</div>
          <Badge color={theme.accent}>PREDICTIVE</Badge>
          <div style={{ marginLeft: 'auto' }}>
            <Button variant={demo ? 'primary' : 'ghost'} onClick={() => setDemo((d) => !d)}>
              <Icon name="play" size={14} />
              {demo ? 'Demo data on' : 'Show me with demo data'}
            </Button>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub, maxWidth: 760 }}>
          Where every unit is heading over the next {HORIZON} shifts, how likely each one is to breach, and exactly
          where to move staff. Every forecast is fit to that unit's own history and scored against shifts it never saw.
        </div>
      </div>

      {demo && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: `${STAGE_COLORS.YELLOW}1f`,
            border: `1px solid ${STAGE_COLORS.YELLOW}`,
            fontSize: 12,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="alert" size={15} />
          <span>
            <strong>Demonstration data.</strong> {demoScenario.meta.units} synthetic units,{' '}
            {demoScenario.meta.weeks} weeks, {demoScenario.meta.observations} shifts — generated in your browser, never
            saved, and never mixed with live unit data. Switch it off to return to real entries.
          </span>
        </div>
      )}

      <div style={{ ...grid(4), marginBottom: 20 }}>
        <StatCard
          label="Units at risk"
          value={atRisk.length}
          sub={`more likely than not to hit RED within ${HORIZON} shifts`}
          icon="alert"
          color={atRisk.length ? STAGE_COLORS.RED : STAGE_COLORS.GREEN}
        />
        <StatCard
          label="Soonest projected breach"
          value={soonest ? shiftLabel(soonest.assessment.shiftsToBreach) : 'None'}
          sub={soonest ? soonest.loc.name : 'No unit projected to cross RED'}
          icon="clock"
          color={soonest ? STAGE_COLORS.RED : STAGE_COLORS.GREEN}
        />
        <StatCard
          label="Census cap pressure"
          value={capRisk.length}
          sub={capRisk.length ? `${capRisk[0].loc.name} closest to cap` : 'All units within cap'}
          icon="building"
          color={capRisk.length ? STAGE_COLORS.YELLOW : theme.accent}
        />
        <StatCard
          label="Units modeled"
          value={`${modeled.length}/${units.length}`}
          sub={
            medianSkill != null
              ? `median ${Math.round(medianSkill * 100)}% better than naive`
              : 'awaiting enough history'
          }
          icon="target"
          color={theme.navy}
        />
      </div>

      <DeploymentPlan
        plan={plan}
        mode={mode}
        onModeChange={setMode}
        floatStaff={floatStaff}
        onFloatChange={setFloatStaff}
      />

      <VolumeOutlook units={units} />

      <div style={{ marginTop: 24, marginBottom: 12 }}>
        <div style={{ fontFamily: theme.display, fontSize: 17, fontWeight: 700 }}>Unit forecasts</div>
        <div style={{ fontSize: 12, color: theme.sub }}>
          Solid line is what was logged; dashed line and shaded band are the prediction and its 80% range.
        </div>
      </div>

      {units.length === 0 && (
        <Card>
          <div style={{ fontSize: 13, color: theme.sub }}>No locations yet. Add one in Settings.</div>
        </Card>
      )}

      <div style={grid(2, 16)}>
        {units.map((unit) => (
          <UnitForecastCard
            key={unit.loc.id}
            unit={unit}
            expanded={expanded === unit.loc.id}
            onToggle={() => setExpanded((cur) => (cur === unit.loc.id ? null : unit.loc.id))}
          />
        ))}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 12,
          background: theme.panelAlt,
          fontSize: 11.5,
          color: theme.sub,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: theme.text }}>How these predictions are made.</strong> Each unit gets its own model,
        fit to its own history: a weekly shift-of-week pattern, a damped trend, and smoothing parameters chosen by
        minimizing error on shifts the model was not allowed to see. Acuitas then compares that model against two
        simpler rules — same shift last week, and the unit's recent median — and uses whichever actually scored best.
        Prediction ranges come from the unit's measured past errors, not an assumed bell curve. Nothing leaves your
        browser: there is no external model service, no vendor API, and no patient data in transit.
      </div>
    </div>
  )
}
