import React, { useEffect, useMemo, useState } from 'react'
import { Card, Field, Button, StatCard, Icon, Badge, theme, grid } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'
import { STAGE_COLORS } from '../lib/model.js'
import { evaluatePlan, adherenceSummary, regionCalibration, opOutcomeSummary, thresholdFeedback } from '../lib/outcomes.js'
import { costSummary, realizedValue, normalizeRates, DEFAULT_COST_RATES, DEPLOYMENT_SOURCES, formatMoney } from '../lib/cost.js'
import { useCollection, useConfigValue } from '../lib/store.js'
import { useOutpatientData } from '../lib/opData.js'
import { can } from '../lib/roles.js'
import { dayIndex, dateFromDayIndex } from '../lib/forecast.js'
import { today } from '../lib/storage.js'
import { ReliabilityChart, ObservedVsPredicted, SERIES } from './charts.jsx'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

const FOLLOW_COLOR = { full: '#1f7a54', partial: '#8a6a10', none: '#a5342a' }
const FOLLOW_LABEL = { full: 'Followed', partial: 'Partly followed', none: 'Not followed' }
const OUTCOME_LABEL = { avoided: 'Avoided RED', red: 'Went RED', pending: 'Awaiting reading' }

function Pill({ color, children }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: `${color}1f`, color, whiteSpace: 'nowrap' }}>{children}</span>
}

const RATE_FIELDS = [
  ['redShiftCost', 'Cost of one RED unit-shift', '$'],
  ['floatHourly', 'Float pool, per hour', '$'],
  ['overtimeHourly', 'Overtime, per hour', '$'],
  ['agencyHourly', 'Agency / travel, per hour', '$'],
  ['internalHourly', 'Reassigned staff, per hour', '$'],
  ['boardingHourCost', 'One ED boarding hour', '$'],
  ['shiftHours', 'Hours in a shift', 'h'],
]

