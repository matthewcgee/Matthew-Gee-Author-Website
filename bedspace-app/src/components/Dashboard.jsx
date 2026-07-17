import React, { useMemo } from 'react'
import { Card, StatCard, Badge, theme, grid } from './ui.jsx'
import { DORMS, BED_STATUS, residencyStatus } from '../lib/model.js'

function isoWeekStart(d = new Date()) {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return date.toISOString().slice(0, 10)
}

export default function Dashboard({ beds, residents, now }) {
  const activeResidents = useMemo(() => residents.filter((r) => !r.dischargedAt), [residents])

  const counts = useMemo(() => {
    const c = { open: 0, held: 0, occupied: 0, oos: 0 }
    beds.forEach((b) => {
      if (b.status === BED_STATUS.HELD && b.hold && now >= b.hold.expiresAt) c.open++
      else if (b.status === BED_STATUS.AVAILABLE) c.open++
      else if (b.status === BED_STATUS.HELD) c.held++
      else if (b.status === BED_STATUS.OCCUPIED) c.occupied++
      else c.oos++
    })
    return c
  }, [beds, now])

  const byDorm = DORMS.map((d) => {
    const dormBeds = beds.filter((b) => b.dorm === d.id)
    const occupied = dormBeds.filter((b) => b.status === BED_STATUS.OCCUPIED).length
    return { ...d, occupied, pct: Math.round((occupied / d.capacity) * 100) }
  })

  const capWatch = useMemo(() => {
    return activeResidents
      .map((r) => ({ r, rs: residencyStatus(r, now) }))
      .filter(({ rs }) => rs.status !== 'ok')
      .sort((a, b) => a.rs.daysRemaining - b.rs.daysRemaining)
  }, [activeResidents, now])

  const thisWeek = isoWeekStart(new Date(now))
  const complianceGaps = useMemo(() => {
    return activeResidents.filter((r) => {
      const missingGroup = !r.compliance.groupTherapyWeeks.includes(thisWeek)
      const noPsych = !r.compliance.lastPsychApptAt
      const noPrimary = !r.compliance.lastPrimaryCareApptAt
      return missingGroup || noPsych || noPrimary
    })
  }, [activeResidents, thisWeek])

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 22 }}>Dashboard</div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>Occupancy, residency caps, and care compliance across both dorms</div>
      </div>

      <div style={{ ...grid(4, 12), marginBottom: 18 }}>
        <StatCard label="Total Beds" value={beds.length} icon="bed" />
        <StatCard label="Open" value={counts.open} color={theme.green} icon="checkCircle" />
        <StatCard label="Held" value={counts.held} color={theme.amber} icon="clock" />
        <StatCard label="Occupied" value={counts.occupied} color={theme.red} icon="users" />
      </div>

      <div style={{ ...grid(2, 16) }}>
        <Card title="Occupancy by Dorm">
          {byDorm.map((d) => (
            <div key={d.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>{d.label}</span>
                <span style={{ color: theme.sub }}>{d.occupied} / {d.capacity} ({d.pct}%)</span>
              </div>
              <div style={{ background: theme.panelAlt, borderRadius: 999, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${d.pct}%`, height: '100%', background: theme.accent, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </Card>

        <Card title="Residency Cap Watch" sub="Residents within 7 days of, or past, their 90-day cap">
          {capWatch.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>No residents approaching their cap.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {capWatch.map(({ r, rs }) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>{r.name} <span style={{ color: theme.sub }}>· Bed {r.bedId}</span></span>
                <Badge bg={rs.status === 'expired' ? theme.redSoft : theme.amberSoft} color={rs.status === 'expired' ? theme.red : theme.amber}>
                  {rs.status === 'expired' ? 'Cap reached' : `${rs.daysRemaining}d left`}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Care Compliance Gaps" sub="Active residents missing this week's group therapy check-in or an appointment log">
        {complianceGaps.length === 0 && <div style={{ fontSize: 13, color: theme.sub }}>Everyone is current.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {complianceGaps.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{r.name} <span style={{ color: theme.sub }}>· Bed {r.bedId}</span></span>
              <span style={{ fontSize: 11.5, color: theme.sub }}>
                {!r.compliance.groupTherapyWeeks.includes(thisWeek) && 'Group therapy · '}
                {!r.compliance.lastPsychApptAt && 'Psych · '}
                {!r.compliance.lastPrimaryCareApptAt && 'Primary care'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
