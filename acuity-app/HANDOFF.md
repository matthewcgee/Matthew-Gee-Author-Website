# Acuitas™ — Technical Handoff Guide
**Behavioral Health Acuity Intelligence — inpatient to outpatient, powered by AcuiScale™**  
*Patent Pending — © Matthew C. Gee*

---

## What Is This

Acuitas™ is a real-time, predictive behavioral health acuity dashboard. It allows charge nurses and clinical staff to:
- Log shift acuity data per unit (census, points, staffing)
- View color-coded acuity status across an entire region
- Score patient acuity using the built-in AcuiCalc™ calculator
- Track staff deployments
- Generate trend reports
- **See where every unit is heading** over the next several shifts, with prediction ranges
- **Get a specific, ranked deployment plan** — who to move, from where, to where, and what it buys
- **Forecast census and volume** against nursing-driven caps before a unit runs over
- **Test what-if scenarios** — bed closures, call-outs, acuity surges — before they happen
- **Close the loop** — record the plans they act on, and see whether they were followed, whether they worked, and what they saved (Outcomes & ROI)
- **Forecast ED boarding** against the region's open beds, and **predict safety-event risk** by unit (Capacity & Safety)
- **Screen and route outpatient referrals** with AcuiPath™: two-tier screening, clinic and attending-vs-resident routing, a discharge bridge tracked against 7- and 30-day follow-up, PHQ-9 / GAD-7 measurement-based care, and placement outcomes
- Work under **role-based access** with a **hash-chained audit log**, and import census from the EHR via **FHIR R4**

The application is a **React single-page app** that builds to plain static files (HTML, CSS, JavaScript). It requires no application server — only a web server capable of serving static files.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite 5 |
| Language | JavaScript (ES2022) |
| Styling | Inline styles (no CSS framework) |
| Real-time database | Optional — Firebase Firestore, supplied at build time (swappable, see below) |
| Build output | Static HTML/CSS/JS |
| Node.js required | v18 or higher (build-time only) |

---

## Quick Start — Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
# App available at http://localhost:5173/<base-path>/

# 3. Run the test suite (331 tests: forecasting, optimization, screening, outcomes,
#    follow-up, cost, capacity, safety, roles, audit chain, FHIR, and UI rendering)
npm test

# 4. Build for production
npm run build
# Output goes to ../acuity/ (configurable — see vite.config.js)
```

---

## Production Deployment

The build output is a folder of static files. Deploy them to any static file host:

- **Nginx / Apache** — copy build output to your web root
- **IIS** (Windows Server) — copy to wwwroot, enable SPA fallback
- **S3-compatible object storage** — enable static website hosting
- **Internal CDN / portal** — upload the files

### Important: Base Path

The app is currently configured for the path `/acuity/`, which is where it sits on the custom domain in `/CNAME`.  
**Change this before deployment** to match your institution's URL structure.

Edit `vite.config.js`:
```js
export default defineConfig({
  base: '/your-internal-path/',   // ← change this
  ...
})
```

If deploying at the root of a domain (e.g. `https://acuitas.yourhospital.org/`):
```js
base: '/'
```

---

## Changing the Access Password

The app is password-protected. The password is never stored in plain text — only its SHA-256 hash is in the source code.

> **What this gate is and is not.** It keeps casual visitors out of the
> interface. It is checked in the browser, so it is *not* an access control on
> the data: anyone who can reach a build configured against a real database can
> reach that database directly unless the database's own security rules stop
> them. Before any deployment holding real data, set server-side rules (Firestore
> Security Rules, or the equivalent in whatever backend replaces it) and put
> proper authentication in front of it.

To set a new password:

```bash
# Generate hash of your new password
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('YourNewPassword').digest('hex'))"
```

Then open `src/components/PasswordGate.jsx` and replace the hash on line 4:
```js
const EXPECTED_HASH = 'paste-your-new-hash-here'
```

Rebuild and redeploy.

---

## Sign-in, Roles & Audit

### Three sign-in modes, chosen at build time

