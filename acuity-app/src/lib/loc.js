// Acuitas™ Level-of-Care Screener
//
// Screens a behavioral health patient for the appropriate level of care along
// the outpatient-to-inpatient continuum, and — the question that motivates it —
// whether the outpatient setting is appropriate at all.
//
// WHAT THIS IS, AND IS NOT
//
// This is decision support. It organizes the clinical dimensions a level-of-care
// decision already turns on, produces a recommendation, and shows its reasoning
// so a licensed clinician can agree or override. It does NOT make the decision,
// and it is not a substitute for clinical judgment.
//
// It is aligned to the concepts behind the established instruments — LOCUS and
// CASII for psychiatric level of care, ASAM for substance use — but it is an
// original scale. It does not reproduce those copyrighted instruments, and where
// a payer or regulation requires the actual LOCUS/CASII/ASAM determination, this
// does not replace it. Unlike those instruments it carries no validation study;
// the band cut points below are a transparent, adjustable starting calibration,
// not an empirically fitted one.
//
// The design mirrors the rest of Acuitas: every recommendation decomposes into
// parts you can see, and the tool refuses to average away an acute risk.

export const POPULATIONS = {
  adult: { id: 'adult', label: 'Adult', framework: 'LOCUS-aligned' },
  adolescent: { id: 'adolescent', label: 'Child / Adolescent', framework: 'CASII-aligned' },
}

// The six dimensions are shared across populations; only the anchor wording
// differs, because an adolescent's functioning and supports are read through
// family, school and development rather than work and independent living.
export const DIMENSIONS = ['risk', 'function', 'comorbidity', 'stress', 'support', 'engagement']

// Every dimension is scored 1 (minimal concern) to 5 (severe). Higher is always
// worse, including for support — a 5 on "support" means support is absent, not
// abundant — so the dimensions sum in a single consistent direction.
export const SCORE_MIN = 1
export const SCORE_MAX = 5

const ADULT_ANCHORS = {
  risk: {
    label: 'Risk of harm',
    detail: 'Suicide or self-harm, violence to others, or inability to keep oneself safe.',
    anchors: [
      'No current risk; no ideation.',
      'Passive or fleeting ideation, no intent or plan, future-oriented.',
      'Ideation with some intent but no specific plan or means; can contract for safety.',
      'Active ideation with plan or means, or recent attempt; safety uncertain without support.',
      'Imminent risk: plan and intent, access to means, or unable to maintain safety.',
    ],
  },
  function: {
    label: 'Functional status',
    detail: 'Ability to meet role, self-care and daily-living demands.',
    anchors: [
      'Functioning within normal limits across roles.',
      'Mild, situational impairment; roles largely intact.',
      'Moderate impairment in one or more major roles (work, self-care, relationships).',
      'Serious impairment across most roles; struggling with basic self-care.',
      'Unable to function or care for self without substantial external support.',
    ],
  },
  comorbidity: {
    label: 'Co-occurring complexity',
    detail: 'Interacting medical, substance-use and psychiatric conditions.',
    anchors: [
      'No significant co-occurring medical or substance issues.',
      'A stable co-occurring condition, well controlled.',
      'A co-occurring condition needing active management alongside behavioral care.',
      'Unstable co-occurring illness or active substance use complicating treatment.',
      'Acute co-occurring crisis (e.g., withdrawal risk, unstable medical illness) driving need.',
    ],
  },
  stress: {
    label: 'Environmental stress',
    detail: 'Destabilizing stressors in the recovery environment.',
    anchors: [
      'Stable environment; no significant stressors.',
      'Ordinary life stressors, manageable.',
      'Meaningful stressors (housing, finances, conflict) straining coping.',
      'Severe or compounding stressors actively destabilizing the patient.',
      'Environment is unsafe or in crisis (violence, homelessness, acute loss).',
    ],
  },
  support: {
    label: 'Support availability',
    detail: 'Presence of people and resources that aid recovery (5 = none).',
    anchors: [
      'Strong, reliable support network engaged in care.',
      'Adequate support with some gaps.',
      'Limited support; a few inconsistent connections.',
      'Minimal support; largely isolated.',
      'No available support; alone or in an actively unsupportive setting.',
    ],
  },
  engagement: {
    label: 'Treatment history & engagement',
    detail: 'Response to prior care, adherence, and motivation now.',
    anchors: [
      'Engaged and motivated; prior treatment effective.',
      'Generally engaged; minor adherence gaps.',
      'Ambivalent engagement or partial response to prior care.',
      'Poor engagement or repeated poor response to appropriate treatment.',
      'Refuses or cannot participate; prior care repeatedly unsuccessful.',
    ],
  },
}

