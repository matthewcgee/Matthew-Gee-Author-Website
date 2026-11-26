# 8. Answers to common review questions

Organized by the HIPAA Security Rule safeguards (45 CFR 164.308–312). Short
answers, with a pointer to the section that has the detail.

## Administrative safeguards

| Question | Answer |
|---|---|
| Is there a third-party vendor or hosted service? | No. Acuitas runs entirely in the organization's tenant or data center. There is no vendor-hosted component and no outbound data sharing (§1). |
| Is a BAA needed with an Acuitas vendor? | No Acuitas-hosted service exists to sign one for. The database host must be covered by the organization's existing agreements, e.g. its Microsoft BAA for Azure (§2). |
| Does it send data to an external model or prediction service? | No. Forecasts are statistical models computed in the browser from the organization's own data; no external service is called (§1). |
| How are users provisioned and removed? | Through Entra ID group membership. Removing a person from the directory or group removes access at the next sign-in. Acuitas holds no separate accounts (§3). |
| Is access role-based and least-privilege? | Yes. Six roles, enforced on the server; anyone without a mapped group is read-only (§3). |
| Is there a risk analysis? | STRIDE threat model with controls and residual risk (§4). |
| Contingency plan? | Backup through the database platform; paper downtime procedure (§7). |

## Physical safeguards

| Question | Answer |
|---|---|
| Where is data stored? | In the organization's own SQL Server, Azure SQL or PostgreSQL database, in the region and data center it chooses (§1). |
| Are devices required? | No installed software. Any current browser on an organization-managed device. |

## Technical safeguards

| Question | Answer |
|---|---|
| Authentication | Single sign-on through Microsoft Entra ID (MFA and conditional access per organization policy). No local passwords (§3). |
| Unique user identification | Every action is attributed to the signed-in directory identity (§3). |
| Authorization | Per-collection, per-operation checks on the server for every request (§3). |
| Audit controls | Append-only, hash-chained audit log of every change, readable by Administrators and Quality & finance, with built-in verification (§3). |
| Integrity | Database trigger and service rules make audit entries immutable; hash chain makes tampering detectable; calibration history is append-only (§3, §4). |
| Transmission security | TLS for browser → site and service → database. HSTS on. No third-party requests; Content Security Policy restricts the page to its own site (§1). |
| Encryption at rest | Database platform encryption (TDE on by default in Azure SQL; organization standard on-premises) (§2). |
| Session management | Handled by the sign-in layer (Static Web Apps / proxy) under the organization's session policy. |
| Automatic logoff | Follows the organization's Entra ID session and token lifetime policy. |
| Vulnerability management | Shipped dependencies: 0 known vulnerabilities; SBOM provided; audit on every release (§5). |
| Input validation / injection | Parameterized SQL only; validated ids and collections; 5 MB request limit; React output escaping; CSP (§4). |
| Logging of record contents | None. The service logs errors only; the audit log stores field summaries, never free text (§3, §7). |

## Privacy

| Question | Answer |
|---|---|
| Does it store PHI? | The inpatient board stores no patient-level data. The outpatient modules store scores and dates per case, labelled with a case number, never a name or MRN. Treat the database as PHI-capable; the privacy office confirms the classification (§2). |
| Data minimization | No names, MRNs, dates of birth, addresses or EHR clinical notes are collected. FHIR import keeps counts only. AcuiCalc™ initials stay on screen and are never saved (§2). |
| Data export | Administrators can export a JSON backup; the same organization controls apply to that file. |
| Retention and deletion | Records are kept until deleted by a permitted role; audit entries are permanent; the organization's retention schedule applies (§2). |

## Clinical safety

| Question | Answer |
|---|---|
| Is it a medical device? | It is intended for administrative support of facility operations (staffing, capacity, screening workflow), with every decision made by staff. Regulatory counsel should confirm the FD&C Act §520(o)(1)(A) exclusion (README). |
| Can the scoring change without oversight? | No. AcuiCalc™ domains and level descriptions are locked. Point values move at most ±25%. Every change is Administrator-only, needs a reason and frontline nurse reviewers, is versioned and audited, and never re-scores past shifts. |