| Mode | Set with | Who is signed in | Is it access control? |
|---|---|---|---|
| **local** (default) | nothing | After the access password, each person enters a name and picks a role | **No** — self-asserted. Shapes the interface and attributes the audit log. For evaluation and training. |
| **gateway** | `VITE_AUTH_MODE=gateway`, `VITE_IDENTITY_ENDPOINT=/.auth/me` | Your single sign-on in front of the static host (e.g. Microsoft Entra ID via Azure Static Web Apps built-in auth, or Okta / any IdP via an identity-aware proxy such as oauth2-proxy) | **Yes, at the door** — the gateway blocks unauthenticated users; roles come from IdP groups. |
| **firebase** | `VITE_AUTH_MODE=firebase`, `VITE_AUTH_PROVIDER_ID=oidc.<name>` or `saml.<name>` | Firebase Authentication with your OIDC or SAML provider; role = custom claim `acuitasRole` | **Yes, end to end** — `firestore.rules` enforces every role on the server. |

In gateway and firebase modes the shared access password is skipped (SSO replaces it).
The Firebase sign-in code is loaded only in firebase-mode builds; the public build
contains none of it (verified at build time).

| Variable | Purpose |
|---|---|
| `VITE_AUTH_MODE` | `local` (default), `gateway`, or `firebase` |
| `VITE_IDENTITY_ENDPOINT` | Gateway identity document. Understands Azure SWA `/.auth/me` and standard userinfo (`email`/`roles`/`groups`) |
| `VITE_SIGN_IN_URL` | Where "Sign in" goes in gateway mode (default `/.auth/login/aad`) |
| `VITE_ROLE_MAP` | JSON mapping your IdP groups to Acuitas roles, e.g. `{"BH-House-Sups":"supervisor"}`. Defaults: `acuitas-admin`, `acuitas-supervisor`, `acuitas-charge`, `acuitas-screener`, `acuitas-analyst`, `acuitas-viewer` |
| `VITE_AUTH_PROVIDER_ID` | Firebase / Identity Platform provider id, firebase mode only |

A signed-in user with no mapped role gets **Viewer** — never more.

### Roles

| Role | Does |
|---|---|
| Administrator | Everything, including settings, users, clinic configuration and the audit log |
| House supervisor | Deployments, recorded plans, scenarios, capacity & safety, FHIR import, removing records |
| Charge nurse | Shift entries, deployments, AcuiCalc, safety events |
| Outpatient clinician | AcuiPath screening, discharge follow-up, PHQ-9 / GAD-7, outpatient outcomes |
| Quality & finance | Outcomes, calibration, cost rates, scenarios, audit log (read-mostly) |
| Viewer | Read-only boards and reports |

The full matrix lives in `src/lib/roles.js` and is shown in the app under Settings → People & access.

### Audit log

Every change — shift entries, deployments, caps, locations, thresholds, imports,
recorded plans, safety events, every AcuiPath record, cost rates, sign-ins — is
written to an audit log: who, in which role, what, which record, when. Entries
form a **SHA-256 hash chain**; each stores the hash of the entry before it, so
editing or deleting any entry breaks the chain, and **Verify chain** (Settings)
reports the first break. Entries record field names and short values only, never
free-text notes. On a shared backend `firestore.rules` makes the log
**append-only** and requires the recorded actor to be the signed-in user.
Concurrent writers can produce two entries with the same sequence number; the
verifier reports these as forks, not tampering. A deployment needing a single
strict sequence should append server-side (e.g. a Cloud Function).

### Server-side security rules

`firestore.rules` (in this folder) is the access-control template for a Firebase
backend: per-collection read/write by role, append-only audit log, everything
else closed. Deploy with `firebase deploy --only firestore:rules` and set each
user's role with the Admin SDK (`setCustomUserClaims(uid, { acuitasRole })`).

---

## The Predictive Engine

The Command Center tab forecasts each unit forward, estimates the chance it
breaches its thresholds, and computes where staff should go. Three files carry
all of it, and none of them touch the network:

