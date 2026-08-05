# East Forsyth Eagles Volleyball — Stat Tracker

A mobile-first web app for parents to track their player's volleyball stats live from the
stands, see the season schedule and match outcomes, and pull season totals for recruiting.

---

## What Is This

- **Live Stat Tracker** — pick the match and your player, then tap big buttons as things happen:
  aces, serve errors, kills, attack errors/attempts, assists, solo/assist blocks, block errors,
  digs, and reception errors. A simple scoreboard (+1 Eagles / +1 Opponent, End Set) runs
  alongside it. One-tap **Undo** removes the last thing you logged, in case of a mis-tap.
- **Schedule** — the full 2026 JV + Varsity schedule, grouped by month. Tap any match to enter
  its final set scores by hand (for matches you didn't track live), or it fills in
  automatically for matches tracked in the Live Tracker.
- **Season Stats** — career-to-date totals per player (kills, hitting %, aces, digs, blocks,
  etc.) with an **Export CSV** button for sharing with a coach or recruiter.
- **Roster** — add players (number + name), star your own player as the default selected in
  the Live Tracker.

There is **no login and no server** — this is a static, installable web app. Everything a
parent taps is saved in that browser's `localStorage`, on that device only. That's intentional:
it works instantly with zero setup, zero cost, and no account to lose. The trade-off is that
stats don't sync between parents' phones — each parent tracks their own copy. Export CSV is the
way to combine or hand off data.

Add it to your phone's home screen (Share → Add to Home Screen on iOS, or the browser's install
prompt on Android) and it behaves like a normal app, full-screen, no browser chrome.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite 5 |
| Language | JavaScript (ES2022) |
| Styling | Plain CSS (`src/index.css`), no framework |
| Storage | Browser `localStorage` (event-sourced — see below) |
| Build output | Static HTML/CSS/JS, installable as a PWA |
| Node.js required | v18 or higher (build-time only) |

## Quick Start — Run Locally

```bash
npm install
npm run dev
# App available at http://localhost:5173/Matthew-Gee-Author-Website/volleyball/

npm run build
# Output goes to ../volleyball/ (served at matthewcgee.com/volleyball/)
```

## How Live Tracking Works (event log)

Every score tap, set-end, and stat tap is appended to a single `events` array per match, each
with a timestamp. The scoreboard, set history, and per-player stat counts are all *derived* by
replaying that match's events (`deriveGameState` in `src/lib/model.js`). That's what makes
**Undo** simple and safe — it just drops the last event and everything re-derives from what's
left. Season totals (`computeSeasonTotals`) work the same way, summing stat events across every
match for a given player.

## File Structure

```
volleyball-app/
├── src/
│   ├── App.jsx                    # Shell: header, tab nav, page routing
│   ├── components/
│   │   ├── TrackerPage.jsx        # Live stat tracker (the core feature)
│   │   ├── SchedulePage.jsx       # 2026 schedule + manual/auto results
│   │   ├── StatsPage.jsx          # Season totals table + CSV export
│   │   ├── RosterPage.jsx         # Add/edit players, star "my player"
│   │   └── ui.jsx                 # Shared Card/Button/Logo components
│   └── lib/
│       ├── model.js               # Stat categories, event replay, season totals
│       ├── storage.js             # localStorage load/save + all state mutations
│       ├── schedule2026.js        # Seeded 2026 JV + Varsity schedule data
│       └── AppStateContext.jsx    # React context wrapping storage.js
├── public/
│   ├── assets/                    # Eagles logo + home-screen icons
│   └── manifest.webmanifest       # PWA "add to home screen" config
├── index.html
└── vite.config.js                 # base path: /Matthew-Gee-Author-Website/volleyball/
```

## Adding Next Season's Schedule

Edit `src/lib/schedule2026.js` (or add a new `scheduleYYYY.js` and import it in
`storage.js`'s `seedGames()`). Existing saved results are matched by
`date + opponent + site`, so re-running the seed after editing won't wipe scores already
entered for matches that still match.

## If You Ever Want Cross-Device Sync

Right now every parent's taps stay on their own phone. If the team wants one shared live
scoreboard/stat feed everyone can see (e.g. during the match, not just after), the natural next
step is swapping `localStorage` for a small real-time backend — the `acuity-app` and
`bedspace-app` folders in this repo show the pattern already used elsewhere in this repo
(Firebase Firestore, anonymous auth, a `FIREBASE_CONFIGURED` fallback so the app still works
with no backend configured). `src/lib/storage.js` is the one file that would need to grow a
network layer; `App.jsx` and the page components wouldn't need to change.

---

*Built for East Forsyth Eagles Volleyball parents. Not affiliated with or endorsed by East
Forsyth High School or Forsyth County Schools — team colors and the school mark are used here
only to make the app instantly recognizable to our own team's parents.*