const ADOLESCENT_ANCHORS = {
  risk: {
    label: 'Risk of harm',
    detail: 'Self-harm or suicidality, aggression, or inability to be kept safe in current setting.',
    anchors: [
      'No current risk to self or others.',
      'Passing thoughts of self-harm, no intent, no plan; safe with usual supervision.',
      'Some intent without a specific plan, or aggression needing structure; safety plan holding.',
      'Active plan or means, recent attempt, or aggression the family cannot safely manage.',
      'Imminent danger to self or others; cannot be kept safe in the community.',
    ],
  },
  function: {
    label: 'Functional status',
    detail: 'Functioning across school, family and peer roles for developmental stage.',
    anchors: [
      'Age-appropriate functioning at school, home and with peers.',
      'Mild difficulty in one area (e.g., slipping grades), otherwise intact.',
      'Moderate impairment in school or family functioning.',
      'Serious impairment across school, home and peers; not attending or participating.',
      'Cannot function in age-expected roles without intensive support.',
    ],
  },
  comorbidity: {
    label: 'Co-occurring complexity',
    detail: 'Interacting developmental, medical, substance-use and psychiatric conditions.',
    anchors: [
      'No significant co-occurring conditions.',
      'A stable co-occurring or developmental condition, well supported.',
      'A co-occurring condition needing active management alongside behavioral care.',
      'Unstable co-occurring illness or emerging substance use complicating care.',
      'Acute co-occurring crisis (medical instability, withdrawal risk) driving need.',
    ],
  },
  stress: {
    label: 'Environmental stress',
    detail: 'Destabilizing stress in family, school or community.',
    anchors: [
      'Stable home and school; no significant stressors.',
      'Ordinary developmental or family stressors, manageable.',
      'Meaningful stress (family conflict, bullying, instability) straining coping.',
      'Severe stress actively destabilizing the youth (e.g., placement disruption).',
      'Environment unsafe or in crisis (abuse, neglect, homelessness).',
    ],
  },
  support: {
    label: 'Family & system support',
    detail: 'Caregiver, school and community support for recovery (5 = none).',
    anchors: [
      'Engaged caregivers and a supportive school/community.',
      'Adequate family support with some gaps.',
      'Inconsistent caregiver or school support.',
      'Minimal support; caregivers overwhelmed or largely absent.',
      'No protective support available in the youth’s environment.',
    ],
  },
  engagement: {
    label: 'Resiliency, history & engagement',
    detail: 'Youth and family acceptance of care, response to prior services, and resiliency.',
    anchors: [
      'Youth and family engaged and motivated; prior services helped.',
      'Generally engaged; minor adherence or attendance gaps.',
      'Ambivalent youth or family engagement, or partial response to prior services.',
      'Poor engagement or repeated poor response to appropriate services.',
      'Youth or family refuses or cannot participate; prior services repeatedly unsuccessful.',
    ],
  },
}

export const ANCHORS = { adult: ADULT_ANCHORS, adolescent: ADOLESCENT_ANCHORS }

export function anchorsFor(population) {
  return ANCHORS[population] || ADULT_ANCHORS
}

/* ------------------------------------------------------------ levels of care */

