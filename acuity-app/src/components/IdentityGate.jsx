import React, { useState } from 'react'
import AcuitasLogo from './AcuitasLogo.jsx'
import { ROLES, ROLE_ORDER } from '../lib/roles.js'

const shell = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #071e4d 0%, #0d3a6e 100%)',
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24,
}
const panel = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.13)', borderRadius: 20,
  padding: '40px 36px', width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,0.45)', color: '#fff',
}
const eyebrow = {
  fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textAlign: 'center',
  letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 22,
}
const primary = {
  width: '100%', padding: '13px 16px', borderRadius: 10, border: 'none', background: '#00857C', color: '#fff',
  fontSize: 15, fontWeight: 700, cursor: 'pointer',
}

/** Local mode: who is using Acuitas, and in what role. Attributes the audit log. */
export function IdentityPicker({ onDone, initial }) {
  const [name, setName] = useState(initial?.name || '')
  const [role, setRole] = useState(initial?.role || 'supervisor')
  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) onDone({ name: name.trim(), role, source: 'local' })
  }
  return (
    <div style={shell}>
      <form onSubmit={submit} style={panel}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <AcuitasLogo size={46} dark showWordmark />
        </div>
        <div style={eyebrow}>Who&rsquo;s using Acuitas?</div>
        <label htmlFor="id-name" style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>Your name</label>
        <input id="id-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. J. Alvarez, RN" autoFocus
          style={{ width: '100%', marginTop: 6, marginBottom: 18, padding: '12px 14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 15, boxSizing: 'border-box' }} />
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>Your role</div>
        <div role="radiogroup" aria-label="Role" style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
          {ROLE_ORDER.map((r) => {
            const on = role === r
            return (
              <button key={r} type="button" role="radio" aria-checked={on} onClick={() => setRole(r)}
                style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                  border: `1.5px solid ${on ? '#2bb3a6' : 'rgba(255,255,255,0.14)'}`, background: on ? 'rgba(43,179,166,0.16)' : 'transparent', color: '#fff' }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{ROLES[r].label}</div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>{ROLES[r].blurb}</div>
              </button>
            )
          })}
        </div>
        <button type="submit" style={{ ...primary, opacity: name.trim() ? 1 : 0.5 }} disabled={!name.trim()}>Continue</button>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 14, lineHeight: 1.5, textAlign: 'center' }}>
          Your name is attached to every change you make, in the audit log. In this evaluation build you choose your own
          role, so it shapes the interface but does not restrict access. Production builds take identity and roles from
          your organization&rsquo;s single sign-on.
        </div>
      </form>
    </div>
  )
}

/** Gateway / Firebase modes: not signed in, still checking, or sign-in failed. */
export function SignInScreen({ state, mode, signInUrl, onSignIn }) {
  const messages = {
    loading: 'Checking your sign-in…',
    signin: 'Sign in with your organization account to continue.',
    error: 'Acuitas could not confirm who you are. Sign in again, or contact your administrator.',
  }
  return (
    <div style={shell}>
      <div style={{ ...panel, maxWidth: 420, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <AcuitasLogo size={46} dark showWordmark />
        </div>
        <div style={eyebrow}>Authorized access only</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 22, lineHeight: 1.5 }}>{messages[state] || messages.signin}</div>
        {state !== 'loading' && (
          mode === 'firebase'
            ? <button type="button" style={primary} onClick={onSignIn}>Sign in</button>
            : <a href={signInUrl} style={{ ...primary, display: 'block', textDecoration: 'none' }}>Sign in</a>
        )}
      </div>
    </div>
  )
}
