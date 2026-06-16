import React from 'react'

// Brand colors — Acuitas identity guide
const BRAND = {
  navy:  '#263D4A',
  teal:  '#3DBCB4',
  green: '#70C47A',
}

/**
 * dark=true  → white/light variant (for navy sidebar)
 * dark=false → full-color variant (for white/light backgrounds)
 * showWordmark=false → mark only (app icon / compact use)
 */
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  const navy      = dark ? '#ffffff'  : BRAND.navy
  const teal      = dark ? '#6DDDD8'  : BRAND.teal
  const green     = dark ? '#90DC98'  : BRAND.green
  const textColor = dark ? '#ffffff'  : BRAND.navy
  const subColor  = dark ? '#9fc2bb'  : '#5a7a88'

  // Mark is square-ish; wordmark sits to the right
  const markW  = size
  const markH  = Math.round(size * 1.15)
  const wordPx = Math.round(size * 0.82)
  const tagPx  = Math.round(size * 0.27)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), ...style }}>

      {/* ── Mark ── */}
      <svg
        width={markW}
        height={markH}
        viewBox="0 0 52 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Left leg of A — thick stroked line */}
        <line x1="3"  y1="57" x2="26" y2="4"
              stroke={navy} strokeWidth="4.5" strokeLinecap="round" />
        {/* Right leg of A */}
        <line x1="49" y1="57" x2="26" y2="4"
              stroke={navy} strokeWidth="4.5" strokeLinecap="round" />

        {/* Person — head circle (sits just below the apex of the A) */}
        <circle cx="26" cy="23" r="5.5" fill={teal} />

        {/* Person — shoulders / upper body silhouette */}
        <path d="M16,37 Q16,29 26,29 Q36,29 36,37 Z" fill={teal} />

        {/* Ascending data-point dots — climbing the outside of the left leg */}
        <circle cx="4.5"  cy="46"   r="3.2" fill={green} />
        <circle cx="9.5"  cy="34.5" r="3.2" fill={green} />
        <circle cx="14.5" cy="23"   r="2.8" fill={green} />
      </svg>

      {/* ── Wordmark ── */}
      {showWordmark && (
        <div style={{ lineHeight: 1 }}>
          <div
            style={{
              fontFamily: "'Nunito', 'Inter', sans-serif",
              fontSize:   wordPx,
              fontWeight: 900,
              color:      textColor,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            Acuitas
          </div>
          {size >= 28 && (
            <div
              style={{
                fontFamily:    "'Nunito', 'Inter', sans-serif",
                fontSize:      tagPx,
                color:         subColor,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                fontWeight:    700,
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
