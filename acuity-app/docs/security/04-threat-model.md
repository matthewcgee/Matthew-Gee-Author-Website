# 4. Threat model (STRIDE)

Scope: the service-line deployment, meaning the web app, data service, database
and sign-in layer, as described in section 1.

| Threat | Example | Control | Residual risk |
|---|---|---|---|
| **Spoofing** identity | Someone calls the API pretending to be a supervisor | SSO on every route; identity taken only from the sign-in layer's verified header; the service is not reachable except through it; development sign-in refused when `NODE_ENV=production` | Depends on correct hosting configuration (verified by the "Confirm it works" checks) |
| Spoofing in the audit log | A user records an entry under another person's name | Service rejects audit entries whose actor or role differ from the caller | Low |
| **Tampering** with records | A charge nurse edits a calibration or deletes entries through the API directly | Role checks on every call, independent of the interface; tested role by role | Low |
| Tampering with the audit log | A database administrator edits or deletes audit rows | Trigger refuses UPDATE/DELETE; hash chain exposes any change made with the trigger disabled | An administrator with DDL rights could disable the trigger. Separation of duties and database auditing cover this, and the hash chain still detects the change |
| Tampering with calibration history | Rewriting an earlier AcuiCalc™ version to change past scoring | Service accepts only appends; each saved shift stores the version and zone cutoffs it was scored under | Low |
| SQL injection | Crafted ids or values | Parameterized queries only; id pattern validation; JSON stored as data | Low |
| **Repudiation** | "I didn't change that" | Attributed, hash-chained audit entry for every change | Low |
| **Information disclosure** | A charge nurse reads outpatient assessments | Read permissions per collection; the change feed does not even name collections a role cannot read | Low |
| Disclosure in transit or at rest | Network capture; lost backup | TLS everywhere; database encryption at rest (TDE on Azure SQL by default); organization backup controls | Per organization policy |
| Disclosure to third parties | Telemetry, CDN or font requests leaking usage | No third-party requests at all; Content Security Policy restricts the page to the same site | Low |
| Cross-site scripting | Script injected through a unit name or note | React escapes all rendered text; no HTML injection points; CSP forbids external scripts and framing | Low |
| Clickjacking | App framed by another site | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | Low |
| **Denial of service** | Flooding the API | Body size limit; Azure platform protections; polling interval backs off in background tabs | Moderate; rate limiting can be added at the gateway (Azure Front Door or API Management) if required |
| Availability of the database | Outage during a shift | Paper downtime procedure (section 7); the app keeps the last loaded data on screen | Per organization BC/DR |
| **Elevation of privilege** | A user without a mapped group gains rights | No mapped group means Viewer; the most capable *mapped* role wins, never an unmapped claim | Low |
| Misconfigured role map | A broad group mapped to Administrator | Role map is one reviewed setting; administrators are visible in Settings → People & access | Process control |

## Testing performed

- The service's behavior suite covers each of the controls above. It runs on
  every build against an in-memory store, and against **Microsoft SQL Server 2022
  and PostgreSQL 16**:
  - 401 without identity;
  - 403 per role and collection;
  - append-only audit (also at the database level, beneath the service);
  - audit actor and role;
  - strict audit sequence under concurrent writers;
  - calibration append-only;
  - atomic concurrent updates;
  - id and body validation.
- Two-user browser tests on each database confirmed:
  - one user's shift entry appeared on the other's screen within 1–2 seconds;
  - a forged calibration request from a charge nurse was refused (403);
  - the audit chain verified intact.

## Open items

- A penetration test of the deployed instance, by the organization's security
  team or its usual vendor, before go-live.
