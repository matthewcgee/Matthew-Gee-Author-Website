import React from 'react'

// dark=true → white diamond / teal pulse / white text (for navy sidebar)
// dark=false → navy diamond / white pulse / navy text (for light backgrounds)
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  const diamond = dark ? '#ffffff' : '#1a3a4a'
  const pulse = dark ? '#4db8a8' : '#ffffff'
  const textColor = dark ? '#ffffff' : '#1a3a4a'

  // The mark is always square; word mark sits to the right
  const markSize = size
  const fontSize = Math.round(markSize * 0.48)
  const subSize = Math.round(markSize * 0.28)

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(markSize * 0.28), ...style }}>
      {/* Diamond mark */}
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        {/* Diamond / rhombus */}
        <polygon points="20,2 38,20 20,38 2,20" fill={diamond} />
        {/* EKG / pulse line */}
        <polyline
          points="6,20 12,20 15,13 18,27 21,9 24,20 34,20"
          stroke={pulse}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {showWordmark && (
        <div style={{ lineHeight: 1 }}>
          <div
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize,
              fontWeight: 800,
              color: textColor,
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
            }}
          >
            Acuitas
          </div>
          {markSize >= 30 && (
            <div
              style={{
                fontSize: subSize,
                color: dark ? '#9fc2bb' : '#5a7a82',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600,
                marginTop: 1,
              }}
            >
              Behavioral Health
            </div>
          )}
        </div>
      )}
    </div>
  )
}
