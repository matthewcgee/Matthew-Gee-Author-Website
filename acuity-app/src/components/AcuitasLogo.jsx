import React from 'react'

/**
 * Uses the official Acuitas brand SVG assets from /assets/.
 *
 * dark=true  → applies a white CSS filter for use on navy backgrounds
 * showWordmark=false → icon mark only (no wordmark image)
 * size controls the icon height; wordmark scales proportionally
 */
export default function AcuitasLogo({ size = 36, dark = false, showWordmark = true, style = {} }) {
  const filter = dark ? 'brightness(0) invert(1)' : undefined

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.35), ...style }}>

      {/* Icon mark */}
      <img
        src="/assets/Acuitas_icon_transparent.svg"
        alt="Acuitas"
        height={size}
        width={size}
        style={{ display: 'block', flexShrink: 0, filter }}
      />

      {/* Wordmark */}
      {showWordmark && (
        <img
          src="/assets/Acuitas_wordmark_transparent.svg"
          alt="Acuitas"
          height={Math.round(size * 0.6)}
          style={{ display: 'block', flexShrink: 0, filter }}
        />
      )}
    </div>
  )
}
