// Acuitas™ Measurement-Based Care — PHQ-9 and GAD-7
//
// AcuiScale and the AcuiPath screen are original, transparent scales. This
// module places two widely used validated instruments beside them, for
// patients already in outpatient care:
//
//   PHQ-9  — depression severity (Kroenke, Spitzer & Williams, 2001)
//   GAD-7  — anxiety severity (Spitzer, Kroenke, Williams & Löwe, 2006)
//
// Both were developed with an educational grant from Pfizer, and Pfizer
// states that no permission is required to reproduce, translate, display or
// distribute them, so the items appear here exactly as published.
//
// Scores are tracked over time. When a patient worsens, reports thoughts of
// self-harm, or reaches the severe range, the case is flagged for a fresh
// Tier 2 level-of-care screen. That links measurement-based care to the
// routing decisions the rest of AcuiPath makes.
//
// These are screening and monitoring tools. They support a licensed
// clinician's judgment; they never diagnose or replace a suicide risk
// assessment.

import { dayIndex } from './forecast.js'

export const RESPONSE_OPTIONS = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
]

export const INSTRUMENTS = {
  'PHQ-9': {
    id: 'PHQ-9',
    label: 'PHQ-9 · Depression',
    stem: 'Over the last 2 weeks, how often have you been bothered by any of the following problems?',
    items: [
      'Little interest or pleasure in doing things',
      'Feeling down, depressed, or hopeless',
      'Trouble falling or staying asleep, or sleeping too much',
      'Feeling tired or having little energy',
      'Poor appetite or overeating',
      'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
      'Trouble concentrating on things, such as reading the newspaper or watching television',
      'Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual',
      'Thoughts that you would be better off dead or of hurting yourself in some way',
    ],
    max: 27,
    bands: [
      { max: 4, id: 'minimal', label: 'Minimal' },
      { max: 9, id: 'mild', label: 'Mild' },
      { max: 14, id: 'moderate', label: 'Moderate' },
      { max: 19, id: 'moderately-severe', label: 'Moderately severe' },
      { max: 27, id: 'severe', label: 'Severe' },
    ],
    // A change of 5 points is the commonly used threshold for clinically
    // meaningful change on the PHQ-9.
    meaningfulChange: 5,
    severeAt: 20,
    remissionBelow: 5,
  },
  'GAD-7': {
    id: 'GAD-7',
    label: 'GAD-7 · Anxiety',
    stem: 'Over the last 2 weeks, how often have you been bothered by the following problems?',
    items: [
      'Feeling nervous, anxious or on edge',
      'Not being able to stop or control worrying',
      'Worrying too much about different things',
      'Trouble relaxing',
      'Being so restless that it is hard to sit still',
      'Becoming easily annoyed or irritable',
      'Feeling afraid as if something awful might happen',
    ],
    max: 21,
    bands: [
      { max: 4, id: 'minimal', label: 'Minimal' },
      { max: 9, id: 'mild', label: 'Mild' },
      { max: 14, id: 'moderate', label: 'Moderate' },
      { max: 21, id: 'severe', label: 'Severe' },
    ],
    meaningfulChange: 4,
    severeAt: 15,
    remissionBelow: 5,
  },
}

export function severityOf(instrumentId, total) {
  const inst = INSTRUMENTS[instrumentId]
  if (!inst || total == null) return null
  return inst.bands.find((b) => total <= b.max) || inst.bands[inst.bands.length - 1]
}

/**
 * Score one completed questionnaire. An incomplete questionnaire is not scored
 * (no prorating), so a partial sheet can never pass for a low score.
 */
export function scoreAssessment(instrumentId, items) {
  const inst = INSTRUMENTS[instrumentId]
  if (!inst) return { complete: false, total: null, severity: null }
  const vals = (items || []).slice(0, inst.items.length)
  const complete = vals.length === inst.items.length &&
    vals.every((v) => Number.isInteger(v) && v >= 0 && v <= 3)
  const total = complete ? vals.reduce((s, v) => s + v, 0) : null
  const out = { instrument: instrumentId, complete, total, severity: complete ? severityOf(instrumentId, total) : null }
  if (instrumentId === 'PHQ-9') {
    out.item9 = Number.isInteger(vals[8]) ? vals[8] : null
    out.selfHarmFlag = (vals[8] ?? 0) > 0
  }
  return out
}

/**
 * One patient's trajectory on one instrument: baseline, latest, and the
 * standard response / remission / worsening reads.
 */
