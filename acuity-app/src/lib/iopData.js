// AcuiStep™ data — IOP intakes and program tracks.
//
// Intakes are one shared collection (`iopIntakes`); program tracks are one
// shared setting (`appConfig/iopTracks`). In local mode both stay in the
// browser; on a configured backend they sync live and are audited like every
// other AcuiPath record. Each saved intake keeps its raw answers, so the screen
// is always re-run against today's engine and tracks, plus the last
// disposition and track for the queue and census.

import { useCollection, useConfigValue, audit } from './store.js'
import { screenIop, emptyIntake, DEFAULT_IOP_TRACKS, normalizeTracks } from './iop.js'
import { buildSampleOutpatient } from './demoData.js'
import { screenSampleRecord } from './opData.js'
import { DEFAULT_AP_THRESHOLDS } from './loc.js'

export const IOP_KEYS = { intakes: 'bhai:iopIntakes', tracks: 'bhai:iopTracks' }

export function useIopData() {
  const [intakes, intakesApi] = useCollection('iopIntakes', { localKey: IOP_KEYS.intakes, auditAs: 'iopIntakes' })
  const [tracks, setTracks] = useConfigValue('iopTracks', { localKey: IOP_KEYS.tracks, initial: DEFAULT_IOP_TRACKS })
  return { intakes, intakesApi, tracks: normalizeTracks(tracks), setTracks }
}

