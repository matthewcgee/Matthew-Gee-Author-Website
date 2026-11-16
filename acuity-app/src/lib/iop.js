// AcuiStep™ — IOP screening, eligibility and intake path
//
// Takes a referral to an intensive outpatient program (IOP) from intake to a
// decision: is IOP the right level, what stands in the way, which track fits,
// what the first weeks look like, and what has to be done before day one.
//
// WHAT THIS IS, AND IS NOT
//
// Decision support. Every determination below decomposes into named criteria a
// clinician can read, agree with or override. It is aligned to the concepts
// behind LOCUS / CASII (level of care) and ASAM Level 2.1 (substance use IOP),
// but it is an original tool, not those instruments, and it carries no
// validation study. Where a payer requires the real instrument, use it.
//
// HOW IT DECIDES
//
//   1. Hard stops. Anything that needs 24-hour or day-hospital care — imminent
//      risk, a recent attempt without a workable safety plan, acute mania or
//      psychosis, withdrawal needing medical management, medical instability —
//      sends the referral up, whatever else is true. A stop is never averaged
//      away by a low score elsewhere.
//   2. Intensity. The six AcuiPath dimensions (shared with the level-of-care
//      screen) give a composite and a level band. IOP sits between routine
//      outpatient and partial hospitalization. A step-down from inpatient or PHP
//      may be IOP even when the composite has already fallen to the outpatient
//      band: continuity is the point of a step-down.
//   3. Participation. The person must be able to take part in group-based care
//      (cognition, stability) and must be willing to attend.
//   4. Logistics and coverage. Schedule, transport and authorization rarely
//      change the clinical answer, but they decide whether the person actually
//      starts. They make the result conditional, with the fix named.
//
// The disposition is one of: higher (needs more than IOP), eligible,
// conditional (eligible once named items are resolved), lower (routine
// outpatient is enough), or alternative (IOP cannot work as offered).

import { DIMENSIONS, screenLevelOfCare, emptyScores } from './loc.js'

/* ------------------------------------------------------------ vocabularies */

export const POPULATION_LABEL = { adult: 'Adult', adolescent: 'Adolescent' }

export const REFERRAL_SOURCES = [
  { id: 'inpatient', label: 'Inpatient step-down', stepDown: true },
  { id: 'php', label: 'PHP step-down', stepDown: true },
  { id: 'ed', label: 'Emergency department' },
  { id: 'outpatient', label: 'Outpatient step-up' },
  { id: 'pcp', label: 'Primary care' },
  { id: 'school', label: 'School / counselor' },
  { id: 'self', label: 'Self or family' },
  { id: 'other', label: 'Other' },
]
export const SOURCE_BY_ID = Object.fromEntries(REFERRAL_SOURCES.map((s) => [s.id, s]))

export const CONCERNS = [
  { id: 'depression', label: 'Depression' },
  { id: 'anxiety', label: 'Anxiety / panic' },
  { id: 'bipolar', label: 'Bipolar disorder (stable)' },
  { id: 'trauma', label: 'Trauma / PTSD' },
  { id: 'ocd', label: 'OCD' },
  { id: 'dysregulation', label: 'Emotion dysregulation / self-harm' },
  { id: 'psychosis', label: 'Psychotic disorder (stable)' },
  { id: 'substance', label: 'Substance use' },
  { id: 'eating', label: 'Disordered eating' },
]
export const CONCERN_BY_ID = Object.fromEntries(CONCERNS.map((c) => [c.id, c]))

