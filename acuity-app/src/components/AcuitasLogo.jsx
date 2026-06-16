import React from 'react'

/**
 * Uses official Acuitas brand SVG assets.
 *
 * dark=true  → teal icon + white text (for navy sidebar background)
 * dark=false → full wordmark SVG on light background
 * showWordmark=false → icon mark only
 */
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  // On dark (navy) backgrounds: the wordmark SVG has navy text that would vanish,
  // so we show the teal icon mark + white text rendered in HTML instead.
  if (dark) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), ...style }}>
        <img
          src="/assets/Acuitas_icon_transparent.svg"
          alt="Acuitas"
          height={size}
          width={size}
          style={{ display: 'block', flexShrink: 0 }}
        />
        {showWordmark && (
          <div style={{ lineHeight: 1 }}>
            <div style={{
              fontFamily: 'Avenir Next, Montserrat, Inter, sans-serif',
              fontSize: Math.round(size * 0.72),
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.01em',
              lineHeight: 1.1,
            }}>
              Acuitas
            </div>
            {size >= 30 && (
              <div style={{
                fontFamily: 'Avenir Next, Montserrat, Inter, sans-serif',
                fontSize: Math.round(size * 0.27),
                fontWeight: 600,
                color: '#9fc2bb',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}>
                Acuity You Can Act On
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Light backgrounds: full wordmark SVG (icon + Acuitas text + tagline in one asset)
  if (showWordmark) {
    // SVG is 980×300 — scale height to size*2 so the wordmark renders at a readable size
    const h = Math.round(size * 1.8)
    const w = Math.round(h * (980 / 300))
    return (
      <img
        src="/assets/Acuitas_wordmark_transparent.svg"
        alt="Acuitas"
        height={h}
        width={w}
        style={{ display: 'block', flexShrink: 0, ...style }}
      />
    )
  }

  // Light, no wordmark: icon only
  return (
    <img
      src="/assets/Acuitas_icon_transparent.svg"
      alt="Acuitas"
      height={size}
      width={size}
      style={{ display: 'block', flexShrink: 0, ...style }}
    />
  )
}
