import React from 'react'
import { theme, Button } from './ui.jsx'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('BedSpace render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div style={{ fontFamily: theme.display, fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13.5, color: theme.sub, marginBottom: 18, lineHeight: 1.6 }}>
            This screen hit an unexpected error. Bed and resident data are unaffected. Try reloading.
          </div>
          <Button onClick={() => window.location.reload()}>Reload BedSpace</Button>
        </div>
      </div>
    )
  }
}