/** Build the stored record for an intake: answers, plus the screen's headline. */
export function intakeRecord(answers, { id, tracks, status, tasksDone, by, createdAt } = {}) {
  const r = screenIop(answers, { tracks })
  const autoStatus = r.disposition === 'higher' || r.disposition === 'alternative' || r.disposition === 'lower' ? 'referred'
    : r.disposition === 'conditional' ? 'pending' : 'screening'
  return {
    ...emptyIntake(),
    ...answers,
    id: id || `iop_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    disposition: r.disposition,
    trackId: r.track?.id || null,
    trackName: r.track?.name || null,
    targetStart: r.targetStart.date,
    status: status || autoStatus,
    tasksDone: tasksDone || {},
    by: by || null,
    createdAt: createdAt || Date.now(),
    updatedAt: Date.now(),
  }
}

/* -------------------------------------------------- AcuiPath → AcuiStep */

// AcuiPath symptoms map onto AcuiStep presenting concerns for the track match.
const SYMPTOM_TO_CONCERN = {
  depression: 'depression', trd: 'depression', perinatal: 'depression', anxiety: 'anxiety', ocd: 'ocd',
  trauma: 'trauma', eating: 'eating', substance: 'substance', psychosis: 'psychosis', mania: 'bipolar',
}

/** Should this AcuiPath record go to AcuiStep? Automatic when the screen recommends IOP. */
export function acuiPathRecommendsIop(pt) {
  return !!pt && pt.level === 'iop' && !pt.acuteSafety
}

/**
 * Turn an AcuiPath case into AcuiStep answers. The six dimension scores carry
 * over as they are; safety, stability and readiness were not asked in
 * AcuiPath, so they are left for the clinician to confirm (`pendingSections`).
 */
export function intakeFromAcuiPath(pt, { assessments = [] } = {}) {
  const latest = (inst) => assessments
    .filter((a) => a.patientId === pt.id && a.instrument === inst && a.total != null)
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : (y.createdAt || 0) - (x.createdAt || 0)))[0]?.total
  const concerns = [...new Set((pt.symptoms || []).map((s) => SYMPTOM_TO_CONCERN[s]).filter(Boolean))]
  const phq9 = latest('PHQ-9'), gad7 = latest('GAD-7')
  return {
    ...emptyIntake(),
    caseLabel: pt.name || '',
    population: pt.population === 'adolescent' ? 'adolescent' : 'adult',
    referralSource: pt.bridge ? 'inpatient' : 'acuipath',
    referralDate: new Date().toISOString().slice(0, 10),
    concerns,
    substance: (pt.symptoms || []).includes('substance') ? 'use' : 'none',
    scores: { ...emptyIntake().scores, ...(pt.scores || {}) },
    phq9: phq9 ?? '',
    gad7: gad7 ?? '',
    telehealthOk: !!pt.telehealthOnly,
    pendingSections: ['safety', 'stability', 'readiness'],
    fromAcuiPath: pt.id,
  }
}

/**
 * Send an AcuiPath case to AcuiStep. One intake per AcuiPath case: a re-screen
 * refreshes the carried-over scores and concerns of an intake still in
 * screening, and never overwrites answers a clinician has already confirmed.
 * Returns the intake id.
 */
export function sendToAcuiStep(io, pt, { assessments = [], by = null } = {}) {
  const fresh = intakeFromAcuiPath(pt, { assessments })
  const existing = io.intakes.find((x) => x.fromAcuiPath === pt.id)
  if (existing) {
    if (existing.status === 'screening' || existing.status === 'pending') {
      const merged = { ...existing, scores: fresh.scores, concerns: [...new Set([...(existing.concerns || []), ...fresh.concerns])], phq9: existing.phq9 === '' ? fresh.phq9 : existing.phq9, gad7: existing.gad7 === '' ? fresh.gad7 : existing.gad7 }
      io.intakesApi.upsert(intakeRecord(merged, { id: existing.id, tracks: io.tracks, status: existing.status, tasksDone: existing.tasksDone, by: existing.by, createdAt: existing.createdAt }))
    }
    return existing.id
  }
  const rec = intakeRecord(fresh, { tracks: io.tracks, by, status: 'screening' })
  io.intakesApi.add(rec)
  audit('acuistep.fromAcuiPath', rec.id, { acuipathId: pt.id })
  return rec.id
}

/* ---------------------------------------------------------- sample intakes */

const d = (offset) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10)
const S = (risk, fn, co, st, su, en) => ({ risk, function: fn, comorbidity: co, stress: st, support: su, engagement: en })

// De-identified, synthetic referrals covering every disposition and track.
export function buildSampleIntakes(tracks) {
  const raw = [
    { caseLabel: 'IOP-2401', referralSource: 'inpatient', referralDate: d(3), concerns: ['depression'], ideation: 'passive', recentAttempt: true, safetyPlan: true, scores: S(3, 3, 2, 3, 3, 3), phq9: 18, gad7: 11, payer: 'commercial', auth: 'approved', _status: 'scheduled', _done: ['consent', 'roi', 'psych-eval', 'baseline', 'safety-plan', 'handoff'] },
    { caseLabel: 'IOP-2402', referralSource: 'outpatient', referralDate: d(9), concerns: ['anxiety', 'depression'], scores: S(2, 3, 2, 3, 2, 3), phq9: 14, gad7: 16, payer: 'commercial', auth: 'approved', _status: 'admitted', _done: ['consent', 'roi', 'psych-eval', 'baseline', 'med-rec', 'orientation'] },
    { caseLabel: 'IOP-2403', referralSource: 'ed', referralDate: d(2), concerns: ['substance', 'depression'], substance: 'use', scores: S(2, 3, 3, 3, 3, 3), phq9: 15, gad7: 9, payer: 'medicaid', auth: 'pending', _done: ['consent'] },
    { caseLabel: 'IOP-2404', referralSource: 'pcp', referralDate: d(5), concerns: ['dysregulation'], selfHarm: true, ideation: 'active', safetyPlan: false, scores: S(3, 3, 2, 3, 3, 3), phq9: 17, gad7: 13, payer: 'commercial', auth: 'not-needed', willing: 'ambivalent', _done: [] },
    { caseLabel: 'IOP-2405', referralSource: 'self', referralDate: d(1), concerns: ['depression'], ideation: 'plan', scores: S(4, 3, 2, 3, 3, 3), phq9: 24, gad7: 14, payer: 'commercial' },
    { caseLabel: 'IOP-2406', referralSource: 'school', referralDate: d(4), population: 'adolescent', concerns: ['anxiety', 'depression'], scores: S(2, 3, 2, 3, 2, 3), phq9: 13, gad7: 14, payer: 'medicaid', auth: 'approved', transport: 'help', _done: ['consent', 'roi', 'baseline'] },
    { caseLabel: 'IOP-2407', referralSource: 'php', referralDate: d(6), concerns: ['trauma'], scores: S(2, 3, 2, 4, 3, 3), phq9: 12, gad7: 15, payer: 'medicare', auth: 'approved', _status: 'admitted', _done: ['consent', 'roi', 'cert', 'psych-eval', 'baseline', 'med-rec', 'handoff', 'orientation'] },
    { caseLabel: 'IOP-2408', referralSource: 'outpatient', referralDate: d(8), concerns: ['substance'], substance: 'withdrawal', scores: S(2, 3, 4, 3, 3, 3), phq9: 9, gad7: 8, payer: 'commercial' },
    { caseLabel: 'IOP-2409', referralSource: 'pcp', referralDate: d(10), concerns: ['anxiety'], scores: S(1, 2, 1, 2, 2, 2), phq9: 7, gad7: 11, payer: 'commercial' },
    { caseLabel: 'IOP-2410', referralSource: 'outpatient', referralDate: d(12), concerns: ['depression', 'anxiety'], scores: S(2, 3, 2, 3, 3, 3), phq9: 15, gad7: 12, payer: 'commercial', auth: 'approved', _status: 'admitted', _done: ['consent', 'roi', 'psych-eval', 'baseline', 'med-rec', 'orientation'] },
    { caseLabel: 'IOP-2411', referralSource: 'inpatient', referralDate: d(4), concerns: ['substance', 'bipolar'], substance: 'use', mania: 'mild', scores: S(2, 3, 3, 3, 3, 3), phq9: 11, gad7: 7, payer: 'medicaid', auth: 'approved', _status: 'scheduled', _done: ['consent', 'roi', 'psych-eval', 'baseline', 'asam'] },
    { caseLabel: 'IOP-2412', referralSource: 'outpatient', referralDate: d(7), concerns: ['depression'], scores: S(2, 3, 2, 3, 2, 3), phq9: 16, gad7: 10, payer: 'commercial', schedule: 'no', telehealthOk: true, auth: 'approved', _done: ['consent'] },
  ]
  return raw.map(({ _status, _done = [], ...a }, k) => {
    const rec = intakeRecord({ ...emptyIntake(), ...a, scores: { ...emptyIntake().scores, ...a.scores } }, {
      id: `iop_sample_${k + 1}`, tracks, createdAt: Date.now() - (k + 1) * 3600e3,
      tasksDone: Object.fromEntries(_done.map((t) => [t, true])),
    })
    const admittedOn = _status === 'admitted' ? new Date(Date.parse(`${rec.referralDate}T12:00:00`) + (4 + (k % 4)) * 864e5).toISOString().slice(0, 10) : undefined
    return { ...rec, ...(_status ? { status: _status } : {}), ...(admittedOn ? { admittedOn } : {}), demo: true }
  })
}

/** Sample AcuiPath cases that screen to IOP, already sent across, as the live flow would. */
export function buildSampleFromAcuiPath(tracks) {
  return buildSampleOutpatient().patients
    .map((p) => screenSampleRecord(p, DEFAULT_AP_THRESHOLDS))
    .filter(acuiPathRecommendsIop)
    .map((pt) => ({ ...intakeRecord(intakeFromAcuiPath(pt), { id: `iop_from_${pt.id}`, tracks, status: 'screening' }), demo: true }))
}

export async function loadIopSample(io) {
  const sample = [...buildSampleIntakes(io.tracks), ...buildSampleFromAcuiPath(io.tracks)]
  audit('data.sample', 'acuistep', { intakes: sample.length })
  io.setTracks(DEFAULT_IOP_TRACKS)
  await io.intakesApi.replace(sample)
}

export async function clearIopData(io) {
  await io.intakesApi.replace([])
}
