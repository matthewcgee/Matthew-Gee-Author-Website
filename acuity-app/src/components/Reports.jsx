import React, { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, Button, Field, Badge, theme } from './ui.jsx'
import { computeEntryValue, entryStage, thresholdsFor, STAGE_COLORS } from '../lib/model.js'

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function toCSV(rows, columns) {
  const header = columns.map((c) => c.label).join(',')
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = c.value(row)
        const str = val == null ? '' : String(val)
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
      })
      .join(',')
  )
  return [header, ...lines].join('\n')
}

function locName(locations, id) {
  const l = locations.find((loc) => loc.id === id)
  return l ? l.name : (id ? '—' : 'Float pool / off-unit')
}

export default function Reports({ locations, entries, deployments, thresholds, onDeleteEntry }) {
  const [locFilter, setLocFilter] = useState('all')

  const filteredEntries = useMemo(
    () => entries.filter((e) => locFilter === 'all' || e.locId === locFilter),
    [entries, locFilter]
  )

  const sortedEntries = useMemo(
    () => filteredEntries.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [filteredEntries]
  )

  const trendData = useMemo(() => {
    const byKey = new Map()
    filteredEntries.forEach((e) => {
      const loc = locations.find((l) => l.id === e.locId)
      if (!loc) return
      const key = `${e.date} ${e.shift}`
      const value = computeEntryValue(e, loc, thresholds)
      const entry = byKey.get(key) || { label: key }
      entry[loc.name] = value
      byKey.set(key, entry)
    })
    return Array.from(byKey.values()).sort((a, b) => (a.label < b.label ? -1 : 1))
  }, [filteredEntries, locations, thresholds])

  const deploymentHoursByLoc = useMemo(() => {
    const totals = new Map()
    deployments.forEach((d) => {
      const name = locName(locations, d.toLocId)
      totals.set(name, (totals.get(name) || 0) + (d.hours || 0))
    })
    return Array.from(totals.entries()).map(([name, hours]) => ({ name, hours }))
  }, [deployments, locations])

  const exportEntriesCSV = () => {
    const cols = [
      { label: 'Date', value: (e) => e.date },
      { label: 'Shift', value: (e) => e.shift },
      { label: 'Location', value: (e) => locations.find((l) => l.id === e.locId)?.name || e.locId },
      { label: 'Census', value: (e) => e.census },
      { label: 'CensusCap', value: (e) => locations.find((l) => l.id === e.locId)?.censusCap },
      { label: 'Points', value: (e) => e.points },
      { label: 'Staff', value: (e) => e.staff },
      { label: 'Value', value: (e) => {
          const loc = locations.find((l) => l.id === e.locId)
          return loc ? computeEntryValue(e, loc, thresholds).toFixed(2) : ''
        } },
      { label: 'Stage', value: (e) => {
          const loc = locations.find((l) => l.id === e.locId)
          return loc ? entryStage(e, loc, thresholds) : ''
        } },
      { label: 'AddStaffNext', value: (e) => e.addStaffNext },
      { label: 'Notes', value: (e) => e.notes },
    ]
    download('acuity-entries.csv', toCSV(sortedEntries, cols), 'text/csv')
  }

  const exportDeploymentsCSV = () => {
    const cols = [
      { label: 'Date', value: (d) => d.date },
      { label: 'Shift', value: (d) => d.shift },
      { label: 'Staff', value: (d) => d.staffName },
      { label: 'Role', value: (d) => d.role },
      { label: 'From', value: (d) => locName(locations, d.fromLocId) },
      { label: 'To', value: (d) => locName(locations, d.toLocId) },
      { label: 'Hours', value: (d) => d.hours },
      { label: 'Reason', value: (d) => d.reason },
      { label: 'Notes', value: (d) => d.notes },
    ]
    const sortedDeployments = deployments.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    download('staff-deployments.csv', toCSV(sortedDeployments, cols), 'text/csv')
  }

  const exportJSON = () => {
    download('acuity-data.json', JSON.stringify({ locations, entries, deployments, thresholds }, null, 2), 'application/json')
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>Reports</div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>
            Acuity trends, census vs. caps, and staff deployment summaries for budgeting.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Location">
            <select value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
              <option value="all">All locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Field>
          <Button variant="ghost" onClick={exportEntriesCSV}>Export Entries CSV</Button>
          <Button variant="ghost" onClick={exportDeploymentsCSV}>Export Deployments CSV</Button>
          <Button variant="ghost" onClick={exportJSON}>Export JSON</Button>
        </div>
      </div>

      <Card title="Acuity Trend" sub="Computed acuity value per shift entry">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke={theme.sub} fontSize={11} />
            <YAxis stroke={theme.sub} fontSize={11} />
            <Tooltip contentStyle={{ background: theme.panelAlt, border: `1px solid ${theme.border}` }} />
            <Legend />
            {locations.map((loc, i) => (
              <Line
                key={loc.id}
                type="monotone"
                dataKey={loc.name}
                stroke={i % 2 === 0 ? theme.accent : theme.navy}
                connectNulls
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Deployment Hours by Destination" sub="Total hours deployed to each location, for budgeting">
        {deploymentHoursByLoc.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No deployment data yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deploymentHoursByLoc}>
              <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke={theme.sub} fontSize={11} />
              <YAxis stroke={theme.sub} fontSize={11} />
              <Tooltip contentStyle={{ background: theme.panelAlt, border: `1px solid ${theme.border}` }} />
              <Bar dataKey="hours" fill={theme.accent} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card title="Shift Entries" sub={`${sortedEntries.length} record${sortedEntries.length === 1 ? '' : 's'}`}>
        {sortedEntries.length === 0 ? (
          <div style={{ fontSize: 13, color: theme.sub }}>No shift entries yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '6px 8px' }}>Date</th>
                  <th style={{ padding: '6px 8px' }}>Shift</th>
                  <th style={{ padding: '6px 8px' }}>Location</th>
                  <th style={{ padding: '6px 8px' }}>Census / Cap</th>
                  <th style={{ padding: '6px 8px' }}>Points</th>
                  <th style={{ padding: '6px 8px' }}>Staff</th>
                  <th style={{ padding: '6px 8px' }}>Value</th>
                  <th style={{ padding: '6px 8px' }}>Stage</th>
                  <th style={{ padding: '6px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((e) => {
                  const loc = locations.find((l) => l.id === e.locId)
                  if (!loc) return null
                  const value = computeEntryValue(e, loc, thresholds)
                  const stage = entryStage(e, loc, thresholds)
                  const overCap = loc.censusCap != null && e.census != null && e.census > loc.censusCap
                  return (
                    <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '6px 8px' }}>{e.date}</td>
                      <td style={{ padding: '6px 8px' }}>{e.shift}</td>
                      <td style={{ padding: '6px 8px' }}>{loc.name}</td>
                      <td style={{ padding: '6px 8px', color: overCap ? STAGE_COLORS.RED : undefined }}>
                        {e.census ?? '—'}{loc.censusCap != null ? ` / ${loc.censusCap}` : ''}
                      </td>
                      <td style={{ padding: '6px 8px' }}>{e.points}</td>
                      <td style={{ padding: '6px 8px' }}>{e.staff ?? '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{value.toFixed(loc.type === 'ed' ? 0 : 2)}</td>
                      <td style={{ padding: '6px 8px' }}><Badge color={STAGE_COLORS[stage]}>{stage}</Badge></td>
                      <td style={{ padding: '6px 8px' }}>
                        <Button variant="danger" onClick={() => onDeleteEntry(e.id)}>Remove</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