export const OPTIONS = {
  ideation: [
    { id: 'none', label: 'None' },
    { id: 'passive', label: 'Passive (wish to be dead, no intent)' },
    { id: 'active', label: 'Active, no plan or intent' },
    { id: 'plan', label: 'Active with plan or intent' },
  ],
  violence: [
    { id: 'none', label: 'None' },
    { id: 'history', label: 'History only, none current' },
    { id: 'current', label: 'Current thoughts, no intent' },
    { id: 'imminent', label: 'Intent or imminent risk' },
  ],
  psychosis: [
    { id: 'none', label: 'None' },
    { id: 'stable', label: 'Present but stable' },
    { id: 'active', label: 'Active, impairing' },
  ],
  mania: [
    { id: 'none', label: 'None' },
    { id: 'mild', label: 'Mild / hypomanic, functioning' },
    { id: 'acute', label: 'Acute mania' },
  ],
  substance: [
    { id: 'none', label: 'None' },
    { id: 'use', label: 'Use, no withdrawal risk' },
    { id: 'withdrawal', label: 'Withdrawal risk / needs detox' },
  ],
  medical: [
    { id: 'stable', label: 'Stable' },
    { id: 'monitored', label: 'Stable with outpatient monitoring' },
    { id: 'unstable', label: 'Unstable' },
  ],
  cognition: [
    { id: 'full', label: 'Can take part in 3-hour groups' },
    { id: 'limited', label: 'Limited; needs accommodation' },
    { id: 'unable', label: 'Unable to take part in groups' },
  ],
  willing: [
    { id: 'yes', label: 'Willing to attend' },
    { id: 'ambivalent', label: 'Ambivalent' },
    { id: 'no', label: 'Declines' },
  ],
  schedule: [
    { id: 'yes', label: 'Can attend the schedule' },
    { id: 'help', label: 'Needs schedule help (work, school, childcare)' },
    { id: 'no', label: 'Cannot attend any offered schedule' },
  ],
  transport: [
    { id: 'yes', label: 'Has reliable transport' },
    { id: 'help', label: 'Needs transport help' },
    { id: 'no', label: 'No transport' },
  ],
  payer: [
    { id: 'commercial', label: 'Commercial' },
    { id: 'medicare', label: 'Medicare' },
    { id: 'medicaid', label: 'Medicaid' },
    { id: 'self', label: 'Self-pay' },
    { id: 'other', label: 'Other / unknown' },
  ],
  auth: [
    { id: 'not-needed', label: 'Not required' },
    { id: 'pending', label: 'Pending' },
    { id: 'approved', label: 'Approved' },
    { id: 'denied', label: 'Denied' },
  ],
}

export const STATUSES = [
  { id: 'screening', label: 'Screening' },
  { id: 'pending', label: 'Awaiting items' },
  { id: 'scheduled', label: 'Start scheduled' },
  { id: 'admitted', label: 'Admitted' },
  { id: 'referred', label: 'Referred elsewhere' },
  { id: 'declined', label: 'Declined / closed' },
]
export const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]))

/* ------------------------------------------------------------------ tracks */

// Default program tracks. A service edits names, schedules, capacity and which
// tracks it actually runs in Program setup; the matching logic reads `fits`.
export const DEFAULT_IOP_TRACKS = [
  { id: 'mood', name: 'Adult Mood & Anxiety IOP', population: 'adult', fits: ['depression', 'anxiety', 'bipolar', 'ocd', 'psychosis'], schedule: '3 hours a day, 3 days a week', hoursPerWeek: 9, weeks: 6, capacity: 12, telehealth: true, enabled: true },
  { id: 'dbt', name: 'DBT Skills IOP', population: 'adult', fits: ['dysregulation'], schedule: '3 hours a day, 3 days a week', hoursPerWeek: 9, weeks: 8, capacity: 10, telehealth: false, enabled: true },
  { id: 'trauma', name: 'Trauma-Focused IOP', population: 'adult', fits: ['trauma'], schedule: '3 hours a day, 3 days a week', hoursPerWeek: 9, weeks: 8, capacity: 10, telehealth: true, enabled: true },
  { id: 'cod', name: 'Co-Occurring IOP', population: 'adult', fits: ['substance'], cooccurring: true, schedule: '3 hours a day, 4 days a week', hoursPerWeek: 12, weeks: 8, capacity: 12, telehealth: false, enabled: true },
  { id: 'sud', name: 'Substance Use IOP (ASAM 2.1)', population: 'adult', fits: ['substance'], schedule: '3 hours a day, 3 days a week', hoursPerWeek: 9, weeks: 8, capacity: 14, telehealth: true, enabled: true },
  { id: 'adolescent', name: 'Adolescent IOP', population: 'adolescent', fits: ['depression', 'anxiety', 'trauma', 'ocd', 'dysregulation', 'bipolar', 'substance', 'eating', 'psychosis'], schedule: '3 hours after school, 3 days a week, plus a weekly family session', hoursPerWeek: 9, weeks: 6, capacity: 10, telehealth: false, enabled: true },
]

