// Payout engine for the January–June 2027 Psychiatry stub compensation plan.
//
// Everything here is a pure function of the app state, so the whole plan can be
// recomputed on every keystroke and tested against the worked examples in the
// plan document (see engine.test.js).

export const PERIODS = {
  Q1: { label: 'Q1', long: 'Q1 · January–March', fraction: 0.25, months: 3, end: '2027-03-31', pool: 'Regular' },
  Stub: { label: 'Stub', long: 'Six-month stub · January–June', fraction: 0.5, months: 6, end: '2027-06-30', pool: 'Regular' },
  Quality: { label: 'Quality', long: 'Quality settlement · January–June evidence', fraction: 0.5, months: 6, end: '2027-06-30', pool: 'Quality' },
}

export const CATEGORIES = {
  MD: { label: 'Primary Psychiatry physician', short: 'Physician', c1: true, c2: true, acad: true, cit: true },
  PhD: { label: 'Primary clinical psychologist (PhD)', short: 'Psychologist', c1: false, c2: true, acad: true, cit: false },
  NonPrimary: { label: 'Non-primary clinically active faculty', short: 'Non-primary', c1: false, c2: true, acad: false, cit: false },
}

export const RANKS = ['Instructor', 'Assistant Professor', 'Associate Professor', 'Professor', 'Chief']

export const COMPONENTS = [
  { key: 'c1', label: 'Clinical target share', short: 'Target share', color: 'var(--c1)' },
  { key: 'c2', label: 'Work above target', short: 'Above target', color: 'var(--c2)' },
  { key: 'acad', label: 'Academic APR goals', short: 'Academic', color: 'var(--c3)' },
  { key: 'cit', label: 'Committee citizenship', short: 'Citizenship', color: 'var(--c4)' },
]

export const DEFAULT_SETTINGS = {
  weights: { c1: 0.4, c2: 0.4, acad: 0.15, cit: 0.05 },
  floor: 0.95,
  academicGoalsRequired: 4,
  academicCapThreshold: 0.8,
  academicCapPct: 0.05,
  guaranteedPct: 0.85,
  baseTargetPerCFTE: '',
  productivityThresholdAnnual: 5520,
  carryforwardCap: 125000,
  reservePctLimit: 0.05,
  decreaseReviewPct: 0.05,
  rate2026: '',
  rateUplift: 1.035,
  deptWRVUs: '',
}

export const DEFAULT_FUNDS = {
  budgetedResidual: '',
  aboveBudget: '',
  rampUpSupport: '',
  psa: '',
  moonlighting: '',
  academicReserve: '',
  ccfActual: '',
  cfOpening: '',
  cfSpent: '',
  qualityRelease: '',
}

export const DEFAULT_CONTROLS = {
  planApproved: false,
  aprCapConfirmed: false,
  financeConfirmed: false,
  moonlightingApproved: false,
  qualityReleaseConfirmed: false,
}

export const blankFaculty = (id) => ({
  id,
  name: '',
  category: 'MD',
  rank: 'Assistant Professor',
  benchSpecialty: '',
  annualClinicalSalary: '',
  annualOtherCash: '',
  employedFTE: 1,
  clinicalFTE: 1,
  startDate: '',
  endDate: '',
  annualTarget: '',
  wrvuQ1: '',
  wrvuStub: '',
  guarantee: false,
  priorAPR: true,
  academicGoals: '',
  committee: false,
  payLimitOverride: '',
  otherCashOverride: '',
  execApproval: false,
  boardApproval: false,
  comparable2026: '',
  reviewDocumented: false,
})

// ---------- small numeric helpers ----------

export const isBlank = (v) => v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))
export const num = (v) => {
  if (isBlank(v)) return 0
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const EPS = 1e-9
// Round down to cents so rounding can never enlarge the pool or a cap.
export const floorCents = (x) => (Math.abs(x) < 1e-9 ? 0 : x < 0 ? Math.ceil(x * 100 - 1e-7) / 100 : Math.floor(x * 100 + 1e-7) / 100)
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0)

// ---------- eligible service ----------

const parseDate = (s) => {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return Date.UTC(+m[1], +m[2] - 1, +m[3])
}
const DAY = 86400000

