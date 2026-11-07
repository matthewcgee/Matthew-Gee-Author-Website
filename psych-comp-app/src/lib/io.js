// Spreadsheet import/export. ExcelJS is loaded on demand so the calculator
// itself stays light.
import { blankFaculty, COMPONENTS, CATEGORIES, PERIODS, round2 } from './engine.js'

const loadExcel = async () => {
  const mod = await import('exceljs/dist/exceljs.min.js')
  return mod.default || mod
}

const cellVal = (v) => {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10)
    if ('result' in v) return cellVal(v.result)
    if (v.richText) return v.richText.map((t) => t.text).join('')
    if ('text' in v) return v.text
    return null
  }
  return v
}

async function readRows(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return { Sheet1: parseCSV(await file.text()) }
  }
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const out = {}
  wb.eachSheet((ws) => {
    const rows = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = []
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        vals[col - 1] = cellVal(cell.value)
      })
      rows.push(vals)
    })
    out[ws.name] = rows
  })
  return out
}

export function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      cur = ''
    } else cur += c
  }
  row.push(cur)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const toNum = (v) => {
  if (v === null || v === undefined || v === '' || v === '--' || /^isd$/i.test(String(v))) return null
  const n = Number(String(v).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

// ---------------- benchmarks ----------------

function findHeader(rows, mustMatch) {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const h = (rows[i] || []).map(norm)
    if (mustMatch.every((re) => h.some((x) => re.test(x)))) return i
  }
  return -1
}
const colOf = (h, re) => h.findIndex((x) => re.test(x))

export async function importBenchmarks(file) {
  const sheets = await readRows(file)
  const bench = { source: file.name, importedAt: new Date().toISOString(), aamc: [], cpsc: [], sc: [], blend: [] }

  for (const [name, rows] of Object.entries(sheets)) {
    // AAMC faculty salary survey: specialty × rank TCC percentiles
    let hi = findHeader(rows, [/specialty/, /^rank$/, /^75th$/])
    if (hi >= 0) {
      const h = rows[hi].map(norm)
      const c = { year: colOf(h, /year/), sp: colOf(h, /specialty/), rank: colOf(h, /^rank$/), n: colOf(h, /^count$/), p25: colOf(h, /^25th/), p50: colOf(h, /^50th/), p75: colOf(h, /^75th/), p90: colOf(h, /^90th/) }
      for (const r of rows.slice(hi + 1)) {
        const p75 = toNum(r[c.p75])
        if (!r[c.sp] || !r[c.rank]) continue
        bench.aamc.push({ year: String(r[c.year] ?? ''), specialty: String(r[c.sp]).trim(), rank: String(r[c.rank]).trim(), n: toNum(r[c.n]), p25: toNum(r[c.p25]), p50: toNum(r[c.p50]), p75, p90: toNum(r[c.p90]) })
      }
      continue
    }
    // Productivity survey: wRVU per cFTE
    hi = findHeader(rows, [/specialty description/, /50th.*wrvu/])
    if (hi >= 0) {
      const h = rows[hi].map(norm)
      const c = { year: colOf(h, /year/), sp: colOf(h, /specialty description/), n: colOf(h, /n of providers/), mean: colOf(h, /mean/), p25: colOf(h, /^25th/), p50: colOf(h, /^50th/), p75: colOf(h, /^75th/), p90: colOf(h, /^90th/) }
      for (const r of rows.slice(hi + 1)) {
        if (!r[c.sp]) continue
        bench.cpsc.push({ year: toNum(r[c.year]), specialty: String(r[c.sp]).trim(), n: toNum(r[c.n]), mean: toNum(r[c.mean]), p25: toNum(r[c.p25]), p50: toNum(r[c.p50]), p75: toNum(r[c.p75]), p90: toNum(r[c.p90]) })
      }
      continue
    }
    // Staff physician blend: TCC + wRVU percentiles by subspecialty
    hi = findHeader(rows, [/^specialty$/, /tcc.*50th/, /wrvus?.*50th/])
    if (hi >= 0) {
      const h = rows[hi].map(norm)
      const tc = (p) => colOf(h, new RegExp(`tcc.*${p}`))
      const wc = (p) => colOf(h, new RegExp(`wrvu.*${p}`))
      const sp = colOf(h, /^specialty$/)
      const yr = colOf(h, /^year$/)
      for (const r of rows.slice(hi + 1)) {
        if (!r[sp]) continue
        bench.sc.push({
          year: toNum(r[yr]),
          specialty: String(r[sp]).trim(),
          tcc: { p25: toNum(r[tc('25th')]), p50: toNum(r[tc('50th')]), p75: toNum(r[tc('75th')]), p90: toNum(r[tc('90th')]) },
          wrvu: { p25: toNum(r[wc('25th')]), p50: toNum(r[wc('50th')]), p75: toNum(r[wc('75th')]), p90: toNum(r[wc('90th')]) },
        })
      }
      continue
    }
    // Two-year blend: subspecialty P50 TCC and wRVUs
    hi = findHeader(rows, [/subspecialty/, /p50 wrvus/])
    if (hi >= 0) {
      const sources = rows[hi - 1] || []
      const h = rows[hi].map(norm)
      for (const r of rows.slice(hi + 1)) {
        if (!r[0]) continue
        const vals = []
        h.forEach((x, i) => {
          if (/p50 tcc/.test(x)) vals.push({ source: String(sources[i] || '').trim(), tcc: toNum(r[i]), wrvu: toNum(r[i + 1]) })
        })
        bench.blend.push({ subspecialty: String(r[0]).trim(), values: vals })
      }
    }
  }

  if (!bench.aamc.length && !bench.cpsc.length && !bench.sc.length && !bench.blend.length) throw new Error('No recognizable benchmark tables were found in that file.')
  return bench
}

// ---------------- faculty roster ----------------

const FIELDS = [
  ['id', 'ID', /^(faculty )?id$|employee id|^emp/],
  ['name', 'Name', /^name$|faculty name|provider/],
  ['category', 'Category (Physician / Psychologist / Non-primary)', /categor|type/],
  ['rank', 'Rank', /rank/],
  ['benchSpecialty', 'Benchmark specialty', /benchmark spec|specialty/],
  ['annualClinicalSalary', 'Approved annual clinical salary', /clinical salary|clinical comp/],
  ['annualOtherCash', 'Annual nonclinical / other cash', /other cash|nonclinical/],
  ['employedFTE', 'Employed FTE', /employed fte|^fte$/],
  ['clinicalFTE', 'Clinical FTE', /clinical fte|cfte/],
  ['startDate', 'Start date (if after Jan 1)', /start/],
  ['endDate', 'End date (if before Jun 30)', /end date|term/],
  ['annualTarget', 'Approved annual wRVU target', /target/],
  ['wrvuQ1', 'Q1 wRVUs (Jan–Mar)', /q1|jan.?mar/],
  ['wrvuStub', 'Jan–Jun wRVUs', /jan.?jun|stub|six.?month|6.?month/],
  ['guarantee', 'On guarantee (Y/N)', /guarantee/],
  ['priorAPR', 'Completed prior APR (Y/N)', /apr/],
  ['academicGoals', 'APR academic goals achieved', /goals/],
  ['committee', 'Unfunded committee participation (Y/N)', /committee|citizenship/],
  ['payLimitOverride', 'Validated period pay limit', /pay limit|limit/],
  ['otherCashOverride', 'Period other cash (override)', /period other cash/],
  ['execApproval', 'CPE + President approval (Y/N)', /cpe|president|exec/],
  ['boardApproval', 'Board approval (Y/N)', /board/],
  ['comparable2026', 'Comparable 2026 annual cash', /2026/],
  ['reviewDocumented', 'Decrease review documented (Y/N)', /review/],
]
const BOOL = new Set(['guarantee', 'priorAPR', 'committee', 'execApproval', 'boardApproval', 'reviewDocumented'])
const yes = (v) => /^(y|yes|true|1|x|✓)$/i.test(String(v ?? '').trim())

const parseCategory = (v) => {
  const s = norm(v)
  if (/non/.test(s)) return 'NonPrimary'
  if (/phd|psycholog/.test(s)) return 'PhD'
  return 'MD'
}

export async function importFaculty(file, existingIds = new Set()) {
  const sheets = await readRows(file)
  const rows = Object.values(sheets)[0] || []
  const hi = rows.findIndex((r) => (r || []).filter((x) => typeof x === 'string' && x.trim()).length >= 3)
  if (hi < 0) throw new Error('Could not find a header row.')
  const header = rows[hi].map(norm)
  const used = new Set()
  const map = {}
  // Exact template labels first, then fuzzy matches.
  FIELDS.forEach(([key, label]) => {
    const i = header.indexOf(norm(label))
    if (i >= 0) {
      map[key] = i
      used.add(i)
    }
  })
  FIELDS.forEach(([key, , re]) => {
    if (key in map) return
    const i = header.findIndex((h, idx) => !used.has(idx) && re.test(h))
    if (i >= 0) {
      map[key] = i
      used.add(i)
    }
  })
  const out = []
  let n = existingIds.size
  for (const r of rows.slice(hi + 1)) {
    if (!r || r.every((x) => x === null || x === '' || x === undefined)) continue
    let id = map.id !== undefined && r[map.id] ? String(r[map.id]).trim() : ''
    if (!id) {
      do id = `F${String(++n).padStart(3, '0')}`
      while (existingIds.has(id))
    }
    const f = blankFaculty(id)
    for (const [key] of FIELDS) {
      if (key === 'id' || map[key] === undefined) continue
      const v = r[map[key]]
      if (v === null || v === undefined || v === '') continue
      if (BOOL.has(key)) f[key] = yes(v)
      else if (key === 'category') f[key] = parseCategory(v)
      else if (key === 'startDate' || key === 'endDate') f[key] = normDate(v)
      else if (key === 'name' || key === 'rank' || key === 'benchSpecialty') f[key] = String(v).trim()
      else f[key] = toNum(v) ?? ''
    }
    out.push(f)
  }
  return { faculty: out, matched: Object.keys(map).length }
}

const normDate = (v) => {
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
  return ''
}

// ---------------- exports ----------------

const download = (blob, name) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 500)
}

