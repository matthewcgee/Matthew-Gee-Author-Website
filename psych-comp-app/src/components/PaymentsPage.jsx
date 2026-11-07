import React from 'react'
import { money, round2, num, PERIODS } from '../lib/engine.js'
import { NumInput, Ico, Callout } from './ui.jsx'

const COLS = [
  ['c1', 'Target share'],
  ['c2', 'Above target'],
  ['redist', 'Redistribution'],
  ['acad', 'Academic'],
  ['cit', 'Citizenship'],
]

export const nextLedgerId = (payments) => {
  const ids = new Set(payments.map((p) => p.id))
  let n = payments.length
  let id
  do id = `L${String(++n).padStart(3, '0')}`
  while (ids.has(id))
  return id
}

export default function PaymentsPage({ state, result, set, go }) {
  const { payments, faculty, period } = state
  const names = Object.fromEntries(faculty.map((f) => [f.id, f.name || f.id]))
  const update = (id, patch) => set((s) => ({ payments: s.payments.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const add = () =>
    set((s) => ({
      payments: [
        ...s.payments,
        { id: nextLedgerId(s.payments), facultyId: faculty[0]?.id || '', pool: PERIODS[period].pool, period: period === 'Stub' ? 'Q1' : period, payDate: new Date().toISOString().slice(0, 10), c1: '', c2: '', redist: '', acad: '', cit: '' },
      ],
    }))
  const remove = (id) => set((s) => ({ payments: s.payments.filter((x) => x.id !== id) }))
  const credited = period === 'Q1' ? 'Regular · Q1' : period === 'Stub' ? 'Regular · Q1 and Stub' : 'Quality only'
  const orphans = payments.filter((p) => !names[p.facultyId])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Prior Payments</h1>
          <p>
            The payment ledger keeps each component's prior payments so cumulative earnings are credited exactly once. For this run, entries for <b>{credited}</b> are credited. Use{' '}
            <b>Post to ledger</b> on Results to add a payroll run automatically.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={add} disabled={!faculty.length}>
            <Ico name="plus" size={15} /> Add payment
          </button>
          <button className="btn primary" onClick={() => go('results')}>
            Next: Results <Ico name="arrow" size={15} />
          </button>
        </div>
      </div>

      {orphans.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Callout level="warn">{orphans.length} ledger entr{orphans.length === 1 ? 'y does' : 'ies do'} not match any current faculty ID.</Callout>
        </div>
      )}

      <div className="card">
        {!payments.length ? (
          <div className="empty">
            <div className="big">
              <Ico name="ledger" size={40} stroke={1.5} />
            </div>
            <h3>No prior payments</h3>
            <p>That's expected for Q1. For the six-month close, record what was paid for Q1 — or post it from Results when you run Q1.</p>
            <button className="btn primary" onClick={add} disabled={!faculty.length} style={{ marginTop: 10 }}>
              <Ico name="plus" size={15} /> Add a payment
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Pool</th>
                  <th>Earning period</th>
                  <th>Pay date</th>
                  {COLS.map(([k, l]) => (
                    <th key={k} style={{ minWidth: 120 }}>
                      {l}
                    </th>
                  ))}
                  <th className="r">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((x) => {
                  const total = round2(COLS.reduce((s, [k]) => s + num(x[k]), 0))
                  return (
                    <tr className="row" key={x.id}>
                      <td>
                        <select className="input sm" value={x.facultyId} onChange={(e) => update(x.id, { facultyId: e.target.value })} style={{ minWidth: 160 }}>
                          {!names[x.facultyId] && <option value={x.facultyId}>{x.facultyId || '— choose —'}</option>}
                          {faculty.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name || f.id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select className="input sm" value={x.pool} onChange={(e) => update(x.id, { pool: e.target.value, period: e.target.value === 'Quality' ? 'Quality' : x.period === 'Quality' ? 'Q1' : x.period })}>
                          <option>Regular</option>
                          <option>Quality</option>
                        </select>
                      </td>
                      <td>
                        <select className="input sm" value={x.period} onChange={(e) => update(x.id, { period: e.target.value })}>
                          {x.pool === 'Quality' ? (
                            <option>Quality</option>
                          ) : (
                            <>
                              <option value="Q1">Q1 (Jan–Mar)</option>
                              <option value="Stub">Stub (Jan–Jun)</option>
                            </>
                          )}
                        </select>
                      </td>
                      <td>
                        <input className="input sm" type="date" value={x.payDate || ''} onChange={(e) => update(x.id, { payDate: e.target.value })} />
                      </td>
                      {COLS.map(([k]) => (
                        <td key={k}>
                          <NumInput size="sm" prefix="$" value={x[k]} onChange={(v) => update(x.id, { [k]: v })} placeholder="0" />
                        </td>
                      ))}
                      <td className="r num" style={{ fontWeight: 700 }}>
                        {money(total)}
                      </td>
                      <td>
                        <button className="icon-btn" title="Delete" onClick={() => remove(x.id)}>
                          <Ico name="trash" size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Ledger total</td>
                  {COLS.map(([k]) => (
                    <td key={k} className="num">
                      {money(payments.reduce((s, x) => s + num(x[k]), 0))}
                    </td>
                  ))}
                  <td className="r num">{money(payments.reduce((s, x) => s + COLS.reduce((t, [k]) => t + num(x[k]), 0), 0))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      {payments.length > 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          Credited against this run: <b>{money(result.totals.prior)}</b>. A Q1 payment paid in April still has earning period Q1.
        </p>
      )}
    </>
  )
}
