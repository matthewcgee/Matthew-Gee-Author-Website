import React, { useState } from 'react'
import { Card, Field, Button, Icon, theme } from './ui.jsx'
import AcuitasLogo from './AcuitasLogo.jsx'

const SETTINGS_PASSWORD = 'Advocate'

export default function SettingsLock({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (value === SETTINGS_PASSWORD) {
      onUnlock()
    } else {
      setError(true)
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '12px 4px' }}>
          <AcuitasLogo size={44} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 18, fontWeight: 700 }}>Settings Locked</div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginBottom: 4 }}>
            Enter the settings password to manage locations, thresholds, and data.
          </div>

          <form onSubmit={submit} style={{ width: '100%' }}>
            <Field label="Password">
              <input
                type="password"
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setError(false)
                }}
              />
            </Field>
            {error && (
              <div style={{ fontSize: 12, color: '#e0584a', marginTop: -4, marginBottom: 8, textAlign: 'left' }}>
                Incorrect password.
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <Button type="submit">Unlock Settings</Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