// Fraction of the selected period a faculty member was employed, counted
// month by month so a full month is exactly one month (Apr 1 start → 0.5 of the stub).
export function eligibleFraction(startDate, endDate, periodKey) {
  const p = PERIODS[periodKey]
  const s = parseDate(startDate)
  const e = parseDate(endDate)
  if (s === null && e === null) return 1
  let total = 0
  for (let m = 0; m < p.months; m++) {
    const ms = Date.UTC(2027, m, 1)
    const me = Date.UTC(2027, m + 1, 0)
    const days = (me - ms) / DAY + 1
    const a = Math.max(ms, s ?? ms)
    const b = Math.min(me, e ?? me)
    if (b >= a) total += ((b - a) / DAY + 1) / days
  }
  return Math.max(0, Math.min(1, total / p.months))
}

// ---------- benchmarks ----------

export function benchFor(bench, specialty, rank) {
  if (!bench?.aamc?.length) return null
  const rows = bench.aamc.filter((r) => r.specialty === specialty && r.rank === rank && r.p75 > 0)
  if (!rows.length) return null
  return rows.sort((a, b) => (a.year < b.year ? 1 : -1))[0]
}

export function defaultSpecialty(bench, category) {
  const names = [...new Set((bench?.aamc || []).map((r) => r.specialty))]
  const want = category === 'PhD' ? /psychology/i : /psychiatry:\s*general/i
  return names.find((n) => want.test(n) && !/peds/i.test(n)) || names[0] || ''
}

export function wrvuBenchFor(bench, category) {
  if (!bench?.cpsc?.length) return null
  const want = category === 'PhD' ? /^psychology$/i : /^psychiatry$/i
  const rows = bench.cpsc.filter((r) => want.test(r.specialty))
  if (!rows.length) return null
  return rows.sort((a, b) => b.year - a.year)[0]
}

// Approximate percentile by linear interpolation between published points.
export function estimatePercentile(value, b) {
  if (!b || !(value > 0)) return null
  const pts = [
    [25, b.p25],
    [50, b.p50],
    [75, b.p75],
    [90, b.p90],
  ].filter(([, v]) => v > 0)
  if (pts.length < 2) return null
  if (value <= pts[0][1]) return { label: `≤ P${pts[0][0]}`, value: pts[0][0] }
  const last = pts[pts.length - 1]
  if (value >= last[1]) return { label: `≥ P${last[0]}`, value: last[0] }
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, v0] = pts[i]
    const [p1, v1] = pts[i + 1]
    if (value >= v0 && value <= v1) {
      const p = p0 + ((value - v0) / (v1 - v0)) * (p1 - p0)
      return { label: `≈ P${Math.round(p)}`, value: p }
    }
  }
  return null
}

// ---------- pool waterfall ----------

