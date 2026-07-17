import React from 'react'
import { Icon, theme } from './ui.jsx'
import BedSpaceLogo from './BedSpaceLogo.jsx'

const ROLES = [
  {
    id: 'hospital',
    icon: 'bed',
    title: 'Hospital Staff',
    sub: 'Emergency Department / Inpatient',
    detail: 'View the bed board, hold beds, screen and admit residents.',
  },
  {
    id: 'bethesda',
    icon: 'shieldLock',
    title: 'Bethesda Center Staff',
    sub: 'Shelter administration',
    detail: 'Manage the disallowed-resident list, verifications, holds, and residency extensions.',
  },
]

export default function RoleSelectGate({ onSelect }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: theme.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ marginBottom: 36 }}>
        <BedSpaceLogo size={46} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: theme.sub, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 22 }}>
        Who's signing in?
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 700 }}>
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className="btn-press hover-lift"
            style={{
              width: 300,
              textAlign: 'left',
              background: theme.panel,
              border: `1.5px solid ${theme.border}`,
              borderRadius: 16,
              padding: 22,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 42, height: 42, borderRadius: 12, background: theme.accentSoft, color: theme.accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Icon name={r.icon} size={21} />
            </div>
            <div>
              <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 17, color: theme.text }}>{r.title}</div>
              <div style={{ fontSize: 11.5, color: theme.accent, fontWeight: 700, marginTop: 1 }}>{r.sub}</div>
            </div>
            <div style={{ fontSize: 12.5, color: theme.sub, lineHeight: 1.5 }}>{r.detail}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 30, fontSize: 11, color: theme.sub, textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>
        You'll be signed out automatically when you leave this page.
      </div>
    </div>
  )
}
