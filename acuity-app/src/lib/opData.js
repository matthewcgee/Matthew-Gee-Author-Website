// AcuiPath™ data — every outpatient collection and setting, in one place.
//
// The screen, caseload, discharge bridge, measurement-based care and outcome
// views all read and write through here. In local mode the data stays in the
// browser under the same keys AcuiPath has always used, so existing caseloads
// carry over. On a configured backend each collection syncs live across users.

import { useCollection, useConfigValue, audit } from './store.js'
import { screenLevelOfCare, DEFAULT_AP_THRESHOLDS } from './loc.js'
import { DEFAULT_TIER1_TRIGGERS } from './tier1.js'
import { dischargeToOpPatient } from './fuh.js'
import { buildSampleOutpatient } from './demoData.js'

export const DEFAULT_PROGRAMS = [
  'Therapy only', 'Medication management', 'Neuromodulation',
  'Substance use program', 'Eating disorders program',
]

export const OP_KEYS = {
  patients: 'bhai:opPatients',
  providers: 'bhai:opProviders',
  programs: 'bhai:opPrograms',
  thresholds: 'bhai:apThresholds',
  triggers: 'bhai:apTier1Triggers',
  discharges: 'bhai:opDischarges',
  assessments: 'bhai:opAssessments',
  outcomes: 'bhai:opOutcomes',
}

export function useOutpatientData() {
  const [patients, patientsApi] = useCollection('opPatients', { localKey: OP_KEYS.patients, auditAs: 'opPatients' })
  const [providers, providersApi] = useCollection('opProviders', { localKey: OP_KEYS.providers, auditAs: 'opProviders' })
  const [discharges, dischargesApi] = useCollection('opDischarges', { localKey: OP_KEYS.discharges, auditAs: 'opDischarges' })
  const [assessments, assessmentsApi] = useCollection('opAssessments', { localKey: OP_KEYS.assessments, auditAs: 'opAssessments' })
  const [outcomes, outcomesApi] = useCollection('opOutcomes', { localKey: OP_KEYS.outcomes, auditAs: 'opOutcomes' })
  const [programs, setPrograms] = useConfigValue('opPrograms', { localKey: OP_KEYS.programs, initial: DEFAULT_PROGRAMS })
  const [thresholds, setThresholds] = useConfigValue('apThresholds', { localKey: OP_KEYS.thresholds, initial: DEFAULT_AP_THRESHOLDS })
  const [triggers, setTriggers] = useConfigValue('apTier1Triggers', { localKey: OP_KEYS.triggers, initial: DEFAULT_TIER1_TRIGGERS })
  return {
    patients, patientsApi,
    providers, providersApi,
    discharges, dischargesApi,
    assessments, assessmentsApi,
    outcomes, outcomesApi,
    programs: programs || DEFAULT_PROGRAMS, setPrograms,
    thresholds: thresholds || DEFAULT_AP_THRESHOLDS, setThresholds,
    triggers: triggers || DEFAULT_TIER1_TRIGGERS, setTriggers,
  }
}

// Re-screen a sample record through the current engine and thresholds, so the
// stored level, attending determination and routability always match today's
// settings rather than a hardcoded value.
export function screenSampleRecord(r, thresholds) {
  const res = screenLevelOfCare(r.scores, { population: r.population, thresholds })
  return {
    id: r.id, name: r.name, population: r.population, scores: r.scores, tier: '2-full',
    level: res.level.id, levelLabel: res.level.label, opAppropriate: res.opAppropriate,
    riskScore: r.scores.risk, requiresAttending: res.attending.required, attendingReasons: res.attending.reasons,
    routableOutpatient: res.routableOutpatient, phpIopConsider: res.phpIop.consider, acuteSafety: res.acuteSafety.flag,
    needs: r.needs, specialties: r.specialties, symptoms: r.symptoms,
    program: r.program, telehealthOnly: r.telehealthOnly, urgencyDays: r.urgencyDays, createdAt: r.createdAt, demo: true,
  }
}

/** Replace every outpatient collection with the de-identified sample. */
export async function loadOutpatientSample(d) {
  const s = buildSampleOutpatient()
  const screened = s.patients.map((r) => screenSampleRecord(r, d.thresholds))
  // Discharges already bridged into AcuiPath join the caseload as priority cases.
  const bridged = s.discharges.filter((x) => x.bridged).map((x) => ({ ...dischargeToOpPatient(x), demo: true }))
  const discharges = s.discharges.map((x) => (x.bridged ? { ...x, bridgedPatientId: `bridge_${x.id}` } : x))
  audit('data.sample', 'acuipath', { patients: screened.length + bridged.length })
  d.setPrograms(s.programs)
  await d.patientsApi.replace([...screened, ...bridged])
  await d.providersApi.replace(s.providers)
  await d.dischargesApi.replace(discharges)
  await d.assessmentsApi.replace(s.assessments)
  await d.outcomesApi.replace(s.outcomes)
}

export async function clearOutpatientData(d) {
  await d.patientsApi.replace([])
  await d.providersApi.replace([])
  await d.dischargesApi.replace([])
  await d.assessmentsApi.replace([])
  await d.outcomesApi.replace([])
}
