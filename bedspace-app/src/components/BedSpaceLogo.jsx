import React from 'react'

/**
 * Placeholder brand mark for BedSpace — a roofline over a bed frame, rendered
 * as inline vector (no external asset files) so it always renders crisply and
 * is trivial to swap once Bethesda Center provides finished brand assets.
 *
 * dark=true  → mark in a warm accent badge + white text (for the navy sidebar / gates)
 * dark=false → mark + charcoal text (for light backgrounds)
 */
export default function BedSpaceLogo({ size = 36, dark = false, showWordmark = true, showTagline = true, style = {} }) {
  const wordColor = dark ? '#ffffff' : '#23201b'
  const tagColor = dark ? '#e3c9a6' : '#b0602a'
  const badgeBg = dark ? 'rgba(255,255,255,0.92)' : '#fdf3e7'
  const markColor = '#b0602a'

  const mark = (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: badgeBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="none" stroke={markColor} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 18v-7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M13 13h6a2 2 0 0 1 2 2v3" />
        <path d="M3 13h18" />
        <path d="M3 18v2M21 18v2" />
        <circle cx="6.5" cy="8.5" r="1.4" fill={markColor} stroke="none" />
        <path d="M4 4.5L12 1l8 3.5" strokeWidth={2.3} />
      </svg>
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

const theme_display = "'Fraunces', 'Georgia', serif"
