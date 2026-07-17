import React, { useState } from 'react'
import { Card, Field, Button, Icon, theme } from './ui.jsx'
import BedSpaceLogo from './BedSpaceLogo.jsx'

// SHA-256 of the Bethesda Center staff PIN — gates the admin area that manages
// the private disallowed-resident list, long-hold overrides, and residency
// extensions. Default: Bethesda90Cap — change before go-live (see HANDOFF.md).
//
// IMPORTANT: this is a client-side UI gate, matching the two-tier access model
// requested for this build. It hides the admin area from casual users but does
// NOT by itself make the disallowed list confidential at the database level —
// anyone with the Firestore project config could still query it directly. For
// true server-enforced confidentiality, complete the Firebase Auth + security
// rules setup described in HANDOFF.md → "Server-Side Confidentiality".
const EXPECTED_HASH = 'ae69d68f82358baa89a7952a814b7acf48bc3c38eb41cb533c06c85c9503dc21'

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export { EXPECTED_HASH }

export default function BethesdaLock({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!value || loading) return
    setLoading(true)
    const hash = await sha256(value)
    if (hash === EXPECTED_HASH) {
      onUnlock(hash)
    } else {
      setError(true)
      setValue('')
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: 440, margin: '48px auto' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '16px 6px' }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: theme.amberSoft,
            color: theme.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
          }}>
            <Icon name="shieldLock" size={26} />
          </div>
          <div style={{ fontFamily: theme.display, fontSize: 19, fontWeight: 700 }}>Bethesda Center Access</div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 4, lineHeight: 1.6 }}>
            This area manages the confidential disallowed-resident list, verification decisions,
            long-hold approvals, and residency extensions. Enter the Bethesda staff PIN to continue.
          </div>

          <form onSubmit={submit} style={{ width: '100%' }}>
            <Field label="Bethesda Staff PIN">
              <input
                type="password"
                autoFocus
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(false) }}
              />
            </Field>
            {error && (
              <div style={{ fontSize: 12, color: '#a5342a', marginTop: 6, marginBottom: 4, textAlign: 'left' }}>
                Incorrect PIN.
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <Button type="submit" disabled={loading || !value}>
                <Icon name="shieldLock" size={15} /> Unlock
              </Button>
            </div>
          </form>
        </div>
      </Card>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, opacity: 0.6 }}>
        <BedSpaceLogo size={24} showTagline={false} />
      </div>
    </div>
  )
}
