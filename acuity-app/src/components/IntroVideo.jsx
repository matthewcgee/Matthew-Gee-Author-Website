import React, { useEffect, useState } from 'react'
import { Icon, theme } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'

const SCENE_DURATION = 5200

const SCENES = [
  {
    logo: true,
    eyebrow: 'Welcome to',
    title: 'Behavioral Health Acuity Dashboard',
    body: 'One index. Every unit. Every region. Real-time acuity that tells the story your teams are living — every single shift.',
  },
  {
    icon: 'shield',
    eyebrow: 'Built From the Frontlines',
    title: 'Designed by the people who live it',
    body: "This dashboard was born from real shifts — the surges, the short-staffed nights, the 2 a.m. calls. It turns that lived experience into a tool that protects patients and staff alike.",
  },
  {
    icon: 'barChart',
    eyebrow: 'Real-Time Clarity',
    title: 'Acuity, Census, and Staffing — Unified',
    body: 'Census, behavioral health points, and staffing combine into a single Acuity Index, so risk is visible before it becomes a crisis.',
  },
  {
    icon: 'building',
    eyebrow: 'Census Caps Meet Acuity',
    title: 'Capacity decisions, never a guess',
    body: 'Nursing-driven census caps are cross-referenced against acuity in real time — so leaders know exactly when a unit is approaching its limit.',
  },
  {
    icon: 'users',
    eyebrow: 'Every Deployment, Tracked',
    title: 'Staffing decisions become budget-ready data',
    body: 'See exactly who was deployed, where, and when. Offsetting acuity surges becomes a documented, defensible part of your reporting.',
  },
  {
    icon: 'grid',
    eyebrow: 'The Vision',
    title: 'One dashboard. Every region. Better care.',
    body: "This is more than a tool — it's a commitment to safer units, supported staff, and patients who get the care they deserve.",
    cta: true,
  },
]

export default function IntroVideo({ onClose }) {
  const [scene, setScene] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    if (scene >= SCENES.length - 1) return
    const t = setTimeout(() => setScene((s) => s + 1), SCENE_DURATION)
    return () => clearTimeout(t)
  }, [scene, paused])

  const current = SCENES[scene]

  return (
    <div
      className="fade-in"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,45,77,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="scale-in"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 640,
          borderRadius: 20,
          overflow: 'hidden',
          background: `linear-gradient(135deg, ${theme.navy} 0%, #114a73 55%, ${theme.accent} 130%)`,
          color: '#ffffff',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(255,255,255,0.12)',
            border: 'none',
            borderRadius: 999,
            width: 32,
            height: 32,
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
          className="btn-press"
        >
          <Icon name="close" size={16} />
        </button>

        <div style={{ display: 'flex', gap: 6, padding: '18px 24px 0' }}>
          {SCENES.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: '#ffffff',
                  width: i < scene ? '100%' : i > scene ? '0%' : undefined,
                  animation: i === scene && !paused ? `barfill ${SCENE_DURATION}ms linear forwards` : undefined,
                }}
              />
            </div>
          ))}
        </div>

        <style>{`@keyframes barfill { from { width: 0% } to { width: 100% } }`}</style>

        <div key={scene} className="fade-in-up" style={{ padding: '36px 32px 40px', minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {current.logo ? (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, opacity: 0.85, marginBottom: 14 }}>
                {current.eyebrow}
              </div>
              <div style={{ marginBottom: 18 }}>
                <AcuitasLogo size={52} dark showWordmark />
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 18,
                }}
              >
                <Icon name={current.icon} size={26} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.8, marginBottom: 8 }}>
                {current.eyebrow}
              </div>
            </>
          )}
          <div style={{ fontFamily: theme.display, fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 14 }}>
            {current.title}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.6, opacity: 0.92, maxWidth: 480 }}>
            {current.body}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28 }}>
            {current.cta ? (
              <button
                onClick={onClose}
                className="btn-press"
                style={{
                  background: '#ffffff',
                  color: theme.navy,
                  border: 'none',
                  borderRadius: 10,
                  padding: '12px 22px',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                Enter the Dashboard <Icon name="chevronRight" size={16} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setScene((s) => Math.min(s + 1, SCENES.length - 1))}
                  className="btn-press"
                  style={{
                    background: '#ffffff',
                    color: theme.navy,
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 18px',
                    fontWeight: 700,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Next <Icon name="chevronRight" size={15} />
                </button>
                <button
                  onClick={onClose}
                  className="btn-press"
                  style={{
                    background: 'transparent',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.35)',
                    borderRadius: 10,
                    padding: '10px 18px',
                    fontWeight: 600,
                    fontSize: 13.5,
                    cursor: 'pointer',
                  }}
                >
                  Skip intro
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