| File | Responsibility |
|---|---|
| `src/lib/forecast.js` | Per-unit time-series forecasting and self-scoring |
| `src/lib/risk.js` | Breach probability, runway, drift detection, attribution |
| `src/lib/optimize.js` | Optimal staff allocation across units |

### How the forecast works

Each unit gets its own model fit to its own history — never a single model
imposed across the region:

1. **Shift-of-week pattern.** Additive offsets for each of the 14 weekly slots
   (7 days × AM/PM), estimated against a *locally* centered baseline so a unit's
   underlying trend is not misread as seasonality. Offsets are shrunk toward zero
   in proportion to how little evidence backs them, so one unusual Tuesday does
   not become "Tuesdays are bad."
2. **Damped trend.** Holt's linear method with a damping factor, so a three-shift
   climb projects forward realistically instead of off the top of the chart.
3. **Fitted parameters.** Smoothing constants are chosen per unit by minimizing
   one-step-ahead error, not hardcoded.
4. **Honest method selection.** The fitted model is compared by walk-forward
   backtest against two simple baselines — same shift last week, and the unit's
   recent median — and whichever actually scores best is the one used. On a unit
   whose acuity is pure noise, the simple rule wins and the app says so.
5. **Measured uncertainty.** Prediction ranges come from the unit's own past
   forecast errors at each horizon, not an assumed normal distribution.

Every unit card reports its method, its typical error, how many held-out shifts
that was measured on, and how it compares to the naive baseline.

### Data requirements

| History logged | What the app shows |
|---|---|
| 0–5 shifts | "Too little history to forecast" — no prediction, and it says why |
| 6–13 shifts | Forecast with wide ranges, marked low confidence |
| 14–27 shifts | Weekly pattern becomes usable; moderate confidence |
| 28+ shifts | Full confidence available if the unit is genuinely predictable |

Confidence reflects *usefulness*, not sophistication. A unit earns high
confidence either because the model explains its swings or because it is steady
enough to pin down tightly — and never simply for beating a weak baseline.

### How the deployment plan works

Staff allocation is solved **exactly**, by dynamic programming over the staffing
budget — not by a greedy "best next move" heuristic, which gets the answer wrong
whenever a unit needs several staff to climb out of RED and earns no credit for
the first one or two.

- Risk is weighted by patients exposed, so a 20-bed unit in RED outranks a 6-bed
  unit in the same state.
- Pulling staff off a unit is modeled as a negative allocation, so a donor is
  only tapped when the receiving unit's gain outweighs the donor's loss.
- Donors are never dropped below GREEN, and never below the staffing floor.
- **A unit must have a track record before it can donate.** Giving and receiving
  are deliberately asymmetric: any unit may *receive* staff, including one that
  opened yesterday, but a unit needs a full week on the board — 14 logged shifts
  by default — before Acuitas will pull staff off it. One quiet reading on a new
  unit is not evidence it will still be quiet next shift, and acuity moves with
  the day of the week, so a unit seen only across a few weekdays has never been
  observed on a Monday morning. When a unit is held back for this reason the
  board names it and says how many shifts it still needs, so a supervisor
  looking at a quiet unit knows it was skipped deliberately. Tune the bar with
  the `donorMinHistory` option (`DONOR_MIN_HISTORY` in `src/lib/optimize.js`).
- A per-move disruption cost stops the optimizer recommending churn for a
  rounding-error improvement.
- "Act on next shift" optimizes against the *forecast* rather than the current
  reading — moving staff before the surge lands.

### AcuiPath™ — the outpatient module

A second tab, **AcuiPath™**, extends Acuitas from inpatient units to the
outpatient continuum. Screening is **two-tier**, mirroring how intake actually
works:

1. **Tier 1 — nurse chart review (no patient contact).** A quick, conservative
   pass over the chart against an **editable list of red-flag triggers**
   (documented risk, recent hospitalization, active substance use, diagnostic
   uncertainty, forensic involvement, and so on). A completely clean review can
   be **placed directly** into a clinic and bypasses the deeper screen; **any one
   flag escalates** to Tier 2. The asymmetry is deliberate — over-referring to
   the in-depth screen is safe, under-referring is not. The trigger list is
   org-configurable, edited in the Caseload tab and stored under
   `bhai:apTier1Triggers`. Logic lives in `src/lib/tier1.js`.
