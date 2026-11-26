# 3. Access control & audit

## Sign-in

- **Single sign-on only.** People sign in with their organization account
  through Microsoft Entra ID, using Azure Static Web Apps authentication or the
  organization's identity-aware proxy. Acuitas never sees or stores a password.
  MFA and conditional access come from the organization's Entra ID policies.
- **Every route requires sign-in.** That includes the app, the API and static
  files (`staticwebapp.config.json`, `"allowedRoles": ["authenticated"]`). An
  unauthenticated request is redirected to sign-in. The only exceptions are
  `/api/health` and the role-assignment hook, and neither returns data.
- **How the service knows who is calling.** It reads the identity that the sign-in
  layer verified. Under Static Web Apps this is the `x-ms-client-principal`
  header, which the platform sets on every request and which clients cannot
  forge. Behind a proxy, it is the proxy's identity headers, optionally
  protected by a shared secret, with the service reachable only from the proxy.
- **The demonstration build is different.** It uses a shared access password and
  a self-chosen role, and says so on screen. It is not used for service-line
  data.

## Roles

Directory groups (or Entra app roles) map to six roles in `ACUITAS_ROLE_MAP`. A
person in several mapped groups gets the most capable role. A signed-in person
in none of them gets **Viewer**, which is read-only.

| Role | Purpose |
|---|---|
| Administrator | Settings, locations, AcuiCalc™ calibration, users' view of the audit log |
| House supervisor | Runs the region: deployments, plans, capacity and safety |
| Charge nurse | Logs shifts, deployments and safety events |
| Outpatient clinician | AcuiPath and AcuiStep screening, discharge follow-up, PHQ-9 / GAD-7 |
| Quality & finance | Outcomes, cost rates, audit log (read-mostly) |
| Viewer | Read-only boards and reports |

## Server-side permissions

The data service checks every request against this matrix before it touches the
database. R = read, C = create, U = update, D = delete. The matrix below is
generated from the running rules (`api/src/core/rules.js`), which are tested
role by role against an independently written expectation.

| Collection | Admin | Supv | Charge | OP clin. | Q&F | Viewer |
|---|---|---|---|---|---|---|
| `appState` | RCUD | R | R | R | R | R |
| `entries` | RCUD | RCUD | RCU | R | R | R |
| `deployments` | RCUD | RCUD | RCU | R | R | R |
| `safetyEvents` | RCUD | RCUD | RCU | R | R | R |
| `locationCaps` | RCUD | RCUD | RCUD | R | R | R |
| `planLog` | RCUD | RC | — | — | R | — |
| `opPatients` | RCUD | R | — | RCUD | R | — |
| `iopIntakes` | RCUD | R | — | RCUD | R | — |
| `opProviders` | RCUD | R | — | R | R | — |
| `opDischarges` | RCUD | R | — | RCUD | R | — |
| `opAssessments` | RCUD | — | — | RCUD | R | — |
| `opOutcomes` | RCUD | R | — | RCUD | R | — |
| `auditLog` | RC | C | C | C | RC | C |
| `appConfig/acuiCalibration` | RCU | R | R | R | R | R |
| `appConfig/costRates` | RCUD | R | R | R | RCUD | R |
| `appConfig/censusPrefill` | RCUD | RCUD | R | R | R | R |
| `appConfig/(other settings)` | RCUD | R | R | R | R | R |

Additional rules, also enforced on the server:

- **Audit entries.**
  - An entry can only be created, never updated or deleted, by anyone,
    administrators included.
  - The recorded actor must be the signed-in person, and the recorded role must
    be their actual role.
  - Each new entry must extend the latest one: same next sequence number, and a
    link to the latest hash. A writer that raced someone else is told where the
    chain now ends and rebuilds its entry, so the log is one strict sequence.
- **AcuiCalc™ calibration (the GREEN/YELLOW/RED cutoffs and point values).**
  Only an Administrator can save it. On the server, a save must:
  - add exactly one version, with the next version number;
  - leave every earlier version byte-for-byte unchanged;
  - name the signed-in Administrator as its author;
  - carry a written reason and the reviewing frontline nurses;
  - keep point values within ±25% of the shipped defaults and the locked items;
  - keep every zone set in order (0 < GREEN < YELLOW).

  It can never be deleted. Moving a unit between the ED and pediatric ED zone
  sets, or changing its type, is audited unit by unit with before and after
  values. How cutoffs are set and tested is in `docs/cutoff-standard.md`.
- **Input.** Only known collections are accepted, record ids are validated,
  request bodies are limited to 5 MB, and all SQL is parameterized.

## Audit trail

| Property | How |
|---|---|
| What is recorded | Every change made anywhere in the app: shift entries, deployments, caps, locations, calibration (old and new values, reason, reviewers), imports, plans, safety events, outpatient records, sign-ins |
| Who and when | Sign-in name, role, timestamp, action, record id, a short summary of changed fields (never free-text notes) |
| Append-only | Enforced in the data service; by a database trigger that refuses UPDATE or DELETE of any audit row (`tr_acuitas_audit_append_only`); and by least-privilege grants (no DDL, no TRUNCATE) |
| Tamper evidence | Each entry stores the SHA-256 hash of the previous entry and of its own content. **Settings → Audit log → Verify chain** recomputes every hash and names the first entry that was edited, deleted or inserted |
| Who can read it | Administrators and Quality & finance |
| Database-level history | The organization's database auditing (e.g. SQL Server Audit) can be layered on top |

## Open items

- The identity team supplies the Entra ID group object IDs for each role.