export default function Outcomes({ locations, entries, deployments, thresholds, role = 'admin' }) {
  const [planLog] = useCollection('planLog', { localKey: 'bhai:planLog' })
  const [rawRates, setRates] = useConfigValue('costRates', { localKey: 'bhai:costRates', initial: DEFAULT_COST_RATES })
  const rates = normalizeRates(rawRates)
  const op = useOutpatientData()
  const [windowDays, setWindowDays] = useState(30)
  const [calibration, setCalibration] = useState(null)

  const evaluations = useMemo(
    () => planLog
      .map((p) => evaluatePlan(p, { entries, deployments, locations, thresholds }))
      .sort((a, b) => (a.targetDate < b.targetDate ? 1 : a.targetDate > b.targetDate ? -1 : 0)),
    [planLog, entries, deployments, locations, thresholds]
  )
  const adherence = useMemo(() => adherenceSummary(evaluations), [evaluations])
  const realized = useMemo(() => realizedValue(adherence, evaluations, rates), [adherence, evaluations, rates])

  const to = today()
  const from = dateFromDayIndex(dayIndex(to) - windowDays + 1)
  const cost = useMemo(
    () => costSummary({ entries, deployments, locations, thresholds, rates, from, to }),
    [entries, deployments, locations, thresholds, rates, from, to]
  )

  // Replaying every unit's history takes a moment; do it after first paint so
  // the rest of the page appears immediately.
  useEffect(() => {
    setCalibration(null)
    const t = setTimeout(() => setCalibration(regionCalibration(entries, locations, thresholds, { window: 24 })), 60)
    return () => clearTimeout(t)
  }, [entries, locations, thresholds])

  const opSummary = useMemo(() => opOutcomeSummary(op.patients, op.outcomes), [op.patients, op.outcomes])
  const prompts = useMemo(() => thresholdFeedback(opSummary), [opSummary])
  const canEditRates = can(role, 'cost-edit')
  const thinEvidence = adherence.followed.moves < 5 || adherence.notFollowed.moves < 5

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Outcomes &amp; ROI</div>
          <Badge color={theme.accent}>CLOSED LOOP</Badge>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub, maxWidth: 820 }}>
          Whether Acuitas&rsquo;s recommendations were followed, whether they were right, and what they were worth.
          Deployment plans are scored against what happened next, every forecast is checked against reality, and the
          outpatient placements are tracked to their outcomes. Every figure shows its count and its arithmetic.
        </div>
      </div>

      <div style={{ ...grid(4), marginBottom: 18 }}>
        <StatCard label="Plans recorded" value={adherence.plans} sub={`${adherence.moves} recommended moves`} icon="file" color={theme.navy} />
        <StatCard label="Moves followed in full" value={pct(adherence.adherenceRate)} sub={`${adherence.pendingMoves} awaiting the next reading`} icon="users" color={theme.accent} />
        <StatCard label="RED when followed vs not" value={`${pct(adherence.followed.redRate)} vs ${pct(adherence.notFollowed.redRate)}`}
          sub={adherence.redReduction != null ? `${Math.round(adherence.redReduction * 100)}-point drop when followed` : 'needs outcomes on both sides'}
          icon="shield" color={adherence.redReduction > 0 ? '#3fb37f' : theme.navy} />
        <StatCard label="Forecast skill" value={calibration ? (calibration.overall.skill == null ? '—' : `${Math.round(calibration.overall.skill * 100)}%`) : '…'}
          sub={calibration ? `better than the base rate · ${calibration.overall.n} shifts scored` : 'scoring past forecasts…'} icon="target" color={theme.navy} />
      </div>

      <div style={grid(2, 16)}>
        <Card title="Following the plan" sub="RED rate on the target shift. The bar shows what happened; the dark tick shows what Acuitas predicted.">
          <ObservedVsPredicted rows={[
            { label: 'Plan followed', value: adherence.followed.redRate, predicted: adherence.followed.predictedRedRate, n: adherence.followed.moves, color: SERIES.a },
            { label: 'Plan not followed', value: adherence.notFollowed.redRate, predicted: adherence.notFollowed.predictedRedRate, n: adherence.notFollowed.moves, color: SERIES.b },
          ]} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ padding: '5px 6px' }} />
                <th style={{ padding: '5px 6px', textAlign: 'right' }}>Moves</th>
                <th style={{ padding: '5px 6px', textAlign: 'right' }}>Avoided RED</th>
                <th style={{ padding: '5px 6px', textAlign: 'right' }}>Went RED</th>
                <th style={{ padding: '5px 6px', textAlign: 'right' }}>Predicted RED</th>
              </tr>
            </thead>
            <tbody>
              {[['Plan followed', adherence.followed], ['Plan not followed', adherence.notFollowed]].map(([label, g]) => (
                <tr key={label} style={{ borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }}>
                  <td style={{ padding: '6px 6px', fontWeight: 700 }}>{label}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right' }}>{g.moves}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: '#1f7a54', fontWeight: 700 }}>{g.moves - g.red}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right', color: g.red ? '#a5342a' : theme.text, fontWeight: 700 }}>{g.red}</td>
                  <td style={{ padding: '6px 6px', textAlign: 'right' }}>{pct(g.predictedRedRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 8, lineHeight: 1.5 }}>
            {adherence.followed.moves} followed and {adherence.notFollowed.moves} unfollowed moves with known outcomes.
            For followed moves, the prediction is the post-move chance of RED. For unfollowed moves, it is the warning
            Acuitas gave.
            {thinEvidence && <strong style={{ color: '#8a6a10' }}> Fewer than 5 outcomes on one side — treat the comparison as early.</strong>}
          </div>
        </Card>

        <Card title="Forecast calibration" sub="When Acuitas says 30%, does RED happen about 30% of the time?">
          {!calibration ? (
            <div style={{ fontSize: 12.5, color: theme.sub, padding: '30px 0' }}>Replaying each unit&rsquo;s history one shift at a time…</div>
          ) : calibration.overall.n === 0 ? (
            <div style={{ fontSize: 12.5, color: theme.sub }}>Not enough logged history to score forecasts yet. Each unit needs about two weeks of shifts.</div>
          ) : (
            <>
              <ReliabilityChart bins={calibration.overall.bins} />
              <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6, lineHeight: 1.5 }}>
                {calibration.overall.n} one-shift-ahead forecasts, each made only from the shifts before it. Brier score{' '}
                <strong style={{ color: theme.text }}>{calibration.overall.brier.toFixed(3)}</strong>, average gap between predicted and
                actual <strong style={{ color: theme.text }}>{pct(calibration.overall.ece)}</strong>.
              </div>
            </>
          )}
        </Card>
      </div>

      {calibration && calibration.perUnit.length > 0 && (
        <Card title="Calibration by unit" style={{ marginTop: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '6px 8px' }}>Unit</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Shifts scored</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Shifts in RED</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Brier score</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Skill vs base rate</th>
                </tr>
              </thead>
              <tbody>
                {calibration.perUnit.map((u) => (
                  <tr key={u.loc.id} style={{ borderBottom: `1px solid ${theme.border}`, fontVariantNumeric: 'tabular-nums' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700 }}>{u.loc.name}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{u.n}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{pct(u.baseRate)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{u.brier.toFixed(3)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: theme.sub }}>
                      {u.skill == null ? 'no RED to predict' : `${Math.round(u.skill * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: theme.sub, marginTop: 8 }}>
            Lower Brier is better (0 is perfect). Skill compares it with always guessing the unit&rsquo;s own share of RED
            shifts; a unit that never went RED has nothing to beat, so its skill is undefined, not zero.
          </div>
        </Card>
      )}

      <Card title="Cost & ROI" sub="What acuity cost over the window, and what following Acuitas was worth"
        right={(
          <div role="group" aria-label="Window" style={{ display: 'flex', gap: 4 }}>
            {[7, 30, 90].map((d) => (
              <Button key={d} variant={windowDays === d ? 'primary' : 'ghost'} onClick={() => setWindowDays(d)} style={{ padding: '5px 10px', fontSize: 12 }}>{d} days</Button>
            ))}
          </div>
        )}
        style={{ marginTop: 16 }}>
        <div style={grid(2, 18)}>
          <div style={{ minWidth: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '7px 4px' }}>RED unit-shifts</td>
                  <td style={{ padding: '7px 4px', color: theme.sub, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cost.redShifts} × {formatMoney(rates.redShiftCost)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cost.redCost)}</td>
                </tr>
                {Object.entries(cost.bySource).filter(([, v]) => v.count).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '7px 4px' }}>Deployments — {DEPLOYMENT_SOURCES[k]}</td>
                    <td style={{ padding: '7px 4px', color: theme.sub, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{v.hours} h</td>
                    <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(v.cost)}</td>
                  </tr>
                ))}
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '7px 4px' }}>ED boarding hours</td>
                  <td style={{ padding: '7px 4px', color: theme.sub, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(cost.boardingHours)} × {formatMoney(rates.boardingHourCost)}</td>
                  <td style={{ padding: '7px 4px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cost.boardingCost)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '9px 4px', fontWeight: 800 }}>Total, last {windowDays} days</td>
                  <td />
                  <td style={{ padding: '9px 4px', textAlign: 'right', fontWeight: 800, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(cost.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Value from followed plans (all recorded plans)</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: theme.panelAlt }}>
                <div style={{ fontSize: 12, color: theme.sub }}>Model estimate</div>
                <div style={{ fontFamily: theme.display, fontSize: 22, fontWeight: 800, color: '#1f7a54' }}>{formatMoney(realized.modeledValue)}</div>
                <div style={{ fontSize: 11.5, color: theme.sub }}>{realized.modeledRedAvoided.toFixed(1)} RED shifts avoided, by the drop in predicted risk across {realized.followedMoves} followed moves</div>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: theme.panelAlt }}>
                <div style={{ fontSize: 12, color: theme.sub }}>Observed estimate</div>
                <div style={{ fontFamily: theme.display, fontSize: 22, fontWeight: 800, color: realized.observedValue == null ? theme.sub : '#1f7a54' }}>
                  {realized.observedValue == null ? 'Not enough data yet' : formatMoney(realized.observedValue)}
                </div>
                <div style={{ fontSize: 11.5, color: theme.sub }}>
                  {realized.observedValue == null
                    ? 'Needs 5 or more outcomes for both followed and unfollowed moves.'
                    : `${realized.observedRedAvoided.toFixed(1)} RED shifts avoided, from the observed gap between followed and unfollowed moves`}
                </div>
              </div>
            </div>
          </div>
        </div>

        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            Cost rates {rawRates && JSON.stringify(normalizeRates(rawRates)) === JSON.stringify(DEFAULT_COST_RATES) && <span style={{ color: '#8a6a10', fontWeight: 600 }}>— illustrative defaults; replace with your finance figures</span>}
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 10 }}>
            {RATE_FIELDS.map(([k, label, unit]) => (
              <Field key={k} label={`${label} (${unit})`}>
                <input id={`rate-${k}`} type="number" min="0" step="1" disabled={!canEditRates} value={rates[k]}
                  onChange={(e) => setRates({ ...rates, [k]: e.target.value === '' ? 0 : Number(e.target.value) })} />
              </Field>
            ))}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 12.5, lineHeight: 1.45 }}>
            <input type="checkbox" disabled={!canEditRates} checked={rates.floatOnShift}
              onChange={(e) => setRates({ ...rates, floatOnShift: e.target.checked })} style={{ marginTop: 3 }} />
            <span>
              <strong>Float pool is already on shift.</strong> Deploying a float adds no new labor to a plan&rsquo;s cost. Turn
              this off if your floats are per diem and called in only when needed.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
            {canEditRates && <Button variant="ghost" onClick={() => setRates(DEFAULT_COST_RATES)}>Reset to defaults</Button>}
            <span style={{ fontSize: 11, color: theme.sub }}>
              {canEditRates ? 'Rates are shared with everyone and used across Acuitas, including the plan value in the Command Center.' : 'Only an administrator or the quality & finance role can change rates.'}
            </span>
          </div>
        </details>
      </Card>

      <Card title="Recorded plans" sub="Each plan, scored against the deployments logged and the reading that followed" style={{ marginTop: 16 }}>
        {evaluations.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>
            No plans recorded yet. In the Command Center, choose <strong>Record this plan</strong> when you act on a recommendation.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {evaluations.slice(0, 12).map((ev) => (
              <div key={ev.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: '9px 11px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                  <strong>{ev.targetDate} · {ev.targetShift} shift</strong>
                  <span style={{ color: theme.sub, fontSize: 11.5 }}>{ev.mode === 'forecast' ? 'Next-shift plan' : 'Act-now plan'} · {ev.floatStaff} float · recorded by {ev.recordedBy || 'unknown'}</span>
                </div>
                <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                  {ev.moves.map((m, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
                      <span>{m.staff} × {m.fromName} → <strong>{m.toName}</strong> <span style={{ color: theme.sub }}>· predicted RED {pct(m.pRedBefore)} → {pct(m.pRedAfter)}</span></span>
                      <span style={{ display: 'flex', gap: 5 }}>
                        <Pill color={FOLLOW_COLOR[m.followed]}>{FOLLOW_LABEL[m.followed]}{m.followed === 'partial' ? ` (${m.deployed}/${m.staff})` : ''}</Pill>
                        <Pill color={m.outcome === 'red' ? STAGE_COLORS.RED : m.outcome === 'avoided' ? '#1f7a54' : theme.sub}>
                          {m.actualStage && m.outcome !== 'pending' ? `${OUTCOME_LABEL[m.outcome]} · ${m.actualStage}` : OUTCOME_LABEL[m.outcome]}
                        </Pill>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {evaluations.length > 12 && <div style={{ fontSize: 11.5, color: theme.sub }}>Showing the 12 most recent of {evaluations.length}.</div>}
          </div>
        )}
      </Card>

      <Card title="Outpatient placement outcomes" sub="AcuiPath placements tracked to first visit, 30-day retention and step-up" style={{ marginTop: 16 }}>
        <div style={{ ...grid(4), marginBottom: 12 }}>
          {[
            ['Placements tracked', opSummary.overall.tracked],
            ['Attended first visit', pct(opSummary.overall.attendedRate)],
            ['In care at 30 days', pct(opSummary.overall.retainedRate)],
            ['Needed a higher level', pct(opSummary.overall.stepUpRate)],
          ].map(([l, v]) => (
            <div key={l} style={{ padding: '9px 11px', borderRadius: 10, background: theme.panelAlt }}>
              <div style={{ fontSize: 11, color: theme.sub }}>{l}</div>
              <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 19 }}>{v}</div>
            </div>
          ))}
        </div>
        {prompts.length > 0 ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {prompts.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.5, padding: '8px 10px', borderRadius: 9, background: p.severity === 'review' ? '#e0b34118' : theme.panelAlt }}>
                <Icon name={p.severity === 'review' ? 'alert' : 'help'} size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{p.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: theme.sub }}>No threshold review prompts. Outcomes are recorded and broken down in AcuiPath → Outcomes.</div>
        )}
      </Card>
    </div>
  )
}
