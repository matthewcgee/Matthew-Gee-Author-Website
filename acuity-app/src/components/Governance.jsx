import React, { useMemo, useState } from 'react'
import { Card, Field, Button, Icon, Badge, theme } from './ui.jsx'
import { ROLES, ROLE_ORDER, PERMISSIONS, can } from '../lib/roles.js'
import { verifyAuditChain, sortAudit, actionLabel } from '../lib/audit.js'
import { parseFhirCensus, planCensusApply, exampleFhirBundle } from '../lib/fhir.js'
import { useConfigValue } from '../lib/store.js'
import { today } from '../lib/storage.js'

/* ------------------------------------------------------------- people & access */

const MODE_TEXT = {
  local: {
    title: 'Local sign-in',
    body: 'Each person enters their name and role after the access password. Roles shape what the interface offers, and every change is attributed in the audit log. Because the role is self-chosen, this is not access control. For production, put Acuitas behind your single sign-on (gateway mode) or the Firebase sign-in (firebase mode).',
    color: '#8a6a10',
  },
  gateway: {
    title: 'Single sign-on (gateway)',
    body: 'Acuitas sits behind your organization’s sign-in. The gateway blocks anyone who has not authenticated, and roles come from your identity provider’s groups.',
    color: '#1f7a54',
  },
  firebase: {
    title: 'Firebase sign-in',
    body: 'Users sign in through your identity provider via Firebase Authentication. Roles are custom claims, and the shipped Firestore security rules enforce them on the server.',
    color: '#1f7a54',
  },
}

const MATRIX_PERMS = ['view', 'enter-shift', 'deploy', 'plan-record', 'scenario', 'outcomes-view', 'cost-edit', 'safety-log', 'op-screen', 'op-manage', 'discharge', 'mbc', 'import', 'settings', 'audit-view']

