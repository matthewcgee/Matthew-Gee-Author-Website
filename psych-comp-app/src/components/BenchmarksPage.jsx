import React from 'react'
import { money, fmtNum, RANKS, num } from '../lib/engine.js'
import { importBenchmarks } from '../lib/io.js'
import { DropZone, Callout, Ico, FileButton } from './ui.jsx'

const latest = (rows, key = 'year') => {
  const m = new Map()
  rows.forEach((r) => {
    const k = r.specialty + '|' + (r.rank || '')
    const cur = m.get(k)
    if (!cur || String(r[key]) > String(cur[key])) m.set(k, r)
  })
  return [...m.values()]
}

export default function BenchmarksPage({ state, bench, setBench, setSettings, notify }) {
  const onFile = async (f) => {
    try {
      const b = await importBenchmarks(f)
      setBench(b)
      notify(`Benchmarks loaded: ${b.aamc.length + b.cpsc.length + b.sc.length + b.blend.length} rows`)
    } catch (e) {
      notify(e.message)
    }
  }

  const aamc = bench ? latest(bench.aamc).filter((r) => r.p75 > 0) : []
  const specialties = [...new Set(aamc.map((r) => r.specialty))]
  const cpsc = bench ? latest(bench.cpsc) : []
  const sc = bench ? latest(bench.sc) : []
  const suggestions = []
  if (bench) {
    bench.blend.forEach((b) => b.values.forEach((v) => v.wrvu && suggestions.push({ label: `${b.subspecialty} · ${v.source.split(' - ')[0].split(',')[0]} P50`, v: Math.round(v.wrvu) })))
    const psych = cpsc.find((r) => /^psychiatry$/i.test(r.specialty))
    if (psych) {
      suggestions.push({ label: `CPSC ${psych.year} Psychiatry P50`, v: Math.round(psych.p50) })
    }
  }
  const psych75 = cpsc.find((r) => /^psychiatry$/i.test(r.specialty))?.p75

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Benchmarks</h1>
          <p>
            Load the annual benchmark workbook once. It drives the 75th / 90th percentile pay-limit checks, percentile estimates and target suggestions. Survey data is licensed, so it stays
            in this browser and is never published with the site.
          </p>
        </div>
        {bench && (
          <div style={{ display: 'flex', gap: 8 }}>
            <FileButton accept=".xlsx" onFile={onFile}>
              <Ico name="upload" size={15} /> Replace workbook
            </FileButton>
            <button className="btn danger" onClick={() => confirm('Remove benchmarks from this device?') && setBench(null)}>
              <Ico name="trash" size={15} /> Remove
            </button>
          </div>
        )}
      </div>

      {!bench ? (
        <div className="card card-pad">
          <DropZone accept=".xlsx" onFile={onFile}>
            <div style={{ color: 'var(--teal-700)', marginBottom: 8 }}>
              <Ico name="bench" size={34} stroke={1.6} />
            </div>
            <b>Drop the benchmark workbook here</b> or click to choose it
            <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>Reads the AAMC, CPSC, Sullivan Cotter / MGMA blend and two-year blend tabs automatically.</div>
          </DropZone>
          <div style={{ marginTop: 14 }}>
            <Callout level="info">Without benchmarks the calculator still works — enter each person's validated pay limit on their faculty record instead.</Callout>
          </div>
        </div>
      ) : (
        <div className="grid">
          <Callout level="ok">
            <b>{bench.source}</b> loaded {new Date(bench.importedAt).toLocaleDateString()} · {bench.aamc.length} AAMC rows · {bench.cpsc.length} productivity rows · {bench.sc.length} blend rows
          </Callout>

          <div className="grid g2">
            <div className="card card-pad">
              <h2>Base wRVU target per 1.0 cFTE</h2>
              <p className="hint">
                Current: <b>{state.settings.baseTargetPerCFTE ? fmtNum(state.settings.baseTargetPerCFTE) : 'not set'}</b>. Choose a reference value or keep your approved internal target.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {suggestions.map((s) => (
                  <button key={s.label} className={`btn sm ${num(state.settings.baseTargetPerCFTE) === s.v ? 'primary' : ''}`} onClick={() => setSettings('baseTargetPerCFTE', s.v)}>
                    {fmtNum(s.v)} <span style={{ fontWeight: 500, opacity: 0.8 }}>· {s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="card card-pad">
              <h2>75th-percentile productivity</h2>
              <p className="hint">
                The plan uses <b>{fmtNum(state.settings.productivityThresholdAnnual)}</b> annual wRVUs.
                {psych75 ? ` The workbook's CPSC Psychiatry P75 is ${fmtNum(psych75, 2)}.` : ''}
              </p>
              {psych75 && (
                <button className="btn sm" onClick={() => setSettings('productivityThresholdAnnual', Math.round(psych75))}>
                  Use {fmtNum(Math.round(psych75))}
                </button>
              )}
            </div>
          </div>

          {specialties.map((sp) => (
            <div className="card" key={sp}>
              <div className="card-head">
                <b>AAMC total compensation · {sp}</b>
                <span className="badge gray">{aamc.find((r) => r.specialty === sp)?.year}</span>
              </div>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th className="r">n</th>
                      <th className="r">P25</th>
                      <th className="r">P50</th>
                      <th className="r">P75 · approval line</th>
                      <th className="r">P90 · board line</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RANKS.map((rk) => {
                      const r = aamc.find((x) => x.specialty === sp && x.rank === rk)
                      if (!r) return null
                      return (
                        <tr key={rk}>
                          <td>{rk}</td>
                          <td className="r num">{fmtNum(r.n)}</td>
                          <td className="r num">{money(r.p25, { whole: true })}</td>
                          <td className="r num">{money(r.p50, { whole: true })}</td>
                          <td className="r num" style={{ fontWeight: 700 }}>
                            {money(r.p75, { whole: true })}
                          </td>
                          <td className="r num">{money(r.p90, { whole: true })}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="grid g2">
            <div className="card">
              <div className="card-head">
                <b>Productivity · wRVU per cFTE</b>
              </div>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Specialty</th>
                      <th className="r">P25</th>
                      <th className="r">P50</th>
                      <th className="r">P75</th>
                      <th className="r">P90</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cpsc.map((r) => (
                      <tr key={r.specialty}>
                        <td>
                          {r.specialty} <span className="badge gray">{r.year}</span>
                        </td>
                        <td className="r num">{fmtNum(r.p25)}</td>
                        <td className="r num">{fmtNum(r.p50)}</td>
                        <td className="r num">{fmtNum(r.p75)}</td>
                        <td className="r num">{fmtNum(r.p90)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <b>Staff physician blend · subspecialties</b>
              </div>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Subspecialty</th>
                      <th className="r">TCC P50</th>
                      <th className="r">TCC P75</th>
                      <th className="r">wRVU P50</th>
                      <th className="r">wRVU P75</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sc
                      .filter((r) => /psychiatry/i.test(r.specialty))
                      .map((r) => (
                        <tr key={r.specialty}>
                          <td>{r.specialty.replace('Psychiatry - ', '')}</td>
                          <td className="r num">{r.tcc.p50 ? money(r.tcc.p50, { whole: true }) : '—'}</td>
                          <td className="r num">{r.tcc.p75 ? money(r.tcc.p75, { whole: true }) : '—'}</td>
                          <td className="r num">{r.wrvu.p50 ? fmtNum(r.wrvu.p50) : '—'}</td>
                          <td className="r num">{r.wrvu.p75 ? fmtNum(r.wrvu.p75) : '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