export function normalizeTracks(tracks) {
  const list = Array.isArray(tracks) && tracks.length ? tracks : DEFAULT_IOP_TRACKS
  return list.map((t) => ({ ...DEFAULT_IOP_TRACKS.find((d) => d.id === t.id), ...t }))
}

/* ------------------------------------------------------------------ intake */

/** A blank intake with every field present and the least-concerning default. */
export function emptyIntake() {
  return {
    caseLabel: '',
    population: 'adult',
    referralSource: 'outpatient',
    referralDate: new Date().toISOString().slice(0, 10),
    concerns: [],
    // safety
    ideation: 'none',
    recentAttempt: false,
    selfHarm: false,
    violence: 'none',
    safetyPlan: true,
    // stability
    psychosis: 'none',
    mania: 'none',
    substance: 'none',
    medical: 'stable',
    cognition: 'full',
    // intensity (the six shared AcuiPath dimensions, 1–5)
    scores: emptyScores(),
    phq9: '',
    gad7: '',
    // readiness and logistics
    willing: 'yes',
    schedule: 'yes',
    transport: 'yes',
    telehealthOk: false,
    payer: 'commercial',
    auth: 'not-needed',
    notes: '',
  }
}

const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))

/* ------------------------------------------------------------------ engine */

// Severity of a single finding. A 'stop' sends the referral above IOP; an
// 'exclude' means IOP cannot work as offered; a 'fix' makes the result
// conditional; 'note' is information the clinician should see.
const SEV_ORDER = { stop: 0, exclude: 1, fix: 2, note: 3 }

/**
 * Screen an intake for IOP.
 *
 * Returns the disposition, the recommended level if not IOP, every finding with
 * its severity and reason, an eight-criterion checklist, the matched track, a
 * treatment plan outline, an intake task list, a target start date, and a
 * plain-language summary for the chart.
 */
