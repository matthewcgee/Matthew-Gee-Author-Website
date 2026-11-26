# Acuitas — security & architecture packet

This packet is for the information security, privacy, architecture and
accessibility reviewers evaluating Acuitas for service-line use. Each section
states what is true of the current build, how it was checked, and what is still
open.

| # | Section | Answers |
|---|---|---|
| 1 | [Architecture & data flow](01-architecture.md) | What runs where, and what talks to what |
| 2 | [Data inventory & classification](02-data-inventory.md) | Every collection, its fields, and how sensitive it is |
| 3 | [Access control & audit](03-access-control-and-audit.md) | Sign-in, roles, server-side enforcement, the audit trail |
| 4 | [Threat model](04-threat-model.md) | STRIDE analysis and the control for each threat |
| 5 | [Vulnerability management & SBOM](05-vulnerabilities-and-sbom.md) | Dependency scan results and the software bill of materials |
| 6 | [Accessibility](06-accessibility.md) | WCAG 2.1 AA automated results and remediation plan |
| 7 | [Operations, backup & downtime](07-operations.md) | Monitoring, backup, recovery, and the paper fallback |
| 8 | [Answers to common review questions](08-review-questions.md) | Short answers, organized by HIPAA Security Rule safeguard |

## Summary for reviewers

- **What it is:** an operational staffing and patient-flow tool for behavioral
  health. It scores unit acuity, forecasts staffing need, and supports
  outpatient level-of-care screening. It is not a diagnostic device and makes
  no autonomous clinical decisions. A licensed clinician or the house supervisor
  decides every action.
- **Where it runs:** a static web app and a small data service, hosted in the
  organization's own Azure tenant (Azure Static Web Apps with Microsoft Entra
  ID) or on its own servers. Data lives in the organization's **Microsoft SQL
  Server, Azure SQL or PostgreSQL** database.
- **No third parties:**
  - no vendor-hosted service;
  - no external model or prediction service;
  - no analytics, tracking or advertising scripts;
  - no font, CDN or Google requests.

  The browser talks only to the site it was loaded from. A Content Security
  Policy enforces this (`connect-src 'self'`).
- **Identity:** single sign-on through Microsoft Entra ID. The app stores no
  passwords. Directory groups map to six Acuitas roles, and anyone without a
  mapped group gets read-only access.
- **Enforcement:** every read and write is checked on the server against the
  caller's role. The checks are tested role by role.
- **Audit:** every change is recorded with who, which role, when and what. The
  log is append-only in three places:
  - in the service;
  - in a database trigger;
  - in the database grants.

  It is SHA-256 hash-chained, so any tampering is detectable.
- **Data classification:** the inpatient board holds no patient-level data. The
  outpatient modules hold screening scores and dates per case, labelled with a
  case number, never a name or MRN. The privacy office should confirm the
  classification. The recommendation is to host the database under the
  organization's PHI controls (see section 2).
- **Testing:**
  - 449 automated tests run on every build;
  - the data service's behavior suite also runs against real Microsoft SQL
    Server 2022 and PostgreSQL 16 databases;
  - two-user browser tests were run on each database.
- **Open items:** see "Open items" at the end of each section, collected below.

## Open items

| Item | Owner | Section |
|---|---|---|
| Privacy office confirms classification of outpatient case data | Privacy | 2 |
| Penetration test of the deployed instance | Security | 4 |
| Manual accessibility evaluation (screen reader, keyboard) and status-color contrast remediation | Accessibility / development | 6 |
| Upgrade the test-runner toolchain (dev-only findings) | Development | 5 |
| Confirm managed-identity database access in the organization's Azure tenant | Azure team | 1 |
| Load the organization's directory group IDs into `ACUITAS_ROLE_MAP` | Identity team | 3 |
| Print the downtime kit (worksheets and zone card) for every unit before go-live | Nursing operations | 7 |

## Regulatory positioning

Acuitas supports the administrative operation of a health care facility. It
forecasts staffing, tracks capacity and records deployments, and its outpatient
screens organize criteria for a clinician who makes the decision. Section
520(o)(1)(A) of the Federal Food, Drug, and Cosmetic Act excludes software
intended for the administrative support of a health care facility from the
definition of a device. The organization's regulatory counsel should confirm
that this exclusion applies to the intended use here.
