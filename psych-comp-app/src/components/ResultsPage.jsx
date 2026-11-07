import React, { Fragment, useState } from 'react'
import { money, pct, fmtNum, COMPONENTS, CATEGORIES, PERIODS } from '../lib/engine.js'
import { exportResults } from '../lib/io.js'
import { Callout, Toggle, Ico } from './ui.jsx'
import { EligChips } from './FacultyPage.jsx'
import { nextLedgerId } from './PaymentsPage.jsx'

const STATUS = {
  'Ready for payroll': 'green',
  'Hold for review': 'red',
  'Awaiting approvals': 'amber',
  'Nothing due': 'gray',
}

export default function ResultsPage({ state, result, set, setControls, notify, go }) {
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('all')
  const { period, settings } = state
  const P = PERIODS[period]
  const r = result

  const postToLedger = () => {
    const rows = r.people.filter((p) => p.ready && p.release.total > 0)
    if (!rows.length) return notify('Nothing is ready for payroll')
    if (!confirm(`Append ${rows.length} payroll entr${rows.length === 1 ? 'y' : 'ies'} totaling ${money(r.totals.release)} to the payment ledger?`)) return
    set((s) => {
      const payments = [...s.payments]
      const today = new Date().toISOString().slice(0, 10)
      rows.forEach((p) => {
        payments.push({ id: nextLedgerId(payments), facultyId: p.f.id, pool: P.pool, period, payDate: today, c1: p.release.c1, c2: p.release.c2, redist: p.release.redist, acad: p.release.acad, cit: p.release.cit })
      })
      return { payments }
    })
    notify('Posted to ledger — balances now show what remains')
  }

  const people = r.people.filter((p) => filter === 'all' || (filter === 'hold' ? p.hold : filter === 'ready' ? p.status === 'Ready for payroll' : p.earned.total > 0))
  const allocated = COMPONENTS.map((c) => ({
    ...c,
    pool: r.comp[c.key],
    paid: r.totals[c.key] + (c.key === 'c1' ? r.totals.redist : 0),
  }))

  if (!state.faculty.length)
    return (
      <div className="card">
        <div className="empty">
          <div className="big">
            <Ico name="results" size={40} stroke={1.5} />
          </div>
          <h3>Results appear here</h3>
          <p>Enter funds and add faculty — every payout is calculated instantly.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button className="btn" onClick={() => go('funds')}>
              Enter funds
            </button>
            <button className="btn primary" onClick={() => go('faculty')}>
              Add faculty
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Results &amp; Payroll · {P.long}</h1>
          <p>Every award is calculated with the exact plan weights, rounded down to the cent, credited for prior payments and checked against approvals and pay limits.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => window.print()}>
            <Ico name="print" size={15} /> Print
          </button>
          <button className="btn" onClick={() => exportResults(r, state)}>
            <Ico name="download" size={15} /> Excel
          </button>
          <button className="btn primary" onClick={postToLedger} disabled={!r.totals.release}>
            <Ico name="ledger" size={15} /> Post to ledger
          </button>
        </div>
      </div>

      <div className="comp-cards" style={{ marginBottom: 16 }}>
        {allocated.map((c) => (
          <div key={c.key} className="comp-card" style={{ '--cc': c.color }}>
            <div className="lbl">
              {c.label} · {pct(settings.weights[c.key])}
            </div>
            <div className="amt">{money(c.paid, { whole: true })}</div>
            <div className="sub">
              of {money(c.pool, { whole: true })} · {c.pool > 0 ? pct(c.paid / c.pool) : '—'} distributed
            </div>
            <div className="meter" style={{ marginTop: 8 }}>
              <i style={{ width: `${c.pool > 0 ? Math.min(100, (c.paid / c.pool) * 100) : 0}%`, background: c.color }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h2>Payroll release checklist</h2>
          <p className="hint">Nothing is marked ready until these are confirmed.</p>
          <div className="checklist">
            {r.controlChecks.map((c) => (
              <Toggle key={c.key} checked={c.ok} onChange={(v) => setControls(c.key, v)} label={c.text} />
            ))}
          </div>
          {r.poolInfo.checks.some((c) => c.level === 'hold') && (
            <div style={{ marginTop: 8 }}>
              <Callout level="hold">Resolve the funding checks on Funds &amp; Setup.</Callout>
            </div>
          )}
        </div>
        <div className="card card-pad">
          <h2>Reconciliation</h2>
          <p className="hint">Dollars in = dollars out.</p>
          <table className="t" style={{ fontSize: 13 }}>
            <tbody>
              <Rec label="Net variable pool" v={r.pool} strong />
              <Rec label="Earned by faculty" v={r.totals.earned} />
              <Rec label="Undistributed / awaiting disposition" v={r.undistributed} />
              <Rec label="Prior payments credited" v={r.totals.prior} />
              <Rec label="Held for review" v={r.totals.held} />
              <Rec label="Ready for payroll" v={r.totals.release} strong green />
            </tbody>
          </table>
        </div>
        <div className="card card-pad">
          <h2>What shaped this run</h2>
          <p className="hint">Plan rules that changed the math.</p>
          <div className="callouts">
            {r.notes.length ? (
              r.notes.map((n, i) => (
                <Callout key={i} level="info">
                  {n}
                </Callout>
              ))
            ) : (
              <Callout level="ok">Every component distributed with no caps or limits triggered.</Callout>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="segmented">
            {[
              ['all', 'Everyone'],
              ['earning', 'Earning'],
              ['ready', 'Ready'],
              ['hold', `Holds (${r.people.filter((p) => p.hold).length})`],
            ].map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <span className="hint" style={{ margin: 0 }}>
            Click a row to see exactly how it was calculated.
          </span>
        </div>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Earning</th>
                {COMPONENTS.map((c) => (
                  <th key={c.key} className="r">
                    {c.short}
                  </th>
                ))}
                <th className="r">Earned</th>
                <th className="r">Prior paid</th>
                <th className="r">Release</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <Fragment key={p.f.id}>
                  <tr className="row clickable" onClick={() => setOpen(open === p.f.id ? null : p.f.id)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Ico name="chev" size={14} style={{ transform: open === p.f.id ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--muted)' }} />
                        <div className="who">
                          <b>{p.f.name || p.f.id}</b>
                          <small>
                            {CATEGORIES[p.f.category].short} · {p.attain === null ? 'no target' : `${pct(p.attain)} of target`}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <EligChips p={p} />
                    </td>
                    <td className="r num">{money(p.earned.c1 + p.earned.redist)}</td>
                    <td className="r num">{money(p.earned.c2)}</td>
                    <td className="r num">{money(p.earned.acad)}</td>
                    <td className="r num">{money(p.earned.cit)}</td>
                    <td className="r num" style={{ fontWeight: 800 }}>
                      {money(p.earned.total)}
                    </td>
                    <td className="r num" style={{ color: 'var(--muted)' }}>
                      {p.prior.total ? `(${money(p.prior.total)})` : '—'}
                    </td>
                    <td className="r num" style={{ fontWeight: 800, color: p.release.total ? 'var(--green)' : undefined }}>
                      {money(p.release.total)}
                    </td>
                    <td>
                      <span className={`badge ${STATUS[p.status]}`}>{p.status}</span>
                    </td>
                  </tr>
                  {open === p.f.id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0 }}>
                        <Detail p={p} r={r} settings={settings} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="r num">{money(r.totals.c1 + r.totals.redist)}</td>
                <td className="r num">{money(r.totals.c2)}</td>
                <td className="r num">{money(r.totals.acad)}</td>
                <td className="r num">{money(r.totals.cit)}</td>
                <td className="r num">{money(r.totals.earned)}</td>
                <td className="r num">{r.totals.prior ? `(${money(r.totals.prior)})` : '—'}</td>
                <td className="r num" style={{ color: 'var(--green)' }}>
                  {money(r.totals.release)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  )
}

const Rec = ({ label, v, strong, green }) => (
  <tr>
    <td style={{ padding: '7px 0', fontWeight: strong ? 700 : 400 }}>{label}</td>
    <td className="r num" style={{ padding: '7px 0', fontWeight: strong ? 800 : 600, color: green ? 'var(--green)' : undefined }}>
      {money(v)}
    </td>
  </tr>
)

function Detail({ p, r, settings }) {
  const d = r.denominators
  const rows = [
    {
      l: 'Clinical floor',
      f: p.hasTarget ? `${fmtNum(p.W)} ÷ ${fmtNum(p.T)} target` : 'no valid target',
      v: p.attain === null ? '—' : `${pct(p.attain, 1)} ${p.meetsFloor ? '✓' : '✗'}`,
      zero: !p.meetsFloor,
    },
    {
      l: 'Target share',
      f: p.elig1 ? `${money(r.comp.c1)} × ${fmtNum(p.F, 3)} FTE ÷ ${fmtNum(d.sF1, 3)}${p.c1Withheld > 0 ? ` − ${money(p.c1Withheld)} pay limit` : ''}` : p.why.c1,
      v: money(p.earned.c1),
      zero: !p.earned.c1,
    },
    p.earned.redist > 0 && { l: 'Redistribution', f: `withheld equal shares × ${fmtNum(p.X)} excess wRVUs`, v: money(p.earned.redist) },
    {
      l: 'Above target',
      f: p.elig2 ? `${money(r.comp.c2)} × ${fmtNum(p.X)} ÷ ${fmtNum(d.sX)} excess wRVUs` : p.why.c2,
      v: money(p.earned.c2),
      zero: !p.earned.c2,
    },
    {
      l: 'Academic',
      f: p.eligA ? `${money(r.comp.acad)} × ${fmtNum(p.F, 3)} ÷ ${fmtNum(d.sFA, 3)}${p.acadCapped ? ` · capped at ${money(r.academic.cap)}` : ''}${r.ncScale < 1 ? ` · × ${pct(r.ncScale, 1)}` : ''}` : p.why.acad,
      v: money(p.earned.acad),
      zero: !p.earned.acad,
    },
    {
      l: 'Citizenship',
      f: p.eligC ? `${money(r.comp.cit)} × ${fmtNum(p.F, 3)} ÷ ${fmtNum(d.sFC, 3)}${r.ncScale < 1 ? ` · × ${pct(r.ncScale, 1)}` : ''}` : p.why.cit,
      v: money(p.earned.cit),
      zero: !p.earned.cit,
    },
  ].filter(Boolean)

  return (
    <div className="detail">
      <div>
        <div className="section-title">How this was calculated</div>
        <div className="math">
          {rows.map((x, i) => (
            <div key={i} className={`math-row ${x.zero ? 'zero' : ''}`}>
              <span className="ml">{x.l}</span>
              <span className="mf">{x.f}</span>
              <span className="mv">{x.v}</span>
            </div>
          ))}
          {p.prior.total > 0 && (
            <div className="math-row">
              <span className="ml">Prior payments</span>
              <span className="mf">credited by component from the ledger</span>
              <span className="mv">({money(p.prior.total)})</span>
            </div>
          )}
          <div className="math-row" style={{ borderColor: 'var(--teal)' }}>
            <span className="ml">Balance</span>
            <span className="mf">{p.ready ? 'released to payroll' : p.status.toLowerCase()}</span>
            <span className="mv" style={{ color: 'var(--teal-700)' }}>
              {money(p.balance.total)}
            </span>
          </div>
        </div>
      </div>
      <div>
        <div className="section-title">Pay &amp; benchmarks</div>
        <div className="math">
          <div className="math-row">
            <span className="ml">Period cash</span>
            <span className="mf">other cash {money(p.otherCash, { whole: true })} + variable</span>
            <span className="mv">{money(p.periodCash, { whole: true })}</span>
          </div>
          <div className="math-row">
            <span className="ml">Pay limit</span>
            <span className="mf">{p.limitSource === 'validated' ? 'validated by Finance' : p.limitSource === 'none' ? 'not available' : `${p.limitSource} · ${p.specialty}, ${p.f.rank}`}</span>
            <span className="mv">{p.limit === null ? '—' : money(p.limit, { whole: true })}</span>
          </div>
          <div className="math-row">
            <span className="ml">Pay percentile</span>
            <span className="mf">{money(p.cashPerFTE, { whole: true })} annualized per FTE</span>
            <span className="mv">{p.tccPct?.label || '—'}</span>
          </div>
          <div className="math-row">
            <span className="ml">wRVU percentile</span>
            <span className="mf">{fmtNum(p.annualWperCFTE)} annualized per cFTE</span>
            <span className="mv">{p.wrvuPct?.label || '—'}</span>
          </div>
          {p.change2026 !== null && p.change2026 !== undefined && (
            <div className="math-row">
              <span className="ml">vs. 2026</span>
              <span className="mf">annualized vs comparable 2026 cash</span>
              <span className="mv" style={{ color: p.change2026 < -settings.decreaseReviewPct ? 'var(--red)' : undefined }}>
                {p.change2026 >= 0 ? '+' : ''}
                {pct(p.change2026, 1)}
              </span>
            </div>
          )}
        </div>
        {p.flags.length > 0 && (
          <div className="callouts" style={{ marginTop: 10 }}>
            {p.flags.map((x, i) => (
              <Callout key={i} level={x.level}>
                {x.text}
              </Callout>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
