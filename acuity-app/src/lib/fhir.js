// Acuitas™ FHIR Census Import
//
// Census is the one acuity input an EHR already knows precisely. This module
// reads it from a standard HL7 FHIR R4 Bundle, so nurses don't retype what the
// ADT system already has. It counts admitted inpatient Encounters by their
// current Location. Many interface engines export exactly this, and so do
// Epic's and Oracle Health's FHIR APIs (Encounter?status=in-progress with
// Location included).
//
// The import fills in census only. Acuity points and staffing still come from
// the charge nurse, because no EHR feed carries them. A FHIR count merges into
// the shift entry already logged for that unit and shift, or waits as a
// pre-filled census for the nurse's next entry.
//
// No patient data is kept. The import reads each Encounter's status, class and
// location to count it, then discards the bundle.

const INPATIENT_CLASSES = new Set(['IMP', 'ACUTE', 'NONAC', 'inpatient', 'IMP-ACUTE', 'PRENC'])

function refId(ref) {
  if (!ref) return null
  const s = String(ref.reference || ref)
  const m = s.match(/Location\/([^/]+)$/)
  return m ? m[1] : null
}

function encounterClassCode(enc) {
  const c = enc.class
  if (!c) return null
  if (Array.isArray(c)) return c[0]?.coding?.[0]?.code || c[0]?.code || null // R5 shape
  return c.code || c.coding?.[0]?.code || null
}

// The location an admitted patient is in now: the active one if marked,
// else the last listed.
function currentLocation(enc) {
  const locs = enc.location || []
  const active = locs.filter((l) => !l.status || l.status === 'active')
  const pick = (active.length ? active : locs)[(active.length ? active : locs).length - 1]
  return pick ? refId(pick.location) : null
}

/**
 * Count in-progress inpatient encounters per FHIR Location, and match each
 * Location to an Acuitas unit: by an explicit mapping first, then by exact
 * name, ignoring case.
 */
export function parseFhirCensus(bundle, { locations = [], mapping = {} } = {}) {
  if (!bundle || bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
    return { ok: false, reason: 'Not a FHIR Bundle. Expected a JSON resource with resourceType "Bundle".' }
  }
  const resources = bundle.entry.map((e) => e.resource).filter(Boolean)
  const fhirLocs = new Map()
  for (const r of resources) {
    if (r.resourceType === 'Location') fhirLocs.set(r.id, r.name || r.alias?.[0] || r.id)
  }

  const counts = new Map()
  let encounters = 0
  let skipped = 0
  for (const r of resources) {
    if (r.resourceType !== 'Encounter') continue
    encounters += 1
    const cls = encounterClassCode(r)
    const inProgress = r.status === 'in-progress' || r.status === 'arrived'
    if (!inProgress || (cls && !INPATIENT_CLASSES.has(cls))) { skipped += 1; continue }
    const lid = currentLocation(r)
    if (!lid) { skipped += 1; continue }
    counts.set(lid, (counts.get(lid) || 0) + 1)
  }

  const byName = new Map(locations.map((l) => [String(l.name).trim().toLowerCase(), l]))
  const byId = new Map(locations.map((l) => [l.id, l]))
  const rows = [...counts].map(([fhirId, census]) => {
    const name = fhirLocs.get(fhirId) || fhirId
    const mapped = mapping[fhirId] ? byId.get(mapping[fhirId]) : null
    const unit = mapped || byName.get(String(name).trim().toLowerCase()) || null
    return { fhirLocationId: fhirId, name, census, locId: unit?.id || null, unitName: unit?.name || null, matchedBy: mapped ? 'mapping' : unit ? 'name' : null }
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)))

  return {
    ok: true,
    asOf: bundle.timestamp || bundle.meta?.lastUpdated || null,
    encounters,
    counted: encounters - skipped,
    skipped,
    rows,
    matched: rows.filter((r) => r.locId),
    unmatched: rows.filter((r) => !r.locId),
  }
}

/**
 * Plan how a parsed census applies to the shift: update the census on entries
 * already logged for that date and shift, or queue a pre-fill for the unit's
 * next entry.
 */
export function planCensusApply(parsed, entries, { date, shift }) {
  const updates = []
  const prefills = {}
  for (const r of parsed?.matched || []) {
    const existing = (entries || [])
      .filter((e) => e.locId === r.locId && e.date === date && e.shift === shift)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]
    if (existing) updates.push({ entryId: existing.id, locId: r.locId, census: r.census, previous: existing.census ?? null })
    else prefills[r.locId] = { census: r.census, date, shift }
  }
  return { updates, prefills }
}

/** A small, valid example bundle for trying the importer. */
export function exampleFhirBundle(locations = []) {
  const ip = locations.filter((l) => l.type !== 'ed').slice(0, 4)
  const entry = []
  ip.forEach((l, i) => {
    const lid = `loc-${i + 1}`
    entry.push({ resource: { resourceType: 'Location', id: lid, name: l.name, status: 'active' } })
    const n = 8 + ((i * 5) % 9)
    for (let k = 0; k < n; k++) {
      entry.push({ resource: {
        resourceType: 'Encounter', id: `enc-${i}-${k}`, status: 'in-progress',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP' },
        location: [{ location: { reference: `Location/${lid}` }, status: 'active' }],
      } })
    }
  })
  entry.push({ resource: { resourceType: 'Encounter', id: 'enc-done', status: 'finished', class: { code: 'IMP' }, location: [{ location: { reference: 'Location/loc-1' } }] } })
  return { resourceType: 'Bundle', type: 'searchset', timestamp: new Date().toISOString(), entry }
}
