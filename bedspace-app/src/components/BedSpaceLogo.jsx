import React from 'react'

/**
 * Placeholder brand mark for BedSpace — a roofline over a bed frame, drawn in
 * the same thin, geometric line-art spirit as the Bethesda Center mark
 * (shelter-shaped icon, dark charcoal stroke, rounded wordmark), rendered as
 * inline vector so it always renders crisply and is trivial to swap once
 * Bethesda Center provides finished co-brand assets.
 *
 * dark=true  → mark in a white chip so the charcoal stroke reads on a dark sidebar
 * dark=false → mark drawn directly on the light background, no chip (matches
 *              the plain-white treatment of the Bethesda Center logo)
 */
export default function BedSpaceLogo({ size = 36, dark = false, showWordmark = true, showTagline = true, style = {} }) {
  const wordColor = dark ? '#ffffff' : '#262c36'
  const tagColor = dark ? '#c7b9a3' : '#b0602a'
  const markColor = dark ? '#262c36' : '#262c36'

  const icon = (
    <svg width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} viewBox="0 0 24 24" fill="none" stroke={markColor} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.2L12 0.8l8 3.4" />
      <path d="M3 18v-7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M13 13h6a2 2 0 0 1 2 2v3" />
      <path d="M3 13h18" />
      <path d="M3 18v2M21 18v2" />
      <circle cx="6.5" cy="8.5" r="1.3" fill={markColor} stroke="none" />
    </svg>
  )

  const mark = dark ? (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </div>
  ) : (
    <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
  )

  if (!showWordmark) {
    return <div style={style}>{mark}</div>
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), ...style }}>
      {mark}
      <div style={{ lineHeight: 1 }}>
        <div
          style={{
            fontFamily: theme_display,
            fontSize: Math.round(size * 0.62),
            fontWeight: 700,
            color: wordColor,
            letterSpacing: '0.01em',
            lineHeight: 1.1,
          }}
        >
          BedSpace
        </div>
        {showTagline && size >= 28 && (
          <div
            style={{
              fontFamily: theme_display,
              fontSize: Math.round(size * 0.24),
              fontWeight: 600,
              color: tagColor,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            Bethesda Center Partnership
          </div>
        )}
      </div>
    </div>
  )
}

const theme_display = "'Quicksand', 'Nunito', sans-serif"