2. **Tier 2 — in-depth screen (with a phone screen / patient discussion).** The
   full six-dimension screen (risk of harm, functional status, co-occurring
   complexity, environmental stress, support availability, treatment history &
   engagement), scored 1–5 for an adult or adolescent, plus a manual
   "diagnostic / treatment complexity" flag. It produces the operational outputs
   below.
3. **Who should see whom?** An assignment view matches the routable caseload to
   providers by role (prescriber / therapist), **clinic/program**, specialty,
   telehealth, **supervision level**, and open capacity, placing the most urgent
   patients first and reporting every patient it could not place with the reason.

**What the screen decides — and what it does not.** Per the intended design, the
screen decides only **(a) which outpatient clinic** the patient is routed to and
**(b) whether an attending must be the primary treating physician** (vs. a
resident being eligible). It deliberately **does not** screen patients into PHP
or IOP on complexity. PHP/IOP is surfaced **only as an advisory** when the overall
acuity composite crosses an adjustable threshold — never an automatic placement;
clinic routing still applies. A separate **acute-safety guard** (risk at/above an
adjustable threshold) pulls a case out of routine outpatient for urgent/same-day
evaluation; this is a safety floor, kept distinct from complexity routing.

**Adjustable thresholds.** The operational cut points are editable in the Caseload
tab (stored under `bhai:apThresholds`, defaults in `DEFAULT_AP_THRESHOLDS` in
`loc.js`): the risk and comorbidity levels that require an attending, the
manual-complexity flag, the acute-safety risk level, and the PHP/IOP advisory
composite. A service tunes these without a code change.

**Load balancing for equal distribution.** Each provider carries a current panel
size (`panelLoad`), and the assignment engine balances new patients toward the
**least-loaded** provider — measured on total load (existing panel + assigned this
run) — so patients spread evenly. The Caseload tab shows a **load-distribution
view**: per-provider bars (current panel vs. newly assigned) and a per-group
fairness read (attendings / staff / residents) with the load spread in each group.

**Clinic / program routing.** Each screen prominently recommends which clinic or
program the patient should go to (Therapy only, Medication management,
Neuromodulation, etc.). That list is **org-configurable** — edited in the
Caseload tab and stored under `bhai:opPrograms` — so a site can name its own
programs. A provider is tagged with the programs they staff, and a patient's
recommended program is a hard matching constraint.

**Symptom-driven program recommendation.** The screen also carries a current-
symptoms checklist (depressed mood, trauma/PTSD, active substance use, disordered
eating, psychotic symptoms, treatment-resistant depression, catatonia, perinatal
onset, and more). Each symptom points at a program *concept*, and the concept is
matched to whatever clinics the site has actually named — by keyword, so
"Neuromodulation", "TMS/ECT clinic" and "Interventional psychiatry" all satisfy
the neuromodulation concept. The most specialized concept wins (treatment-
resistant depression → Neuromodulation over plain depression → Therapy), the
driving symptoms are shown as the rationale, and when no configured clinic
matches the recommended concept the screen says so rather than guessing. The
logic is in `src/lib/programs.js` and is fully overridable by the clinician.

**Rating definitions are shown, not hidden.** Every dimension displays all five
anchor definitions with the selected level highlighted, so a rater sees exactly
what makes a reading a 4 versus a 3 on each standard.

**Academic / teaching model.** Providers carry a training level (attending,
fellow, staff, resident). The attending-vs-resident determination is made by the
Tier 2 screen from the configurable complexity rule above (risk ≥ threshold,
comorbidity ≥ threshold, or the manual complexity flag) and stored on the
patient; the assignment engine then routes any attending-required case away from
residents to an attending or independently-licensed non-trainee. For older
records or direct callers with no stored determination, `opmatch.js` falls back
to a risk-based rule (`ATTENDING_RISK_THRESHOLD`, default 3). A provider with no
training level set is treated as independent, so non-academic clinics need no
configuration.