export function AccessPanel({ identity, authMode, onSwitch }) {
  const [draft, setDraft] = useState({ name: identity?.name || '', role: identity?.role || 'viewer' })
  const mode = MODE_TEXT[authMode] || MODE_TEXT.local
  return (
    <Card title="People & access" sub="Who is signed in, how, and what each role can do">
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ padding: '10px 13px', borderRadius: 10, background: theme.panelAlt, minWidth: 220 }}>
          <div style={{ fontSize: 10.5, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6 }}>Signed in as</div>
          <div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>{identity?.name || '—'}</div>
          <div style={{ fontSize: 12, color: theme.sub }}>{ROLES[identity?.role]?.label || 'Viewer'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 260, fontSize: 12.5, lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: mode.color, display: 'flex', gap: 6, alignItems: 'center' }}>
            <Icon name="lock" size={14} />{mode.title}
          </div>
          <div style={{ color: theme.text, marginTop: 3 }}>{mode.body}</div>
        </div>
      </div>

      {authMode === 'local' && onSwitch && (
        <form onSubmit={(e) => { e.preventDefault(); if (draft.name.trim()) onSwitch({ name: draft.name.trim(), role: draft.role }) }}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
          <Field label="Name"><input id="who-name" type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. J. Alvarez, RN" /></Field>
          <Field label="Role">
            <select id="who-role" value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
            </select>
          </Field>
          <Button type="submit" variant="ghost"><Icon name="user" size={14} />Switch user</Button>
        </form>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
          <thead>
            <tr style={{ color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
              <th style={{ padding: '5px 6px', textAlign: 'left' }}>Permission</th>
              {ROLE_ORDER.map((r) => <th key={r} style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>{ROLES[r].label}</th>)}
            </tr>
          </thead>
          <tbody>
            {MATRIX_PERMS.map((p) => (
              <tr key={p} style={{ borderBottom: `1px solid ${theme.border}` }}>
                <td style={{ padding: '5px 6px' }}>{PERMISSIONS[p]}</td>
                {ROLE_ORDER.map((r) => (
                  <td key={r} style={{ padding: '5px 6px', textAlign: 'center', color: can(r, p) ? '#1f7a54' : theme.border, fontWeight: 800 }}
                    aria-label={can(r, p) ? 'allowed' : 'not allowed'}>
                    {can(r, p) ? '✓' : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ audit log */

export function AuditLogPanel({ entries }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(40)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const sorted = useMemo(() => sortAudit(entries).reverse(), [entries])
  const q = query.trim().toLowerCase()
  const shown = q
    ? sorted.filter((e) => `${e.actor} ${e.role} ${e.action} ${actionLabel(e.action)} ${e.target ?? ''}`.toLowerCase().includes(q))
    : sorted

  const verify = async () => {
    setBusy(true)
    try { setResult(await verifyAuditChain(entries)) } finally { setBusy(false) }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(sortAudit(entries), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `acuitas-audit-${today()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card title="Audit log" sub="Every change, who made it, in which role, and when — hash-chained so tampering shows"
      right={<Badge color={theme.accent}>{entries.length} ENTRIES</Badge>}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <Button onClick={verify} disabled={busy || !entries.length}><Icon name="shield" size={14} />{busy ? 'Verifying…' : 'Verify chain'}</Button>
        <Button variant="ghost" onClick={exportJson} disabled={!entries.length}>Export (JSON)</Button>
        <input type="search" aria-label="Filter the audit log" placeholder="Filter by person, role or action" value={query}
          onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      </div>
      {result && (
        <div role="status" style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600,
          background: result.ok ? '#3fb37f18' : '#e0584a16', color: result.ok ? '#1f7a54' : '#a5342a' }}>
          {result.ok
            ? `Chain intact — ${result.checked} entries verified.${result.forks ? ` ${result.forks} concurrent write${result.forks === 1 ? '' : 's'} recorded as forks (not tampering).` : ''}`
            : `Chain ${result.reason === 'tampered' ? 'tampered' : 'broken'} at entry ${result.brokenAt}. ${result.reason === 'tampered' ? 'That entry was changed after it was written.' : 'An entry before it is missing or out of order.'}`}
        </div>
      )}
      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: theme.sub }}>{entries.length ? 'No entries match the filter.' : 'Nothing recorded yet.'}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ padding: '5px 6px' }}>#</th>
                <th style={{ padding: '5px 6px' }}>When</th>
                <th style={{ padding: '5px 6px' }}>Who</th>
                <th style={{ padding: '5px 6px' }}>What</th>
                <th style={{ padding: '5px 6px' }}>Record</th>
                <th style={{ padding: '5px 6px' }}>Hash</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((e) => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '5px 6px', color: theme.sub, fontVariantNumeric: 'tabular-nums' }}>{e.seq}</td>
                  <td style={{ padding: '5px 6px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{new Date(e.at).toLocaleString()}</td>
                  <td style={{ padding: '5px 6px' }}>{e.actor} <span style={{ color: theme.sub }}>· {ROLES[e.role]?.label || e.role}</span></td>
                  <td style={{ padding: '5px 6px', fontWeight: 600 }}>{actionLabel(e.action)}</td>
                  <td style={{ padding: '5px 6px', color: theme.sub, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.target ?? '—'}</td>
                  <td style={{ padding: '5px 6px', fontFamily: 'ui-monospace, monospace', color: theme.sub }}>{e.hash.slice(0, 10)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > limit && <Button variant="ghost" onClick={() => setLimit((l) => l + 60)} style={{ marginTop: 10 }}>Show more</Button>}
        </div>
      )}
      <div style={{ fontSize: 11, color: theme.sub, marginTop: 10, lineHeight: 1.5 }}>
        Each entry stores the SHA-256 hash of the one before it, so editing or deleting any entry breaks the chain from
        that point on. On a shared backend the log is also append-only under the security rules. Entries record field
        names and short values only, never free-text notes.
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------- FHIR import */

export function FhirImport({ locations, entries, onApply }) {
  const [text, setText] = useState('')
  const [date, setDate] = useState(today())
  const [shift, setShift] = useState(new Date().getHours() < 12 ? 'AM' : 'PM')
  const [mapping, setMapping] = useConfigValue('fhirLocationMap', { localKey: 'bhai:fhirLocationMap', initial: {} })
  const [applied, setApplied] = useState(null)
  const ipUnits = locations.filter((l) => l.type !== 'ed')

  let bundle = null
  let parseError = null
  if (text.trim()) {
    try { bundle = JSON.parse(text) } catch (e) { parseError = 'That isn’t valid JSON.' }
  }
  const parsed = bundle ? parseFhirCensus(bundle, { locations: ipUnits, mapping: mapping || {} }) : null
  const plan = parsed?.ok ? planCensusApply(parsed, entries, { date, shift }) : null

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    if (f) setText(await f.text())
    e.target.value = ''
  }

  return (
    <Card title="FHIR census import" sub="Read census straight from your EHR: a FHIR R4 Bundle of admitted Encounters and their Locations">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <label className="btn-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          <Icon name="upload" size={14} />Choose a bundle file
          <input type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
        </label>
        <Button variant="ghost" onClick={() => { setApplied(null); setText(JSON.stringify(exampleFhirBundle(locations), null, 2)) }}>Load an example bundle</Button>
        {text && <Button variant="ghost" onClick={() => { setText(''); setApplied(null) }}>Clear</Button>}
      </div>
      <textarea aria-label="FHIR Bundle JSON" value={text} onChange={(e) => { setText(e.target.value); setApplied(null) }}
        placeholder='Or paste a FHIR Bundle here: { "resourceType": "Bundle", "entry": [ … ] }'
        style={{ width: '100%', minHeight: 90, fontFamily: 'ui-monospace, monospace', fontSize: 11.5 }} />

      {parseError && <div style={{ color: '#a5342a', fontSize: 12.5, marginTop: 8 }}>{parseError}</div>}
      {parsed && !parsed.ok && <div style={{ color: '#a5342a', fontSize: 12.5, marginTop: 8 }}>{parsed.reason}</div>}

      {parsed?.ok && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12.5, marginBottom: 8 }}>
            <strong>{parsed.counted}</strong> admitted inpatient encounters across <strong>{parsed.rows.length}</strong> locations
            {parsed.skipped ? ` (${parsed.skipped} finished or non-inpatient encounters skipped)` : ''}{parsed.asOf ? ` · bundle time ${new Date(parsed.asOf).toLocaleString()}` : ''}.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: theme.sub, borderBottom: `1px solid ${theme.border}` }}>
                  <th style={{ padding: '5px 6px' }}>FHIR location</th>
                  <th style={{ padding: '5px 6px', textAlign: 'right' }}>Census</th>
                  <th style={{ padding: '5px 6px' }}>Acuitas unit</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((r) => (
                  <tr key={r.fhirLocationId} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '5px 6px' }}>{r.name} <span style={{ color: theme.sub }}>({r.fhirLocationId})</span></td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700 }}>{r.census}</td>
                    <td style={{ padding: '5px 6px' }}>
                      <select aria-label={`Acuitas unit for ${r.name}`} value={r.locId || ''}
                        onChange={(e) => setMapping({ ...(mapping || {}), [r.fhirLocationId]: e.target.value || undefined })}
                        style={{ fontSize: 12, padding: '3px 6px' }}>
                        <option value="">Not mapped — skip</option>
                        {ipUnits.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      {r.matchedBy === 'name' && <span style={{ fontSize: 10.5, color: theme.sub, marginLeft: 6 }}>matched by name</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
            <Field label="Apply to date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Shift">
              <select value={shift} onChange={(e) => setShift(e.target.value)}><option value="AM">AM</option><option value="PM">PM</option></select>
            </Field>
            <Button disabled={!plan || (!plan.updates.length && !Object.keys(plan.prefills).length)}
              onClick={() => { onApply(plan, { date, shift }); setApplied({ updates: plan.updates.length, prefills: Object.keys(plan.prefills).length }) }}>
              <Icon name="upload" size={14} />Apply census
            </Button>
          </div>
          {plan && (
            <div style={{ fontSize: 11.5, color: theme.sub, marginTop: 8 }}>
              {plan.updates.length} logged {plan.updates.length === 1 ? 'entry' : 'entries'} for {date} {shift} will get the FHIR census;{' '}
              {Object.keys(plan.prefills).length} unit{Object.keys(plan.prefills).length === 1 ? '' : 's'} with no entry yet will have census pre-filled on New Shift Entry.
            </div>
          )}
          {applied && (
            <div role="status" style={{ marginTop: 8, fontSize: 12.5, fontWeight: 700, color: '#1f7a54' }}>
              Applied: {applied.updates} updated, {applied.prefills} pre-filled.
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 11, color: theme.sub, marginTop: 12, lineHeight: 1.5 }}>
        Counts Encounters with status in-progress and an inpatient class (IMP / ACUTE) at their current Location; nothing
        else in the bundle is kept. For a live feed, have your interface engine export this bundle each shift, or query
        your EHR&rsquo;s FHIR API for <code>Encounter?status=in-progress&amp;_include=Encounter:location</code>.
        Acuity points and staffing still come from the charge nurse.
      </div>
    </Card>
  )
}
