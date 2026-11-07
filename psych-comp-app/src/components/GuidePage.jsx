import React from 'react'
import { COMPONENTS, pct } from '../lib/engine.js'
import { Ico } from './ui.jsx'

export default function GuidePage({ state, go }) {
  const w = state.settings.weights
  return (
    <div className="grid g3">
      <div className="card card-pad span2 guide">
        <h2 style={{ fontSize: 20 }}>How the plan pays</h2>
        <p>
          The January–June 2027 stub keeps 85% of clinical compensation as guaranteed biweekly pay and puts 15% into a performance pool paid quarterly, with a cumulative
          six-month reconciliation after Q2. Quality funds are measured over all of FY2027 and settled separately in February 2028.
        </p>

        <h3>1 · Build the net pool</h3>
        <ol>
          <li>Start with funded budgeted / residual variable dollars plus institutionally settled above-budget dollars.</li>
          <li>Repay 50% of ramp-up support and 100% of purchase service agreements out of above-budget funds.</li>
          <li>Deduct expressly approved resident moonlighting — budgeted funds first, outside the 5% reserve.</li>
          <li>Deduct the approved academic reserve, capped at 5% of actual six-month clinical compensatory funds.</li>
          <li>Refill carryforward from remaining above-budget funds, up to the $125,000 cap including the opening balance.</li>
        </ol>

        <h3>2 · Split it four ways</h3>
        <div className="stack" style={{ margin: '8px 0' }}>
          {COMPONENTS.map((c) => (
            <i key={c.key} style={{ width: `${w[c.key] * 100}%`, background: c.color }} />
          ))}
        </div>
        <ul>
          <li>
            <b>Target share ({pct(w.c1)})</b> — equal shares by eligible employed FTE for primary physicians at ≥ 95% of their internal target who are not on a guarantee.
          </li>
          <li>
            <b>Work above target ({pct(w.c2)})</b> — in proportion to positive wRVUs above target. Physicians, clinical psychologists and non-primary faculty all participate.
          </li>
          <li>
            <b>Academic ({pct(w.acad)})</b> — by FTE for primary faculty with a completed prior APR, at least four goals met and the 95% clinical floor. If fewer than 80% of that
            group qualifies, each award is capped at 5% of the academic component.
          </li>
          <li>
            <b>Citizenship ({pct(w.cit)})</b> — by FTE for primary physicians at the clinical floor with documented unfunded committee participation.
          </li>
        </ul>

        <h3>3 · Apply limits</h3>
        <ul>
          <li>If total cash would pass a physician's permitted pay limit, the equal share is reduced first. Those dollars go to higher producers with room under their own limits, in proportion to their wRVUs above target.</li>
          <li>Pay above the 75th percentile needs productivity above the 75th percentile (5,520 annual wRVUs at 1.0 cFTE) plus executive approval; above the 90th also needs board approval.</li>
          <li>Academic + citizenship payments can never exceed one-third of actual clinical payments (25% of the total).</li>
          <li>Every award is rounded down to the cent. Unused dollars stay undistributed — they never move between components.</li>
        </ul>

        <h3>4 · Reconcile and release</h3>
        <p>
          Prior payments are credited component by component. Overpayments put that person on hold rather than being recovered automatically. A modeled decrease of more than 5%
          against comparable 2026 pay needs a documented review before release.
        </p>
      </div>

      <div className="grid" style={{ alignContent: 'start' }}>
        <div className="card card-pad">
          <h2>Quick start</h2>
          <ol style={{ paddingLeft: 18, margin: '8px 0 0', lineHeight: 1.8 }}>
            <li>
              Load the <a href="#" onClick={(e) => (e.preventDefault(), go('bench'))}>benchmark workbook</a>
            </li>
            <li>Pick Q1, Stub or Quality at the top</li>
            <li>
              Enter <a href="#" onClick={(e) => (e.preventDefault(), go('funds'))}>funds from Finance</a>
            </li>
            <li>
              Import or add <a href="#" onClick={(e) => (e.preventDefault(), go('faculty'))}>faculty</a>
            </li>
            <li>Record prior payments (Stub only)</li>
            <li>
              Confirm approvals and review <a href="#" onClick={(e) => (e.preventDefault(), go('results'))}>results</a>
            </li>
            <li>Export to Excel and post to the ledger</li>
          </ol>
        </div>
        <div className="card card-pad">
          <h2>
            <Ico name="lock" size={16} /> Your data stays here
          </h2>
          <p className="hint" style={{ margin: 0 }}>
            Everything runs in your browser and saves only on this device. Use <b>Save scenario</b> at the bottom of the page to hand a file to Finance or a colleague.
          </p>
        </div>
        <div className="card card-pad">
          <h2>Note</h2>
          <p className="hint" style={{ margin: 0 }}>
            This calculator implements the proposed plan, including provisions that still need committee acceptance (the 80/20 weighting, quarterly formulas, the citizenship measure and the
            per-recipient APR cap). Validate results against the approved plan before payroll.
          </p>
        </div>
      </div>
    </div>
  )
}
