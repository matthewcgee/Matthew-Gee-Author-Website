import React, { useState } from 'react'
import { Modal, Button, Badge, Icon, theme } from './ui.jsx'
import { BED_STATUS, POSITION_LABEL, holdTimeRemainingMs, formatDuration, residencyStatus } from '../lib/model.js'

export default function BedActionModal({
  bed, resident, now, bethesdaUnlocked, staffName,
  onClose, onHold, onReleaseHold, onExtendHold, onToggleOutOfService,
  onOpenAdmit, onOpenResidentDetail,
}) {
  const [extendNote, setExtendNote] = useState('')
  const holdExpired = bed.status === BED_STATUS.HELD && bed.hold && now >= bed.hold.expiresAt
  const effStatus = holdExpired ? BED_STATUS.AVAILABLE : bed.status

  const title = `Bed ${bed.id}${bed.accessible ? ' · Accessible Single' : ''}`

  return (
    <Modal title={title} onClose={onClose} width={440}>
      <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Badge bg={theme.panelAlt} color={theme.text}>{POSITION_LABEL[bed.position]} Bunk</Badge>
        {bed.bottomBunk && <Badge bg={theme.blueSoft} color={theme.blue}>No-climb eligible</Badge>}
      </div>

      {effStatus === BED_STATUS.AVAILABLE && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: theme.sub, lineHeight: 1.6 }}>
            This bed is open. Medical providers can hold it for up to 2 hours while arranging transport,
            or admit a resident directly.
          </div>
          <Button onClick={() => { onHold(bed.id); onClose() }}>
            <Icon name="clock" size={15} /> Hold Bed (2 hours)
          </Button>
          <Button variant="dark" onClick={() => { onOpenAdmit(bed); onClose() }}>
            <Icon name="userCheck" size={15} /> Admit Resident Now
          </Button>
          {bethesdaUnlocked && (
            <Button variant="ghost" onClick={() => { onToggleOutOfService(bed.id, true); onClose() }}>
              Mark Out of Service
            </Button>
          )}
        </div>
      )}

      {effStatus === BED_STATUS.HELD && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            background: theme.amberSoft, border: `1px solid ${theme.amber}`, borderRadius: 10,
            padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 12.5, color: theme.text }}>
              Held by <strong>{bed.hold.heldBy}</strong>
              {bed.hold.extendedBy && <div style={{ fontSize: 11, color: theme.sub }}>Extended by {bed.hold.extendedBy}</div>}
            </div>
            <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 18, color: theme.amber }}>
              {formatDuration(holdTimeRemainingMs(bed.hold, now))}
            </div>
          </div>
          <Button onClick={() => { onOpenAdmit(bed); onClose() }}>
            <Icon name="userCheck" size={15} /> Admit Resident to This Bed
          </Button>
          <Button variant="ghost" onClick={() => { onReleaseHold(bed.id); onClose() }}>
            Release Hold
          </Button>
          {bethesdaUnlocked && (
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, marginTop: 2 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.sub, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                Bethesda Leadership Override
              </div>
              <input
                placeholder="Reason for extension (optional)"
                value={extendNote}
                onChange={(e) => setExtendNote(e.target.value)}
                style={{ width: '100%', marginBottom: 8 }}
              />
              <Button variant="dark" onClick={() => { onExtendHold(bed.id, extendNote, staffName); onClose() }}>
                Grant 2-Hour Extension
              </Button>
            </div>
          )}
        </div>
      )}

      {effStatus === BED_STATUS.OCCUPIED && resident && (
        <ResidentSummary resident={resident} now={now} onManage={() => { onOpenResidentDetail(resident); onClose() }} />
      )}

      {effStatus === BED_STATUS.OUT_OF_SERVICE && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: theme.sub }}>This bed is marked out of service and not shown as available.</div>
          {bethesdaUnlocked && (
            <Button onClick={() => { onToggleOutOfService(bed.id, false); onClose() }}>Return to Service</Button>
          )}
        </div>
      )}
    </Modal>
  )
}

function ResidentSummary({ resident, now, onManage }) {
  const rs = residencyStatus(resident, now)
  const capColor = rs.status === 'expired' ? theme.red : rs.status === 'warning' ? theme.amber : theme.green
  const capLabel = rs.status === 'expired' ? 'Cap reached' : `${rs.daysRemaining} day${rs.daysRemaining === 1 ? '' : 's'} to cap`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 16 }}>{resident.name}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Badge bg={theme.panelAlt} color={theme.text}>Day {rs.elapsed} of 90{resident.extensionDays ? `+${resident.extensionDays}` : ''}</Badge>
        <Badge bg={`${capColor}22`} color={capColor}>{capLabel}</Badge>
      </div>
      <Button variant="dark" onClick={onManage}>
        <Icon name="users" size={15} /> Manage Resident
      </Button>
    </div>
  )
}