**No patient-identifying information is required.** The case label is optional
and discourages names/MRNs; if left blank a non-identifying reference (e.g.
`Case 3F1A`) is generated. Nothing in the module needs PHI.

Three files carry the logic, all pure functions with no network use:

| File | Responsibility |
|---|---|
| `src/lib/tier1.js` | Tier 1 chart-review triage (red-flag triggers, direct-vs-escalate) |
| `src/lib/loc.js` | Level-of-care screening, band mapping, the safety net, and the operational outputs (attending rule, acute guard, PHP/IOP advisory) |
| `src/lib/opmatch.js` | Outpatient patient-to-provider assignment and load balancing |

**The safety net is the most important property.** A tool that only summed its
dimensions could route a patient with imminent suicide risk to "outpatient" if
the other five dimensions were mild. `loc.js` applies safety *floors*: an acute
single-dimension risk sets a minimum level the recommendation can exceed but
never fall below, and each floor is shown to the clinician with its reason. This
is covered heavily by tests.

**What it is not.** This is decision support a licensed clinician confirms or
overrides — never an autonomous determination. It is aligned to the concepts
behind LOCUS, CASII and ASAM, but it is an **original, unvalidated** scale: it
does not reproduce those copyrighted instruments and does not replace them where
a payer or regulation requires the real tool. The band cut points are a
transparent starting calibration, adjustable in `loc.js`, not empirically fitted.
The app states this on the screen.

**Data storage.** All AcuiPath data — patients, providers, clinics, triggers,
thresholds, discharges, PHQ-9/GAD-7 scores and outcomes — goes through the shared
store layer (`src/lib/store.js`, `src/lib/opData.js`). In local mode it stays in
the browser under the same keys AcuiPath always used (`bhai:opPatients`,
`bhai:opProviders`, …), so existing caseloads carry over. With a backend
configured, each record is its own document and syncs live across users, exactly
like shift entries.

**Discharge bridge (follow-up after hospitalization).** Inpatient discharges are
recorded de-identified and bridged into AcuiPath as priority cases — the
assignment engine places them ahead of routine referrals because their follow-up
clock is already running. Each discharge is tracked against the 7- and 30-day
windows of the HEDIS FUH measure; a visit on the discharge day does not count,
and a discharge enters a rate only once its window has closed. The worklist
orders open cases by urgency (unbooked → booked too late → booked in time →
missed-7). This is an operational approximation for driving follow-up, not a
certified HEDIS calculation: no diagnosis, age, enrollment or readmission logic;
exclusions are marked by hand. Logic: `src/lib/fuh.js`.

**Measurement-based care.** PHQ-9 and GAD-7 (free to reproduce; items as
published) are recorded per case and tracked over time: severity bands, response
(≥50% drop from a baseline ≥10), remission (<5), and meaningful worsening (≥5
points PHQ-9, ≥4 GAD-7). A positive PHQ-9 item 9 raises an urgent flag to
complete a suicide risk assessment; worsening or severe scores recommend a fresh
Tier 2 screen, which reopens the case in place. Incomplete questionnaires are
never scored. Logic: `src/lib/mbc.js`.

**Placement outcomes.** For each case: first visit attended, in care at 30
days, needed a higher level of care. Each outcome stores a snapshot of how the
case was placed (tier, attending-or-resident, clinic) so it still counts after
the case closes. Rates are broken down by tier, physician level and clinic, and
plain-language review prompts appear only when evidence clears a minimum sample
(8 per side) and gap (10 points) — e.g. Tier 1 direct placements stepping up
more often than fully screened cases. Prompts never change a setting.

The assignment engine is an honest **priority heuristic**, not a proven optimum
like the inpatient staff optimizer — outpatient matching trades off soft goals
(specialty fit, panel balance, continuity) with no single correct objective, so
it enforces the hard constraints exactly and prioritizes transparently rather
than claiming global optimality.

