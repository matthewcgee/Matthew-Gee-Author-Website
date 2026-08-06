// Stat categories a parent can tap live, grouped the way a college recruiting
// box score is usually organized (serve / attack / set / block / dig / receive).
export const STAT_GROUPS = [
  {
    key: 'serve',
    label: 'Serve',
    stats: [
      { key: 'aces', label: 'Ace', hint: 'Serve won the point outright' },
      { key: 'serveErrors', label: 'Serve Error', hint: 'Into the net or out' },
    ],
  },
  {
    key: 'attack',
    label: 'Attack',
    stats: [
      { key: 'kills', label: 'Kill', hint: 'Attack won the point' },
      { key: 'attackErrors', label: 'Attack Error', hint: 'Hit out, into net, or blocked for a point' },
      { key: 'attackAttempts', label: 'Attempt', hint: 'Attack stayed in play (for hitting %)' },
    ],
  },
  {
    key: 'set',
    label: 'Set',
    stats: [
      { key: 'assists', label: 'Assist', hint: 'Set led directly to a kill' },
    ],
  },
  {
    key: 'block',
    label: 'Block',
    stats: [
      { key: 'blockSolos', label: 'Solo Block', hint: 'Blocked alone for a point' },
      { key: 'blockAssists', label: 'Block Assist', hint: 'Blocked with a teammate for a point' },
      { key: 'blockErrors', label: 'Block Error', hint: 'Net violation or block put ball out' },
    ],
  },
  {
    key: 'dig',
    label: 'Dig',
    stats: [
      { key: 'digs', label: 'Dig', hint: 'Defensive save that kept the ball alive' },
    ],
  },
  {
    key: 'receive',
    label: 'Receive',
    stats: [
      { key: 'receptionErrors', label: 'Reception Error', hint: 'Missed or shanked serve receive' },
    ],
  },
]

export const ALL_STAT_KEYS = STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.key))

export const STAT_LABELS = Object.fromEntries(
  STAT_GROUPS.flatMap((g) => g.stats.map((s) => [s.key, s.label]))
)

export function blankStatLine() {
  return Object.fromEntries(ALL_STAT_KEYS.map((k) => [k, 0]))
}

// Replay a match's event log into the live/derived state a screen needs:
// current set score, completed sets, and per-player stat tallies.
// Event-sourced so "undo" is just dropping the last event and re-deriving.
export function deriveMatchState(events) {
  let us = 0
  let them = 0
  let setNumber = 1
  const completedSets = []
  const statTotals = {} // playerId -> { statKey: count }

  for (const e of events) {
    if (e.type === 'score') {
      if (e.side === 'us') us += 1
      else them += 1
    } else if (e.type === 'endSet') {
      completedSets.push({ setNumber, us, them })
      us = 0
      them = 0
      setNumber += 1
    } else if (e.type === 'stat') {
      if (!statTotals[e.playerId]) statTotals[e.playerId] = blankStatLine()
      statTotals[e.playerId][e.statKey] = (statTotals[e.playerId][e.statKey] || 0) + 1
    }
  }

  const setsWonUs = completedSets.filter((s) => s.us > s.them).length
  const setsWonThem = completedSets.filter((s) => s.them > s.us).length

  return {
    setNumber,
    currentSet: { us, them },
    completedSets,
    statTotals,
    setsWonUs,
    setsWonThem,
  }
}

export function finalResultFromSets(sets) {
  if (!sets || sets.length === 0) return null
  const setsWonUs = sets.filter((s) => s.us > s.them).length
  const setsWonThem = sets.filter((s) => s.them > s.us).length
  return {
    sets,
    setsWonUs,
    setsWonThem,
    outcome: setsWonUs === setsWonThem ? null : setsWonUs > setsWonThem ? 'W' : 'L',
  }
}

export function computeSeasonTotals(events, playerId) {
  const totals = blankStatLine()
  let matchesPlayed = new Set()
  for (const e of events) {
    if (e.type === 'stat' && e.playerId === playerId) {
      totals[e.statKey] += 1
      matchesPlayed.add(e.matchId)
    }
  }
  return { totals, matchesPlayed: matchesPlayed.size }
}

export function hittingPct(totals) {
  const { kills = 0, attackErrors = 0, attackAttempts = 0 } = totals
  const total = kills + attackErrors + attackAttempts
  if (total === 0) return null
  return (kills - attackErrors) / total
}

export function formatPct(n) {
  if (n === null || Number.isNaN(n)) return '—'
  return n.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
}

export function csvEscape(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function formatDateRange(startDate, endDate) {
  const parse = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const start = parse(startDate)
  const end = parse(endDate)
  const sameDay = startDate === endDate
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const month = (d) => d.toLocaleDateString('en-US', { month: 'short' })
  const day = (d) => d.getDate()
  const year = end.getFullYear()

  if (sameDay) return `${month(start)} ${day(start)}, ${year}`
  if (sameMonth) return `${month(start)} ${day(start)}–${day(end)}, ${year}`
  return `${month(start)} ${day(start)} – ${month(end)} ${day(end)}, ${year}`
}
