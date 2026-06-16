import React, { useRef } from 'react'
import { Card, Badge, Button, Icon, theme, grid, ProgressBar } from './ui.jsx'
import { STAGE_COLORS, PEDIATRIC_ED_THRESHOLDS } from '../lib/model.js'
import AcuitasLogo from './AcuitasLogo.jsx'

const SECTIONS = [
  { id: 'overview', label: 'Getting Around', icon: 'grid' },
  { id: 'status', label: 'Region Status Board', icon: 'shield' },
  { id: 'entry', label: 'New Shift Entry', icon: 'plusCircle' },
  { id: 'deployments', label: 'Staff Deployments', icon: 'users' },
  { id: 'reports', label: 'Reports & Exports', icon: 'barChart' },
  { id: 'acuity', label: 'AcuiCalc™ — Acuity Calculator™', icon: 'sparkle' },
  { id: 'settings', label: 'Settings & Admin', icon: 'settings' },
  { id: 'tips', label: 'Tips & Troubleshooting', icon: 'help' },
]

function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
      <div
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: theme.accentSoft,
          color: theme.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 800,
          marginTop: 1,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55 }}>{children}</div>
    </div>
  )
}

function Illustration({ label, children }) {
  return (
    <div
      style={{
        border: `1px dashed ${theme.border}`,
        borderRadius: 12,
        padding: 14,
        background: theme.panelAlt,
        marginTop: 10,
        marginBottom: 18,
      }}
    >
      {label && (
        <div style={{ fontSize: 11, fontWeight: 700, color: theme.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          {label}
        </div>
      )}
      {children}
    </div>
  )
}

function MockBar({ children, style }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12.5,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function Pointer({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: theme.accent, fontWeight: 700, marginTop: 6 }}>
      <Icon name="cursor" size={12} style={{ color: theme.accent }} />
      {children}
    </div>
  )
}

function BrandMark() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, paddingTop: 10, borderTop: `1px solid ${theme.border}` }}>
      <AcuitasLogo size={20} dark={false} showWordmark />
    </div>
  )
}

