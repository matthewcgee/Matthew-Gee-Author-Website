import React, { useMemo, useState } from 'react'
import { Card, Button, Icon, Badge, theme, grid } from './ui.jsx'
import { STAGE_COLORS } from '../lib/model.js'
import { runScenario, isEmptyScenario } from '../lib/whatif.js'

const pct = (p) => (p == null ? '—' : `${Math.round(p * 100)}%`)
const blank = (floatStaff) => ({ staffDelta: {}, bedDelta: {}, acuityMultiplier: {}, regionAcuity: 1, floatStaff })

function Delta({ before, after, fmt = pct, goodWhenLower = true }) {
  const d = (after ?? 0) - (before ?? 0)
  const color = Math.abs(d) < 0.005 ? theme.sub : (d < 0) === goodWhenLower ? '#1f7a54' : '#a5342a'
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {fmt(before)} <span style={{ color: theme.sub }}>→</span> <strong style={{ color }}>{fmt(after)}</strong>
    </span>
  )
}

function Stepper({ value, onChange, label, step = 1, min = -20, max = 20, suffix = '' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}
        style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.panel, cursor: 'pointer', fontWeight: 700 }}>−</button>
      <span aria-label={label} style={{ minWidth: 34, textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: value ? theme.text : theme.sub }}>
        {value > 0 && suffix !== '%' ? '+' : ''}{value}{suffix}
      </span>
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Math.min(max, value + step))}
        style={{ width: 22, height: 22, borderRadius: 6, border: `1px solid ${theme.border}`, background: theme.panel, cursor: 'pointer', fontWeight: 700 }}>+</button>
    </span>
  )
}

