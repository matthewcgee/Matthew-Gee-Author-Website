export const theme = {
  bg: '#f4f8f7',
  panel: '#ffffff',
  panelAlt: '#eef5f3',
  border: '#d9e6e2',
  text: '#15302b',
  sub: '#5e7972',
  accent: '#00857C',
  accentSoft: 'rgba(0,133,124,0.10)',
  navy: '#0b2d4d',
  display: "'Playfair Display', 'Georgia', serif",
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
  plusCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
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
  barChart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
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
  building: (
    <>
      <rect x="4" y="3" width="11" height="18" rx="1" />
      <path d="M9 7h2M9 11h2M9 15h2M17 11h3v10h-3M19 21V11" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9.5 12l1.8 1.8L14.5 10" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.8 2.8 0 1 1 4.4 2.3c-.9.6-1.6 1.1-1.6 2.2" />
      <path d="M12 17.2h.01" />
    </>
  ),
  cursor: (
    <>
      <path d="M5 3l5.5 14 2-6 6-2L5 3z" />
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
        boxShadow: '0 1px 3px rgba(11,45,77,0.04)',
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

export function Badge({ color, children, pulse }) {
  return (
    <span
      className={pulse ? 'pulse-ring' : ''}
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.4,
        color: '#0b0e14',
        background: color,
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
    danger: { background: 'transparent', color: '#c0392b', border: '1px solid #e3b3ac' },
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
      {hint && <span style={{ fontSize: 11, color: theme.sub, opacity: 0.8 }}>{hint}</span>}
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
        boxShadow: '0 6px 24px rgba(11,45,77,0.35)',
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
        boxShadow: '0 1px 3px rgba(11,45,77,0.04)',
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

export const grid = (cols, gap = 12) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
  gap,
})