export default function HelpGuide() {
  const refs = useRef({})

  const scrollTo = (id) => {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <div className="fade-in-up" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <AcuitasLogo size={26} dark={false} showWordmark={false} />
          <div style={{ fontFamily: theme.display, fontSize: 20, fontWeight: 700 }}>Help &amp; Training Guide</div>
        </div>
        <div style={{ fontSize: 12.5, color: theme.sub }}>
          A step-by-step walkthrough of every screen in the Behavioral Health Acuity Index dashboard.
        </div>
      </div>

      <Card title="Jump to a Section">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SECTIONS.map((s) => (
            <Button key={s.id} variant="ghost" onClick={() => scrollTo(s.id)} style={{ fontSize: 12.5 }}>
              <Icon name={s.icon} size={14} />
              {s.label}
            </Button>
          ))}
        </div>
      </Card>

      {/* OVERVIEW */}
      <div ref={(el) => (refs.current.overview = el)}>
        <Card title="Getting Around the App" sub="Everything lives behind the left-hand navigation menu">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            The dark sidebar on the left is always visible. Click any item to switch screens — your data is shared
            in real time, so anything you or a teammate enters will appear for everyone within a second or two.
          </div>
          <Illustration label="What the sidebar looks like">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 240 }}>
              {[
                { label: 'Region Status Board', icon: 'grid', active: true },
                { label: 'New Shift Entry', icon: 'plusCircle' },
                { label: 'Staff Deployments', icon: 'users' },
                { label: 'Reports', icon: 'barChart' },
                { label: 'AcuiCalc™', icon: 'sparkle' },
                { label: 'Help & Training', icon: 'help' },
                { label: 'Settings', icon: 'settings' },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: item.active ? theme.accent : 'transparent',
                    color: item.active ? '#fff' : theme.navy,
                  }}
                >
                  <Icon name={item.icon} size={15} />
                  {item.label}
                </div>
              ))}
            </div>
          </Illustration>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            A quick summary of each screen:
          </div>
          <ul style={{ fontSize: 13, lineHeight: 1.7, marginTop: 6, paddingLeft: 20 }}>
            <li><b>Region Status Board</b> — a live snapshot of every unit's acuity and census, updated automatically.</li>
            <li><b>New Shift Entry</b> — where staff log census, acuity points, and staffing for AM/PM shifts.</li>
            <li><b>Staff Deployments</b> — a log of who was moved between units and why, for staffing/budget records.</li>
            <li><b>Reports</b> — charts, trends, and downloadable data exports.</li>
            <li><b>AcuiCalc™</b> — score individual patients and push totals directly to ED acuity.</li>
            <li><b>Settings</b> — password-protected. Used to manage locations, thresholds, and data.</li>
          </ul>
          <BrandMark />
        </Card>
      </div>

      {/* STATUS BOARD */}
      <div ref={(el) => (refs.current.status = el)}>
        <Card title="Region Status Board" sub="Your home screen — a live look at every unit">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            This is the first screen you see. It shows one card per unit with that unit's most recent
            shift entry for today.
          </div>
          <Illustration label="Example unit card">
            <Card
              interactive
              title="1 South A"
              sub="High Point Medical Center"
              right={<Badge color={STAGE_COLORS.YELLOW}>YELLOW</Badge>}
              style={{ marginBottom: 0, maxWidth: 360 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, fontFamily: theme.display }}>2.31</div>
                  <div style={{ fontSize: 11.5, color: theme.sub }}>Acuity per staff (UAI)</div>
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: theme.sub, marginBottom: 4 }}>
                  <span>Census vs. nursing cap</span>
                  <span style={{ fontWeight: 700 }}>16 / 18</span>
                </div>
                <ProgressBar value={16} max={18} color={theme.accent} />
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: `${STAGE_COLORS.YELLOW}1a`,
                  color: STAGE_COLORS.YELLOW,
                }}
              >
                Deploy 1 staff to GREEN
              </div>
            </Card>
          </Illustration>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>How to read a card</div>
          <Step n="1">
            <b>Top-right badge</b> — the unit's current status:
            {' '}<Badge color={STAGE_COLORS.GREEN}>GREEN</Badge> (at/below target),{' '}
            <Badge color={STAGE_COLORS.YELLOW}>YELLOW</Badge> (elevated), or{' '}
            <Badge color={STAGE_COLORS.RED}>RED</Badge> (critical — pulses to draw attention). If no one has
            logged today's shift yet, you'll see <Badge color={STAGE_COLORS.NONE}>AWAITING REPORT</Badge>.
          </Step>
          <Step n="2">
            <b>Big number</b> — the unit's computed acuity value for today (for inpatient units this is the
            "Unit Acuity Index," or acuity points divided by staff on shift; for the ED it's total behavioral
            health points). The small chart beside it shows the recent trend.
          </Step>
          <Step n="3">
            <b>Census vs. nursing cap</b> — shows today's census against the unit's census cap. The number
            after the slash is editable — click it to type a new cap. Any charge nurse can update this without
            the Settings password, and it updates everywhere instantly.
          </Step>
          <Step n="4">
            <b>Staffing suggestion</b> — if a unit is YELLOW or RED, this box tells you how many additional
            staff would be needed to reach GREEN (and to reach YELLOW if currently RED).
          </Step>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Top summary tiles</div>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              At the top of the page, four tiles summarize the whole region at a glance: total locations
              tracked, how many are at/below target vs. elevated/critical, total census vs. total caps across
              all units, and how many units are currently in RED status.
            </div>
          </div>
          <BrandMark />
        </Card>
      </div>

      {/* NEW SHIFT ENTRY */}
      <div ref={(el) => (refs.current.entry = el)}>
        <Card title="New Shift Entry" sub="Log a unit's numbers once per shift">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            Each unit should submit one entry per shift (AM and PM). This is the data that drives the
            Status Board and Reports.
          </div>
          <Illustration label="The shift entry form">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420 }}>
              <div style={{ ...grid(3), gap: 8 }}>
                <MockBar>Location ▾</MockBar>
                <MockBar>Date 📅</MockBar>
                <MockBar>Shift: AM ▾</MockBar>
              </div>
              <div style={{ ...grid(3), gap: 8 }}>
                <MockBar>Census</MockBar>
                <MockBar>Acuity Points</MockBar>
                <MockBar>Staff on Shift</MockBar>
              </div>
              <MockBar style={{ justifyContent: 'flex-start', gap: 8 }}>
                <span style={{ color: theme.sub }}>Computed:</span>
                <b>2.31</b>
                <Badge color={STAGE_COLORS.YELLOW}>YELLOW</Badge>
              </MockBar>
            </div>
            <Pointer>Save Entry button appears below the form</Pointer>
          </Illustration>

          <Step n="1"><b>Location</b> — choose your unit from the dropdown.</Step>
          <Step n="2"><b>Date &amp; Shift</b> — defaults to today; choose AM or PM.</Step>
          <Step n="3">
            <b>Census</b> — how many patients are currently on the unit (not shown for the ED). If a nursing
            census cap is set, it's shown as a hint under this field.
          </Step>
          <Step n="4">
            <b>Acuity Points / Behavioral Health Points</b> — total points from your unit's acuity scoring
            (you can also build this number with <b>AcuiCalc™</b> on its dedicated sidebar tab).
          </Step>
          <Step n="5">
            <b>Staff on Shift</b> — number of RNs/MHTs staffed (not shown for the ED, since ED status is based
            on total points only).
          </Step>
          <Step n="6">
            <b>Notes</b> — optional free text for anything worth flagging.
          </Step>
          <Step n="7">
            Check the <b>Computed</b> preview at the bottom — it shows the resulting value and status color
            before you save, so you can confirm it looks right.
          </Step>
          <Step n="8">
            Click <b>Save Entry</b>. The Status Board updates immediately for everyone.
          </Step>
          <BrandMark />
        </Card>
      </div>

      {/* DEPLOYMENTS */}
      <div ref={(el) => (refs.current.deployments = el)}>
        <Card title="Staff Deployments" sub="Track who moved where, and why">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            Use this screen whenever a staff member is moved between units (e.g., to cover an acuity surge or
            a census cap issue). This builds a record used for budgeting and reporting.
          </div>
          <Illustration label="Log a Deployment form">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
              <div style={{ ...grid(4), gap: 8 }}>
                <MockBar>Date 📅</MockBar>
                <MockBar>Shift ▾</MockBar>
                <MockBar>Staff Name</MockBar>
                <MockBar>Role</MockBar>
              </div>
              <div style={{ ...grid(4), gap: 8 }}>
                <MockBar>Deployed From ▾</MockBar>
                <MockBar>Deployed To ▾</MockBar>
                <MockBar>Hours</MockBar>
                <MockBar>Reason</MockBar>
              </div>
            </div>
          </Illustration>

          <Step n="1"><b>Date &amp; Shift</b> — when the deployment happened.</Step>
          <Step n="2"><b>Staff Name &amp; Role</b> — who was deployed (e.g., "J. Alvarez, RN").</Step>
          <Step n="3">
            <b>Deployed From</b> — the unit they came from, or leave blank for "Float pool / off-unit."
          </Step>
          <Step n="4"><b>Deployed To</b> — the unit they were sent to (required).</Step>
          <Step n="5"><b>Hours &amp; Reason</b> — optional, but helpful for reporting (e.g., "acuity surge").</Step>
          <Step n="6">
            Click <b>Log Deployment</b>. It appears instantly in the Deployment Log table below the form,
            which everyone can see. Use the <b>Remove</b> button on a row to delete a mistaken entry.
          </Step>
          <BrandMark />
        </Card>
      </div>

      {/* REPORTS */}
      <div ref={(el) => (refs.current.reports = el)}>
        <Card title="Reports & Exports" sub="Trends, charts, and downloadable data">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            The Reports screen turns every shift entry and deployment into charts and exportable files.
          </div>
          <Illustration label="What you'll see">
            <div style={{ ...grid(3), gap: 10 }}>
              <div style={{ gridColumn: 'span 2', background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>Acuity Trend (line chart)</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50 }}>
                  {[18, 28, 22, 36, 30, 44, 38].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: h, background: i % 2 ? theme.navy : theme.accent, borderRadius: 3 }} />
                  ))}
                </div>
              </div>
              <div style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 8 }}>Acuity Stage Mix (pie)</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      background: `conic-gradient(${STAGE_COLORS.GREEN} 0 50%, ${STAGE_COLORS.YELLOW} 50% 80%, ${STAGE_COLORS.RED} 80% 100%)`,
                    }}
                  />
                </div>
              </div>
            </div>
          </Illustration>

          <Step n="1">
            <b>Location filter</b> (top right) — narrow every chart and table to a single unit, or leave on
            "All locations."
          </Step>
          <Step n="2">
            <b>Acuity Trend</b> — line chart of each unit's computed acuity value over time, so you can spot
            patterns by shift.
          </Step>
          <Step n="3">
            <b>Acuity Stage Mix</b> — pie chart showing what proportion of shift entries were GREEN, YELLOW,
            or RED.
          </Step>
          <Step n="4">
            <b>Deployment Hours by Destination</b> — bar chart of total staff hours deployed to each unit,
            useful for budget conversations.
          </Step>
          <Step n="5">
            <b>Shift Entries table</b> — every entry ever logged. Click any column header to sort, use the
            search box to filter by unit/date/notes, and click <b>Remove</b> to delete a bad entry.
          </Step>
          <Step n="6">
            <b>Export buttons</b> (top right) — download <b>Export Entries CSV</b>, <b>Export Deployments CSV</b>,
            or <b>Export JSON</b> (a full backup of all locations, entries, deployments, and thresholds) for
            spreadsheets or record-keeping.
          </Step>
          <BrandMark />
        </Card>
      </div>

      {/* ACUITY CALCULATOR */}
      <div ref={(el) => (refs.current.acuity = el)}>
        <Card title="AcuiCalc™ — Acuity Calculator™" sub="A two-step flow: Acuity Scoring first, then Peds Modifiers for pediatric patients">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            AcuiCalc™ lives on its own tab in the sidebar. It uses a two-step approach — <b>Step 1</b> applies
            to all patients; <b>Step 2</b> applies only to pediatric patients who need modifier points added on
            top of their base score.
          </div>
          <Illustration label="Two-step tab layout">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ padding: '6px 14px', borderRadius: 8, background: theme.accent, color: '#fff', fontSize: 12, fontWeight: 700 }}>Step 1 — Acuity Scoring</div>
                <div style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 12, fontWeight: 700 }}>Step 2 — Peds Modifiers</div>
              </div>
              <div style={{ fontSize: 11.5, color: theme.sub }}>Step 1 for all patients. Adult patients stop here. Pediatric patients continue to Step 2.</div>
            </div>
          </Illustration>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Scoring an adult patient (Step 1 only)</div>
          <Step n="1">
            Open <b>Step 1 — Acuity Scoring</b>. This tab is active by default.
          </Step>
          <Step n="2">
            Enter the patient's <b>initials</b> — keeps the list readable without using full names.
          </Step>
          <Step n="3">
            Check every box that applies across <b>four scoring categories</b>:
            <ul style={{ marginTop: 6, paddingLeft: 20, lineHeight: 1.7 }}>
              <li><b>A. Observation Status</b> — level of observation required (1:1=5 pts, Q15=3 pts, line-of-sight=2 pts).</li>
              <li><b>B. Behavioral Risk (last 24 hours)</b> — aggression, restraints, PRN sedation, suicide/self-injury, homicidal ideation.</li>
              <li><b>C. Clinical Complexity</b> — psychosis, mania, detox protocol, elopement risk, forensic hold, severe personality disorder behavior.</li>
              <li>
                <b>D. Behavioral Severity – MASS (Last 24 Hours)</b> — select the highest applicable MASS level:
                <ul style={{ marginTop: 4, paddingLeft: 20, lineHeight: 1.7 }}>
                  <li>MASS 1–3 – Very Mild (behavioral interventions only) = <b>0 pts</b></li>
                  <li>MASS 4–6 – Mild (behavioral interventions + oral meds) = <b>+1 pt</b></li>
                  <li>MASS 7–9 – Moderate (behavioral + oral or IM meds) = <b>+2 pts</b></li>
                  <li>MASS 10+ – Severe/Violent (IM meds ± seclusion/restraint) = <b>+4 pts</b></li>
                </ul>
              </li>
            </ul>
          </Step>
          <Step n="3b">
            <b>MASS Escalation alerts</b> appear automatically when a MASS level is selected that triggers clinical action:
            <ul style={{ marginTop: 6, paddingLeft: 20, lineHeight: 1.7 }}>
              <li><b>MASS ≥7</b> (Moderate selected) — yellow alert: Charge RN awareness + mitigation plan required.</li>
              <li><b>MASS ≥10</b> (Severe/Violent selected) — red alert: High-risk — consider 1:1, staffing flex, admin notification.</li>
            </ul>
          </Step>
          <Step n="4">
            Watch the <b>Total Score</b> update live as you check items.
          </Step>
          <Step n="5">
            Click <b>Add Adult to List</b>. The patient (initials + score) appears in "Scored Patients" and
            the form resets for the next patient.
          </Step>

          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 6 }}>Scoring a pediatric patient (Steps 1 + 2)</div>
          <Illustration label="Push to Peds flow">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 500 }}>
              <MockBar>Patient Initials: <b>R.S.</b></MockBar>
              <div style={{ ...grid(3), gap: 10 }}>
                {['Observation Status', 'Behavioral Risk', 'Clinical Complexity'].map((g) => (
                  <div key={g} style={{ background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>{g}</div>
                    <div style={{ fontSize: 11.5, color: theme.sub, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span>☑ Item (+points)</span>
                      <span>☐ Item (+points)</span>
                    </div>
                  </div>
                ))}
              </div>
              <MockBar>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 11.5, color: theme.sub }}>Total Score</span>
                  <b style={{ fontSize: 18 }}>6</b>
                </span>
                <span style={{ display: 'flex', gap: 8 }}>
                  <span style={{ padding: '5px 12px', borderRadius: 7, border: `1px solid ${theme.border}`, fontSize: 11.5, fontWeight: 700 }}>Push to Peds →</span>
                  <span style={{ padding: '5px 12px', borderRadius: 7, background: theme.accent, color: '#fff', fontSize: 11.5, fontWeight: 700 }}>Add Adult to List</span>
                </span>
              </MockBar>
            </div>
          </Illustration>
          <Step n="1">
            On <b>Step 1 — Acuity Scoring</b>, enter the patient's initials and check all applicable criteria
            exactly as you would for an adult patient.
          </Step>
          <Step n="2">
            Click <b>Push to Peds →</b> at the bottom of Step 1. The calculator switches to Step 2
            automatically, carrying the initials and pre-filling the <b>Base Acuity Score</b> with the Step 1
            total — no re-entry needed.
          </Step>
          <Step n="3">
            On <b>Step 2 — Peds Modifiers</b>, check any pediatric modifiers that apply:
            <ul style={{ marginTop: 6, paddingLeft: 20, lineHeight: 1.7 }}>
              <li><b>Observation</b> — continuous line-of-sight observation (C1), or an on-unit self-harm/suicide attempt this admission (C7).</li>
              <li><b>Behavioral Safety</b> — prior restraint/seclusion on the unit (C4), or sexually inappropriate/boundary-risk behavior (C8).</li>
              <li><b>Medical Complexity</b> — eating disorder protocol (C3), brittle Type 1 diabetes management (C5), or contact precautions/room isolation (C2).</li>
            </ul>
          </Step>
          <Step n="4">
            <b>Observation modifiers don't stack.</b> C1 and C7 are both "continuous observation" triggers —
            if you check both, only the higher-value one (+4) counts. The other shows struck-through.
          </Step>
          <Step n="5">
            The <b>Total Score</b> updates live as <i>base + modifiers</i>, shown with a breakdown underneath.
          </Step>
          <Step n="6">
            Click <b>Add to List</b>. The patient appears in "Scored Patients" with a <b>Peds</b> tag.
          </Step>
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 8 }}>
            Note: C6 (documentation reminders for admits, discharges, and staffing changes) is a charting
            checklist item, not a points modifier — it isn't part of this calculator.
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 16, marginBottom: 6 }}>Pushing a score to the ED</div>
          <Illustration label="Scored Patients list">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
              <div style={{ ...grid(2), gap: 8 }}>
                <MockBar>Push to ED Location: Emergency Dept ▾</MockBar>
                <MockBar>Shift: AM ▾</MockBar>
              </div>
              <MockBar>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b>J.D.</b> <Badge color={theme.accentSoft}>7 pts</Badge>
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 6, background: theme.accent, color: '#fff', fontSize: 11, fontWeight: 700 }}>Push to ED Acuity</span>
                  <span style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e3b3ac', color: '#c0392b', fontSize: 11, fontWeight: 700 }}>Remove</span>
                </span>
              </MockBar>
            </div>
          </Illustration>
          <Step n="1">
            Under "Scored Patients," choose the <b>ED location</b> and <b>shift</b> (AM/PM) you want to add
            the score to.
          </Step>
          <Step n="2">
            Click <b>Push to ED Acuity</b> on that patient's row. Their score is added to today's ED total for
            that shift — if no entry exists yet, one is created automatically.
          </Step>
          <Step n="3">
            The patient is removed from the list once pushed, and the ED's card on the Status Board updates
            automatically with the new total.
          </Step>
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 8 }}>
            Tip: Score several patients before pushing — the running total of pending points is shown in the
            "Scored Patients" card header.
          </div>
          <BrandMark />
        </Card>
      </div>

      {/* SETTINGS */}
      <div ref={(el) => (refs.current.settings = el)}>
        <Card title="Settings & Admin" sub="Password-protected — for unit/location management">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            The Settings screen controls things that affect the whole region: which units exist, their
            thresholds, and full data export/import. It's locked with a password held by your administrator.
          </div>
          <Illustration label="Settings lock screen">
            <div style={{ maxWidth: 320, margin: '0 auto', textAlign: 'center' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: theme.accentSoft,
                  color: theme.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                }}
              >
                <Icon name="settings" size={20} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Settings Locked</div>
              <MockBar style={{ justifyContent: 'center' }}>Password: ••••••••</MockBar>
            </div>
          </Illustration>

          <Step n="1">
            If you need access (e.g., to add a new unit), ask your administrator for the settings password.
          </Step>
          <Step n="2">
            <b>Locations</b> — add, edit, or remove units; set each unit's type (Inpatient or Emergency
            Department) and its nursing-driven census cap.
          </Step>
          <Step n="3">
            <b>Default Thresholds</b> — set the Green/Yellow cutoffs used to determine status color for
            Inpatient units and the ED. System defaults: Inpatient GREEN ≤ 1.5 UAI / YELLOW ≤ 2.5 UAI;
            ED GREEN ≤ 21 total points / YELLOW ≤ 27 total points (reflecting the four-category scoring
            rubric including MASS). Leave custom fields blank on individual units to use these region defaults.
          </Step>
          <Step n="4">
            <b>Custom Green Max / Yellow Max</b> — each location row also has its own threshold override.
            Fill in both fields to give that unit its own Green/Yellow cutoffs instead of the region default;
            leave both blank to use the default.
          </Step>
          <Step n="5">
            <b>Data Management</b> — Export All Data (JSON) for backups, Import Data (JSON) to restore from a
            backup, or Clear All Data to reset everything (this cannot be undone, so use with care).
          </Step>

          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: theme.accentSoft,
              fontSize: 12.5,
              lineHeight: 1.6,
            }}
          >
            <b>Recommended Pediatric ED thresholds:</b> for a Pediatric ED location, set{' '}
            <b>Custom Green Max = {PEDIATRIC_ED_THRESHOLDS.greenMax}</b> and{' '}
            <b>Custom Yellow Max = {PEDIATRIC_ED_THRESHOLDS.yellowMax}</b>. This makes the unit turn YELLOW at
            54 total points and RED at 72 — 20% above the initial 45 / 60 pilot bands.
          </div>
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 8 }}>
            Note: Census caps on the Status Board can be updated by any charge nurse directly on the unit's
            card — you don't need the Settings password for day-to-day cap changes.
          </div>
          <BrandMark />
        </Card>
      </div>

      {/* TIPS */}
      <div ref={(el) => (refs.current.tips = el)}>
        <Card title="Tips & Troubleshooting">
          <ul style={{ fontSize: 13, lineHeight: 1.8, paddingLeft: 20, marginBottom: 0 }}>
            <li>
              <b>Data syncs in real time.</b> If you don't see a teammate's update right away, give it a
              second or two, or refresh the page.
            </li>
            <li>
              <b>One entry per shift, per unit.</b> The Status Board always shows the most recent entry for
              today — if you re-submit, it's an additional entry, not a replacement. Remove duplicates from
              Reports → Shift Entries if needed.
            </li>
            <li>
              <b>"Awaiting daily report"</b> on the Status Board just means no one has logged today's shift
              for that unit yet — it isn't an error.
            </li>
            <li>
              <b>Census cap edits are instant and shared.</b> Click the cap number on any unit card to update
              it — no password needed.
            </li>
            <li>
              <b>Lost your place?</b> Use the "Jump to a Section" buttons at the top of this page, or the
              sidebar to switch screens at any time.
            </li>
            <li>
              <b>Need the intro video again?</b> Click "Watch the Story" at the bottom of the sidebar.
            </li>
          </ul>
          <BrandMark />
        </Card>
      </div>
    </div>
  )
}
