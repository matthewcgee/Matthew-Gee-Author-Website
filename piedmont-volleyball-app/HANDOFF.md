# Piedmont Volleyball Club — Stat Tracker

A mobile-first web app for parents to track their player's volleyball stats live from the
sidelines, see the club's tournament calendar, and pull season totals for recruiting.

---

## What Is This

This is the Piedmont Volleyball Club counterpart to the East Forsyth Eagles app in
`volleyball-app/` at the root of this repo — same core idea, adapted for club/AAU play instead
of a fixed high school dual-match schedule:

- **Live Stat Tracker** — same tap-to-log flow as the Eagles app: aces, serve errors, kills,
  attack errors/attempts, assists, solo/assist blocks, block errors, digs, and reception errors,
  plus a running scoreboard and one-tap Undo.
- **Schedule** — two things, not one: the club's published **Tournament Calendar** (informational
  — dates, event name, location, pulled from piedmontvolleyballclub.com) and a separate list of
  **Matches** a parent has actually logged. Club opponents aren't known ahead of a tournament, so
  matches are always created ad hoc (optionally tagged to one of the calendar events) rather than
  picked from a pre-seeded list.
- **Season Stats** — career-to-date totals per player with **Export CSV** for recruiting.
- **Roster** — add players (number + name), star your own player as the default.

Same storage model as the Eagles app: **no login, no server** — everything lives in that
browser's `localStorage`, on that device only. See the Eagles app's HANDOFF.md for the full
rationale; it's identical here.

---

## What's Different From the Eagles App

| | East Forsyth (`volleyball-app/`) | Piedmont (this app) |
|---|---|---|
| Schedule shape | Fixed dual matches (JV/Varsity times, Home/Away) | Multi-day tournaments (name, date range, location) |
| Where matches come from | Pre-seeded from the school schedule | Always created ad hoc by a parent — opponents in pool play aren't known ahead of time |
| "Us" label | Eagles | Piedmont |
| Palette | Navy / silver / gold, from the EFHS eagle mark | Navy / baby blue / red, from the PVC circular badge |
| State keys | `games`, `gameId` | `matches` + `tournaments`, `matchId` |

The event-sourced stat/score engine (`src/lib/model.js` — `deriveMatchState`,
`computeSeasonTotals`, undo-by-dropping-the-last-event) is otherwise unchanged from the Eagles
app.

## Tech Stack

Same as the Eagles app: React 18 + Vite 5, plain CSS, `localStorage`, static build, installable
as a PWA. See `volleyball-app/HANDOFF.md` for the full technical writeup (event log design, file
structure pattern, how to add Firebase sync later if the club ever wants a shared live feed).

## Quick Start — Run Locally

```bash
npm install
npm run dev
# App available at http://localhost:5173/piedmont-volleyball/

npm run build
# Output goes to ../piedmont-volleyball/ (served at matthewcgee.com/piedmont-volleyball/)
```

## Updating the Tournament Calendar

Edit `src/lib/tournaments2027.js`. The list is always refreshed from that file on load (see
`migrate()` in `src/lib/storage.js`) — safe to do anytime, since tournaments are reference-only
and don't carry user-entered state directly (results live on `matches`, which are untouched by
this refresh).

---

*Built for Piedmont Volleyball Club parents. Not affiliated with or endorsed by Piedmont
Volleyball Club — team colors and the club mark are used here only to make the app instantly
recognizable to our own team's parents.*
