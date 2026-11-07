import React, { useMemo, useState } from 'react'
import { blankFaculty, CATEGORIES, COMPONENTS, RANKS, PERIODS, money, pct, fmtNum, num, defaultSpecialty, isBlank } from '../lib/engine.js'
import { importFaculty, downloadTemplate } from '../lib/io.js'
import { Field, NumInput, Toggle, Stepper, Meter, Callout, FileButton, DropZone, Ico } from './ui.jsx'

const nextId = (faculty) => {
  const ids = new Set(faculty.map((f) => f.id))
  let n = faculty.length
  let id
  do id = `F${String(++n).padStart(3, '0')}`
  while (ids.has(id))
  return id
}

export function EligChips({ p }) {
  return (
    <span className="chips">
      {COMPONENTS.map((c, i) => {
        const on = p.earned[c.key] > 0 || (c.key === 'c1' && p.earned.redist > 0)
        return (
          <span key={c.key} className={`chip ${on ? 'on' : ''}`} style={on ? { background: c.color } : undefined} title={`${c.label}: ${on ? 'earned' : p.why[c.key] || 'not earned'}`}>
            {['T', 'X', 'A', 'C'][i]}
          </span>
        )
      })}
    </span>
  )
}

export default function FacultyPage({ state, bench, result, set, notify, go }) {
  const [editing, setEditing] = useState(null)
  const [q, setQ] = useState('')
  const { faculty, period } = state
  const P = PERIODS[period]
  const byId = useMemo(() => Object.fromEntries(result.people.map((p) => [p.f.id, p])), [result])

  const update = (id, patch) => set((s) => ({ faculty: s.faculty.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  const add = () => {
    const id = nextId(faculty)
    set((s) => ({ faculty: [...s.faculty, blankFaculty(id)] }))
    setEditing(id)
  }
  const remove = (id) => {
    if (!confirm('Remove this faculty member? Their ledger entries are kept.')) return
    set((s) => ({ faculty: s.faculty.filter((f) => f.id !== id) }))
    setEditing(null)
  }
  const duplicate = (f) => {
    const id = nextId(faculty)
    set((s) => ({ faculty: [...s.faculty, { ...f, id, name: f.name ? `${f.name} (copy)` : '' }] }))
    setEditing(id)
  }
  const onImport = async (file) => {
    try {
      const { faculty: rows, matched } = await importFaculty(file, new Set(faculty.map((f) => f.id)))
      if (!rows.length) throw new Error('No faculty rows found.')
      set((s) => {
        const map = new Map(s.faculty.map((f) => [f.id, f]))
        rows.forEach((r) => map.set(r.id, { ...(map.get(r.id) || {}), ...r }))
        return { faculty: [...map.values()] }
      })
      notify(`Imported ${rows.length} faculty (${matched} columns matched)`)
    } catch (e) {
      notify(e.message)
    }
  }

  const shown = faculty.filter((f) => !q || `${f.name} ${f.id}`.toLowerCase().includes(q.toLowerCase()))
  const wKey = period === 'Q1' ? 'wrvuQ1' : 'wrvuStub'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Faculty</h1>
          <p>
            Add each participant once. Targets, eligible service, eligibility and pay limits are worked out automatically — type actual wRVUs right in the table, or open a row for everything else.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => downloadTemplate(faculty)}>
            <Ico name="download" size={15} /> {faculty.length ? 'Export roster' : 'Template'}
          </button>
          <FileButton accept=".xlsx,.csv" onFile={onImport}>
            <Ico name="upload" size={15} /> Import spreadsheet
          </FileButton>
          <button className="btn primary" onClick={add}>
            <Ico name="plus" size={15} /> Add faculty
          </button>
        </div>
      </div>

      {!faculty.length ? (
        <div className="card">
          <div className="empty">
            <div className="big">
              <Ico name="people" size={40} stroke={1.5} />
            </div>
            <h3>No faculty yet</h3>
            <p>Import your roster from Excel or CSV, or add people one at a time.</p>
            <div style={{ maxWidth: 520, margin: '18px auto 0' }}>
              <DropZone accept=".xlsx,.csv" onFile={onImport}>
                <b>Drop a roster spreadsheet here</b> or click to choose a file
                <div className="hint" style={{ marginTop: 6, marginBottom: 0, color: 'var(--muted)', fontSize: 12.5 }}>
                  Column names are matched automatically — download the template for the ideal layout.
                </div>
              </DropZone>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
                <button className="btn" onClick={() => downloadTemplate([])}>
                  <Ico name="download" size={15} /> Download template
                </button>
                <button className="btn primary" onClick={add}>
                  <Ico name="plus" size={15} /> Add first faculty member
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="hint" style={{ margin: 0 }}>
              Showing {P.long} · <b>T</b> target share · <b>X</b> above target · <b>A</b> academic · <b>C</b> citizenship
            </span>
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Category</th>
                  <th className="r">cFTE</th>
                  <th className="r">Period target</th>
                  <th style={{ width: 130 }}>Actual wRVUs</th>
                  <th style={{ width: 170 }}>Attainment</th>
                  <th>Earning</th>
                  <th className="r">Earned</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((f) => {
                  const p = byId[f.id]
                  if (!p) return null
                  const att = p.attain
                  const color = att === null ? '#c4cbd0' : att >= 1 ? 'var(--green)' : att >= state.settings.floor ? 'var(--teal)' : 'var(--amber)'
                  return (
                    <tr className="row" key={f.id}>
                      <td className="clickable" onClick={() => setEditing(f.id)}>
                        <div className="who">
                          <b>{f.name || <span style={{ color: 'var(--muted)' }}>Unnamed</span>}</b>
                          <small>
                            {f.id} · {f.rank}
                            {p.elig < 1 && ` · ${pct(p.elig)} service`}
                          </small>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${f.category === 'MD' ? 'teal' : f.category === 'PhD' ? 'blue' : 'gray'}`}>{CATEGORIES[f.category].short}</span>
                        {f.guarantee && (
                          <span className="badge amber" style={{ marginLeft: 4 }}>
                            Guarantee
                          </span>
                        )}
                      </td>
                      <td className="r num">{fmtNum(num(f.clinicalFTE), 2)}</td>
                      <td className="r num">{p.hasTarget ? fmtNum(p.T) : <span className="badge red">No target</span>}</td>
                      <td>
                        <NumInput size="sm" value={f[wKey]} onChange={(v) => update(f.id, { [wKey]: v })} placeholder="0" />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Meter value={att || 0} mark={state.settings.floor} color={color} />
                          <span className="num" style={{ fontWeight: 700, minWidth: 44, textAlign: 'right', color }}>
                            {att === null ? '—' : pct(att)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <EligChips p={p} />
                      </td>
                      <td className="r num" style={{ fontWeight: 700 }}>
                        {money(p.earned.total)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="icon-btn" title="Edit" onClick={() => setEditing(f.id)}>
                          <Ico name="edit" size={15} />
                        </button>
                        <button className="icon-btn" title="Duplicate" onClick={() => duplicate(f)}>
                          <Ico name="copy" size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={add}>
              <Ico name="plus" size={15} /> Add faculty
            </button>
            <button className="btn primary" onClick={() => go('payments')}>
              Next: Prior payments <Ico name="arrow" size={15} />
            </button>
          </div>
        </div>
      )}

      {editing && byId[editing] && (
        <FacultyDrawer
          f={faculty.find((x) => x.id === editing)}
          p={byId[editing]}
          state={state}
          bench={bench}
          onChange={(patch) => update(editing, patch)}
          onClose={() => setEditing(null)}
          onRemove={() => remove(editing)}
          onRename={(newId) => {
            if (!newId || faculty.some((x) => x.id === newId)) return notify('That ID is already in use')
            set((s) => ({
              faculty: s.faculty.map((x) => (x.id === editing ? { ...x, id: newId } : x)),
              payments: s.payments.map((x) => (x.facultyId === editing ? { ...x, facultyId: newId } : x)),
            }))
            setEditing(newId)
          }}
        />
      )}
    </>
  )
}

function FacultyDrawer({ f, p, state, bench, onChange, onClose, onRemove, onRename }) {
  const { settings, period } = state
  const P = PERIODS[period]
  const c = (k) => (v) => onChange({ [k]: v })
  const specialties = [...new Set((bench?.aamc || []).map((r) => r.specialty))]
  const autoTarget = num(f.clinicalFTE) * num(settings.baseTargetPerCFTE)
  const [idDraft, setIdDraft] = useState(f.id)
  React.useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Edit faculty">
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{f.name || 'New faculty member'}</div>
            <div className="hint" style={{ margin: 0 }}>
              {CATEGORIES[f.category].label} · changes save automatically
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Ico name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <div className="preview">
            <div>
              <div className="k">Attainment</div>
              <div className="v" style={{ color: p.meetsFloor ? 'var(--green)' : 'var(--amber)' }}>
                {p.attain === null ? '—' : pct(p.attain, 1)}
              </div>
            </div>
            <div>
              <div className="k">Earned ({P.label})</div>
              <div className="v">{money(p.earned.total)}</div>
            </div>
            <div>
              <div className="k">Components</div>
              <div style={{ marginTop: 4 }}>
                <EligChips p={p} />
              </div>
            </div>
          </div>

          <section>
            <div className="section-title">Identity</div>
            <div className="fields two">
              <Field label="Name or label">
                <input className="input" value={f.name} onChange={(e) => c('name')(e.target.value)} placeholder="e.g. Dr. Smith" autoFocus={!f.name} />
              </Field>
              <Field label="Unique ID" hint="Links this person to payment ledger entries">
                <input className="input" value={idDraft} onChange={(e) => setIdDraft(e.target.value.trim())} onBlur={() => idDraft !== f.id && onRename(idDraft)} />
              </Field>
              <Field label="Participation category">
                <select className="input" value={f.category} onChange={(e) => c('category')(e.target.value)}>
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rank">
                <select className="input" value={f.rank} onChange={(e) => c('rank')(e.target.value)}>
                  {RANKS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              {specialties.length > 0 && (
                <Field label="Benchmark specialty" hint="Sets the 75th / 90th percentile pay checks">
                  <select className="input" value={f.benchSpecialty || ''} onChange={(e) => c('benchSpecialty')(e.target.value)}>
                    <option value="">Auto · {defaultSpecialty(bench, f.category)}</option>
                    {specialties.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </section>

          <section>
            <div className="section-title">Effort &amp; salary</div>
            <div className="fields two">
              <Field label="Approved annual clinical salary" hint={`Six-month opportunity ${money(p.opp * (period === 'Q1' ? 2 : 1), { whole: true })} · ${pct(settings.guaranteedPct)} guaranteed`}>
                <NumInput prefix="$" value={f.annualClinicalSalary} onChange={c('annualClinicalSalary')} placeholder="0" />
              </Field>
              <Field label="Annual nonclinical / other cash" hint="Admin, education, research, stipends">
                <NumInput prefix="$" value={f.annualOtherCash} onChange={c('annualOtherCash')} placeholder="0" />
              </Field>
              <Field label="Employed FTE">
                <NumInput value={f.employedFTE} onChange={c('employedFTE')} placeholder="1.0" />
              </Field>
              <Field label="Clinical FTE" hint="1.0 = at least nine half-day sessions a week">
                <NumInput value={f.clinicalFTE} onChange={c('clinicalFTE')} placeholder="1.0" />
              </Field>
              <Field label="Start date" hint="Only if after Jan 1, 2027">
                <input className="input" type="date" value={f.startDate} min="2027-01-01" max="2027-06-30" onChange={(e) => c('startDate')(e.target.value)} />
              </Field>
              <Field label="End date" hint="Only if leaving before Jun 30, 2027">
                <input className="input" type="date" value={f.endDate} min="2027-01-01" max="2027-06-30" onChange={(e) => c('endDate')(e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <div className="section-title">Productivity</div>
            <div className="fields three">
              <Field label="Annual internal target" hint={isBlank(f.annualTarget) ? (autoTarget ? 'Auto: cFTE × base target' : 'Set a base target on Funds & Setup') : 'Entered manually'}>
                <NumInput value={f.annualTarget} autoValue={autoTarget || undefined} onChange={c('annualTarget')} placeholder="wRVUs" />
              </Field>
              <Field label="Q1 wRVUs" hint="January–March">
                <NumInput value={f.wrvuQ1} onChange={c('wrvuQ1')} placeholder="0" />
              </Field>
              <Field label="Jan–Jun wRVUs" hint="Cumulative six months">
                <NumInput value={f.wrvuStub} onChange={c('wrvuStub')} placeholder="0" />
              </Field>
            </div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              {P.label} target: <b>{fmtNum(p.T)}</b> wRVUs ({fmtNum(p.annualTarget)} × {P.fraction}
              {p.elig < 1 ? ` × ${pct(p.elig, 1)} service` : ''}) · 95% floor <b>{fmtNum(p.T * settings.floor)}</b>
              {p.X > 0 && (
                <>
                  {' '}
                  · <b>{fmtNum(p.X)}</b> above target
                </>
              )}
            </p>
          </section>

          <section>
            <div className="section-title">Performance metrics</div>
            <div className="fields two">
              <Toggle checked={f.guarantee} onChange={c('guarantee')} label="On a compensation guarantee" sub="Excluded from the target-share component" />
              <Toggle checked={f.committee} onChange={c('committee')} label="Unfunded committee participation" sub="Roster and attendance documented" />
              <Toggle checked={f.priorAPR} onChange={c('priorAPR')} label="Completed prior APR" sub="New faculty without one are excluded" />
              <Field label={`APR academic goals achieved (need ${settings.academicGoalsRequired})`}>
                <Stepper value={f.academicGoals} onChange={c('academicGoals')} max={12} />
              </Field>
            </div>
          </section>

          <section>
            <div className="section-title">Pay limits &amp; reviews</div>
            <div className="fields two">
              <Field label="Validated period pay limit" hint={p.limit !== null && isBlank(f.payLimitOverride) ? `Auto from ${p.limitSource} benchmark: ${money(p.limit, { whole: true })}` : 'Total cash allowed for this period'}>
                <NumInput prefix="$" value={f.payLimitOverride} autoValue={isBlank(f.payLimitOverride) && p.limit !== null ? Math.round(p.limit) : undefined} onChange={c('payLimitOverride')} placeholder="from Finance" />
              </Field>
              <Field label="Other cash this period" hint="Salary + other applicable cash before variable awards">
                <NumInput prefix="$" value={f.otherCashOverride} autoValue={Math.round(isBlank(f.otherCashOverride) ? p.otherCash : 0) || undefined} onChange={c('otherCashOverride')} placeholder="0" />
              </Field>
              <Toggle checked={f.execApproval} onChange={c('execApproval')} label="CPE + Area President approval" sub="Needed above the 75th percentile" />
              <Toggle checked={f.boardApproval} onChange={c('boardApproval')} label="Board approval" sub="Needed above the 90th percentile" />
              <Field label="Comparable 2026 annual cash" hint="Like-for-like effort; flags a decrease over 5%">
                <NumInput prefix="$" value={f.comparable2026} onChange={c('comparable2026')} placeholder="optional" />
              </Field>
              <Toggle checked={f.reviewDocumented} onChange={c('reviewDocumented')} label="Decrease review documented" sub="Mitigation plan on file" />
            </div>
          </section>

          {p.flags.length > 0 && (
            <div className="callouts">
              {p.flags.map((x, i) => (
                <Callout key={i} level={x.level}>
                  {x.text}
                </Callout>
              ))}
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <button className="btn danger" onClick={onRemove}>
            <Ico name="trash" size={15} /> Remove
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </>
  )
}
