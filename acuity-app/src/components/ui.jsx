export const theme = {
  bg: '#0b0e14',
  panel: '#11151f',
  panelAlt: '#161a24',
  border: '#262b3a',
  text: '#e8e6e1',
  sub: '#9aa1b1',
  gold: '#c9a35f',
  display: "'Georgia', 'Playfair Display', serif",
}

export function Card({ title, sub, right, children, style }) {
  return (
    <div
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        ...style,
      }}
    >
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 }}>
          <div>
            {title && <div style={{ fontFamily: theme.display, fontWeight: 700, fontSize: 16 }}>{title}</div>}
            {sub && <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Badge({ color, children }) {
  return (
    <span
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
    primary: { background: theme.gold, color: '#0b0e14', border: '1px solid ' + theme.gold },
    ghost: { background: 'transparent', color: theme.text, border: `1px solid ${theme.border}` },
    danger: { background: 'transparent', color: '#e0584a', border: '1px solid #5a2d28' },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 13.5,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
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
      style={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        background: theme.gold,
        color: '#0b0e14',
        padding: '8px 18px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        zIndex: 1000,
        boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
      }}
    >
      {message}
    </div>
  )
}

export const grid = (cols, gap = 12) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
  gap,
})
