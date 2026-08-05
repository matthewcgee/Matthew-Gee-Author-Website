import React from 'react'

export function EaglesLogo({ className }) {
  return (
    <img
      src="/Matthew-Gee-Author-Website/volleyball/assets/eagles-logo.png"
      alt="East Forsyth Eagles"
      className={className || 'eagles-logo'}
    />
  )
}

export function Card({ title, eyebrow, children, right }) {
  return (
    <div className="card">
      {(title || eyebrow) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: title ? 10 : 0 }}>
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2 style={{ margin: eyebrow ? '2px 0 0' : 0 }}>{title}</h2>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

export function Button({ variant = 'primary', block, children, ...rest }) {
  const cls = `btn btn-${variant}${block ? ' btn-block' : ''}`
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  )
}

export function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>
}
