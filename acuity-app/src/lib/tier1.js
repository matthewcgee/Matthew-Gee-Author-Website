// Acuitas™ AcuiPath — Tier 1 chart-review triage
//
// The first, lightweight pass: a nurse reviews the chart only — no patient
// contact — and decides one thing. Either the case is straightforward enough to
// place directly into an outpatient clinic, or something in the chart warrants a
// closer look, which routes it to the in-depth Tier 2 screen (with a phone
// screen / patient discussion).
//
// The logic is deliberately simple and conservative: the review is a list of
// red-flag triggers, and ANY trigger escalates. A clean review (no triggers) is
// the only path to a direct placement. That asymmetry is on purpose — it is safe
// to over-refer to the deeper screen and unsafe to under-refer.
//
// The trigger list is org-configurable, because what counts as a red flag from a
// chart varies by service. These are only the defaults.

export const DEFAULT_TIER1_TRIGGERS = [
  { id: 'risk', label: 'Documented suicidal / self-harm risk, ideation, or recent attempt' },
  { id: 'aggression', label: 'History of violence or aggression toward others' },
  { id: 'recent_hospitalization', label: 'Psychiatric hospitalization or ED visit in the last 90 days' },
  { id: 'substance', label: 'Active substance use or withdrawal risk' },
  { id: 'comorbidity', label: 'Multiple or unstable co-occurring conditions / polypharmacy' },
  { id: 'diagnostic_uncertainty', label: 'No established diagnosis, or diagnostic uncertainty' },
  { id: 'treatment_failure', label: 'Repeated prior treatment failures or multiple past trials' },
  { id: 'functional', label: 'Significant functional impairment documented' },
  { id: 'forensic', label: 'Forensic, court-ordered, or guardianship involvement' },
  { id: 'special_population', label: 'Specialty need (perinatal, eating disorder, first-episode psychosis, etc.)' },
  { id: 'engagement', label: 'Engagement concern (pattern of no-shows, AMA, disengagement)' },
]

/**
 * Evaluate a Tier 1 chart review.
 *
 * @param checkedIds  ids of the triggers the nurse found in the chart
 * @param triggers    the (possibly customized) trigger list
 * @returns { escalate, triggered:[{id,label}], disposition }
 *          disposition is 'escalate' (any trigger present) or 'direct'
 *          (clean review → eligible for simple direct placement).
 */
export function evaluateTier1(checkedIds = [], triggers = DEFAULT_TIER1_TRIGGERS) {
  const set = new Set(checkedIds)
  const triggered = triggers.filter((t) => set.has(t.id))
  const escalate = triggered.length > 0
  return {
    escalate,
    triggered,
    count: triggered.length,
    disposition: escalate ? 'escalate' : 'direct',
  }
}

// A direct Tier 1 placement is, by definition, a clean chart review: no red
// flags, so it is routed to routine outpatient and does not require an attending
// (a resident may see it). Tier 2 is where attending determinations are made.
export function directPlacementDefaults() {
  return { tier: '1-direct', requiresAttending: false, routableOutpatient: true }
}
