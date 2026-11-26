# 2. Data inventory & classification

Each collection is stored as rows of `(collection, id, JSON)` in
`acuitas_records`. The table below lists every collection the service accepts;
it refuses any other.

| Collection | Contents | Patient-level? | Notes |
|---|---|---|---|
| `appState` | Location list (unit name, type, census cap, zone set) and legacy thresholds | No | |
| `entries` | Per unit per shift: date, shift, census, acuity points, staff on shift, patients on 1:1 (a count), cap flag, ED arrivals / boarders / boarding hours, calibration and instrument versions, the charge nurse's shift rating (Manageable / Strained / Unsafe), free-text notes | No | Notes are free text (see below) |
| `deployments` | Date, shift, staff member's name and role, from/to unit, hours, source (float / overtime / agency / internal), notes | No | **Staff names** (workforce information) |
| `locationCaps` | Census cap per unit | No | |
| `safetyEvents` | Unit, date, shift, event type, severity | No | No patient identifiers |
| `planLog` | Recommended staffing moves and their predicted effect | No | |
| `opPatients` | AcuiPath case: case label, population (adult/adolescent), six dimension scores, needs, program, urgency | **Yes (de-identified label)** | Label is a case number; the form instructs "No names or MRNs" |
| `opDischarges` | Case label, unit, discharge date, follow-up scheduled/completed dates | **Yes (dates)** | |
| `opAssessments` | PHQ-9 / GAD-7 item scores and dates per case | **Yes** | |
| `opOutcomes` | Placement outcome per case | **Yes** | |
| `iopIntakes` | AcuiStep IOP screening answers, verdict, track, task status per case | **Yes** | |
| `opProviders` | Provider panel: name, credential, specialties, capacity | No | Workforce information |
| `appConfig` | Settings: AcuiCalc™ calibration (versioned), clinic list, thresholds, cost rates, FHIR location map, census pre-fill counts | No | |
| `auditLog` | Who (sign-in name), role, action, record id, short summary of changed fields, time, hash | No | Never contains free-text notes |

**Not stored anywhere:** patient names, MRNs, dates of birth, addresses, phone
numbers, insurance information, diagnoses or clinical notes from the EHR. The
AcuiCalc™ patient list holds a patient's initials only on the screen, for the
length of the session. Initials are never saved or sent. Only the point total
is pushed to the ED shift record.

**FHIR census import** reads a FHIR bundle in the browser. It keeps only the
count of admitted encounters per location and discards everything else in the
bundle.

## Classification recommendation

- **Inpatient board** (`entries`, `deployments`, `locationCaps`, `safetyEvents`,
  `planLog`, `appState`): confidential operational data. It holds no
  patient-level information.
- **Outpatient modules** (`opPatients`, `opDischarges`, `opAssessments`,
  `opOutcomes`, `iopIntakes`): these hold health information per case,
  including service dates. They are labelled with a case or referral number,
  never a name or MRN. However, HIPAA's de-identification standard treats dates
  more specific than the year, and unique identifying numbers, as identifiers.
  So if the case label is a number the organization can trace back to a
  patient, this data is PHI.

**Recommendation:** treat the Acuitas database as PHI-capable. Host it under the
same controls the organization uses for PHI:
- in an Azure subscription covered by the organization's Business Associate
  Agreement with Microsoft, or on-premises;
- with encryption at rest (Azure SQL applies Transparent Data Encryption by
  default) and TLS in transit;
- with standard backup and retention.

This avoids depending on every user labelling cases correctly.

## Free-text fields

Shift entries and deployments have an optional notes field. Training and the
on-screen guidance tell users never to enter patient identifiers there, but the
app cannot technically prevent it. Hosting under PHI controls, as recommended,
covers this.

## Retention

Records are kept until deleted by a role permitted to delete them. Audit entries
are permanent. The organization's records-retention schedule applies, and
archiving can be done in the database with standard tools.

## Open items

- Privacy office confirms the classification above.
