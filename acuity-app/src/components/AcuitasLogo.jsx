import React from 'react'

// Brand colors from the Acuitas identity guide
const BRAND = {
  navy:  '#263D4A',
  teal:  '#3DBCB4',
  green: '#70C47A',
}

/**
 * dark=true  → white/light variant for navy sidebar background
 * dark=false → full-color variant for white/light backgrounds
 * showWordmark=false → mark only (app icon / favicon use)
 */
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  const navy      = dark ? '#ffffff'  : BRAND.navy
  const teal      = dark ? '#6DDDD8'  : BRAND.teal
  const green     = dark ? '#90DC98'  : BRAND.green
  const textColor = dark ? '#ffffff'  : BRAND.navy
  const subColor  = dark ? '#9fc2bb'  : '#5a7a88'

  const markW   = size
  const markH   = Math.round(size * 1.12)
  const wordPx  = Math.round(size * 0.8)
  const tagPx   = Math.round(size * 0.27)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), ...style }}>

      {/* ── Mark: stylised A with person figure + ascending data dots ── */}
      <svg
        width={markW}
        height={markH}
        viewBox="0 0 44 50"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Left leg of A */}
        <line x1="2"  y1="47" x2="22" y2="4" stroke={navy} strokeWidth="3.6" strokeLinecap="round" />
        {/* Right leg of A */}
        <line x1="42" y1="47" x2="22" y2="4" stroke={navy} strokeWidth="3.6" strokeLinecap="round" />

        {/* Person — head circle */}
        <circle cx="22" cy="20" r="4.5" fill={teal} />
        {/* Person — shoulders / torso silhouette */}
        <path d="M13.5,32 Q13.5,25 22,25 Q30.5,25 30.5,32 Z" fill={teal} />

        {/* Ascending data-point dots along left leg */}
        <circle cx="6"    cy="40"   r="2.6" fill={green} />
        <circle cx="10.5" cy="29.5" r="2.6" fill={green} />
        <circle cx="15"   cy="19.5" r="2.2" fill={green} />
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
              letterSpacing: '-0.01em',
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
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                fontWeight:    600,
                marginTop:     2,
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
