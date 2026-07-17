import React from 'react'
import { Card, theme } from './ui.jsx'

const SECTIONS = [
  {
    title: 'Bed Board',
    body: `Beds are grouped by dorm (Men's — 70 beds, Women's — 30 beds) and shown in their physical
    three-high bunk stacks. Green means open, amber means held with a countdown, red means occupied.
    Turn on "Bottom Bunk Only" to highlight beds a resident who cannot climb could use.`,
  },
  {
    title: 'Holding a Bed',
    body: `Medical providers can hold an open bed for up to 2 hours while arranging transport or paperwork.
    Holds expire automatically. A Bethesda Center representative can grant a 2-hour extension from the
    same screen when a longer hold is genuinely needed — this keeps long blocks rare and visible.`,
  },
  {
    title: 'Screening',
    body: `Enter a name in the Screening tab, or right on the Admit form, to check it against the Bethesda
    Center's confidential list. You will only ever see Accepted, Not Accepted, or Possible Match — the
    underlying list itself is never shown to hospital staff. A possible match (a close but not exact name)
    always routes to a Bethesda Center representative for a human decision.`,
  },
  {
    title: 'Admitting a Resident',
    body: `Admitting assigns the resident to the specific bed you selected, records their bunk requirement,
    and requires them to commit to ongoing psychiatric care, primary care, and weekly group therapy as a
    condition of residency.`,
  },
  {
    title: '90-Day Residency Cap',
    body: `Each resident's stay is capped at 90 days from admission. The Resident detail view shows days
    used and days remaining. Only a Bethesda Center representative can grant an extension beyond 90 days.`,
  },
  {
    title: 'Bethesda Center Admin',
    body: `Bethesda Center staff unlock a separate area to manage the disallowed list, resolve possible
    matches, review screening activity, approve long holds, and grant residency extensions. Hospital staff
    never see this area.`,
  },
]

export default function HelpGuide() {
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: theme.display, fontWeight: 800, fontSize: 22 }}>Help &amp; Training</div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>How BedSpace supports the ED/IP &harr; Bethesda Center bed placement workflow</div>
      </div>
      {SECTIONS.map((s) => (
        <Card key={s.title} title={s.title}>
          <div style={{ fontSize: 13.5, color: theme.text, lineHeight: 1.7 }}>{s.body}</div>
        </Card>
      ))}
    </div>
  )
}