// Ordered least → most intensive. `setting` classifies each for the outpatient
// question: 'below-op' may not need formal OP; 'outpatient' and 'outpatient-
// intensive' ARE the outpatient continuum; 'step-up' and above exceed routine
// outpatient and need a higher level.
export const LEVELS = [
  { id: 'self', order: 0, label: 'Self-management / minimal care', setting: 'below-op',
    detail: 'Below the threshold for formal outpatient treatment; monitoring or self-directed care.' },
  { id: 'op', order: 1, label: 'Outpatient', setting: 'outpatient',
    detail: 'Routine outpatient therapy and/or medication management.' },
  { id: 'iop', order: 2, label: 'Intensive Outpatient (IOP)', setting: 'outpatient-intensive',
    detail: 'Structured outpatient program, roughly 9–19 hours per week.' },
  { id: 'php', order: 3, label: 'Partial Hospitalization (PHP)', setting: 'step-up',
    detail: 'Day-hospital level, roughly 20+ hours per week; exceeds routine outpatient.' },
  { id: 'residential', order: 4, label: 'Residential / 24-hour supervised', setting: 'higher-level',
    detail: '24-hour non-hospital supervised care.' },
  { id: 'inpatient', order: 5, label: 'Acute inpatient', setting: 'higher-level',
    detail: '24-hour hospital-level acute stabilization.' },
]

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l]))
export const levelByOrder = (order) => LEVELS.find((l) => l.order === order) || LEVELS[LEVELS.length - 1]

// Composite (sum of six 1–5 dimensions, range 6–30) → level order. Transparent
// and adjustable; these are calibration, not validated cut points.
const COMPOSITE_BANDS = [
  { max: 9, order: 0 },   // 6–9
  { max: 13, order: 1 },  // 10–13
  { max: 17, order: 2 },  // 14–17
  { max: 22, order: 3 },  // 18–22
  { max: 26, order: 4 },  // 23–26
  { max: 30, order: 5 },  // 27–30
]

function compositeToOrder(total) {
  for (const b of COMPOSITE_BANDS) if (total <= b.max) return b.order
  return 5
}

/* -------------------------------------------------------------- safety net */

// A level-of-care tool that only averaged its dimensions would be dangerous: a
// patient with imminent suicide risk but otherwise stable could score into
// "outpatient". These rules set a FLOOR — a minimum level — that the final
// recommendation can exceed but never fall below, and each carries a reason
// shown to the clinician. The final level is the more intensive of the composite
// band and every triggered floor.
export const SAFETY_RULES = [
  {
    id: 'imminent-risk',
    when: (d) => d.risk >= 5,
    floor: 5,
    label: 'Imminent risk of harm — inpatient safety evaluation indicated regardless of other factors.',
  },
  {
    id: 'acute-risk',
    when: (d) => d.risk === 4,
    floor: 3,
    label: 'Active risk with plan, means or recent attempt — not appropriate for routine outpatient alone.',
  },
  {
    id: 'acute-comorbidity',
    when: (d) => d.comorbidity >= 5,
    floor: 3,
    label: 'Acute co-occurring medical/substance crisis — needs a medically supervised level.',
  },
  {
    id: 'unsafe-environment',
    when: (d) => d.stress >= 5,
    floor: 2,
    label: 'Environment is unsafe or in crisis — routine outpatient unlikely to hold without added structure.',
  },
  {
    id: 'isolated-and-impaired',
    when: (d) => d.support >= 5 && d.function >= 4,
    floor: 2,
    label: 'Seriously impaired with no available support — more structure than routine outpatient is needed.',
  },
]

/* ------------------------------------------------------ AcuiPath thresholds */

// The screen's operational outputs — which clinic, and attending-vs-resident —
// are governed by adjustable thresholds so a service can tune them without a
// code change. PHP/IOP is deliberately NOT a routing output: it is only an
// advisory, surfaced when the overall acuity score crosses `phpIopComposite`.
export const DEFAULT_AP_THRESHOLDS = {
  // Attending required as primary physician when complexity crosses any of:
  attendingRisk: 3,          // risk-of-harm at or above this
  attendingComorbidity: 4,   // co-occurring complexity at or above this
  // Advisory only — "consider PHP/IOP" when the composite reaches this.
  phpIopComposite: 20,
  // Acute-safety: at or above this risk the case is not routine outpatient and
  // needs urgent/same-day evaluation. Kept as a safety guard, not complexity.
  acuteRisk: 4,
}

export function normalizeApThresholds(t) {
  return { ...DEFAULT_AP_THRESHOLDS, ...(t || {}) }
}

/* -------------------------------------------------------------------- score */

function clampScore(v) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, n))
}

// Normalize a dimension map to valid 1–5 scores, defaulting anything missing to
// 1 (minimal concern) so a partial screen is scored conservatively low rather
// than throwing.
export function normalizeScores(scores) {
  const out = {}
  for (const d of DIMENSIONS) out[d] = clampScore(scores?.[d])
  return out
}

