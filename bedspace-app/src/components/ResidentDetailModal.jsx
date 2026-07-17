import React, { useState } from 'react'
import { Modal, Button, Field, Badge, ProgressBar, Icon, theme } from './ui.jsx'
import { residencyStatus, commitmentsAccepted, RESIDENCY_CAP_DAYS } from '../lib/model.js'

function isoWeekStart(d = new Date()) {
  const date = new Date(d)
  const day = (date.getDay() + 6) % 7 // Monday = 0
  date.setDate(date.getDate() - day)
  return date.toISOString().slice(0, 10)
}

export default function ResidentDetailModal({ resident, bed, bethesdaUnlocked, staffName, now, onClose, onDischarge, onGrantExtension, onUpdateCompliance }) {
  const [extendDays, setExtendDays] = useState(14)
  const [extendNote, setExtendNote] = useState('')

  const rs = residencyStatus(resident, now)
  const capColor = rs.status === 'expired' ? theme.red : rs.status === 'warning' ? theme.amber : theme.green
  const thisWeek = isoWeekStart(new Date(now))
  const attendedThisWeek = resident.compliance.groupTherapyWeeks.includes(thisWeek)

  return (
    <Modal title={resident.name} onClose={onClose} width={520}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Badge bg={theme.panelAlt} color={theme.text}>Bed {bed?.id || resident.bedId}</Badge>
        <Badge bg={theme.panelAlt} color={theme.text}>
          Admitted {new Date(resident.admittedAt).toLocaleDateString()}
        </Badge>
        <Badge bg={commitmentsAccepted(resident.commitments) ? theme.greenSoft : theme.redSoft} color={commitmentsAccepted(resident.commitments) ? theme.green : theme.red}>
          {commitmentsAccepted(resident.commitments) ? 'Commitments On File' : 'Commitments Incomplete'}
        </Badge>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: theme.sub, marginBottom: 6 }}>
          <span>Day {rs.elapsed} of {RESIDENCY_CAP_DAYS + (resident.extensionDays || 0)}</span>
          <span style={{ color: capColor, fontWeight: 700 }}>
            {rs.status === 'expired' ? 'Residency cap reached' : `${rs.daysRemaining} day${rs.daysRemaining === 1 ? '' : 's'} remaining`}
          </span>
        </div>
        <ProgressBar value={rs.elapsed} max={RESIDENCY_CAP_DAYS + (resident.extensionDays || 0)} color={capColor} />
        {resident.extensionDays > 0 && (
          <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 6 }}>
            +{resident.extensionDays} day extension granted by {resident.extensionGrantedBy}
            {resident.extensionNote ? ` — “${resident.extensionNote}”` : ''}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.sub, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Ongoing Care Compliance
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ComplianceRow
            label="Psychiatric appointment"
            date={resident.compliance.lastPsychApptAt}
            onLog={() => onUpdateCompliance(resident.id, { lastPsychApptAt: now })}
          />
          <ComplianceRow
            label="Primary care appointment"
            date={resident.compliance.lastPrimaryCareApptAt}
            onLog={() => onUpdateCompliance(resident.id, { lastPrimaryCareApptAt: now })}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={attendedThisWeek}
              onChange={(e) => {
                const weeks = new Set(resident.compliance.groupTherapyWeeks)
                if (e.target.checked) weeks.add(thisWeek)
                else weeks.delete(thisWeek)
                onUpdateCompliance(resident.id, { groupTherapyWeeks: Array.from(weeks) })
              }}
            />
            Attended weekly group therapy (week of {thisWeek})
            <span style={{ marginLeft: 'auto', fontSize: 11, color: theme.sub }}>
              {resident.compliance.groupTherapyWeeks.length} week{resident.compliance.groupTherapyWeeks.length === 1 ? '' : 's'} logged
            </span>
          </label>
        </div>
      </div>

      {bethesdaUnlocked && (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: theme.sub, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Bethesda Center — Grant Residency Extension
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Field label="Additional days">
              <input type="number" min={1} max={90} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} style={{ width: 90 }} />
            </Field>
            <Field label="Reason">
              <input value={extendNote} onChange={(e) => setExtendNote(e.target.value)} placeholder="Optional note" style={{ width: 200 }} />
            </Field>
            <Button onClick={() => onGrantExtension(resident.id, extendDays, extendNote, staffName)}>Grant Extension</Button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: `1px solid ${theme.border}`, paddingTop: 14 }}>
        <Button variant="danger" onClick={() => { onDischarge(resident.id); onClose() }}>
          <Icon name="logOut" size={15} /> Discharge Resident
        </Button>
      </div>
    </Modal>
  )
}

function ComplianceRow({ label, date, onLog }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11.5, color: theme.sub }}>
          {date ? `Last: ${new Date(date).toLocaleDateString()}` : 'Not yet logged'}
        </span>
        <Button variant="ghost" onClick={onLog} style={{ padding: '4px 10px', fontSize: 11.5 }}>Log Today</Button>
      </div>
    </div>
  )
}