export function screenIop(intake, { tracks, today } = {}) {
  const i = { ...emptyIntake(), ...(intake || {}) }
  const trackList = normalizeTracks(tracks)
  const adolescent = i.population === 'adolescent'
  const stepDown = !!SOURCE_BY_ID[i.referralSource]?.stepDown
  const loc = screenLevelOfCare(i.scores, { population: i.population })
  const phq9 = num(i.phq9)
  const gad7 = num(i.gad7)
  const findings = []
  const add = (sev, id, text, fix) => findings.push({ sev, id, text, fix: fix || null })

  /* 1 · hard stops: needs more than IOP */
  let higher = null // the level we would send them to instead
  const up = (level, id, text) => {
    add('stop', id, text)
    const rank = { php: 1, residential: 2, withdrawal: 2, inpatient: 3 }
    if (!higher || rank[level] > rank[higher]) higher = level
  }
  if (i.ideation === 'plan') up('inpatient', 'si-plan', 'Active suicidal ideation with plan or intent: same-day safety evaluation; consider inpatient.')
  if (i.violence === 'imminent') up('inpatient', 'violence', 'Intent or imminent risk of violence: same-day evaluation; IOP cannot hold this safely.')
  if (i.recentAttempt && !i.safetyPlan) up('php', 'attempt-no-plan', 'Recent attempt or preparatory behavior without a workable safety plan: needs a more structured level first.')
  if (i.mania === 'acute') up('inpatient', 'mania', 'Acute mania: stabilize at a higher level before group-based care.')
  if (i.psychosis === 'active') up('php', 'psychosis', 'Active, impairing psychosis: stabilize first; IOP once symptoms allow group participation.')
  if (i.substance === 'withdrawal') up('withdrawal', 'withdrawal', 'Withdrawal risk: medically managed withdrawal first, then IOP.')
  if (i.medical === 'unstable') up('inpatient', 'medical', 'Medically unstable: medical stabilization comes first.')
  if (loc.level.order >= 4) up(loc.level.id === 'inpatient' ? 'inpatient' : 'residential', 'intensity-24h', `Overall need (${loc.total}/30) points to ${loc.level.label.toLowerCase()}.`)
  else if (loc.level.order === 3 && !stepDown) up('php', 'intensity-php', `Overall need (${loc.total}/30) is in the partial hospitalization band; consider PHP, or IOP with close review.`)
  else if (loc.level.order === 3 && stepDown) add('note', 'intensity-php-stepdown', `Overall need (${loc.total}/30) is still in the PHP band. As a step-down this can be IOP, with weekly review and a low bar to step back up.`)

  /* 2 · safety that IOP can hold, with the right plan */
  if (i.ideation === 'active') add(i.safetyPlan ? 'note' : 'fix', 'si-active', 'Active ideation without plan: IOP is appropriate with a written safety plan and crisis access between sessions.', i.safetyPlan ? null : 'Complete a safety plan before start')
  if (i.ideation === 'passive') add('note', 'si-passive', 'Passive ideation: monitor at every session (PHQ-9 item 9).')
  if (i.recentAttempt && i.safetyPlan) add('note', 'attempt-plan', 'Recent attempt or preparatory behavior with a safety plan: IOP possible with weekly risk review and lethal-means counseling.')
  if (i.selfHarm) add('note', 'self-harm', 'Recent non-suicidal self-harm: a skills-based track fits; review safety weekly.')
  if (i.violence === 'current') add('fix', 'violence-current', 'Current thoughts of violence without intent: needs a documented risk plan before group start.', 'Document a violence risk plan')
  if (!i.safetyPlan && (i.ideation !== 'none' || i.selfHarm) && !findings.some((f) => f.id === 'si-active' || f.sev === 'stop')) add('fix', 'safety-plan', 'Any ideation or self-harm calls for a safety plan before start.', 'Complete a safety plan before start')

  /* 3 · participation */
  if (i.cognition === 'unable') add('exclude', 'cognition', 'Cannot take part in group-based programming: consider individual intensive services instead.')
  if (i.cognition === 'limited') add('fix', 'cognition-limited', 'Limited capacity for 3-hour groups: plan accommodations or a shorter-day track.', 'Agree group accommodations')
  if (i.psychosis === 'stable') add('note', 'psychosis-stable', 'Stable psychotic disorder: confirm a prescriber is following.')
  if (i.mania === 'mild') add('note', 'mania-mild', 'Mild or hypomanic symptoms: prescriber review in week one.')
  if (i.willing === 'no') add('exclude', 'declines', 'Declines IOP: offer routine outpatient, motivational follow-up, and a re-referral path.')
  if (i.willing === 'ambivalent') add('fix', 'ambivalent', 'Ambivalent about attending: a motivational intake call before start improves attendance.', 'Motivational intake call')

  /* 4 · logistics and coverage */
  const virtualTrackExists = trackList.some((t) => t.enabled && t.telehealth)
  if (i.schedule === 'no') {
    if (i.telehealthOk && virtualTrackExists) add('fix', 'schedule-virtual', 'Cannot attend in person on the offered schedule: a virtual track may work.', 'Confirm virtual schedule')
    else add('exclude', 'schedule', 'Cannot attend any offered schedule.')
  }
  if (i.schedule === 'help') add('fix', 'schedule-help', 'Needs schedule help (work, school or childcare).', 'Work, school or childcare letter')
  if (i.transport === 'no') {
    if (i.telehealthOk && virtualTrackExists) add('fix', 'transport-virtual', 'No transport: a virtual track removes the barrier.', 'Confirm virtual participation')
    else add('fix', 'transport', 'No transport: arrange transport before start.', 'Arrange transport')
  }
  if (i.transport === 'help') add('fix', 'transport-help', 'Needs transport help.', 'Arrange transport')
  if (i.auth === 'pending') add('fix', 'auth-pending', 'Authorization pending.', 'Obtain authorization')
  if (i.auth === 'denied') add('fix', 'auth-denied', 'Authorization denied: appeal, peer-to-peer review, or alternative funding.', 'Appeal or find funding')
  if (i.payer === 'medicare') add('note', 'medicare', 'Medicare IOP needs a physician certification that the person requires at least 9 hours of services a week, and a plan of care.')

  /* 5 · measures */
  if (phq9 != null && phq9 >= 20) add('note', 'phq9-severe', `PHQ-9 ${phq9} (severe): prescriber review in week one.`)
  if (gad7 != null && gad7 >= 15) add('note', 'gad7-severe', `GAD-7 ${gad7} (severe).`)
  if (phq9 == null) add('fix', 'phq9-missing', 'No baseline PHQ-9.', 'Baseline PHQ-9')

  /* 6 · intensity: is IOP more than they need? */
  const belowIop = loc.level.order <= 1 && !stepDown
  if (belowIop && !higher) add('note', 'intensity-low', `Overall need (${loc.total}/30) is in the ${loc.level.label.toLowerCase()} band; routine outpatient may be enough.`)

  /* ----- disposition */
  const stops = findings.filter((f) => f.sev === 'stop')
  const excludes = findings.filter((f) => f.sev === 'exclude')
  const fixes = findings.filter((f) => f.sev === 'fix')
  let disposition
  if (stops.length) disposition = 'higher'
  else if (excludes.length) disposition = 'alternative'
  else if (belowIop) disposition = 'lower'
  else if (fixes.length) disposition = 'conditional'
  else disposition = 'eligible'

  /* ----- criteria (what a reviewer checks, in order) */
  const has = (id) => findings.some((f) => f.id === id)
  const criteria = [
    { id: 'more-than-op', label: 'Needs more than routine outpatient', met: !belowIop, detail: stepDown ? `Step-down from ${SOURCE_BY_ID[i.referralSource].label.replace(' step-down', '').toLowerCase()}; overall need ${loc.total}/30.` : `Overall need ${loc.total}/30 (${loc.level.label}).` },
    { id: 'not-24h', label: 'Does not need 24-hour or day-hospital care', met: !stops.length, detail: stops.length ? stops.map((s) => s.text.split(':')[0]).join('; ') : 'No hard stops.' },
    { id: 'safe', label: 'Can stay safe between sessions', met: !stops.some((s) => ['si-plan', 'violence', 'attempt-no-plan'].includes(s.id)) && !has('safety-plan') && !(has('si-active') && !i.safetyPlan), detail: i.safetyPlan ? 'Safety plan in place or not needed.' : 'Safety plan needed.' },
    { id: 'medical', label: 'Medically stable; no withdrawal management needed', met: i.medical !== 'unstable' && i.substance !== 'withdrawal', detail: OPTIONS.medical.find((o) => o.id === i.medical)?.label },
    { id: 'participate', label: 'Able to take part in group programming', met: i.cognition !== 'unable' && i.psychosis !== 'active' && i.mania !== 'acute', detail: OPTIONS.cognition.find((o) => o.id === i.cognition)?.label },
    { id: 'willing', label: 'Willing to attend', met: i.willing === 'yes' ? true : i.willing === 'no' ? false : null, detail: OPTIONS.willing.find((o) => o.id === i.willing)?.label },
    { id: 'attend', label: 'Can attend the schedule', met: i.schedule === 'yes' && i.transport === 'yes' ? true : (i.schedule === 'no' && !(i.telehealthOk && virtualTrackExists)) ? false : null, detail: [OPTIONS.schedule.find((o) => o.id === i.schedule)?.label, OPTIONS.transport.find((o) => o.id === i.transport)?.label].join('; ') },
    { id: 'coverage', label: 'Coverage in place', met: i.auth === 'approved' || i.auth === 'not-needed' ? true : i.auth === 'denied' ? false : null, detail: `${OPTIONS.payer.find((o) => o.id === i.payer)?.label}; authorization ${OPTIONS.auth.find((o) => o.id === i.auth)?.label.toLowerCase()}.` },
  ]

  /* ----- track */
  const track = matchTrack(i, trackList)

  /* ----- plan, tasks, timing */
  const plan = disposition === 'eligible' || disposition === 'conditional' ? buildPlan(i, track, { phq9, stepDown, loc }) : null
  const tasks = buildTasks(i, { disposition, findings, track, stepDown })
  const targetDays = stepDown ? 7 : (i.ideation !== 'none' || i.recentAttempt || i.selfHarm || (phq9 != null && phq9 >= 20)) ? 7 : 14
  const base = today ? new Date(today) : new Date(`${i.referralDate || new Date().toISOString().slice(0, 10)}T12:00:00`)
  const target = new Date(base.getTime() + targetDays * 864e5).toISOString().slice(0, 10)

  const result = {
    disposition,
    dispositionLabel: DISPOSITIONS[disposition].label,
    higherLevel: higher ? HIGHER_LEVELS[higher] : null,
    stepDown,
    loc: { total: loc.total, level: loc.level, flags: loc.flags, contributions: loc.contributions },
    findings: findings.sort((a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev]),
    criteria,
    criteriaMet: criteria.filter((c) => c.met === true).length,
    track,
    plan,
    tasks,
    targetStart: { days: targetDays, date: target, reason: stepDown ? 'Step-down: start within 7 days to keep continuity (and the 7-day follow-up window).' : targetDays === 7 ? 'Safety or severity: start within 7 days.' : 'Routine referral: start within 14 days.' },
    adolescent,
  }
  result.summary = summarize(i, result)
  return result
}

