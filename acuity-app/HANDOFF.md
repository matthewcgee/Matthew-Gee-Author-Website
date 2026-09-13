# Acuitas™ — Technical Handoff Guide
**Behavioral Health Acuity Dashboard**  
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

The application is a **React single-page app** that builds to plain static files (HTML, CSS, JavaScript). It requires no application server — only a web server capable of serving static files.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite 5 |
| Language | JavaScript (ES2022) |
| Styling | Inline styles (no CSS framework) |
| Real-time database | Firebase Firestore (swappable — see below) |
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

# 3. Run the test suite (covers the forecasting and optimization math)
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

The app is currently configured for the path `/Matthew-Gee-Author-Website/acuity/`.  
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

### Current Setup — Firebase Firestore

The app currently connects to a Firebase Firestore project. The connection config is in:

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
| `entries` | One document per shift entry |
| `deployments` | One document per staff deployment |
| `locationCaps` | Live census cap per location |

All documents are plain JSON. Field names are documented in `src/lib/model.js`.

### Swapping the Backend

All Firebase calls are isolated in two files:
- `src/lib/firebase.js` — connection config
- `src/App.jsx` — all read/write calls (~60 lines, clearly commented)

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
│   │   ├── CommandCenter.jsx    # Predictive forecasts, risk & deployment plan
│   │   ├── Deployments.jsx      # Staff deployment tracking
│   │   ├── ErrorBoundary.jsx    # Error handling wrapper
│   │   ├── HelpGuide.jsx        # Built-in help & training
│   │   ├── IntroVideo.jsx       # Animated welcome slideshow
│   │   ├── PasswordGate.jsx     # Login screen (SHA-256 auth)
│   │   ├── Reports.jsx          # Trend reports & data table
│   │   ├── Settings.jsx         # Admin settings panel
│   │   ├── SettingsLock.jsx     # Settings PIN screen
│   │   ├── ShiftEntryForm.jsx   # New shift entry form
│   │   ├── StatusBoard.jsx      # Region-wide acuity overview
│   │   └── ui.jsx               # Shared UI components & theme
│   └── lib/
│       ├── __tests__/           # Test suite for the predictive math
│       ├── demoData.js          # Synthetic demo region (in-memory only)
│       ├── firebase.js          # Firebase connection (swap this for your backend)
│       ├── forecast.js          # Time-series forecasting & backtesting
│       ├── model.js             # Acuity scoring logic, thresholds, seed data
│       ├── optimize.js          # Exact staff-allocation optimizer
│       ├── risk.js              # Breach probability, drift, attribution
│       ├── stateShapes.js       # US state SVG map shapes
│       └── storage.js           # localStorage helpers
├── public/
│   └── assets/                  # Logo SVGs, OG image
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