export function buildPool(settings, funds, controls, periodKey) {
  const checks = []
  if (periodKey === 'Quality') {
    const q = num(funds.qualityRelease)
    if (!controls.qualityReleaseConfirmed)
      checks.push({ level: 'hold', text: 'Confirm the institutional quality release and its January–June stub allocation before payment.' })
    return { kind: 'Quality', available: q, steps: [{ label: 'Quality funds released for the stub', amount: q, kind: 'in' }], pool: q, checks, carryforward: null }
  }

  const B0 = num(funds.budgetedResidual)
  const A0 = num(funds.aboveBudget)
  let B = B0
  let A = A0
  const steps = [
    { label: 'Funded budgeted / residual variable funds', amount: B0, kind: 'in' },
    { label: 'Institutionally settled above-budget funds', amount: A0, kind: 'in' },
  ]

  // 1. Required repayments come out of above-budget funds before any distribution.
  const repayRequired = 0.5 * num(funds.rampUpSupport) + num(funds.psa)
  const repayTaken = Math.min(repayRequired, Math.max(A, 0))
  A -= repayTaken
  if (num(funds.rampUpSupport)) steps.push({ label: 'Ramp-up repayment (50%)', amount: -Math.min(0.5 * num(funds.rampUpSupport), repayTaken), kind: 'out' })
  if (num(funds.psa)) steps.push({ label: 'Purchase service agreement repayment (100%)', amount: -(repayTaken - Math.min(0.5 * num(funds.rampUpSupport), repayTaken)), kind: 'out' })
  if (repayRequired - repayTaken > 0.005)
    checks.push({ level: 'hold', text: `Above-budget funds cover only ${money(repayTaken)} of ${money(repayRequired)} in required repayments. Confirm the shortfall treatment with Finance.` })

  // 2. Approved resident moonlighting — budgeted/residual funds first, then above-budget.
  const moon = num(funds.moonlighting)
  if (moon > 0) {
    if (!controls.moonlightingApproved) {
      checks.push({ level: 'warn', text: 'Resident moonlighting is entered but its specific committee approval is not confirmed, so it is not deducted. Pending requests are never deducted.' })
    } else {
      const fromB = Math.min(moon, Math.max(B, 0))
      B -= fromB
      const fromA = Math.min(moon - fromB, Math.max(A, 0))
      A -= fromA
      steps.push({ label: 'Approved resident moonlighting (outside reserve)', amount: -(fromB + fromA), kind: 'out' })
      if (moon - fromB - fromA > 0.005) checks.push({ level: 'hold', text: 'Moonlighting cost exceeds available clinical funds.' })
    }
  }

  // 3. Approved incremental academic reserve, capped at 5% of actual clinical compensatory funds.
  const reserve = num(funds.academicReserve)
  if (reserve > 0) {
    const ccf = num(funds.ccfActual) || num(settings.rate2026) * num(settings.rateUplift) * num(settings.deptWRVUs)
    const limit = settings.reservePctLimit * ccf
    if (!(ccf > 0)) checks.push({ level: 'hold', text: 'Enter actual six-month clinical compensatory funds so the 5% reserve limit can be checked.' })
    else if (reserve > limit + 0.005) checks.push({ level: 'hold', text: `Academic reserve ${money(reserve)} exceeds the 5% limit of ${money(limit)}.` })
    else checks.push({ level: 'ok', text: `Academic reserve is within the 5% limit (${money(limit)}).` })
    const fromA = Math.min(reserve, Math.max(A, 0))
    A -= fromA
    const fromB = Math.min(reserve - fromA, Math.max(B, 0))
    B -= fromB
    steps.push({ label: 'Approved academic reserve', amount: -(fromA + fromB), kind: 'out' })
  }

  // 4. Replenish carryforward from remaining above-budget funds only, up to the cap.
  const balance = num(funds.cfOpening) - num(funds.cfSpent)
  const cap = num(settings.carryforwardCap)
  const capacity = Math.max(0, cap - balance)
  if (balance > cap + 0.005) checks.push({ level: 'hold', text: `Carryforward balance ${money(balance)} already exceeds the ${money(cap)} cap — seek institutional reconciliation.` })
  const refill = Math.min(capacity, Math.max(A, 0))
  A -= refill
  if (refill > 0) steps.push({ label: 'Carryforward replenishment', amount: -refill, kind: 'out' })

  const pool = Math.max(0, B) + Math.max(0, A)
  return {
    kind: 'Regular',
    available: B0 + A0,
    steps,
    pool,
    checks,
    carryforward: { opening: num(funds.cfOpening), spent: num(funds.cfSpent), refill, ending: balance + refill, cap, capacity },
  }
}

// ---------- main calculation ----------