---

### The outcome loop (Outcomes & ROI)

`src/lib/outcomes.js`. Three loops, all computed from data the app already holds:

1. **Recorded plans.** "Record this plan" in the Command Center freezes the
   recommended moves and their predicted chance of RED for the target shift.
   Logged deployments for that shift say whether each move was followed (full /
   partial / none); the reading that comes in says whether the unit avoided RED.
   Followed moves are compared with unfollowed ones, each beside what Acuitas
   predicted for it, so the plan's own claims can be checked.
2. **Forecast calibration.** Each unit's history is replayed one shift at a
   time; every prediction uses only earlier shifts, exactly as the live engine
   would have. Reported: Brier score, skill against always predicting the unit's
   base rate, expected calibration error, and a reliability diagram. On the
   demonstration region the engine scores about 0.5 skill with a ~4% average gap
   between predicted and observed.
3. **Outpatient placements** — see AcuiPath above.

### Cost & ROI

`src/lib/cost.js`. Every rate is an input (Outcomes & ROI → Cost rates); defaults
are illustrative and labeled as such. Reported over 7/30/90 days: RED unit-shifts
× cost per RED shift, deployment labor by source (float, overtime, agency,
reassignment) × hourly rate, and ED boarding hours × cost per hour. Each
recommended plan shows its expected value: the summed drop in predicted RED
probability × cost per RED shift, against the new labor it adds. Reassignments
and a float pool already on shift add none (configurable for per-diem floats).
Realized value from followed plans is reported two ways: model-based, and
observed (followed vs unfollowed RED rates) once both sides have ≥5 outcomes.

### What-if planner

`src/lib/whatif.js`. Projects next shift under a scenario — staff added or
removed per unit, beds opened or closed against the census cap, a per-unit or
region-wide acuity multiplier, a different float pool — using the same forecasts,
breach probabilities and exact optimizer as the live plan, so baseline and
scenario differ only by the change. Shows per-unit stage, chance of RED and
chance over cap before → after, plus the plan the optimizer would recommend.

### Capacity & boarding

`src/lib/capacity.js`. Supply = each inpatient unit's census cap minus its
forecast census, summed. Demand = forecast BH patients boarding in the ED, from
the ED's own logged history (ED shift entries carry optional `bhArrivals`,
`boarders` and `boardingHours`). For each of the next six shifts: open beds,
boarders, status (OK / tight under 2 beds / boarding), the probability demand
exceeds open beds (empirical error of the ED forecast, treating beds as fixed),
and expected boarding hours.

### Safety-event risk

`src/lib/safety.js`. Safety events (assault on staff, staff injury,
patient-to-patient assault, restraint, seclusion, behavioral code, self-harm,
elopement) are logged by unit, date, shift and type only. Each is matched to the
acuity stage of that unit-shift, giving an event rate per stage and relative risk
vs GREEN. Next-shift risk per unit = Σ P(stage) × rate(stage) from the unit's
forecast, with P(at least one) from a Poisson model.

### FHIR census import

`src/lib/fhir.js`, Settings → FHIR census import. Reads a FHIR R4 Bundle, counts
in-progress inpatient Encounters (class IMP / ACUTE) by current Location, matches
Locations to Acuitas units by an explicit saved mapping or exact name, and
applies the census to entries already logged for the chosen shift — or pre-fills
it on New Shift Entry for units with no entry yet. No other data from the bundle
is kept. A live feed is an interface-engine export of the same bundle each shift,
or `Encounter?status=in-progress&_include=Encounter:location` against the EHR's
FHIR API.

### Privacy posture

There is **no external model service, no vendor AI API, and no patient data in
transit**. Every forecast, probability, and recommendation is computed in the
browser from data the app already holds. This is a deliberate architectural
choice for a clinical tool: it keeps the system auditable, keeps PHI inside your
network, and means the predictive features carry no additional BAA, vendor
review, or data-egress burden.

### Demonstration mode

