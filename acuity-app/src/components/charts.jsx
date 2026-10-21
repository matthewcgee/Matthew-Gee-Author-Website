// Small SVG chart kit for the outcome, capacity and safety views.
//
// Built to one set of rules: thin marks with 4px rounded data-ends anchored to
// the baseline, a 2px gap between adjacent bars, a recessive grid, text in ink
// colors (never the series color), a hover tooltip on every mark with a hit
// area larger than the mark, and a legend whenever there are two series.
// The one two-series palette (open beds vs ED boarders) is validated for
// color-vision deficiency and contrast; acuity stages keep the app's reserved
// GREEN / YELLOW / RED status colors and are always labeled by name.

import React, { useState } from 'react'
import { theme } from './ui.jsx'

export const SERIES = { a: '#00a090', b: '#7058b5' }

const ink = { primary: theme.text, secondary: theme.sub, grid: theme.border }

// A bar whose data-end (top) has 4px rounded corners and whose base stays square.
function vBar(x, y, w, h, r = 4) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}
function hBar(x, y, w, h, r = 4) {
  if (w <= 0) return ''
  const rr = Math.min(r, h / 2, w)
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`
}

function Tooltip({ tip }) {
  if (!tip) return null
  return (
    <div role="status" style={{
      position: 'absolute', left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 8px))',
      background: theme.navy, color: '#fff', borderRadius: 7, padding: '6px 9px', fontSize: 11.5, lineHeight: 1.4,
      pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(7,30,77,.18)', zIndex: 5,
    }}>
      {tip.lines.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>{l}</div>)}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: ink.secondary }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: 3, background: it.color, display: 'inline-block' }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

/**
 * Reliability diagram: within each band of predicted probability, how often
 * the event actually happened. Points on the diagonal are perfectly
 * calibrated. One series, so no legend; the title names it.
 */
export function ReliabilityChart({ bins, height = 230 }) {
  const [tip, setTip] = useState(null)
  const W = 300
  const H = height
  const m = { l: 50, r: 12, t: 12, b: 34 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const X = (v) => m.l + v * iw
  const Y = (v) => m.t + (1 - v) * ih
  const pts = (bins || []).filter((b) => b.n > 0)
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Predicted versus observed chance of RED">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(0)} x2={X(1)} y1={Y(t)} y2={Y(t)} stroke={ink.grid} strokeWidth="1" />
            <text x={m.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="9.5" fill={ink.secondary}>{Math.round(t * 100)}%</text>
            <text x={X(t)} y={H - m.b + 14} textAnchor="middle" fontSize="9.5" fill={ink.secondary}>{Math.round(t * 100)}%</text>
          </g>
        ))}
        <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke={ink.secondary} strokeWidth="1.2" strokeDasharray="4 4" />
        {pts.length > 1 && (
          <path d={pts.map((b, i) => `${i ? 'L' : 'M'}${X(b.meanPredicted)},${Y(b.observed)}`).join(' ')}
            fill="none" stroke={SERIES.a} strokeWidth="2" />
        )}
        {pts.map((b) => (
          <g key={b.lo}>
            <circle cx={X(b.meanPredicted)} cy={Y(b.observed)} r="5" fill={SERIES.a} stroke={theme.panel} strokeWidth="2" />
            <circle cx={X(b.meanPredicted)} cy={Y(b.observed)} r="13" fill="transparent"
              onMouseEnter={() => setTip({ x: `${(X(b.meanPredicted) / W) * 100}%`, y: (Y(b.observed) / H) * 100 + '%',
                lines: [`Predicted ${pct(b.lo)}–${pct(b.hi)}`, `Average prediction ${pct(b.meanPredicted)}`, `Actually RED ${pct(b.observed)}`, `${b.n} shifts`] })}
              onMouseLeave={() => setTip(null)} />
          </g>
        ))}
        <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="10" fill={ink.secondary}>Predicted chance of RED</text>
        <text x={10} y={m.t + ih / 2} textAnchor="middle" fontSize="10" fill={ink.secondary} transform={`rotate(-90 10 ${m.t + ih / 2})`}>Actually RED</text>
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: ink.secondary, marginTop: 2 }}>
        <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" stroke={ink.secondary} strokeWidth="1.2" strokeDasharray="4 4" /></svg>
        Perfect calibration — points on this line mean predictions matched reality
      </div>
      <Tooltip tip={tip} />
    </div>
  )
}

/**
 * Horizontal bars of an observed rate per group, each with a dark tick at the
 * rate the engine predicted for that group, so claim and reality sit side by side.
 */
export function ObservedVsPredicted({ rows, max = 1 }) {
  const [tip, setTip] = useState(null)
  const W = 420
  const rowH = 34
  const m = { l: 128, r: 46, t: 6, b: 22 }
  const H = m.t + rows.length * rowH + m.b
  const X = (v) => m.l + (Math.min(v, max) / max) * (W - m.l - m.r)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Observed rate compared with predicted rate">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={X(t * max)} x2={X(t * max)} y1={m.t} y2={H - m.b} stroke={ink.grid} strokeWidth="1" />
            <text x={X(t * max)} y={H - 6} textAnchor="middle" fontSize="9.5" fill={ink.secondary}>{Math.round(t * max * 100)}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const y = m.t + i * rowH + 7
          const h = rowH - 14
          return (
            <g key={r.label}>
              <text x={m.l - 8} y={y + h / 2 + 4} textAnchor="end" fontSize="11" fontWeight="600" fill={ink.primary}>{r.label}</text>
              {r.value != null && <path d={hBar(X(0), y, X(r.value) - X(0), h)} fill={r.color || SERIES.a} />}
              {r.predicted != null && (
                <line x1={X(r.predicted)} x2={X(r.predicted)} y1={y - 3} y2={y + h + 3} stroke={theme.navy} strokeWidth="2.5" />
              )}
              <text x={Math.max(r.value != null ? X(r.value) : X(0), r.predicted != null ? X(r.predicted) + 2 : 0) + 6} y={y + h / 2 + 4} fontSize="11" fontWeight="700" fill={ink.primary}>
                {r.value == null ? 'no data' : pct(r.value)}
              </text>
              <rect x={0} y={y - 6} width={W} height={h + 12} fill="transparent"
                onMouseEnter={() => setTip({ x: `${(X(r.value ?? 0) / W) * 100}%`, y: `${(y / H) * 100}%`,
                  lines: [r.label, `Observed ${pct(r.value)}${r.n != null ? ` (${r.n})` : ''}`, ...(r.predicted != null ? [`Predicted ${pct(r.predicted)}`] : [])] })}
                onMouseLeave={() => setTip(null)} />
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

/**
 * Paired vertical bars per period (two measures in the same unit, one axis),
 * with a legend and a hover tooltip per period.
 */
export function PairedBars({ points, aLabel, bLabel, height = 190, format = (v) => v.toFixed(1), statusFor }) {
  const [tip, setTip] = useState(null)
  const W = 560
  const H = height
  const m = { l: 34, r: 8, t: 10, b: 40 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const maxV = Math.max(1, ...points.flatMap((p) => [p.a, p.b])) * 1.12
  const Y = (v) => m.t + ih - (v / maxV) * ih
  const slot = iw / Math.max(1, points.length)
  const bw = Math.min(26, (slot - 18) / 2)
  const step = Math.max(1, Math.ceil(maxV / 4))
  const ticks = []
  for (let t = 0; t <= maxV; t += step) ticks.push(t)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${aLabel} and ${bLabel} by shift`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={ink.grid} strokeWidth="1" />
            <text x={m.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="9.5" fill={ink.secondary}>{t}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = m.l + slot * i + slot / 2
          const xa = cx - bw - 1
          const xb = cx + 1
          const st = statusFor ? statusFor(p) : null
          return (
            <g key={p.label}>
              <path d={vBar(xa, Y(p.a), bw, Y(0) - Y(p.a))} fill={SERIES.a} />
              <path d={vBar(xb, Y(p.b), bw, Y(0) - Y(p.b))} fill={SERIES.b} />
              <text x={cx} y={H - m.b + 14} textAnchor="middle" fontSize="9.5" fill={ink.primary} fontWeight="600">{p.label}</text>
              {st && <text x={cx} y={H - m.b + 27} textAnchor="middle" fontSize="9" fill={st.color} fontWeight="700">{st.text}</text>}
              <rect x={cx - slot / 2} y={m.t} width={slot} height={ih} fill="transparent"
                onMouseEnter={() => setTip({ x: `${(cx / W) * 100}%`, y: `${(Y(Math.max(p.a, p.b)) / H) * 100}%`,
                  lines: [p.title || p.label, `${aLabel}: ${format(p.a)}`, `${bLabel}: ${format(p.b)}`, ...(p.extra || [])] })}
                onMouseLeave={() => setTip(null)} />
            </g>
          )
        })}
        <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke={ink.secondary} strokeWidth="1" />
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