export const DISPOSITIONS = {
  eligible: { label: 'Eligible for IOP', tone: 'good', blurb: 'Meets every criterion. Schedule the start.' },
  conditional: { label: 'Eligible once items are resolved', tone: 'warn', blurb: 'Clinically appropriate. Resolve the named items, then start.' },
  higher: { label: 'Needs a higher level first', tone: 'stop', blurb: 'Something here needs more than IOP can safely give. Step up, then re-screen.' },
  lower: { label: 'Routine outpatient may be enough', tone: 'info', blurb: 'Need is below the IOP band. Consider outpatient therapy or medication management.' },
  alternative: { label: 'IOP cannot work as offered', tone: 'stop', blurb: 'A barrier rules out the program as it runs today. Offer an alternative.' },
}

export const HIGHER_LEVELS = {
  php: { id: 'php', label: 'Partial hospitalization (PHP)' },
  residential: { id: 'residential', label: 'Residential / 24-hour supervised care' },
  withdrawal: { id: 'withdrawal', label: 'Medically managed withdrawal' },
  inpatient: { id: 'inpatient', label: 'Acute inpatient / same-day evaluation' },
}

/** Best-fitting enabled track, and why. Adolescents only match adolescent tracks. */
export function matchTrack(i, tracks) {
  const concerns = i.concerns || []
  const pool = normalizeTracks(tracks).filter((t) => t.enabled && t.population === i.population)
  if (!pool.length) return null
  const substance = concerns.includes('substance') || i.substance === 'use'
  const psychiatric = concerns.some((c) => c !== 'substance')
  const scored = pool.map((t) => {
    let score = 0
    const why = []
    const hits = concerns.filter((c) => t.fits.includes(c))
    score += hits.length * 2
    if (hits.length) why.push(hits.map((h) => CONCERN_BY_ID[h]?.label || h).join(', '))
    if (t.cooccurring) { if (substance && psychiatric) { score += 4; why.push('co-occurring substance use and mental health needs') } else score -= 3 }
    if (t.id === 'sud' && substance && psychiatric) score -= 1 // prefer co-occurring when both
    if (substance && t.fits.includes('substance') && !concerns.includes('substance')) { score += 1; why.push('substance use reported') }
    if (i.selfHarm && t.fits.includes('dysregulation')) { score += 2; why.push('recent self-harm') }
    if ((i.schedule === 'no' || i.transport === 'no') && i.telehealthOk) score += t.telehealth ? 2 : -2
    return { t, score, why }
  }).sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best.score <= 0 && concerns.length) return { ...best.t, why: 'Closest available track; no direct match for the presenting concerns.', fit: 'weak' }
  return { ...best.t, why: best.why.length ? `Matches ${best.why.join('; ')}.` : 'Default track for this population.', fit: best.score >= 2 ? 'strong' : 'fair' }
}