export function instrumentTrend(assessments, instrumentId) {
  const inst = INSTRUMENTS[instrumentId]
  const series = (assessments || [])
    .filter((a) => a.instrument === instrumentId && a.total != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)))
  if (!series.length) return null
  const baseline = series[0]
  const latest = series[series.length - 1]
  const previous = series.length > 1 ? series[series.length - 2] : null
  const change = latest.total - baseline.total
  const changeFromPrevious = previous ? latest.total - previous.total : null
  return {
    instrument: instrumentId,
    series: series.map((a) => ({ date: a.date, total: a.total })),
    count: series.length,
    baseline,
    latest,
    previous,
    severity: severityOf(instrumentId, latest.total),
    change,
    changeFromPrevious,
    pctChange: baseline.total > 0 ? change / baseline.total : null,
    // Response needs a meaningful starting score; halving a 4 is not a response.
    response: series.length > 1 && baseline.total >= 10 && latest.total <= baseline.total * 0.5,
    remission: series.length > 1 && baseline.total >= inst.remissionBelow && latest.total < inst.remissionBelow,
    worsening: series.length > 1 && (
      change >= inst.meaningfulChange ||
      (changeFromPrevious != null && changeFromPrevious >= inst.meaningfulChange)
    ),
    selfHarmFlag: instrumentId === 'PHQ-9' ? (latest.items?.[8] ?? 0) > 0 : false,
  }
}

export const TRIGGER_SEVERITY = { urgent: 0, review: 1, due: 2 }

/**
 * Reasons this patient needs attention now, most urgent first. A worsening,
 * severe or self-harm signal recommends a fresh Tier 2 level-of-care screen.
 */
export function rescreenTriggers(assessments, { asOf, staleDays = 30 } = {}) {
  const out = []
  const phq = instrumentTrend(assessments, 'PHQ-9')
  const gad = instrumentTrend(assessments, 'GAD-7')

  if (phq?.selfHarmFlag) {
    out.push({ id: 'self-harm', severity: 'urgent', message: 'PHQ-9 item 9 positive (thoughts of death or self-harm). Complete a suicide risk assessment today, then re-screen Tier 2.' })
  }
  for (const t of [phq, gad]) {
    if (!t) continue
    const inst = INSTRUMENTS[t.instrument]
    if (t.worsening) {
      out.push({ id: `worse-${t.instrument}`, severity: 'review', message: `${t.instrument} rose ${t.changeFromPrevious >= inst.meaningfulChange ? `${t.changeFromPrevious} points since the last measure` : `${t.change} points from baseline`}, at least the ${inst.meaningfulChange}-point threshold for meaningful change. Re-screen Tier 2.` })
    }
    if (t.latest.total >= inst.severeAt && !out.some((o) => o.id === `worse-${t.instrument}`)) {
      out.push({ id: `severe-${t.instrument}`, severity: 'review', message: `${t.instrument} is in the severe range (${t.latest.total}). Review whether the current level of care still fits.` })
    }
  }
  if (asOf) {
    const latestDate = [phq?.latest?.date, gad?.latest?.date].filter(Boolean).sort().pop()
    const days = latestDate ? dayIndex(asOf) - dayIndex(latestDate) : null
    if (days == null) {
      out.push({ id: 'no-baseline', severity: 'due', message: 'No PHQ-9 or GAD-7 on file. Record a baseline.' })
    } else if (days > staleDays) {
      out.push({ id: 'stale', severity: 'due', message: `Last measure was ${days} days ago. Repeat it, at least every ${staleDays} days.` })
    }
  }
  return out.sort((a, b) => TRIGGER_SEVERITY[a.severity] - TRIGGER_SEVERITY[b.severity])
}

/** Caseload view: every patient's latest scores and triggers, most urgent first. */
export function caseloadMbc(patients, assessments, { asOf, staleDays = 30 } = {}) {
  const byPatient = new Map()
  for (const a of assessments || []) {
    if (!byPatient.has(a.patientId)) byPatient.set(a.patientId, [])
    byPatient.get(a.patientId).push(a)
  }
  return (patients || [])
    .map((p) => {
      const list = byPatient.get(p.id) || []
      const triggers = rescreenTriggers(list, { asOf, staleDays })
      return {
        patient: p,
        phq: instrumentTrend(list, 'PHQ-9'),
        gad: instrumentTrend(list, 'GAD-7'),
        triggers,
        top: triggers[0]?.severity ?? null,
      }
    })
    .sort((a, b) =>
      (a.top == null ? 9 : TRIGGER_SEVERITY[a.top]) - (b.top == null ? 9 : TRIGGER_SEVERITY[b.top]) ||
      String(a.patient.name).localeCompare(String(b.patient.name))
    )
}
