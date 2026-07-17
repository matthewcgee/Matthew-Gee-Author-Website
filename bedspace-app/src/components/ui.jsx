import React from 'react'

export const theme = {
  bg: '#f6f4f0',
  panel: '#ffffff',
  panelAlt: '#f1ece1',
  border: '#e3dac8',
  text: '#23201b',
  sub: '#75695a',
  accent: '#b0602a',
  accentSoft: 'rgba(176,96,42,0.10)',
  navy: '#1c2333',
  green: '#2f9e5c',
  greenSoft: 'rgba(47,158,92,0.12)',
  amber: '#c98a2b',
  amberSoft: 'rgba(201,138,43,0.14)',
  red: '#c14a3a',
  redSoft: 'rgba(193,74,58,0.12)',
  blue: '#3b6ea5',
  blueSoft: 'rgba(59,110,165,0.12)',
  display: "'Fraunces', 'Georgia', serif",
}

const ICON_PATHS = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  bed: (
    <>
      <path d="M3 18v-7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M13 13h6a2 2 0 0 1 2 2v3" />
      <path d="M3 13h18" />
      <path d="M3 18v2M21 18v2" />
      <circle cx="6.5" cy="8.5" r="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21v-1.5A4.5 4.5 0 0 1 6.5 15h5a4.5 4.5 0 0 1 4.5 4.5V21" />
      <path d="M16.5 11.5l2 2 4-4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 19.5V21" />
      <circle cx="9" cy="7.5" r="3.25" />
      <path d="M21 21v-1.5a3.25 3.25 0 0 0-2.4-3.14" />
      <path d="M15.2 4.36a3.25 3.25 0 0 1 0 6.28" />
    </>
  ),
  shieldLock: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <rect x="9.3" y="10.8" width="5.4" height="4.4" rx="1" />
      <path d="M10.3 10.8v-1.4a1.7 1.7 0 0 1 3.4 0v1.4" />
    </>
  ),
  barChart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.8 2.8 0 1 1 4.4 2.3c-.9.6-1.6 1.1-1.6 2.2" />
      <path d="M12 17.2h.01" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  chevronRight: (
    <>
      <path d="M9 6l6 6-6 6" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M6 9l6 6 6-6" />
    </>
  ),
  alertTriangle: (
    <>
      <path d="M10.3 3.86L1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.7 3.86a1.5 1.5 0 0 0-2.6 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  moonBed: (
    <>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.5L12 4l8 7.5" />
      <path d="M6 10v9.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </>
  ),
  arrowDown: (
    <>
      <path d="M12 4v13M6 12l6 6 6-6" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3" width="11" height="18" rx="1" />
      <path d="M9 7h2M9 11h2M9 15h2M17 11h3v10h-3M19 21V11" />
    </>
  ),
}

export function Icon({ name, size = 18, strokeWidth = 2, style }) {
  const paths = ICON_PATHS[name]
  if (!paths) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {paths}
    </svg>
  )
}

export function Card({ title, sub, right, children, style, interactive, className }) {
  return (
    <div
      className={[interactive ? 'hover-lift' : '', className || ''].filter(Boolean).join(' ')}
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: 18,
        marginBottom: 16,
        boxShadow: '0 1px 3px rgba(35,32,27,0.05)',
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
          <div>
            {title && <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 16.5 }}>{title}</div>}
            {sub && <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Badge({ color, bg, children, pulse }) {
  return (
    <span
      className={pulse ? 'pulse-ring' : ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        color: color || '#ffffff',
        background: bg || color || theme.accent,
      }}
    >
      {children}
    </span>
  )
}

export function Button({ children, onClick, variant = 'primary', type = 'button', style, disabled }) {
  const styles = {
    primary: { background: theme.accent, color: '#ffffff', border: '1px solid ' + theme.accent },
    ghost: { background: 'transparent', color: theme.text, border: `1px solid ${theme.border}` },
    danger: { background: 'transparent', color: '#a5342a', border: '1px solid #e3b3ac' },
    dark: { background: theme.navy, color: '#ffffff', border: '1px solid ' + theme.navy },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="btn-press"
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: theme.sub }}>
      <span>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: theme.sub, opacity: 0.85 }}>{hint}</span>}
    </label>
  )
}

export function Toast({ message }) {
  if (!message) return null
  return (
    <div
      className="fade-in-up"
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        background: theme.navy,
        color: '#ffffff',
        padding: '8px 18px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        zIndex: 1000,
        boxShadow: '0 6px 24px rgba(28,35,51,0.4)',
        maxWidth: '90vw',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  )
}

export function ProgressBar({ value, max, color, height = 8 }) {
  const safeMax = max && max > 0 ? max : 1
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100))
  return (
    <div style={{ background: theme.panelAlt, borderRadius: 999, height, overflow: 'hidden' }}>
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 999,
          background: color || theme.accent,
          transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </div>
  )
}

export function StatCard({ label, value, sub, color, icon }) {
  return (
    <div
      className="hover-lift fade-in-up"
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 1px 3px rgba(35,32,27,0.05)',
      }}
    >
      {icon && (
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: color ? `${color}22` : theme.accentSoft,
            color: color || theme.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name={icon} size={19} />
        </div>
      )}
      <div>
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: theme.display, lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 2 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: theme.sub, opacity: 0.8 }}>{sub}</div>}
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, width = 480 }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,35,51,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.panel,
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: width,
          maxHeight: '86vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(28,35,51,0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 18 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.sub, padding: 4 }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const grid = (cols, gap = 12) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
  gap,
})
