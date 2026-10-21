import React, { useEffect, useState } from 'react'
import { Icon, theme } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'

const SCENE_DURATION = 5200

const SCENES = [
  {
    logo: true,
    eyebrow: 'Welcome to',
    title: 'Behavioral health acuity you can see coming',
    body: 'One platform, from the inpatient floor to the outpatient clinic. Acuitas turns the data you already collect into decisions you can act on, and shows its reasoning for every one.',
  },
  {
    icon: 'shield',
    eyebrow: 'Built From the Frontlines',
    title: 'Designed by the people who live it',
    body: "Acuitas was born from real shifts — the surges, the short-staffed nights, the 2 a.m. calls. It turns that lived experience into a tool that protects patients and staff alike.",
  },
  {
    icon: 'barChart',
    eyebrow: 'AcuiScale™',
    title: 'Acuity, census and staffing — one index',
    body: 'Behavioral health points and staffing combine into AcuiScale, read against nursing-driven census caps, so every unit\'s risk is visible at a glance.',
  },
  {
    icon: 'trendUp',
    eyebrow: 'Predictive Command Center',
    title: 'See the surge before it lands',
    body: 'Every unit is forecast six shifts ahead with a measured chance of RED, and an exact staffing plan says who to move, from where, and what it buys. A what-if planner tests bed closures and surges before they happen.',
  },
  {
    icon: 'bed',
    eyebrow: 'Capacity & Safety',
    title: 'Beds, boarding and safety — ahead of time',
    body: 'ED boarding demand is set against the beds the region will have open, and the units where the next assault or staff injury is most likely are named before the shift starts.',
  },
  {
    icon: 'route',
    eyebrow: 'AcuiPath™ Outpatient',
    title: 'The right clinic, the right physician',
    body: 'A two-tier screen places simple referrals and escalates complex ones. Discharges are bridged into care against the 7-day follow-up window, and PHQ-9 and GAD-7 flag who needs a fresh look.',
  },
  {
    icon: 'loop',
    eyebrow: 'Closed Loop',
    title: 'Every recommendation is checked against what happened',
    body: 'Acuitas scores its own advice: whether plans were followed and worked, whether forecasts were calibrated, and what it saved — in dollars your finance team can check.',
  },
  {
    icon: 'lock',
    eyebrow: 'Built to Be Trusted',
    title: 'Private by design, accountable by default',
    body: 'No vendor AI and no patient data in transit, with nothing that needs a name or MRN. Role-based access and a tamper-evident audit log record who did what, and when.',
  },
  {
    icon: 'grid',
    eyebrow: 'The Vision',
    title: 'One platform. Every unit. Better care.',
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