function buildPlan(i, track, { phq9, stepDown, loc }) {
  const adolescent = i.population === 'adolescent'
  const hours = track?.hoursPerWeek || 9
  const components = [
    'Group psychotherapy, the core of each program day',
    'Individual therapy at least weekly',
    'Psychiatric evaluation in week one, then medication management as needed',
    'PHQ-9 / GAD-7 every week, with a re-screen on worsening or item 9 > 0',
  ]
  if (adolescent) components.push('Weekly family session, plus school coordination')
  if (i.concerns.includes('substance') || i.substance === 'use') components.push('Substance use assessment, relapse-prevention groups and toxicology as indicated')
  if (i.ideation !== 'none' || i.selfHarm || i.recentAttempt) components.push('Safety-plan review at every visit; lethal-means counseling')
  if (i.concerns.includes('eating')) components.push('Medical and nutrition monitoring with the primary care physician')
  return {
    hoursPerWeek: hours,
    minimumNote: adolescent ? 'IOP for adolescents typically runs 6–19 hours a week (ASAM Level 2.1 concept).' : 'IOP for adults typically runs 9–19 hours a week (ASAM Level 2.1; Medicare requires at least 9).',
    schedule: track?.schedule || '3 hours a day, 3 days a week',
    weeks: track?.weeks || 6,
    components,
    reviewEvery: 'Weekly treatment-team review; step-down to outpatient when PHQ-9 falls 50% or below 10, attendance is steady and goals are met.',
    stepDownTo: 'Routine outpatient therapy and medication management, booked before IOP discharge.',
    stepUpIf: 'Item 9 rises, a new attempt or plan, two missed days in a week, or PHQ-9 up 5 or more points.',
    baselinePhq9: phq9,
    stepDownContinuity: stepDown,
    intensityBand: loc.level.label,
  }
}

