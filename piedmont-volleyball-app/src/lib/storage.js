import { TOURNAMENTS_2027 } from './tournaments2027.js'

const STORAGE_KEY = 'pvc-volleyball:v1'

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function seedTournaments() {
  return TOURNAMENTS_2027.map((t, i) => ({ id: `t${i + 1}`, ...t }))
}

function defaultState() {
  return {
    version: 1,
    players: [],
    tournaments: seedTournaments(),
    matches: [],
    events: [],
    settings: { myPlayerId: null },
  }
}

function migrate(state) {
  // Tournaments are pure reference info from the club (no user edits live on
  // them directly — results live on matches), so it's safe to always refresh
  // the list from the latest seed rather than merge.
  state.tournaments = seedTournaments()
  return state
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)
    return migrate({ ...defaultState(), ...parsed })
  } catch (e) {
    console.error('Failed to load saved stats — starting fresh', e)
    return defaultState()
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.error('Failed to save stats (storage full or blocked)', e)
  }
}

// ---- Players ----

export function addPlayer(state, { number, name }) {
  const player = { id: uid('p'), number: String(number || '').trim(), name: name.trim() }
  const next = { ...state, players: [...state.players, player] }
  if (!next.settings.myPlayerId) next.settings = { ...next.settings, myPlayerId: player.id }
  return next
}

export function updatePlayer(state, playerId, patch) {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  }
}

export function removePlayer(state, playerId) {
  const players = state.players.filter((p) => p.id !== playerId)
  const settings =
    state.settings.myPlayerId === playerId
      ? { ...state.settings, myPlayerId: players[0]?.id || null }
      : state.settings
  return { ...state, players, settings }
}

export function setMyPlayer(state, playerId) {
  return { ...state, settings: { ...state.settings, myPlayerId: playerId } }
}

// ---- Matches ----
// Unlike a high school team, club opponents aren't known ahead of time, so
// every match is created ad hoc by a parent (optionally tagged to one of the
// club's published tournaments).

export function addMatch(state, { date, opponent, tournamentId }) {
  const match = {
    id: uid('m'),
    date,
    opponent: opponent.trim(),
    tournamentId: tournamentId || null,
    manualResult: null,
    notes: '',
  }
  return { ...state, matches: [...state.matches, match] }
}

export function setManualResult(state, matchId, sets) {
  return {
    ...state,
    matches: state.matches.map((m) => (m.id === matchId ? { ...m, manualResult: sets ? { sets } : null } : m)),
  }
}

// ---- Live event log (score taps + stat taps) ----

export function addEvent(state, event) {
  return { ...state, events: [...state.events, { id: uid('e'), timestamp: Date.now(), ...event }] }
}

export function undoLastEvent(state, matchId) {
  const idx = [...state.events].map((e, i) => ({ e, i })).filter(({ e }) => e.matchId === matchId)
  if (idx.length === 0) return state
  const lastIndex = idx[idx.length - 1].i
  return { ...state, events: state.events.filter((_, i) => i !== lastIndex) }
}

export function eventsForMatch(state, matchId) {
  return state.events.filter((e) => e.matchId === matchId)
}

export function clearMatchEvents(state, matchId) {
  return { ...state, events: state.events.filter((e) => e.matchId !== matchId) }
}