/**
 * Screen a patient and recommend a level of care.
 *
 * Returns the composite, the composite-only level, every triggered safety
 * floor, the final recommended level (the more intensive of the two), whether
 * the outpatient setting is appropriate, and a per-dimension contribution list
 * for the glass-box view.
 */
export function screenLevelOfCare(rawScores, { population = 'adult', thresholds, complexityFlag = false } = {}) {
  const scores = normalizeScores(rawScores)
  const th = normalizeApThresholds(thresholds)
  const total = DIMENSIONS.reduce((s, d) => s + scores[d], 0)

  const compositeOrder = compositeToOrder(total)
  const flags = SAFETY_RULES.filter((r) => r.when(scores))
  const floorOrder = flags.reduce((m, r) => Math.max(m, r.floor), 0)

  const finalOrder = Math.max(compositeOrder, floorOrder)
  const level = levelByOrder(finalOrder)
  const compositeLevel = levelByOrder(compositeOrder)

  // The recommendation was raised above the composite band purely by a safety
  // rule — worth calling out, because the number alone would understate it.
  const overridden = finalOrder > compositeOrder

  const anchors = anchorsFor(population)
  const contributions = DIMENSIONS.map((d) => ({
    id: d,
    label: anchors[d].label,
    score: scores[d],
    detail: anchors[d].anchors[scores[d] - 1],
    // Share of the composite this dimension accounts for.
    weight: total > 0 ? scores[d] / total : 0,
  })).sort((a, b) => b.score - a.score)

  /* ----- operational outputs: clinic routing is elsewhere; here we decide
     attending-vs-resident, whether PHP/IOP is worth considering, and whether
     the case is acute enough to fall outside routine outpatient entirely. ----- */

  // Attending required (complexity-based, configurable). Any indicator suffices.
  const attendingReasons = []
  if (scores.risk >= th.attendingRisk) attendingReasons.push('Elevated risk of harm')
  if (scores.comorbidity >= th.attendingComorbidity) attendingReasons.push('Significant co-occurring complexity')
  if (complexityFlag) attendingReasons.push('Diagnostic / treatment complexity flagged by the clinician')
  const attending = { required: attendingReasons.length > 0, reasons: attendingReasons }

  // Acute-safety guard: not routine outpatient, needs urgent evaluation.
  const acuteSafety = {
    flag: scores.risk >= th.acuteRisk,
    reason: scores.risk >= th.acuteRisk
      ? 'Acute risk — not routine outpatient; arrange same-day / urgent evaluation.'
      : null,
  }

  // PHP / IOP is advisory only, gated on the overall acuity composite. It never
  // removes the patient from clinic routing — the clinician decides.
  const phpIop = {
    consider: total >= th.phpIopComposite,
    threshold: th.phpIopComposite,
    reason: total >= th.phpIopComposite
      ? `Overall acuity (${total}) is at or above the PHP/IOP review threshold (${th.phpIopComposite}) — consider a higher level of care.`
      : null,
  }

  // Acute cases are pulled from routine outpatient routing; PHP/IOP advisories
  // are not — they are routed to a clinic with the advisory attached.
  const routableOutpatient = !acuteSafety.flag

  return {
    population,
    scores,
    total,
    maxTotal: DIMENSIONS.length * SCORE_MAX,
    compositeOrder,
    compositeLevel,
    level,
    overridden,
    flags: flags.map((r) => ({ id: r.id, label: r.label, floor: r.floor })),
    contributions,
    setting: level.setting,
    thresholds: th,

    // New operational outputs
    attending,
    acuteSafety,
    phpIop,
    routableOutpatient,

    // Retained for reference/back-compat; no longer the headline routing signal.
    opAppropriate: level.setting === 'outpatient' || level.setting === 'outpatient-intensive',
    opClassification:
      level.setting === 'below-op' ? 'below-outpatient'
      : level.setting === 'outpatient' || level.setting === 'outpatient-intensive' ? 'outpatient-appropriate'
      : 'exceeds-outpatient',
  }
}

// Blank starting scores (all minimal) for a fresh screen.
export function emptyScores() {
  return Object.fromEntries(DIMENSIONS.map((d) => [d, SCORE_MIN]))
}
