import React from 'react'
import { money, num, pct, fmtNum, COMPONENTS, PERIODS } from '../lib/engine.js'
import { Field, NumInput, Toggle, Callout, Ico } from './ui.jsx'

export default function FundsPage({ state, result, setFunds, setSettings, setControls, go }) {
  const { funds, settings, controls, period } = state
  const P = PERIODS[period]
  const pi = result.poolInfo
  const max = Math.max(pi.available, 1)
  const stubRate = num(settings.rate2026) * settings.rateUplift
  const ccfCalc = stubRate * num(settings.deptWRVUs)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Funds &amp; Setup</h1>
          <p>
            Enter the cumulative fund amounts Finance provides for <b>{P.long}</b>. The pool builds itself in the plan's required order —
            repayments, approved moonlighting, reserve, then carryforward — and splits 40 / 40 / 15 / 5.
          </p>
        </div>
        <button className="btn primary" onClick={() => go('faculty')}>
          Next: Faculty <Ico name="arrow" size={15} />
        </button>
      </div>

      <div className="grid g2">
        <div className="grid">
          {period === 'Quality' ? (
            <div className="card card-pad">
              <h2>
                <span className="ico"><Ico name="spark" size={15} /></span>Quality settlement
              </h2>
              <p className="hint">FY2027 quality funds are paid separately in February 2028. Enter only the amount the institution assigns to the January–June stub.</p>
              <div className="fields">
                <Field label="Quality funds released for the stub">
                  <NumInput prefix="$" value={funds.qualityRelease} onChange={(v) => setFunds('qualityRelease', v)} placeholder="0" />
                </Field>
                <Toggle checked={controls.qualityReleaseConfirmed} onChange={(v) => setControls('qualityReleaseConfirmed', v)} label="Release and stub allocation confirmed by the institution" />
              </div>
            </div>
          ) : (
            <>
              <div className="card card-pad">
                <h2>
                  <span className="ico"><Ico name="funds" size={15} /></span>Available funds
                </h2>
                <p className="hint">Cumulative for the period. Enter explicit zeros where an amount does not apply.</p>
                <div className="fields two">
                  <Field label="Budgeted / residual variable funds" hint="After guaranteed salary obligations">
                    <NumInput prefix="$" value={funds.budgetedResidual} onChange={(v) => setFunds('budgetedResidual', v)} placeholder="0" />
                  </Field>
                  <Field label="Above-budget funds" hint="Institutionally settled production above budget">
                    <NumInput prefix="$" value={funds.aboveBudget} onChange={(v) => setFunds('aboveBudget', v)} placeholder="0" />
                  </Field>
                </div>
              </div>

              <div className="card card-pad">
                <h2>
                  <span className="ico"><Ico name="ledger" size={15} /></span>Required deductions
                </h2>
                <p className="hint">Repayments come out of above-budget funds before anything is distributed.</p>
                <div className="fields two">
                  <Field label="Ramp-up support received" hint="50% is repaid automatically">
                    <NumInput prefix="$" value={funds.rampUpSupport} onChange={(v) => setFunds('rampUpSupport', v)} placeholder="0" />
                  </Field>
                  <Field label="Purchase service agreements" hint="100% is repaid">
                    <NumInput prefix="$" value={funds.psa} onChange={(v) => setFunds('psa', v)} placeholder="0" />
                  </Field>
                  <Field label="Resident moonlighting (incremental)" hint="Enter 0 if already netted from funds">
                    <NumInput prefix="$" value={funds.moonlighting} onChange={(v) => setFunds('moonlighting', v)} placeholder="0" />
                  </Field>
                  <Field label="Approved academic reserve" hint="Incremental amount not already taken">
                    <NumInput prefix="$" value={funds.academicReserve} onChange={(v) => setFunds('academicReserve', v)} placeholder="0" />
                  </Field>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Toggle checked={controls.moonlightingApproved} onChange={(v) => setControls('moonlightingApproved', v)} label="Moonlighting has specific written committee approval" sub="Funded directly from clinical funds, outside the 5% reserve" />
                </div>
              </div>

              <div className="card card-pad">
                <h2>
                  <span className="ico"><Ico name="save" size={15} /></span>Clinical compensatory funds &amp; carryforward
                </h2>
                <p className="hint">Used to test the 5% reserve limit and the carryforward cap.</p>
                <div className="fields two">
                  <Field label="2026 rate per wRVU" hint={stubRate ? `Authorized stub rate (× ${settings.rateUplift}): ${money(stubRate)}` : `Stub rate is this × ${settings.rateUplift}`}>
                    <NumInput prefix="$" value={settings.rate2026} onChange={(v) => setSettings('rate2026', v)} placeholder="optional" />
                  </Field>
                  <Field label="Department credited wRVUs (Jan–Jun)">
                    <NumInput value={settings.deptWRVUs} onChange={(v) => setSettings('deptWRVUs', v)} placeholder="optional" />
                  </Field>
                  <Field label="Actual six-month clinical compensatory funds" hint={ccfCalc ? `Calculated from rate × wRVUs: ${money(ccfCalc, { whole: true })}` : 'Or fill the two fields above to calculate it'}>
                    <NumInput prefix="$" value={funds.ccfActual} autoValue={ccfCalc ? Math.round(ccfCalc) : undefined} onChange={(v) => setFunds('ccfActual', v)} placeholder="0" />
                  </Field>
                  <Field label="Carryforward cap">
                    <NumInput prefix="$" value={settings.carryforwardCap} onChange={(v) => setSettings('carryforwardCap', v)} />
                  </Field>
                  <Field label="Carryforward opening balance">
                    <NumInput prefix="$" value={funds.cfOpening} onChange={(v) => setFunds('cfOpening', v)} placeholder="from ledger" />
                  </Field>
                  <Field label="Carryforward spent this period">
                    <NumInput prefix="$" value={funds.cfSpent} onChange={(v) => setFunds('cfSpent', v)} placeholder="0" />
                  </Field>
                </div>
              </div>
            </>
          )}

          <div className="card card-pad">
            <h2>
              <span className="ico"><Ico name="people" size={15} /></span>Targets &amp; thresholds
            </h2>
            <p className="hint">Department-wide defaults. Each faculty member's annual target fills in automatically as clinical FTE × the base target unless you enter one.</p>
            <div className="fields two">
              <Field label="Annual wRVU target per 1.0 cFTE" hint="Approved internal target — see Benchmarks for reference values">
                <NumInput value={settings.baseTargetPerCFTE} onChange={(v) => setSettings('baseTargetPerCFTE', v)} placeholder="e.g. 5,400" suffix="wRVU" />
              </Field>
              <Field label="75th-percentile productivity (annual)" hint={`${fmtNum(num(settings.productivityThresholdAnnual) * P.fraction)} for this period at 1.0 cFTE; strict "above" test`}>
                <NumInput value={settings.productivityThresholdAnnual} onChange={(v) => setSettings('productivityThresholdAnnual', v)} suffix="wRVU" />
              </Field>
            </div>
          </div>
        </div>

        <div className="grid" style={{ alignContent: 'start', position: 'sticky', top: 78 }}>
          <div className="card card-pad">
            <h2>How the pool builds</h2>
            <p className="hint">Updates as you type.</p>
            <div className="wf">
              {pi.steps.map((s, i) => {
                const w = (Math.abs(s.amount) / max) * 100
                return (
                  <div className="wf-row" key={i}>
                    <div className="wf-label">
                      {s.label}
                      <div className="wf-bar">
                        <i style={{ width: `${w}%`, left: 0, background: s.kind === 'in' ? 'var(--teal)' : '#e8a29b' }} />
                      </div>
                    </div>
                    <div className="wf-amt" style={{ color: s.amount < 0 ? 'var(--red)' : undefined }}>
                      {s.amount < 0 ? `(${money(-s.amount)})` : money(s.amount)}
                    </div>
                  </div>
                )
              })}
              <div className="wf-row wf-total">
                <div className="wf-label">
                  <b>Net variable pool</b>
                </div>
                <div className="wf-amt">{money(result.pool)}</div>
              </div>
            </div>
            {pi.carryforward && (pi.carryforward.opening > 0 || pi.carryforward.refill > 0) && (
              <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
                Carryforward: {money(pi.carryforward.opening - pi.carryforward.spent, { whole: true })} balance + {money(pi.carryforward.refill, { whole: true })} refill ={' '}
                <b>{money(pi.carryforward.ending, { whole: true })}</b> of {money(pi.carryforward.cap, { whole: true })} cap.
              </p>
            )}
          </div>

          <div className="card card-pad">
            <h2>Component split</h2>
            <div className="stack" style={{ margin: '10px 0 4px' }}>
              {COMPONENTS.map((c) => (
                <i key={c.key} style={{ width: `${settings.weights[c.key] * 100}%`, background: c.color }} />
              ))}
            </div>
            <div className="comp-cards" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
              {COMPONENTS.map((c) => (
                <div className="comp-card" key={c.key} style={{ '--cc': c.color }}>
                  <div className="lbl">
                    {c.label} · {pct(settings.weights[c.key])}
                  </div>
                  <div className="amt">{money(result.comp[c.key], { whole: true })}</div>
                </div>
              ))}
            </div>
          </div>

          {pi.checks.length > 0 && (
            <div className="callouts">
              {pi.checks.map((c, i) => (
                <Callout key={i} level={c.level}>
                  {c.text}
                </Callout>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