/** One bar per acuity stage, in the stage's status color, labeled by name. */
export function StageBars({ rows, height = 170, format = pct }) {
  const [tip, setTip] = useState(null)
  const W = 360
  const H = height
  const m = { l: 40, r: 8, t: 18, b: 26 }
  const ih = H - m.t - m.b
  const maxV = Math.max(0.0001, ...rows.map((r) => r.value ?? 0)) * 1.15
  const Y = (v) => m.t + ih - (v / maxV) * ih
  const slot = (W - m.l - m.r) / rows.length
  const bw = Math.min(54, slot - 24)
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 460 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Rate by acuity stage">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t * maxV)} y2={Y(t * maxV)} stroke={ink.grid} />
            <text x={m.l - 6} y={Y(t * maxV) + 3.5} textAnchor="end" fontSize="9.5" fill={ink.secondary}>{format(t * maxV)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = m.l + slot * i + slot / 2
          const v = r.value ?? 0
          return (
            <g key={r.label}>
              <path d={vBar(cx - bw / 2, Y(v), bw, Y(0) - Y(v))} fill={r.color} />
              <text x={cx} y={Y(v) - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={ink.primary}>{r.value == null ? '—' : format(v)}</text>
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={ink.primary}>{r.label}</text>
              <rect x={cx - slot / 2} y={m.t} width={slot} height={ih} fill="transparent"
                onMouseEnter={() => setTip({ x: `${(cx / W) * 100}%`, y: `${(Y(v) / H) * 100}%`, lines: [r.label, ...(r.lines || [])] })}
                onMouseLeave={() => setTip(null)} />
            </g>
          )
        })}
        <line x1={m.l} x2={W - m.r} y1={Y(0)} y2={Y(0)} stroke={ink.secondary} />
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}