export default function WhatIfPlanner({ locations, entries, thresholds, caps, forecasts, censusForecasts, floatStaff = 2 }) {
  const [scenario, setScenario] = useState(() => blank(floatStaff))
  const ipUnits = (locations || []).filter((l) => l.type !== 'ed')

  const result = useMemo(
    () => runScenario({ locations, entries, thresholds, forecasts, censusForecasts, caps, scenario, floatStaff: scenario.floatStaff }),
    [locations, entries, thresholds, forecasts, censusForecasts, caps, scenario]
  )

  const setField = (field, locId, v) => setScenario((s) => ({ ...s, [field]: { ...s[field], [locId]: v } }))
  const unitIds = result.scenario.units.map((u) => u.loc.id)
  const preset = (fn) => setScenario((s) => fn(blank(s.floatStaff)))
  const empty = isEmptyScenario(scenario)
  const t0 = result.baseline.totals
  const t1 = result.scenario.totals
  const plan = result.plan

  return (
    <Card title="What-if planner" sub="Test bed closures, staffing changes and acuity surges against next shift's forecast — before they happen"
      right={<Badge color={theme.accent}>SCENARIO</Badge>} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Button variant="ghost" onClick={() => preset((s) => ({ ...s, regionAcuity: 1.2 }))} style={{ padding: '5px 10px', fontSize: 12 }}>Region-wide surge +20%</Button>
        <Button variant="ghost" onClick={() => preset((s) => ({ ...s, staffDelta: Object.fromEntries(unitIds.map((id) => [id, -1])) }))} style={{ padding: '5px 10px', fontSize: 12 }}>One call-out on every unit</Button>
        {unitIds[2] && (
          <Button variant="ghost" onClick={() => preset((s) => ({ ...s, bedDelta: { [unitIds[2]]: -4 } }))} style={{ padding: '5px 10px', fontSize: 12 }}>
            Close 4 beds on {result.scenario.units[2].loc.name}
          </Button>
        )}
        <Button variant="ghost" onClick={() => setScenario(blank(scenario.floatStaff))} disabled={empty} style={{ padding: '5px 10px', fontSize: 12 }}>Reset</Button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ padding: '6px 6px' }}>Unit</th>
              <th style={{ padding: '6px 6px' }}>Staff</th>
              <th style={{ padding: '6px 6px' }}>Beds</th>
              <th style={{ padding: '6px 6px' }}>Acuity</th>
              <th style={{ padding: '6px 6px' }}>Stage</th>
              <th style={{ padding: '6px 6px' }}>Chance of RED</th>
              <th style={{ padding: '6px 6px' }}>Chance over cap</th>
            </tr>
          </thead>
          <tbody>
            {result.scenario.units.map((u) => {
              const b = result.baseline.units.find((x) => x.loc.id === u.loc.id)
              const mult = scenario.acuityMultiplier[u.loc.id] ?? 1
              return (
                <tr key={u.loc.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '6px 6px', fontWeight: 700 }}>{u.loc.name}</td>
                  <td style={{ padding: '6px 6px' }}><Stepper label={`staff change on ${u.loc.name}`} value={scenario.staffDelta[u.loc.id] || 0} onChange={(v) => setField('staffDelta', u.loc.id, v)} min={-u.baseStaff} /></td>
                  <td style={{ padding: '6px 6px' }}>{b.cap == null ? <span style={{ color: theme.sub }}>no cap</span> : <Stepper label={`bed change on ${u.loc.name}`} value={scenario.bedDelta[u.loc.id] || 0} onChange={(v) => setField('bedDelta', u.loc.id, v)} min={-b.cap} />}</td>
                  <td style={{ padding: '6px 6px' }}><Stepper label={`acuity on ${u.loc.name}`} value={Math.round(mult * 100)} step={10} min={50} max={200} suffix="%" onChange={(v) => setField('acuityMultiplier', u.loc.id, v / 100)} /></td>
                  <td style={{ padding: '6px 6px', whiteSpace: 'nowrap' }}>
                    <span style={{ color: STAGE_COLORS[b.stage], fontWeight: 700 }}>{b.stage}</span>
                    {b.stage !== u.stage && <> → <span style={{ color: STAGE_COLORS[u.stage], fontWeight: 800 }}>{u.stage}</span></>}
                  </td>
                  <td style={{ padding: '6px 6px' }}><Delta before={b.pRed} after={u.pRed} /></td>
                  <td style={{ padding: '6px 6px' }}>{u.pOverCap == null ? <span style={{ color: theme.sub }}>—</span> : <Delta before={b.pOverCap} after={u.pOverCap} />}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, fontSize: 12.5 }}>
        <span>Region-wide acuity <Stepper label="region-wide acuity" value={Math.round((scenario.regionAcuity || 1) * 100)} step={5} min={50} max={200} suffix="%" onChange={(v) => setScenario((s) => ({ ...s, regionAcuity: v / 100 }))} /></span>
        <span>Float staff <Stepper label="float staff" value={scenario.floatStaff} min={0} max={40} onChange={(v) => setScenario((s) => ({ ...s, floatStaff: v }))} /></span>
      </div>

      <div style={{ ...grid(2, 16), marginTop: 14 }}>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: theme.panelAlt }}>
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Next shift, before any moves</div>
          <div style={{ display: 'grid', gap: 5, fontSize: 12.5 }}>
            <div>Expected units in RED <Delta before={t0.expectedRed} after={t1.expectedRed} fmt={(v) => v.toFixed(1)} /></div>
            <div>Units likely over census cap <Delta before={t0.overCapLikely} after={t1.overCapLikely} fmt={(v) => String(v)} /></div>
            <div>Staff on inpatient units <Delta before={t0.staff} after={t1.staff} fmt={(v) => String(v)} goodWhenLower={false} /></div>
            <div>Beds <Delta before={t0.beds} after={t1.beds} fmt={(v) => String(v)} goodWhenLower={false} /></div>
          </div>
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: theme.panelAlt }}>
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>What Acuitas would do about it</div>
          {!plan?.ok || plan.moves.length === 0 ? (
            <div style={{ fontSize: 12.5, color: theme.sub }}>No moves would help under this scenario.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
              {plan.moves.slice(0, 5).map((m, i) => (
                <div key={i}><Icon name="users" size={12} /> {m.staff} × {m.fromName} → <strong>{m.toName}</strong> <span style={{ color: theme.sub }}>({pct(m.pRedBefore)} → {pct(m.pRedAfter)} RED)</span></div>
              ))}
              <div style={{ color: theme.sub, fontSize: 11.5, marginTop: 2 }}>Units in RED {plan.summary.redBefore} → {plan.summary.redAfter} with {plan.summary.staffPlaced} staff moved</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: theme.sub, marginTop: 10, lineHeight: 1.5 }}>
        Uses the same per-unit forecasts, breach probabilities and exact optimizer as the live plan, so the scenario
        differs from today only by what you changed. Closing beds lowers the census cap, staffing changes spread the
        same acuity over more or fewer staff, and a surge scales predicted acuity. Nothing here is saved.
      </div>
    </Card>
  )
}
