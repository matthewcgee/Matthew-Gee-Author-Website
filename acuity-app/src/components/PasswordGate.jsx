import React, { useState } from 'react'
import AcuitasLogo from './AcuitasLogo.jsx'

// SHA-256 of the access password — never store plaintext in source code
const EXPECTED_HASH = '76b1dcf369d5236f088a4d22f62e7070be4bc99eec8bc6a923e2f4de0a4e7581'

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export { EXPECTED_HASH }

export default function PasswordGate({ onSuccess }) {
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!pw || loading) return
    setLoading(true)
    setError('')
    try {
      const hash = await sha256(pw)
      if (hash === EXPECTED_HASH) {
        onSuccess(hash)
      } else {
        setError('Incorrect password. Please try again.')
        setPw('')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #071e4d 0%, #0d3a6e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.13)',
        borderRadius: 20,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <AcuitasLogo size={52} dark showWordmark />
        </div>

        <div style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.40)',
          textAlign: 'center',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 28,
        }}>
          Authorized Access Only
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => { setPw(e.target.value); setError('') }}
              placeholder="Password"
              autoFocus
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '13px 52px 13px 16px',
                borderRadius: 10,
                border: `1.5px solid ${error ? '#e0584a' : 'rgba(255,255,255,0.18)'}`,
                background: 'rgba(255,255,255,0.08)',
                color: '#ffffff',
                fontSize: 15,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'Inter, sans-serif',
                transition: 'border-color 0.15s',
              }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              tabIndex={-1}
              style={{
                position: 'absolute',
                right: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.40)',
                fontSize: 12,
                fontWeight: 600,
                padding: 4,
                letterSpacing: '0.04em',
              }}
            >
              {show ? 'HIDE' : 'SHOW'}
            </button>
          </div>

          {error && (
            <div style={{
              fontSize: 12.5,
              color: '#e0584a',
              marginBottom: 14,
              textAlign: 'center',
              fontWeight: 500,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pw}
            style={{
              width: '100%',
              padding: '13px 0',
              borderRadius: 10,
              border: 'none',
              background: loading || !pw
                ? 'rgba(18,149,163,0.35)'
                : 'linear-gradient(90deg, #1295a3 0%, #41b9a9 60%, #67cfae 100%)',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading || !pw ? 'not-allowed' : 'pointer',
              letterSpacing: '0.04em',
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            {loading ? 'Verifying…' : 'Sign In'}
          </button>
        </form>
      </div>

      <div style={{
        marginTop: 28,
        fontSize: 11,
        color: 'rgba(255,255,255,0.22)',
        textAlign: 'center',
      }}>
        Patent Pending &mdash; &copy; Matthew C. Gee
      </div>
    </div>
  )
}