/** Compact single-series bars for a short daily trend. */
export function MiniBars({ points, height = 70, format = (v) => String(Math.round(v)), label }) {
  const [tip, setTip] = useState(null)
  const W = 300
  const H = height
  const m = { l: 2, r: 2, t: 6, b: 14 }
  const maxV = Math.max(1, ...points.map((p) => p.value))
  const slot = (W - m.l - m.r) / Math.max(1, points.length)
  const bw = Math.max(3, slot - 2)
  const Y = (v) => m.t + (H - m.t - m.b) * (1 - v / maxV)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        {points.map((p, i) => {
          const x = m.l + i * slot + 1
          return (
            <g key={p.key || i}>
              <path d={vBar(x, Y(p.value), bw, Y(0) - Y(p.value), 3)} fill={SERIES.b} />
              <rect x={x - 1} y={0} width={slot} height={H} fill="transparent"
                onMouseEnter={() => setTip({ x: `${((x + bw / 2) / W) * 100}%`, y: `${(Y(p.value) / H) * 100}%`, lines: [p.label, format(p.value)] })}
                onMouseLeave={() => setTip(null)} />
            </g>
          )
        })}
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke={ink.secondary} />
        {points.length > 0 && (
          <>
            <text x={2} y={H - 2} fontSize="9" fill={ink.secondary}>{points[0].label}</text>
            <text x={W - 2} y={H - 2} fontSize="9" fill={ink.secondary} textAnchor="end">{points[points.length - 1].label}</text>
          </>
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  )
}