function buildTasks(i, { disposition, findings, track, stepDown }) {
  const t = []
  const push = (id, label, why) => t.push({ id, label, why: why || null })
  if (disposition === 'higher') {
    push('higher-referral', 'Arrange the higher level of care', 'Hard stop found at screening.')
    push('rescreen', 'Re-screen for IOP at step-down', 'Most people stepping down from a higher level are good IOP candidates.')
    return t
  }
  if (disposition === 'alternative' || disposition === 'lower') {
    push('alt-referral', disposition === 'lower' ? 'Refer to routine outpatient' : 'Offer and document an alternative', null)
    push('rescreen', 'Set a re-referral path if needs change', null)
    return t
  }
  push('consent', 'Consent to treatment and program agreement')
  push('roi', `Release of information for ${SOURCE_BY_ID[i.referralSource]?.label.toLowerCase() || 'the referral source'} and primary care`)
  if (i.auth === 'pending' || i.auth === 'denied') push('auth', i.auth === 'denied' ? 'Appeal the authorization or find funding' : 'Obtain insurance authorization')
  if (i.payer === 'medicare') push('cert', 'Physician certification (≥ 9 hours a week) and plan of care', 'Medicare IOP requirement.')
  push('psych-eval', 'Psychiatric evaluation booked for week one')
  push('baseline', 'Baseline PHQ-9 and GAD-7', findings.some((f) => f.id === 'phq9-missing') ? 'Not yet recorded.' : 'Recorded at screening; repeat on day one.')
  push('med-rec', 'Medication reconciliation')
  if (i.ideation !== 'none' || i.selfHarm || i.recentAttempt || !i.safetyPlan) push('safety-plan', 'Written safety plan and crisis numbers', 'Ideation, self-harm or attempt reported.')
  if (i.violence === 'current') push('violence-plan', 'Violence risk plan documented')
  if (i.concerns.includes('substance') || i.substance === 'use') push('asam', 'Substance use assessment (ASAM dimensions)')
  if (i.medical === 'monitored' || i.concerns.includes('eating')) push('medical', 'Medical clearance and monitoring plan with primary care')
  if (i.population === 'adolescent') push('family', 'Family orientation session and school letter')
  if (i.transport !== 'yes') push('transport', 'Arrange transport')
  if (i.schedule === 'help') push('schedule', 'Work, school or childcare accommodation letter')
  if (i.willing === 'ambivalent') push('mi-call', 'Motivational intake call')
  if (i.cognition === 'limited') push('accommodation', 'Agree group accommodations')
  if (findings.some((f) => f.id === 'schedule-virtual' || f.id === 'transport-virtual')) push('virtual', 'Confirm virtual participation: device, private space, connection')
  if (stepDown) push('handoff', 'Warm handoff from the discharging team', 'Step-down continuity.')
  push('orientation', `Orientation and start date in ${track?.name || 'the IOP'}`)
  return t
}

