import React, { useMemo } from 'react'
import { useAppState } from '../lib/AppStateContext.jsx'
import { computeSeasonTotals, hittingPct, formatPct, csvEscape } from '../lib/model.js'
import { Card, Button, EmptyState } from './ui.jsx'

const COLUMNS = [
  { key: 'matchesPlayed', label: 'MP' },
  { key: 'kills', label: 'K' },
  { key: 'attackErrors', label: 'E' },
  { key: 'attackAttempts', label: 'TA' },
  { key: 'hitPct', label: 'Hit%' },
  { key: 'assists', label: 'A' },
  { key: 'aces', label: 'SA' },
  { key: 'serveErrors', label: 'SE' },
  { key: 'digs', label: 'D' },
  { key: 'blockSolos', label: 'BS' },
  { key: 'blockAssists', label: 'BA' },
  { key: 'blockErrors', label: 'BE' },
  { key: 'receptionErrors', label: 'RE' },
]

function buildRow(state, player) {
  const { totals, matchesPlayed } = computeSeasonTotals(state.events, player.id)
  const hp = hittingPct(totals)
  return {
    player,
    matchesPlayed,
    ...totals,
    hitPct: hp,
  }
}

function exportCsv(rows) {
  const headers = ['Player', 'Number', ...COLUMNS.map((c) => c.label)]
  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) {
    const cells = [
      row.player.name,
      row.player.number,
      ...COLUMNS.map((c) => (c.key === 'hitPct' ? formatPct(row.hitPct) : row[c.key])),
    ]
    lines.push(cells.map(csvEscape).join(','))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pvc-volleyball-season-stats-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function StatsPage() {
  const { state } = useAppState()

  const rows = useMemo(
    () => state.players.map((p) => buildRow(state, p)).sort((a, b) => b.kills - a.kills),
    [state]
  )

  return (
    <>
      <Card
        eyebrow="Season Totals"
        title="Piedmont Stat Book"
        right={
          rows.length > 0 && (
            <Button variant="ghost" onClick={() => exportCsv(rows)}>
              Export CSV
            </Button>
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyState>Add players on the Roster tab and log a match to see season stats here.</EmptyState>
        ) : (
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Player</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} title={c.label}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.player.id}>
                    <td>#{row.player.number || '—'} {row.player.name}</td>
                    {COLUMNS.map((c) => (
                      <td key={c.key}>
                        {c.key === 'hitPct' ? formatPct(row.hitPct) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card eyebrow="Legend" title="What the columns mean">
        <p style={{ margin: 0, color: 'var(--silver)', fontSize: 12.5, lineHeight: 1.7 }}>
          <strong>MP</strong> matches with a logged stat &middot; <strong>K</strong> kills &middot;{' '}
          <strong>E</strong> attack errors &middot; <strong>TA</strong> total attack attempts &middot;{' '}
          <strong>Hit%</strong> (K&minus;E)/TA &middot; <strong>A</strong> assists &middot;{' '}
          <strong>SA</strong> service aces &middot; <strong>SE</strong> service errors &middot;{' '}
          <strong>D</strong> digs &middot; <strong>BS</strong> solo blocks &middot;{' '}
          <strong>BA</strong> block assists &middot; <strong>BE</strong> block errors &middot;{' '}
          <strong>RE</strong> reception errors.
        </p>
      </Card>
    </>
  )
}
