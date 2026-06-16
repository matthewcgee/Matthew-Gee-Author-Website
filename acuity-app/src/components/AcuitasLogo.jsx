import React from 'react'

const BASE = import.meta.env.BASE_URL
const ICON = `${BASE}assets/Acuitas_icon_transparent.svg`

/**
 * dark=true  → icon in white box + white text (navy sidebar)
 * dark=false → icon + navy text (light backgrounds)
 * showWordmark=false → icon only
 */
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  const wordColor = dark ? '#ffffff' : '#071e4d'
  const tagColor  = dark ? '#9fc2bb' : '#167f87'

  const iconEl = dark ? (
    // On dark backgrounds, wrap the icon in a white rounded box so the
    // navy A legs are visible against the navy sidebar.
    <div style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.22),
      background: 'rgba(255,255,255,0.90)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      padding: Math.round(size * 0.08),
      boxSizing: 'border-box',
    }}>
      <img src={ICON} alt="Acuitas" width="100%" height="100%" style={{ display: 'block' }} />
    </div>
  ) : (
    <img
      src={ICON}
      alt="Acuitas"
      height={size}
      width={size}
      style={{ display: 'block', flexShrink: 0 }}
    />
  )

  if (!showWordmark) {
    return <div style={style}>{iconEl}</div>
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.3), ...style }}>
      {iconEl}
      <div style={{ lineHeight: 1 }}>
        <div style={{
          fontFamily: 'Avenir Next, Montserrat, Inter, sans-serif',
          fontSize:   Math.round(size * 0.75),
          fontWeight: 700,
          color:      wordColor,
          letterSpacing: '0.01em',
          lineHeight: 1.1,
        }}>
          Acuitas
        </div>
        {size >= 28 && (
          <div style={{
            fontFamily:    'Avenir Next, Montserrat, Inter, sans-serif',
            fontSize:      Math.round(size * 0.26),
            fontWeight:    700,
            color:         tagColor,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            marginTop:     2,
          }}>
            Acuity You Can Act On.
          </div>
        )}
      </div>
    </div>
  )
}