function summarize(i, r) {
  const parts = []
  const who = `${POPULATION_LABEL[i.population] || 'Adult'} referral${i.caseLabel ? ` (${i.caseLabel})` : ''} from ${(SOURCE_BY_ID[i.referralSource]?.label || 'unknown source').toLowerCase()}`
  parts.push(`${who}. AcuiStep IOP screen: ${r.dispositionLabel.toLowerCase()}.`)
  parts.push(`Overall need ${r.loc.total}/30, in the ${r.loc.level.label} band; ${r.criteriaMet} of ${r.criteria.length} IOP criteria met.`)
  if (r.higherLevel) parts.push(`Recommended: ${r.higherLevel.label}. Reason: ${r.findings.filter((f) => f.sev === 'stop').map((f) => f.text.split(':')[0]).join('; ')}.`)
  if (r.track && (r.disposition === 'eligible' || r.disposition === 'conditional')) parts.push(`Track: ${r.track.name}, ${r.track.schedule}, about ${r.track.weeks} weeks. ${r.track.why}`)
  const fixes = r.findings.filter((f) => f.sev === 'fix' && f.fix)
  if (fixes.length) parts.push(`Before start: ${[...new Set(fixes.map((f) => f.fix))].join('; ')}.`)
  if (r.disposition === 'eligible' || r.disposition === 'conditional') parts.push(`Target start by ${r.targetStart.date}.`)
  parts.push('Decision support only; the treating clinician confirms the level of care.')
  return parts.join(' ')
}

/* ------------------------------------------------------------- program view */

/** Census, open slots and waiting list per track, from saved intakes. */
export function programCensus(intakes = [], tracks) {
  const list = normalizeTracks(tracks).filter((t) => t.enabled)
  return list.map((t) => {
    const mine = intakes.filter((x) => x.trackId === t.id)
    const admitted = mine.filter((x) => x.status === 'admitted').length
    const scheduled = mine.filter((x) => x.status === 'scheduled').length
    const waiting = mine.filter((x) => x.status === 'pending' || x.status === 'screening').length
    return { track: t, admitted, scheduled, waiting, open: Math.max(0, (t.capacity || 0) - admitted - scheduled), capacity: t.capacity || 0 }
  })
}

/** Days from referral to now (or to start), for the queue. */
export function daysWaiting(intake, today = new Date()) {
  if (!intake?.referralDate) return null
  const a = Date.parse(`${intake.referralDate}T12:00:00`)
  return Math.max(0, Math.round((today.getTime() - a) / 864e5))
}

export { DIMENSIONS }
