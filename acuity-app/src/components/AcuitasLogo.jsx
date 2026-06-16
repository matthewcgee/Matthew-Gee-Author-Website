import React from 'react'

// Brand colors
const BRAND = {
  navy:  '#0b2d4d',
  teal:  '#00857C',
}

/**
 * dark=true  → white legs / teal crossbar (for navy sidebar)
 * dark=false → navy legs / teal crossbar (for light backgrounds)
 * showWordmark=false → mark only
 */
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  const legs      = dark ? '#ffffff' : BRAND.navy
  const crossbar  = BRAND.teal          // teal accent on both modes
  const textColor = dark ? '#ffffff' : BRAND.navy
  const subColor  = dark ? '#9fc2bb' : '#5e7972'

  const markH  = Math.round(size * 1.1)
  const wordPx = Math.round(size * 0.78)
  const tagPx  = Math.round(size * 0.27)
  const sw     = Math.max(1.8, size * 0.072)   // stroke scales with size

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.28), ...style }}>

      {/* ── Decorative A mark ── */}
      <svg
        width={size}
        height={markH}
        viewBox="0 0 40 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Left leg */}
        <line x1="3"  y1="42" x2="20" y2="3"
              stroke={legs} strokeWidth={sw} strokeLinecap="round" />
        {/* Right leg */}
        <line x1="37" y1="42" x2="20" y2="3"
              stroke={legs} strokeWidth={sw} strokeLinecap="round" />
        {/* Crossbar — teal accent */}
        <line x1="9.5" y1="27.5" x2="30.5" y2="27.5"
              stroke={crossbar} strokeWidth={sw * 0.88} strokeLinecap="round" />
      </svg>

      {/* ── Wordmark ── */}
      {showWordmark && (
        <div style={{ lineHeight: 1 }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize:   wordPx,
              fontWeight: 800,
              color:      textColor,
              letterSpacing: '0.01em',
              lineHeight: 1.05,
            }}
          >
            Acuitas
          </div>
          {size >= 28 && (
            <div
              style={{
                fontSize:      tagPx,
                color:         subColor,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight:    600,
                marginTop:     3,
              }}
            >
              Clarity in Acuity. Better Care.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