The Command Center has a "Show me with demo data" toggle that builds a synthetic
seven-unit region in memory for demonstrations and training. It is generated in
the browser, **never written to the database**, never mixed with live entries,
and disappears when toggled off. Every synthetic record is stamped `demo: true`.

---

## Database / Backend

### Connection is supplied at build time

Nothing is hardcoded. The app reads its database config from a single build-time
environment variable, `VITE_FIREBASE_CONFIG`, holding the Firebase config object
as JSON:

```bash
VITE_FIREBASE_CONFIG='{"apiKey":"…","authDomain":"…","projectId":"…","storageBucket":"…","messagingSenderId":"…","appId":"…"}' npm run build
```

This matters for two reasons. A build carries no credentials and no project
identifier, so the compiled bundle never reveals which institution it belongs
to. And each environment points at its own database by changing one variable,
with no source edit.

### Local mode — what happens with no config

**With `VITE_FIREBASE_CONFIG` unset the app runs entirely in the browser.** Every
shift entry, deployment and census cap is kept in that browser's local storage
and nothing is transmitted anywhere. No database connection is opened at all.

This is the mode the public demonstration build runs in, and it is the right
mode for training or evaluation: each person gets a working sandbox of their
own, and no one can reach anyone else's data. It is *not* suitable for real use
across a unit, because nothing is shared between browsers or devices.

The mode is decided in:

```
src/lib/firebase.js
```

**Firebase is not required.** It can be replaced with any backend that supports:
1. Document/record storage (JSON objects)
2. Real-time change notifications (WebSockets or Server-Sent Events)

### Recommended Self-Hosted Alternative — Supabase

