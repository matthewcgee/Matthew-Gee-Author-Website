import React, { useMemo, useState } from 'react'
import { theme, Icon, Badge, Button, StatCard, grid } from './ui.jsx'
import { DORMS, BED_STATUS, holdTimeRemainingMs, formatDuration, residencyStatus } from '../lib/model.js'
import BedActionModal from './BedActionModal.jsx'

function statusOf(bed, now) {
  if (bed.status === BED_STATUS.HELD && bed.hold && now >= bed.hold.expiresAt) {
    return BED_STATUS.AVAILABLE // expired holds read as available until the housekeeping sweep clears them
  }
  return bed.status
}

const STATUS_META = {
  [BED_STATUS.AVAILABLE]: { color: theme.green, bg: theme.greenSoft, label: 'Open' },
  [BED_STATUS.HELD]: { color: theme.amber, bg: theme.amberSoft, label: 'Held' },
  [BED_STATUS.OCCUPIED]: { color: theme.red, bg: theme.redSoft, label: 'Occupied' },
  [BED_STATUS.OUT_OF_SERVICE]: { color: '#8a8378', bg: '#eee9df', label: 'Out of Service' },
}

function BedTile({ bed, now, resident, bottomOnlyMode, dim, onClick }) {
  const effStatus = statusOf(bed, now)
  const meta = STATUS_META[effStatus]
  const isPulsing = effStatus === BED_STATUS.HELD
  const heightByPosition = { top: 40, middle: 40, bottom: 46 }

  let subLabel = bed.id
  if (effStatus === BED_STATUS.HELD && bed.hold) {
    subLabel = formatDuration(holdTimeRemainingMs(bed.hold, now))
  } else if (effStatus === BED_STATUS.OCCUPIED && resident) {
    const rs = residencyStatus(resident, now)
    subLabel = rs.status === 'expired' ? 'Cap reached' : `Day ${rs.elapsed}`
  }

  return (
    <button
      onClick={() => onClick(bed)}
      className={`bed-tile ${isPulsing ? 'pulse-ring-amber' : ''}`}
      title={`${bed.id} — ${meta.label}${bed.accessible ? ' (accessible single)' : ''}`}
      style={{
        height: heightByPosition[bed.position],
        borderRadius: 8,
        border: `1.5px solid ${meta.color}`,
        background: meta.bg,
        color: meta.color,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: 10.5,
        fontWeight: 700,
        lineHeight: 1.25,
        opacity: dim ? 0.32 : 1,
        position: 'relative',
        padding: '2px 4px',
      }}
    >
      {bed.bottomBunk && bottomOnlyMode && (
        <span style={{ position: 'absolute', top: -6, right: -6, background: theme.blue, color: '#fff', borderRadius: 999, width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>
          ✓
        </span>
      )}
      <span>{bed.id}</span>
      <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.85 }}>{subLabel}</span>
    </button>
  )
}

