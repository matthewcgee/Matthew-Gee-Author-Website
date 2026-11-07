import React, { useEffect, useRef, useState } from 'react'

const fmtMoneyInput = (v) => {
  if (v === '' || v === null || v === undefined) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}
const parse = (s) => {
  const t = String(s).replace(/[$,\s]/g, '')
  if (t === '') return ''
  const n = Number(t)
  return Number.isFinite(n) ? n : ''
}

// Numeric input that shows grouped digits while idle and raw digits while typing.
export function NumInput({ value, onChange, prefix, suffix, placeholder, size, autoValue, step, min, max, className = '', ...rest }) {
  const [focus, setFocus] = useState(false)
  const [draft, setDraft] = useState('')
  const isAuto = (value === '' || value === null || value === undefined) && autoValue !== undefined && autoValue !== null && autoValue !== ''
  const shown = focus ? draft : isAuto ? '' : fmtMoneyInput(value)
  return (
    <div className="input-wrap">
      {prefix && <span className="pre">{prefix}</span>}
      <input
        {...rest}
        className={`input num ${prefix ? 'has-pre' : ''} ${suffix ? 'has-post' : ''} ${size === 'sm' ? 'sm' : ''} ${isAuto ? 'auto' : ''} ${className}`}
        inputMode="decimal"
        value={shown}
        placeholder={isAuto ? `${fmtMoneyInput(autoValue)} (auto)` : placeholder}
        onFocus={(e) => {
          setFocus(true)
          setDraft(value === '' || value === null || value === undefined ? '' : String(value))
          requestAnimationFrame(() => e.target.select())
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(parse(e.target.value))
        }}
        onBlur={() => setFocus(false)}
      />
      {suffix && <span className="post">{suffix}</span>}
    </div>
  )
}

export function Field({ label, hint, children, tip }) {
  return (
    <label className="field">
      <span>
        {label}
        {tip && <Tip text={tip} />}
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Tip({ text }) {
  return (
    <span className="badge gray" title={text} style={{ padding: '0 6px', cursor: 'help', fontSize: 10.5 }}>
      ?
    </span>
  )
}

export function Toggle({ checked, onChange, label, sub }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
      <span className="tl">
        {label}
        {sub && <small>{sub}</small>}
      </span>
    </label>
  )
}

export function Stepper({ value, onChange, min = 0, max = 10 }) {
  const v = Number(value) || 0
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, v - 1))} aria-label="decrease">
        −
      </button>
      <span className="num">{v}</span>
      <button type="button" onClick={() => onChange(Math.min(max, v + 1))} aria-label="increase">
        +
      </button>
    </div>
  )
}

export function Callout({ level = 'info', children }) {
  const icon = { ok: '✓', warn: '!', hold: '!', info: 'i' }[level]
  return (
    <div className={`callout ${level}`}>
      <span className="ci">{icon}</span>
      <div>{children}</div>
    </div>
  )
}

export function Meter({ value, mark, color = 'var(--teal)', max = 1.5 }) {
  const w = Math.max(0, Math.min(1, (value || 0) / max)) * 100
  return (
    <div className="meter">
      <i style={{ width: `${w}%`, background: color }} />
      {mark !== undefined && <span className="mark" style={{ left: `${(mark / max) * 100}%` }} />}
    </div>
  )
}

export function DropZone({ onFile, accept, children }) {
  const [over, setOver] = useState(false)
  const ref = useRef()
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onClick={() => ref.current.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) onFile(f)
      }}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
      {children}
    </div>
  )
}

export function FileButton({ onFile, accept, children, className = 'btn' }) {
  const ref = useRef()
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current.click()}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}

export function useToast() {
  const [msg, setMsg] = useState(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(t)
  }, [msg])
  return [msg ? <div className="toast">{msg}</div> : null, setMsg]
}

const PATHS = {
  funds: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  ledger: 'M4 2v20l3-2 3 2 3-2 3 2 3-2 1 .7V2l-1 .7-3-2-3 2-3-2-3 2-3-2zM8 8h8M8 12h8M8 16h5',
  results: 'M3 3v18h18M7 16V11M12 16V7M17 16v-3',
  bench: 'M22 12h-4l-3 9L9 3l-3 9H2',
  guide: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  plus: 'M12 5v14M5 12h14',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  copy: 'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  x: 'M18 6 6 18M6 6l12 12',
  chev: 'M9 18l6-6-6-6',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
  spark: 'M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z',
  check: 'M20 6 9 17l-5-5',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2zM7 11V7a5 5 0 0 1 10 0v4',
}
export function Ico({ name, size = 16, stroke = 2, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