[Supabase](https://supabase.com) is an open-source Firebase alternative that can be self-hosted on your own infrastructure. It provides:
- PostgreSQL database
- Real-time subscriptions (matches how the app works today)
- REST and WebSocket APIs
- HIPAA-capable when self-hosted with proper configuration

**Data structure to replicate:**

| Firestore Collection | What it stores |
|---|---|
| `appState/main` | Locations list + acuity thresholds (single document) |
| `entries` | One document per shift entry (ED entries may carry `bhArrivals`, `boarders`, `boardingHours`) |
| `deployments` | One document per staff deployment (with `source`: float / overtime / agency / internal) |
| `locationCaps` | Live census cap per location |
| `planLog` | Recorded deployment plans for the outcome loop |
| `safetyEvents` | Safety events — unit, date, shift, type, severity |
| `opPatients`, `opProviders` | AcuiPath caseload and provider panel |
| `opDischarges`, `opAssessments`, `opOutcomes` | Discharge bridge, PHQ-9/GAD-7 scores, placement outcomes |
| `auditLog` | Hash-chained audit entries (append-only under the rules) |
| `appConfig/{key}` | Shared settings: `opPrograms`, `apThresholds`, `apTier1Triggers`, `costRates`, `censusPrefill`, `fhirLocationMap` |

All documents are plain JSON. Field names are documented in `src/lib/model.js`
and in each module under `src/lib/`. In local mode the same data lives in the
browser under `bhai:`-prefixed keys.

### Swapping the Backend

All Firebase calls are isolated in three files:
- `src/lib/firebase.js` — connection config
- `src/App.jsx` — read/write calls for locations, entries, deployments and caps
- `src/lib/store.js` — one generic synced-collection layer used by every newer feature

A developer familiar with your institution's stack can replace those calls with calls to your chosen backend in a few hours.

---

## Receiving Updates

This application is actively maintained. When updates are needed:

1. The developer makes changes to the source code
2. A new ZIP package is provided to IT
3. IT runs `npm install && npm run build` and redeploys the output

No database migrations are required for UI/feature updates. Backend schema changes (if any) will be documented with each update.

---

## File Structure

```
acuity-app/
├── src/
│   ├── App.jsx                  # Main app shell, routing, Firebase sync
│   ├── components/
│   │   ├── AcuityCalculator.jsx # AcuiCalc™ two-step scoring tool
│   │   ├── AcuitasLogo.jsx      # Brand logo component
│   │   ├── acuipath/            # AcuiPath views: DischargeBridge, MbcPanel, OpOutcomes
│   │   ├── CapacitySafety.jsx   # ED boarding outlook and safety-event risk
│   │   ├── charts.jsx           # Small accessible SVG chart kit
│   │   ├── CommandCenter.jsx    # Predictive forecasts, risk, deployment plan, plan recording
│   │   ├── Deployments.jsx      # Staff deployment tracking
│   │   ├── ErrorBoundary.jsx    # Error handling wrapper
│   │   ├── Governance.jsx       # People & access, audit log, FHIR census import
│   │   ├── HelpGuide.jsx        # Built-in help, training and FAQ
│   │   ├── IdentityGate.jsx     # Sign-in: local identity picker, SSO sign-in screen
│   │   ├── IntroVideo.jsx       # Animated welcome slideshow
│   │   ├── LevelOfCare.jsx      # AcuiPath™ two-tier screening, caseload & view switcher
│   │   ├── Outcomes.jsx         # Outcomes & ROI: plan adherence, calibration, cost
│   │   ├── PasswordGate.jsx     # Login screen (SHA-256 auth)
│   │   ├── Reports.jsx          # Trend reports & data table
│   │   ├── Settings.jsx         # Admin settings panel
│   │   ├── SettingsLock.jsx     # Settings PIN screen
│   │   ├── ShiftEntryForm.jsx   # New shift entry form
│   │   ├── StatusBoard.jsx      # Region-wide acuity overview
│   │   ├── WhatIf.jsx           # What-if scenario planner
│   │   └── ui.jsx               # Shared UI components & theme
│   └── lib/
│       ├── __tests__/           # Test suite (331 tests)
│       ├── audit.js             # Hash-chained audit log
│       ├── capacity.js          # ED boarding vs open-bed outlook
│       ├── cost.js              # Cost rates, spend, plan value, realized value
│       ├── demoData.js          # Synthetic demo region and de-identified samples
│       ├── fhir.js              # FHIR R4 census import
│       ├── firebase.js          # Firebase connection (swap this for your backend)
│       ├── firebaseAuth.js      # Firebase sign-in (firebase-mode builds only)
│       ├── fuh.js               # Discharge bridge, 7/30-day follow-up
│       ├── identity.js          # Sign-in mode and identity loading
│       ├── forecast.js          # Time-series forecasting & backtesting
│       ├── mbc.js               # PHQ-9 / GAD-7 scoring, trends, re-screen triggers
│       ├── model.js             # Acuity scoring logic, thresholds, seed data
│       ├── opData.js            # AcuiPath data hooks, sample loading
│       ├── outcomes.js          # Outcome loop: plans, calibration, OP outcomes
│       ├── optimize.js          # Exact staff-allocation optimizer
│       ├── risk.js              # Breach probability, drift, attribution
│       ├── roles.js             # Roles, permissions, IdP role mapping
│       ├── safety.js            # Safety events, rates by stage, next-shift risk
│       ├── store.js             # Synced collections (local or Firestore) + audit sink
│       ├── tier1.js             # AcuiPath Tier 1 chart-review triage
│       ├── loc.js               # AcuiPath level-of-care screen & operational outputs
│       ├── opmatch.js           # AcuiPath assignment & load balancing
│       ├── programs.js          # AcuiPath symptom → clinic/program recommendation
│       ├── stateShapes.js       # US state SVG map shapes
│       ├── storage.js           # localStorage helpers
│       └── whatif.js            # Scenario projection and re-optimization
├── public/
│   └── assets/                  # Logo SVGs, OG image
├── firestore.rules              # Server-side access control template (Firebase)
├── index.html                   # App entry point
├── vite.config.js               # Build configuration (set base path here)
└── package.json                 # Dependencies
```

---

## Contact & Updates

All source code changes are managed through version control.  
Contact the developer to request changes, new features, or a new deployment package.

*Acuitas™ — Acuity You Can Act On.™*  
*Patent Pending — © Matthew C. Gee*
