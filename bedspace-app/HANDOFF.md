# BedSpace — Technical Handoff Guide
**Shelter Bed &amp; Residency Coordination — Bethesda Center Partnership**

---

## What Is This

BedSpace is a real-time bed coordination tool built for the hospital's partnership with the
Bethesda Center (Winston-Salem). It lets Emergency Department and Inpatient staff:

- See live bed availability across both dormitories (Men's — 70 beds, Women's — 30 beds),
  arranged in their real three-high bunk stacks, with bottom bunks flagged for residents who
  cannot climb.
- Hold an open bed for up to 2 hours while arranging transport or paperwork.
- Screen a name against the Bethesda Center's confidential disallowed-resident list and get
  back **Accepted**, **Not Accepted**, or **Possible Match** — never the list itself.
- Admit a resident to a specific bed, capturing their commitment to ongoing psychiatric care,
  primary care, and weekly group therapy as a condition of residency.
- Track each resident's 90-day residency cap and ongoing care compliance.

A separate, PIN-gated area lets **Bethesda Center staff** manage the disallowed list, resolve
possible-match verifications, approve holds beyond 2 hours, and grant residency extensions
beyond 90 days — none of which is visible to hospital staff.

The application is a **React single-page app** that builds to plain static files. It requires
no application server — only a web server capable of serving static files. It was built inside
the hospital's author-website repo for convenience, but is fully self-contained and meant to be
**handed off to Bethesda Center to host on their own domain** once they're ready to own it.

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
# Output goes to ../bedspace/ (configurable — see vite.config.js)
```

Default logins for local testing (change both before go-live — see below):

| Gate | Value |
|---|---|
| Hospital staff password | `BedSpace2026` |
| Bethesda Center PIN | `Bethesda90Cap` |

---

## Production Deployment

The build output is a folder of static files. Deploy them to any static file host — Nginx,
Apache, IIS, S3-style object storage, or Firebase Hosting (a `firebase.json` is already included
in this folder).

### Important: Base Path

This app is currently configured for `/Matthew-Gee-Author-Website/bedspace/`, matching this
repo's GitHub Pages layout. **Change this when Bethesda Center hosts the app on their own
domain.** Edit `vite.config.js`:

```js
export default defineConfig({
  base: '/',   // ← root deployment, e.g. https://bedspace.bethesdacentersws.org/
  ...
})
```

Also update the hard-coded paths in `index.html` (`favicon.svg` links) to match.

---

## Changing the Access Password / PIN

Both gates use a SHA-256 hash of the secret — plaintext is never stored in source.

```bash
node -e "const c=require('crypto'); console.log(c.createHash('sha256').update('YourNewSecret').digest('hex'))"
```

- Hospital staff password hash: `src/components/PasswordGate.jsx`, `EXPECTED_HASH`
- Bethesda Center PIN hash: `src/components/BethesdaLock.jsx`, `EXPECTED_HASH`

If you deploy the `claimBethesdaRole` Cloud Function (see below), also update the
`BETHESDA_PIN_HASH` secret so both gates accept the same PIN.

Rebuild and redeploy after changing either hash.

---

## Connecting Firebase

The app ships pointed at a **placeholder** Firebase project (`src/lib/firebase.js`) so it runs
today in local-only mode (each browser keeps its own copy of the data in `localStorage` — fine
for a demo, not for real multi-device use across the ED and Bethesda Center). To go live:

1. Create a Firebase project at console.firebase.google.com.
2. Enable **Firestore Database** (production mode) and **Authentication → Anonymous** sign-in.
3. Add a Web App to the project and copy its config object into `src/lib/firebase.js`,
   replacing the `REPLACE_ME` placeholders.
4. Deploy the included security rules: `firebase deploy --only firestore:rules`.
5. Rebuild and redeploy the app. It will now sync bed status, residents, the disallowed list,
   and the screening log in real time across every device.

**Data structure** (all plain JSON documents, one Firestore collection each): `beds` (100 docs,
seeded automatically on first run), `residents`, `disallowedList`, `screeningLog`. Field shapes
are documented in `src/lib/model.js`.

---

## Server-Side Confidentiality — Read This Before Go-Live

This is the most important section in this document.

**Current state:** the two-tier password gate (a shared hospital password + a separate Bethesda
Center PIN) hides the disallowed-list *screen* from hospital staff in the UI. But under the hood,
today's build syncs the full `disallowedList` collection to **every** signed-in client — hospital
and Bethesda alike — so the in-browser matching logic (`screenName()` in `src/lib/model.js`) can
run instantly and offline-tolerant. Hospital staff never see a screen listing the entries, but a
technically sophisticated user could open browser dev tools and read the raw list out of the
app's network traffic or in-memory state. **Do not go live with real residents' names and reasons
in this collection until you complete the upgrade below.**

**The fix — a Cloud Function that never sends the list to hospital clients at all:**

1. `functions/index.js` already contains a `screenResident` callable function that does the
   name comparison **server-side**, using the Admin SDK, and returns only the outcome
   (`accepted` / `not_accepted` / `possible_match`). It also contains `claimBethesdaRole`,
   which verifies the Bethesda PIN and sets a `role: "bethesda"` custom claim on that user's
   Firebase Auth token.
2. Deploy it:
   ```bash
   cd functions && npm install
   firebase functions:secrets:set BETHESDA_PIN_HASH   # paste the same hash used in BethesdaLock.jsx
   firebase deploy --only functions
   ```
3. `firestore.rules` (already included) restricts `disallowedList` and `screeningLog` reads to
   users carrying the `bethesda` custom claim — deploy it with
   `firebase deploy --only firestore:rules`.
4. Update the client to match: in `ScreeningTool.jsx` and `AdmitModal.jsx`, replace the local
   `screenName(name, disallowedList)` call with an `httpsCallable(functions, 'screenResident')`
   call, and in `App.jsx`, only subscribe to the `disallowedList` collection while
   `bethesdaUnlocked` is true (i.e. move that `onSnapshot` into `BethesdaAdmin.jsx`). At that
   point hospital-side clients never download the list — full stop.
5. In `BethesdaLock.jsx`, call the `claimBethesdaRole` callable with the entered PIN instead of
   (or in addition to) the local hash check, so the resulting ID token actually carries the
   claim the security rules check for.

Until steps 4–5 are done, the Cloud Function and rules are deployed but not yet *used* by the
client — they're staged and ready, but the wiring above is what activates them. Budget a few
hours of developer time for this before handling real resident data.

### Recommended Self-Hosted Alternative — Supabase

[Supabase](https://supabase.com) can replace Firestore + Firebase Auth if Bethesda Center prefers
to self-host: Postgres, Row Level Security policies play the same role as the Firestore rules
above, and Edge Functions play the same role as the Cloud Functions above.

---

## Receiving Updates

1. The developer makes changes to the source code.
2. A new ZIP package (or repo access) is provided to IT.
3. IT runs `npm install && npm run build` and redeploys the `../bedspace/` output.

No database migrations are required for UI/feature updates. Backend schema changes (if any)
will be documented with each update.

---

## File Structure

```
bedspace-app/
├── src/
│   ├── App.jsx                       # App shell, tabs, Firebase sync, hold-expiry sweep
│   ├── components/
│   │   ├── AdmitModal.jsx            # Resident intake — screening, bunk requirement, commitments
│   │   ├── BedActionModal.jsx        # Per-bed action sheet (hold / release / extend / admit)
│   │   ├── BedBoard.jsx              # Dorm-separated bunk-stack board
│   │   ├── BedSpaceLogo.jsx          # Brand mark (placeholder — swap once Bethesda has assets)
│   │   ├── BethesdaAdmin.jsx         # Disallowed-list CRUD + verification queue (Bethesda-only)
│   │   ├── BethesdaLock.jsx          # Bethesda Center PIN gate
│   │   ├── Dashboard.jsx             # Occupancy, cap watch, compliance gaps
│   │   ├── ErrorBoundary.jsx
│   │   ├── HelpGuide.jsx
│   │   ├── PasswordGate.jsx          # Hospital staff password gate
│   │   ├── ResidentDetailModal.jsx   # 90-day cap, extensions, compliance logging, discharge
│   │   ├── ScreeningTool.jsx         # Standalone name-screening tab
│   │   └── ui.jsx                    # Shared UI components & theme
│   └── lib/
│       ├── firebase.js               # Firebase connection (swap this for your backend)
│       ├── model.js                  # Bed layout, residency cap, name matching, seed data
│       └── storage.js                # localStorage helpers
├── functions/
│   ├── index.js                      # Optional Cloud Functions — see "Server-Side Confidentiality"
│   └── package.json
├── firestore.rules                   # Security rules for the Firebase Auth custom-claim model
├── firebase.json
├── public/                           # Favicon
├── index.html
├── vite.config.js                    # Build configuration (set base path here)
└── package.json
```

---

## Contact &amp; Updates

All source code changes are managed through version control. Contact the developer to request
changes, new features, or a new deployment package.
