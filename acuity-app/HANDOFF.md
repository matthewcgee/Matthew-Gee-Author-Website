# Acuitas™ — Technical Handoff Guide
**Behavioral Health Acuity Dashboard**  
*Patent Pending — © Matthew C. Gee*

---

## What Is This

Acuitas™ is a real-time behavioral health acuity dashboard. It allows charge nurses and clinical staff to:
- Log shift acuity data per unit (census, points, staffing)
- View color-coded acuity status across an entire region
- Score patient acuity using the built-in AcuiCalc™ calculator
- Track staff deployments
- Generate trend reports

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

# 3. Build for production
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
│       ├── firebase.js          # Firebase connection (swap this for your backend)
│       ├── model.js             # Acuity scoring logic, thresholds, seed data
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
