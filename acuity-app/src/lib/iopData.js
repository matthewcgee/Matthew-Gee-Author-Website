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

export async function loadIopSample(io) {
  const sample = buildSampleIntakes(io.tracks)
  audit('data.sample', 'acuistep', { intakes: sample.length })
  io.setTracks(DEFAULT_IOP_TRACKS)
  await io.intakesApi.replace(sample)
}

export async function clearIopData(io) {
  await io.intakesApi.replace([])
}