export function compute(state) {
  const { settings, funds, controls, faculty, payments, period, bench } = state
  const P = PERIODS[period]
  const w = settings.weights
  const poolInfo = buildPool(settings, funds, controls, period)
  const pool = poolInfo.pool
  const comp = { c1: w.c1 * pool, c2: w.c2 * pool, acad: w.acad * pool, cit: w.cit * pool }

  // --- per-person inputs ---
  const people = faculty.map((f) => {
    const cat = CATEGORIES[f.category] || CATEGORIES.MD
    const elig = eligibleFraction(f.startDate, f.endDate, period)
    const scale = P.fraction * elig
    const F = num(f.employedFTE) * elig
    const baseTarget = num(settings.baseTargetPerCFTE)
    const targetAuto = isBlank(f.annualTarget)
    const annualTarget = targetAuto ? num(f.clinicalFTE) * baseTarget : num(f.annualTarget)
    const T = annualTarget * scale
    const W = num(period === 'Q1' ? f.wrvuQ1 : f.wrvuStub)
    const hasTarget = T > EPS
    const attain = hasTarget ? W / T : null
    const meetsFloor = hasTarget && W + EPS >= settings.floor * T
    const X = hasTarget ? Math.max(W - T, 0) : 0
    const opp = num(f.annualClinicalSalary) * scale
    const guaranteed = opp * settings.guaranteedPct
    const otherCashAuto = isBlank(f.otherCashOverride)
    const otherCash = otherCashAuto ? guaranteed + num(f.annualOtherCash) * scale : num(f.otherCashOverride)

    const specialty = f.benchSpecialty || defaultSpecialty(bench, f.category)
    const tcc = benchFor(bench, specialty, f.rank)
    const prodThreshold = num(settings.productivityThresholdAnnual) * num(f.clinicalFTE) * scale
    const aboveProd = prodThreshold > 0 && W > prodThreshold
    let limit = null
    let limitSource = 'none'
    if (!isBlank(f.payLimitOverride)) {
      limit = num(f.payLimitOverride)
      limitSource = 'validated'
    } else if (tcc) {
      const ftePeriod = num(f.employedFTE) * scale
      if (aboveProd && f.execApproval && tcc.p90 > 0) {
        limit = tcc.p90 * ftePeriod
        limitSource = 'P90'
      } else {
        limit = tcc.p75 * ftePeriod
        limitSource = 'P75'
      }
    }

    const priorAPR = !!f.priorAPR
    const goalsMet = num(f.academicGoals) >= settings.academicGoalsRequired
    const elig1 = cat.c1 && meetsFloor && !f.guarantee && F > 0
    const elig2 = cat.c2 && X > 0
    const eligA = cat.acad && priorAPR && goalsMet && meetsFloor && F > 0
    const eligC = cat.cit && meetsFloor && !!f.committee && F > 0

    const why = {
      c1: !cat.c1 ? `${cat.short}s do not participate` : f.guarantee ? 'On a compensation guarantee' : !hasTarget ? 'No valid clinical target' : !meetsFloor ? `Below the ${pct(settings.floor)} floor` : F <= 0 ? 'No eligible service' : null,
      c2: !cat.c2 ? 'Not eligible' : !hasTarget ? 'No valid clinical target' : X <= 0 ? 'No wRVUs above target' : null,
      acad: !cat.acad ? `${cat.short}s do not participate` : !priorAPR ? 'No completed prior APR' : !hasTarget ? 'No valid clinical target' : !meetsFloor ? `Below the ${pct(settings.floor)} clinical floor` : !goalsMet ? `Fewer than ${settings.academicGoalsRequired} APR goals met` : null,
      cit: !cat.cit ? `${cat.short}s do not participate` : !hasTarget ? 'No valid clinical target' : !meetsFloor ? `Below the ${pct(settings.floor)} clinical floor` : !f.committee ? 'No documented committee participation' : null,
    }

    return { f, cat, elig, scale, F, annualTarget, targetAuto, T, W, hasTarget, attain, meetsFloor, X, opp, guaranteed, variableBudget: opp - guaranteed, otherCash, otherCashAuto, specialty, tcc, prodThreshold, aboveProd, limit, limitSource, elig1, elig2, eligA, eligC, why, priorAPR }
  })

  // --- initial component awards ---
  const sF1 = sum(people.filter((p) => p.elig1), (p) => p.F)
  const sX = sum(people.filter((p) => p.elig2), (p) => p.X)
  const sFA = sum(people.filter((p) => p.eligA), (p) => p.F)
  const sFC = sum(people.filter((p) => p.eligC), (p) => p.F)

  const aprPopulation = people.filter((p) => (p.f.category === 'MD' || p.f.category === 'PhD') && p.priorAPR && p.elig > 0).length
  const aprQualifiers = people.filter((p) => p.eligA).length
  const aprRate = aprPopulation ? aprQualifiers / aprPopulation : null
  const academicCapApplies = aprRate !== null && aprRate + EPS < settings.academicCapThreshold
  const academicCap = academicCapApplies ? settings.academicCapPct * comp.acad : null

  for (const p of people) {
    p.init = {
      c1: p.elig1 && sF1 > 0 ? (comp.c1 * p.F) / sF1 : 0,
      c2: p.elig2 && sX > 0 ? (comp.c2 * p.X) / sX : 0,
      acad: p.eligA && sFA > 0 ? (comp.acad * p.F) / sFA : 0,
      cit: p.eligC && sFC > 0 ? (comp.cit * p.F) / sFC : 0,
    }
    p.acadCapped = false
    if (academicCap !== null && p.init.acad > academicCap) {
      p.init.acad = academicCap
      p.acadCapped = true
    }
  }

  // --- individual pay limits: reduce the equal share first ---
  let withheldPool = 0
  for (const p of people) {
    const v = p.init
    const totalVar = v.c1 + v.c2 + v.acad + v.cit
    p.pay = { ...v, redist: 0 }
    p.c1Withheld = 0
    p.otherHeld = 0
    if (p.limit !== null) {
      const excess = Math.max(0, p.otherCash + totalVar - p.limit)
      if (excess > 0) {
        p.c1Withheld = Math.min(excess, v.c1)
        p.pay.c1 = v.c1 - p.c1Withheld
        const rem = excess - p.c1Withheld
        if (rem > 0) {
          const others = v.c2 + v.acad + v.cit
          const take = Math.min(rem, others)
          if (others > 0) for (const k of ['c2', 'acad', 'cit']) p.pay[k] = v[k] - (take * v[k]) / others
          p.otherHeld = take
        }
      }
      p.capacity = Math.max(0, p.limit - (p.otherCash + p.pay.c1 + p.pay.c2 + p.pay.acad + p.pay.cit))
    } else p.capacity = null
    withheldPool += p.c1Withheld
  }

  // --- redistribute withheld equal-share dollars to higher producers with capacity ---
  let remaining = withheldPool
  let rounds = 0
  while (remaining > 0.005 && rounds < 50) {
    rounds++
    const recips = people.filter((p) => p.f.category === 'MD' && p.X > 0 && p.capacity !== null && p.capacity - p.pay.redist > 0.005)
    const tx = sum(recips, (p) => p.X)
    if (!recips.length || tx <= 0) break
    let given = 0
    for (const p of recips) {
      const share = (remaining * p.X) / tx
      const amt = Math.min(share, p.capacity - p.pay.redist)
      p.pay.redist += amt
      given += amt
    }
    remaining -= given
    if (given < 0.005) break
  }
  const redistLeftover = Math.max(0, remaining)

  // --- actual nonclinical limit: nonclinical ≤ one-third of actual clinical ---
  const clinicalTotal = sum(people, (p) => p.pay.c1 + p.pay.c2 + p.pay.redist)
  const nonclinTotal = sum(people, (p) => p.pay.acad + p.pay.cit)
  let ncScale = 1
  if (nonclinTotal > clinicalTotal / 3 + EPS) ncScale = nonclinTotal > 0 ? clinicalTotal / 3 / nonclinTotal : 0
  for (const p of people) {
    p.pay.acad *= ncScale
    p.pay.cit *= ncScale
  }

  // --- round each final component down to cents ---
  for (const p of people) {
    p.earned = {
      c1: floorCents(p.pay.c1),
      c2: floorCents(p.pay.c2),
      redist: floorCents(p.pay.redist),
      acad: floorCents(p.pay.acad),
      cit: floorCents(p.pay.cit),
    }
    p.earned.total = round2(p.earned.c1 + p.earned.c2 + p.earned.redist + p.earned.acad + p.earned.cit)
  }

  // --- reconcile prior payments ---
  const creditPeriods = period === 'Q1' ? ['Q1'] : period === 'Stub' ? ['Q1', 'Stub'] : ['Quality']
  const creditPool = P.pool
  const keys = ['c1', 'c2', 'redist', 'acad', 'cit']
  for (const p of people) {
    const mine = (payments || []).filter((x) => x.facultyId === p.f.id && (x.pool || 'Regular') === creditPool && creditPeriods.includes(x.period))
    p.prior = Object.fromEntries(keys.map((k) => [k, round2(sum(mine, (x) => num(x[k])))]))
    p.prior.total = round2(sum(keys, (k) => p.prior[k]))
    p.balance = Object.fromEntries(keys.map((k) => [k, round2(p.earned[k] - p.prior[k])]))
    p.balance.total = round2(sum(keys, (k) => p.balance[k]))
    p.overpaid = keys.filter((k) => p.balance[k] < -0.004)
  }

  // --- flags & holds ---
  const decreasePct = settings.decreaseReviewPct
  for (const p of people) {
    const flags = []
    const f = p.f
    if (!p.hasTarget) flags.push({ level: 'warn', text: 'No valid clinical target — not presumed to meet the clinical floor.' })
    if (p.elig < 1) flags.push({ level: 'info', text: `Eligible service ${pct(p.elig)} of the period (prorated).` })
    if (p.acadCapped) flags.push({ level: 'info', text: `Academic award capped at ${pct(settings.academicCapPct)} of the academic component (qualification ${pct(aprRate)} < ${pct(settings.academicCapThreshold)}).` })
    if (p.c1Withheld > 0.004) flags.push({ level: 'info', text: `Pay limit reduced the equal share by ${money(p.c1Withheld)}; that amount is redistributed to higher producers.` })
    if (p.otherHeld > 0.004) flags.push({ level: 'hold', text: `Pay limit still binds after the equal share — ${money(p.otherHeld)} of other awards held. Refer to Finance.` })
    if (p.limit === null && p.earned.total > 0) flags.push({ level: 'warn', text: 'No pay limit available — import benchmarks or enter a validated period pay limit.' })
    if (p.limitSource === 'P75' || p.limitSource === 'P90') flags.push({ level: 'info', text: `Pay limit derived from the ${p.limitSource} benchmark — have Finance validate it before payroll.` })
    if (p.overpaid.length) flags.push({ level: 'hold', text: `Prior payments exceed cumulative earnings on: ${p.overpaid.map(labelOf).join(', ')}. Release held for review; nothing is recovered automatically.` })

    // Total cash and percentile approvals
    const periodCash = p.otherCash + p.earned.total
    p.periodCash = periodCash
    p.annualizedCash = p.scale > 0 ? periodCash / p.scale : 0
    const perFTE = num(f.employedFTE) > 0 ? p.annualizedCash / num(f.employedFTE) : 0
    p.cashPerFTE = perFTE
    p.tccPct = estimatePercentile(perFTE, p.tcc)
    const wb = wrvuBenchFor(bench, f.category)
    const annualW = p.scale > 0 && num(f.clinicalFTE) > 0 ? p.W / p.scale / num(f.clinicalFTE) : 0
    p.annualWperCFTE = annualW
    p.wrvuPct = estimatePercentile(annualW, wb)
    if (p.tcc) {
      if (perFTE > p.tcc.p75 + 0.5) {
        if (!p.aboveProd) flags.push({ level: 'hold', text: `Total cash ${p.tccPct?.label || ''} exceeds the 75th percentile without productivity above the 75th percentile.` })
        else if (!f.execApproval) flags.push({ level: 'hold', text: 'Total cash above the 75th percentile requires Chief Physician Executive and Area President approval.' })
      }
      if (p.tcc.p90 > 0 && perFTE > p.tcc.p90 + 0.5 && !f.boardApproval) flags.push({ level: 'hold', text: 'Total cash above the 90th percentile requires board approval.' })
    }
    if (!isBlank(f.comparable2026) && num(f.comparable2026) > 0 && period !== 'Quality') {
      const change = p.annualizedCash / num(f.comparable2026) - 1
      p.change2026 = change
      if (change < -decreasePct - EPS) {
        flags.push({ level: f.reviewDocumented ? 'info' : 'hold', text: `Modeled pay is ${pct(-change, 1)} below comparable 2026${f.reviewDocumented ? ' — review and mitigation plan documented.' : '. Document a review and mitigation plan before implementation.'}` })
      }
    } else p.change2026 = null
    p.flags = flags
    p.hold = flags.some((x) => x.level === 'hold')
  }

  // --- global controls ---
  const controlChecks = [
    { key: 'planApproved', ok: controls.planApproved, text: 'Plan approved by the Compensation Committee (including the 80/20 weighting)' },
    { key: 'aprCapConfirmed', ok: controls.aprCapConfirmed, text: 'Per-recipient APR cap interpretation confirmed' },
    { key: 'financeConfirmed', ok: controls.financeConfirmed, text: 'Finance confirmed the net pool, rate and benchmark period' },
  ]
  if (period === 'Quality') controlChecks.push({ key: 'qualityReleaseConfirmed', ok: controls.qualityReleaseConfirmed, text: 'Quality release and stub allocation confirmed' })
  const poolHold = poolInfo.checks.some((c) => c.level === 'hold')
  const controlsOK = controlChecks.every((c) => c.ok) && !poolHold

  // --- payroll release with the 25% nonclinical test on actual release ---
  for (const p of people) {
    const ready = controlsOK && !p.hold
    p.ready = ready
    p.release = Object.fromEntries(keys.map((k) => [k, ready ? Math.max(0, p.balance[k]) : 0]))
  }
  const rel = people.filter((p) => p.ready)
  const clinCum = sum(rel, (p) => p.prior.c1 + p.prior.c2 + p.prior.redist + p.release.c1 + p.release.c2 + p.release.redist)
  const ncPrior = sum(rel, (p) => p.prior.acad + p.prior.cit)
  const ncRel = sum(rel, (p) => p.release.acad + p.release.cit)
  let releaseNcScale = 1
  if (ncRel > 0 && ncPrior + ncRel > clinCum / 3 + 0.005) releaseNcScale = Math.max(0, clinCum / 3 - ncPrior) / ncRel
  for (const p of people) {
    if (releaseNcScale < 1) {
      p.release.acad = floorCents(p.release.acad * releaseNcScale)
      p.release.cit = floorCents(p.release.cit * releaseNcScale)
    }
    p.release.total = round2(sum(keys, (k) => p.release[k]))
    p.status = !controlsOK ? 'Awaiting approvals' : p.hold ? 'Hold for review' : p.release.total > 0 ? 'Ready for payroll' : 'Nothing due'
  }

  // --- totals & undistributed reconciliation ---
  const totals = Object.fromEntries(keys.map((k) => [k, round2(sum(people, (p) => p.earned[k]))]))
  totals.earned = round2(sum(people, (p) => p.earned.total))
  totals.prior = round2(sum(people, (p) => p.prior.total))
  totals.balance = round2(sum(people, (p) => p.balance.total))
  totals.release = round2(sum(people, (p) => p.release.total))
  totals.held = round2(sum(people.filter((p) => !p.ready), (p) => Math.max(0, p.balance.total)))
  const undistributed = round2(pool - totals.earned)

  const notes = []
  if (sF1 <= 0 && comp.c1 > 0) notes.push('No one qualifies for the clinical target share — that component stays undistributed.')
  if (sX <= 0 && comp.c2 > 0) notes.push('No eligible work above target — the excess-production component stays undistributed.')
  if (sFA <= 0 && comp.acad > 0) notes.push('No one qualifies for the academic component — it stays undistributed (it does not move to equal shares).')
  if (sFC <= 0 && comp.cit > 0) notes.push('No one qualifies for the citizenship component — it stays undistributed.')
  if (academicCapApplies) notes.push(`Only ${aprQualifiers} of ${aprPopulation} primary faculty with a prior APR qualify (${pct(aprRate)}), so each academic award is capped at ${money(academicCap)}.`)
  if (ncScale < 1) notes.push(`Nonclinical awards scaled to ${pct(ncScale, 1)} so they stay within 25% of actual variable pay.`)
  if (redistLeftover > 0.005) notes.push(`${money(redistLeftover)} of withheld equal-share dollars had no eligible recipient with pay capacity — retain within carryforward capacity or reconcile with the enterprise.`)
  if (releaseNcScale < 1) notes.push('Nonclinical payroll release reduced so cumulative nonclinical payments stay within 25% of actual variable pay.')

  return {
    period,
    poolInfo,
    pool,
    comp,
    people,
    totals,
    undistributed,
    withheldPool,
    redistLeftover,
    ncScale,
    academic: { population: aprPopulation, qualifiers: aprQualifiers, rate: aprRate, capApplies: academicCapApplies, cap: academicCap },
    denominators: { sF1, sX, sFA, sFC },
    controlChecks,
    controlsOK,
    notes,
  }
}

// ---------- formatting ----------
export const round2 = (x) => Math.round(x * 100) / 100
export const money = (x, opts = {}) => {
  const v = Number(x) || 0
  return (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2 })
}
export const pct = (x, d = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(d)}%`)
export const fmtNum = (x, d = 0) => (Number(x) || 0).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const LABELS = { c1: 'target share', c2: 'above target', redist: 'redistribution', acad: 'academic', cit: 'citizenship' }
const labelOf = (k) => LABELS[k] || k
