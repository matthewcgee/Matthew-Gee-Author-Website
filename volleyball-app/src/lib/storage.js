import { SCHEDULE_2026 } from './schedule2026.js'

const STORAGE_KEY = 'efhs-volleyball:v1'

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function seedGames() {
  return SCHEDULE_2026.map((g, i) => ({
    id: `g${i + 1}`,
    ...g,
    manualResult: null, // { sets: [{us, them}] } — set via the Schedule page for games not tracked live
    notes: '',
  }))
}

function defaultState() {
  return {
    version: 1,
    players: [],
    games: seedGames(),
    events: [],
    settings: { myPlayerId: null },
  }
}

function migrate(state) {
  // Merge in any schedule games added since a parent's browser first saved state,
  // without clobbering scores/events they've already recorded.
  const existingByKey = new Map(state.games.map((g) => [`${g.date}|${g.opponent}|${g.site}`, g]))
  const seeded = seedGames()
  for (const g of seeded) {
    const key = `${g.date}|${g.opponent}|${g.site}`
    if (!existingByKey.has(key)) state.games.push(g)
  }
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

// ---- Games ----

export function setManualResult(state, gameId, sets) {
  return {
    ...state,
    games: state.games.map((g) => (g.id === gameId ? { ...g, manualResult: sets ? { sets } : null } : g)),
  }
}

export function addCustomGame(state, { date, opponent, site }) {
  const game = {
    id: uid('g'),
    date,
    opponent: opponent.trim(),
    site,
    jvTime: '',
    varsityTime: '',
    manualResult: null,
    notes: '',
    custom: true,
  }
  return { ...state, games: [...state.games, game] }
}

// ---- Live event log (score taps + stat taps) ----

export function addEvent(state, event) {
  return { ...state, events: [...state.events, { id: uid('e'), timestamp: Date.now(), ...event }] }
}

export function undoLastEvent(state, gameId) {
  const idx = [...state.events].map((e, i) => ({ e, i })).filter(({ e }) => e.gameId === gameId)
  if (idx.length === 0) return state
  const lastIndex = idx[idx.length - 1].i
  return { ...state, events: state.events.filter((_, i) => i !== lastIndex) }
}

export function eventsForGame(state, gameId) {
  return state.events.filter((e) => e.gameId === gameId)
}

export function clearGameEvents(state, gameId) {
  return { ...state, events: state.events.filter((e) => e.gameId !== gameId) }
}