function DormSection({ dorm, beds, residentsById, now, bottomOnly, onBedClick }) {
  const stacks = useMemo(() => {
    const byStack = new Map()
    beds.forEach((b) => {
      if (!byStack.has(b.stack)) byStack.set(b.stack, [])
      byStack.get(b.stack).push(b)
    })
    return Array.from(byStack.entries()).sort((a, b) => a[0] - b[0])
  }, [beds])

  const counts = useMemo(() => {
    const c = { open: 0, held: 0, occupied: 0, oos: 0 }
    beds.forEach((b) => {
      const s = statusOf(b, now)
      if (s === BED_STATUS.AVAILABLE) c.open++
      else if (s === BED_STATUS.HELD) c.held++
      else if (s === BED_STATUS.OCCUPIED) c.occupied++
      else c.oos++
    })
    return c
  }, [beds, now])

  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 17 }}>{dorm.label}</div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, fontWeight: 700 }}>
          <Badge bg={theme.greenSoft} color={theme.green}>{counts.open} Open</Badge>
          <Badge bg={theme.amberSoft} color={theme.amber}>{counts.held} Held</Badge>
          <Badge bg={theme.redSoft} color={theme.red}>{counts.occupied} Occupied</Badge>
          {counts.oos > 0 && <Badge bg="#eee9df" color="#8a8378">{counts.oos} Out</Badge>}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12 }}>
        {stacks.map(([stackNum, stackBeds]) => {
          const ordered = ['top', 'middle', 'bottom']
            .map((pos) => stackBeds.find((b) => b.position === pos))
            .filter(Boolean)
          return (
            <div key={stackNum} style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 74 }}>
              {ordered.map((bed) => (
                <BedTile
                  key={bed.id}
                  bed={bed}
                  now={now}
                  resident={residentsById[bed.residentId]}
                  bottomOnlyMode={bottomOnly}
                  dim={bottomOnly && !bed.bottomBunk}
                  onClick={onBedClick}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function BedBoard({ beds, residents, now, bethesdaUnlocked, onHold, onReleaseHold, onExtendHold, onToggleOutOfService, onOpenAdmit, onOpenResidentDetail, staffName }) {
  const [dormFilter, setDormFilter] = useState('all')
  const [bottomOnly, setBottomOnly] = useState(false)
  const [selectedBed, setSelectedBed] = useState(null)

  const residentsById = useMemo(() => {
    const map = {}
    residents.forEach((r) => { if (!r.dischargedAt) map[r.bedId] = r })
    return map
  }, [residents])

  const totals = useMemo(() => {
    const c = { open: 0, held: 0, occupied: 0 }
    beds.forEach((b) => {
      const s = statusOf(b, now)
      if (s === BED_STATUS.AVAILABLE) c.open++
      else if (s === BED_STATUS.HELD) c.held++
      else if (s === BED_STATUS.OCCUPIED) c.occupied++
    })
    return c
  }, [beds, now])

  const dormsToShow = dormFilter === 'all' ? DORMS : DORMS.filter((d) => d.id === dormFilter)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 22 }}>Bed Board</div>
          <div style={{ fontSize: 12.5, color: theme.sub }}>Live availability across both dormitories</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', ...DORMS.map((d) => d.id)].map((id) => (
            <Button key={id} variant={dormFilter === id ? 'primary' : 'ghost'} onClick={() => setDormFilter(id)}>
              {id === 'all' ? 'Both Dorms' : DORMS.find((d) => d.id === id).label}
            </Button>
          ))}
          <Button variant={bottomOnly ? 'primary' : 'ghost'} onClick={() => setBottomOnly((v) => !v)}>
            <Icon name="bed" size={14} /> Bottom Bunk Only
          </Button>
        </div>
      </div>

      <div style={{ ...grid(3, 12), marginBottom: 22 }}>
        <StatCard label="Open Beds" value={totals.open} color={theme.green} icon="checkCircle" sub="Available now" />
        <StatCard label="Held Beds" value={totals.held} color={theme.amber} icon="clock" sub="≤ 2 hr medical hold" />
        <StatCard label="Occupied Beds" value={totals.occupied} color={theme.red} icon="users" sub="In active residency" />
      </div>

      {dormsToShow.map((dorm) => (
        <DormSection
          key={dorm.id}
          dorm={dorm}
          beds={beds.filter((b) => b.dorm === dorm.id)}
          residentsById={residentsById}
          now={now}
          bottomOnly={bottomOnly}
          onBedClick={setSelectedBed}
        />
      ))}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 11.5, color: theme.sub, marginTop: 4 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: theme.green, marginRight: 5 }} />Open</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: theme.amber, marginRight: 5 }} />Held (2 hr max)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: theme.red, marginRight: 5 }} />Occupied</span>
        <span><span style={{ display: 'inline-flex', width: 14, height: 14, borderRadius: 999, background: theme.blue, color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 9, marginRight: 5 }}>✓</span>Bottom bunk (highlighted when filter is on)</span>
      </div>

      {selectedBed && (
        <BedActionModal
          bed={beds.find((b) => b.id === selectedBed.id) || selectedBed}
          resident={residentsById[selectedBed.id]}
          now={now}
          bethesdaUnlocked={bethesdaUnlocked}
          staffName={staffName}
          onClose={() => setSelectedBed(null)}
          onHold={onHold}
          onReleaseHold={onReleaseHold}
          onExtendHold={onExtendHold}
          onToggleOutOfService={onToggleOutOfService}
          onOpenAdmit={onOpenAdmit}
          onOpenResidentDetail={onOpenResidentDetail}
        />
      )}
    </div>
  )
}