const styleHeader = (ws) => {
  const row = ws.getRow(1)
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B7A73' } }
  row.alignment = { vertical: 'middle', wrapText: true }
  row.height = 32
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

export async function downloadTemplate(faculty = []) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Faculty')
  ws.columns = FIELDS.map(([key, label]) => ({ header: label, key, width: Math.max(14, Math.min(label.length + 2, 30)) }))
  const rows = faculty.length
    ? faculty
    : [{ ...blankFaculty('F001'), name: 'Example Physician', annualClinicalSalary: 300000, annualTarget: 5400, wrvuQ1: 1400, wrvuStub: 2900, academicGoals: 4, committee: true }]
  rows.forEach((f) => {
    const o = {}
    FIELDS.forEach(([k]) => {
      const v = f[k]
      o[k] = BOOL.has(k) ? (v ? 'Y' : 'N') : k === 'category' ? CATEGORIES[v]?.short || v : v
    })
    ws.addRow(o)
  })
  styleHeader(ws)
  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf]), faculty.length ? 'psychiatry-faculty-roster.xlsx' : 'psychiatry-faculty-template.xlsx')
}

export async function exportResults(result, state) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  const P = PERIODS[result.period]
  const cur = '"$"#,##0.00'

  const s = wb.addWorksheet('Summary')
  s.columns = [{ width: 46 }, { width: 20 }]
  s.addRow(['Psychiatry Compensation Payouts — ' + P.long])
  s.getRow(1).font = { bold: true, size: 14 }
  s.addRow(['Generated', new Date().toLocaleString()])
  s.addRow([])
  result.poolInfo.steps.forEach((st) => s.addRow([st.label, st.amount]))
  s.addRow(['Net variable pool', result.pool]).font = { bold: true }
  s.addRow([])
  COMPONENTS.forEach((c) => s.addRow([`${c.label} (${Math.round(state.settings.weights[c.key] * 100)}%)`, result.comp[c.key]]))
  s.addRow([])
  s.addRow(['Total earned (rounded down)', result.totals.earned])
  s.addRow(['Prior payments credited', result.totals.prior])
  s.addRow(['Ready for payroll', result.totals.release]).font = { bold: true }
  s.addRow(['Undistributed / awaiting disposition', result.undistributed])
  s.getColumn(2).numFmt = cur
  result.notes.forEach((n) => s.addRow([n]))

  const ws = wb.addWorksheet('Payouts')
  ws.columns = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Category', key: 'cat', width: 14 },
    { header: 'Eligible FTE', key: 'F', width: 10 },
    { header: 'Target wRVUs', key: 'T', width: 12 },
    { header: 'Actual wRVUs', key: 'W', width: 12 },
    { header: 'Attainment', key: 'att', width: 11 },
    { header: 'Target share', key: 'c1', width: 14 },
    { header: 'Above target', key: 'c2', width: 14 },
    { header: 'Redistribution', key: 'redist', width: 14 },
    { header: 'Academic', key: 'acad', width: 12 },
    { header: 'Citizenship', key: 'cit', width: 12 },
    { header: 'Total earned', key: 'total', width: 14 },
    { header: 'Prior paid', key: 'prior', width: 13 },
    { header: 'Balance', key: 'bal', width: 13 },
    { header: 'Release to payroll', key: 'rel', width: 15 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Flags', key: 'flags', width: 60 },
  ]
  result.people.forEach((p) =>
    ws.addRow({
      id: p.f.id,
      name: p.f.name,
      cat: CATEGORIES[p.f.category]?.short,
      F: round2(p.F * 1000) / 1000,
      T: Math.round(p.T),
      W: p.W,
      att: p.attain ?? '',
      c1: p.earned.c1,
      c2: p.earned.c2,
      redist: p.earned.redist,
      acad: p.earned.acad,
      cit: p.earned.cit,
      total: p.earned.total,
      prior: p.prior.total,
      bal: p.balance.total,
      rel: p.release.total,
      status: p.status,
      flags: p.flags.map((f) => f.text).join(' | '),
    }),
  )
  ;['c1', 'c2', 'redist', 'acad', 'cit', 'total', 'prior', 'bal', 'rel'].forEach((k) => (ws.getColumn(k).numFmt = cur))
  ws.getColumn('att').numFmt = '0.0%'
  styleHeader(ws)

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf]), `psychiatry-payouts-${P.label.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function exportScenario(state) {
  const { bench, ...rest } = state
  download(new Blob([JSON.stringify({ app: 'psych-comp', version: 1, savedAt: new Date().toISOString(), ...rest }, null, 2)], { type: 'application/json' }), `psychiatry-comp-scenario-${new Date().toISOString().slice(0, 10)}.json`)
}

export async function importScenario(file) {
  let data
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not a saved compensation scenario (.json).')
  }
  if (data.app !== 'psych-comp') throw new Error('That file is not a saved compensation scenario.')
  return data
}
