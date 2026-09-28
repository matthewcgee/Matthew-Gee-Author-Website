// Acuitas™ AcuiPath — Symptom-to-program recommendation
//
// Turns a checklist of the patient's current presenting symptoms into a
// recommended clinic / program. Like everything in AcuiPath this is decision
// support: it suggests, transparently, and the clinician confirms or overrides.
//
// Programs are org-configurable free-text names, so this cannot map a symptom to
// a fixed program string. Instead each symptom points at a program *concept*,
// and the concept is matched to whatever the site has actually named its clinics
// by keyword — so "Neuromodulation", "TMS/ECT clinic", or "Interventional
// psychiatry" all satisfy the neuromodulation concept. If a concept has no
// matching configured program, the recommendation says so rather than guessing.

// Presenting symptoms. `concept` is the program family the symptom points to;
// `prescriber` flags symptoms for which medication management is typically
// indicated (surfaced as a hint, never auto-applied).
export const SYMPTOMS = [
  { id: 'depression', label: 'Depressed mood / anhedonia', concept: 'therapy' },
  { id: 'anxiety', label: 'Anxiety / panic', concept: 'therapy' },
  { id: 'ocd', label: 'Obsessive–compulsive symptoms', concept: 'therapy' },
  { id: 'trauma', label: 'Trauma / PTSD symptoms', concept: 'therapy' },
  { id: 'trd', label: 'Treatment-resistant depression (≥2 failed adequate trials)', concept: 'neuromodulation', prescriber: true },
  { id: 'catatonia', label: 'Catatonia', concept: 'neuromodulation', prescriber: true },
  { id: 'eating', label: 'Disordered eating', concept: 'eating' },
  { id: 'substance', label: 'Active substance use', concept: 'substance' },
  { id: 'psychosis', label: 'Psychotic symptoms (esp. first-episode)', concept: 'first-episode', prescriber: true },
  { id: 'mania', label: 'Manic / hypomanic symptoms', concept: 'medication', prescriber: true },
  { id: 'perinatal', label: 'Perinatal / peripartum onset', concept: 'perinatal' },
]

export const SYMPTOM_BY_ID = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s]))

// Program concepts, most-determinative first. A specialized concept (a patient
// with an eating disorder, a treatment-resistant depression) should win over a
// generic one (therapy) when both are present.
export const CONCEPTS = {
  neuromodulation: { priority: 90, label: 'Neuromodulation', keywords: /neuromod|tms|ect|interventional|ketamine|spravato|esketamine/i },
  eating: { priority: 80, label: 'Eating disorders program', keywords: /eating|\bed\b|ednos|anorexi|bulimi/i },
  perinatal: { priority: 75, label: 'Perinatal program', keywords: /perinat|peripartum|maternal|postpartum/i },
  'first-episode': { priority: 70, label: 'First-episode / early psychosis', keywords: /first.?episode|early psychosis|\bfep\b|psychosis|coordinated specialty/i },
  substance: { priority: 65, label: 'Substance use program', keywords: /substance|\bsud\b|addiction|dual diagnosis|mat\b/i },
  medication: { priority: 40, label: 'Medication management', keywords: /medication|med management|med mgmt|pharmac|prescrib/i },
  therapy: { priority: 20, label: 'Therapy', keywords: /therapy|psychotherapy|counsel|\bcbt\b|\bdbt\b/i },
}

// Find the configured program whose name matches a concept, if any.
export function matchProgram(concept, programs = []) {
  const spec = CONCEPTS[concept]
  if (!spec) return null
  return programs.find((p) => spec.keywords.test(p)) || null
}

/**
 * Recommend a clinic / program from checked symptoms, falling back to the
 * patient's service needs when no symptoms are checked.
 *
 * Returns:
 *   concept        the winning program concept id
 *   program        the matched configured program name, or null if none matches
 *   matched        whether a configured program was found for the concept
 *   conceptLabel   human label for the concept (for the "add a program" hint)
 *   rationale      the symptom labels that drove the recommendation
 *   prescriberHint true if a driving symptom typically indicates medication
 *   secondary      other triggered concepts (with matched program if any)
 *   source         'symptoms' | 'needs' | 'none'
 */
export function recommendProgram({ symptoms = [], needs = {}, programs = [] } = {}) {
  const chosen = symptoms.map((id) => SYMPTOM_BY_ID[id]).filter(Boolean)

  if (chosen.length === 0) {
    // No symptoms yet — fall back to the service the patient needs.
    const concept = needs.prescriber && !needs.therapy ? 'medication'
      : needs.therapy && !needs.prescriber ? 'therapy'
      : needs.prescriber ? 'medication' : 'therapy'
    const program = matchProgram(concept, programs) || programs[0] || ''
    return {
      concept, program, matched: !!matchProgram(concept, programs),
      conceptLabel: CONCEPTS[concept].label, rationale: [], prescriberHint: false,
      secondary: [], source: programs.length ? 'needs' : 'none',
    }
  }

  // Group symptoms by concept, keep the highest-priority concept as primary.
  const byConcept = new Map()
  for (const s of chosen) {
    if (!byConcept.has(s.concept)) byConcept.set(s.concept, [])
    byConcept.get(s.concept).push(s)
  }
  const ranked = [...byConcept.keys()].sort((a, b) => CONCEPTS[b].priority - CONCEPTS[a].priority)
  const primary = ranked[0]

  const primarySymptoms = byConcept.get(primary)
  const program = matchProgram(primary, programs)
  const prescriberHint = primarySymptoms.some((s) => s.prescriber)

  const secondary = ranked.slice(1).map((c) => ({
    concept: c,
    label: CONCEPTS[c].label,
    program: matchProgram(c, programs),
    symptoms: byConcept.get(c).map((s) => s.label),
  }))

  return {
    concept: primary,
    program: program || '',
    matched: !!program,
    conceptLabel: CONCEPTS[primary].label,
    rationale: primarySymptoms.map((s) => s.label),
    prescriberHint,
    secondary,
    source: 'symptoms',
  }
}
