import React, { useRef } from 'react'
import { Card, Badge, Button, Icon, theme, grid, ProgressBar } from './ui.jsx'
import { STAGE_COLORS, PEDIATRIC_ED_THRESHOLDS } from '../lib/model.js'
import AcuitasLogo from './AcuitasLogo.jsx'

const SECTIONS = [
  { id: 'overview', label: 'Getting Around', icon: 'grid' },
  { id: 'status', label: 'Region Status Board', icon: 'shield' },
  { id: 'command', label: 'Command Center', icon: 'trendUp' },
  { id: 'outcomes', label: 'Outcomes & ROI', icon: 'loop' },
  { id: 'capacity', label: 'Capacity & Safety', icon: 'bed' },
  { id: 'acuipath', label: 'AcuiPath™ Outpatient', icon: 'route' },
  { id: 'entry', label: 'New Shift Entry', icon: 'plusCircle' },
  { id: 'deployments', label: 'Staff Deployments', icon: 'users' },
  { id: 'reports', label: 'Reports & Exports', icon: 'barChart' },
  { id: 'acuity', label: 'AcuiCalc™ — Acuity Calculator™', icon: 'sparkle' },
  { id: 'settings', label: 'Settings & Admin', icon: 'settings' },
  { id: 'access', label: 'People, Roles & Audit', icon: 'lock' },
  { id: 'faq', label: 'FAQ', icon: 'help' },
  { id: 'tips', label: 'Tips & Troubleshooting', icon: 'help' },
]

const FAQ = [
  ['Does Acuitas make clinical or staffing decisions?',
    'No. Acuitas is decision support. It organizes the evidence, makes a recommendation, and shows its reasoning. A licensed clinician or supervisor confirms or overrides every recommendation. Nothing is automatic: plans are not executed, placements are not booked, and PHP/IOP is never assigned automatically.'],
  ['Does Acuitas use AI? Is our data sent to an outside service?',
    'Acuitas uses transparent statistics: per-unit forecasting, measured prediction ranges, and an exact optimizer. Every calculation runs in your browser. There is no external model service, no vendor AI API, and no patient data in transit. In the evaluation build data stays in this browser; in an internal build it goes only to your own database.'],
  ['Do I need to enter patient names or MRNs?',
    'No, never. AcuiPath, the discharge bridge and safety events all use de-identified case numbers. The FHIR census import counts admitted encounters by location and keeps nothing else from the bundle.'],
  ['How accurate are the forecasts?',
    'Each unit is scored on shifts its model never saw, and its card shows the typical error. Outcomes & ROI → Forecast calibration replays every unit to check that a predicted 30% chance of RED really happens about 30% of the time, and reports a Brier score and skill. A unit with too little history gets no forecast rather than a guess.'],
  ['What does "Record this plan" do?',
    'It saves the recommended moves and their predicted effect for the target shift. Acuitas later checks the deployments logged for that shift (was the plan followed?) and the reading that came in (did the unit avoid RED?). Comparing followed and unfollowed moves measures what the plan was worth.'],
  ['Where do the dollar figures come from?',
    'From the cost rates in Outcomes & ROI: the cost of a RED unit-shift, labor by source (float, overtime, agency, reassignment), and the cost of an ED boarding hour. The defaults are illustrative; enter your finance team’s figures. Every total is shown as a count times a rate, so it can be checked.'],
  ['What could Acuitas save a hospital in a year?',
    'An illustrative model, not a measured result. Take a hospital with 100 behavioral health RNs, 600 psychiatric patients boarded in the ED and 2,000 behavioral health discharges a year. If RN turnover falls 2 points (2 fewer departures × $61,110), boarders fall 10% (60 × $2,264) and 30-day readmissions fall 10% (30 × $7,200), the total is about $474,000 a year, or $1.42 million over three years. Average costs: NSI 2025 National Health Care Retention & RN Staffing Report; Nicks & Manthey, Emergency Medicine International, 2012; AHRQ HCUP Statistical Brief #189. They are not adjusted for inflation. On your own data, Outcomes & ROI measures the real value at your own rates.'],
  ['Is the follow-up rate an official HEDIS FUH result?',
    'No. It is an operational version of the 7- and 30-day follow-up measure, built to drive follow-up work. It does not apply HEDIS diagnosis, age, enrollment or readmission logic. Exclude readmissions and transfers by hand, and use your certified quality reporting for official submissions.'],
  ['Why are PHQ-9 and GAD-7 here if AcuiPath has its own scale?',
    'AcuiScale and the AcuiPath screen are original, transparent scales built for routing. PHQ-9 and GAD-7 are widely used validated instruments that are free to use. Tracking them over time shows whether patients are improving, and a worsening, severe or self-harm signal reopens the case for a fresh Tier 2 screen.'],
  ['What happens when PHQ-9 item 9 is positive?',
    'The patient goes to the top of the PHQ-9 / GAD-7 view with an urgent flag: complete a suicide risk assessment today, then re-screen Tier 2. The flag supports clinical judgment; it does not replace your organization’s suicide risk protocol.'],
  ['Is the AcuiPath level-of-care scale validated?',
    'Not yet. It is aligned to the concepts behind LOCUS, CASII and ASAM but is an original, unvalidated scale, and the app says so on screen. The outcome loop is designed to build the evidence: it records how placements actually turned out and shows when a threshold looks off.'],
  ['Who can see and change what?',
    'Each role sees only what it needs: charge nurses log shifts and events, outpatient clinicians work AcuiPath, quality & finance see outcomes and costs, viewers are read-only. In the evaluation build roles are self-selected and shape the interface only. Production builds take roles from single sign-on, and the shipped database security rules enforce them on the server.'],
  ['Can the audit log be changed?',
    'Each entry carries the SHA-256 hash of the one before it, so editing or deleting any entry breaks the chain, and Verify chain finds where. On a shared backend the security rules also make the log append-only.'],
  ['Can Acuitas connect to Epic or another EHR?',
    'Yes, for census. Settings → FHIR census import reads a standard FHIR R4 Bundle of admitted Encounters, which Epic, Oracle Health and most interface engines can produce. For a live feed, your interface team schedules that export each shift. Acuity points and staffing still come from the charge nurse.'],
  ['Why does a new unit get no forecast, and why won’t Acuitas pull staff from it?',
    'A forecast needs at least six logged shifts. Before a unit can donate staff it needs a full week (14 shifts), because one quiet reading is not a track record. A new unit can always receive staff.'],
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
          A step-by-step walkthrough of every screen in Acuitas™, from the inpatient board to AcuiPath™ outpatient, with answers to common questions.
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
            The dark sidebar on the left is always visible. Click any item to switch screens. On a shared backend,
            anything you or a teammate enters appears for everyone within a second or two. The sidebar shows only the
            screens your role uses, and your name and role appear at the bottom.
          </div>
          <Illustration label="What the sidebar looks like">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 240 }}>
              {[
                { label: 'Region Status Board', icon: 'grid', active: true },
                { label: 'Command Center', icon: 'trendUp' },
                { label: 'Outcomes & ROI', icon: 'loop' },
                { label: 'Capacity & Safety', icon: 'bed' },
                { label: 'AcuiPath™', icon: 'route' },
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
            <li><b>Command Center</b> — six-shift forecasts, chance of RED, the recommended staffing plan, and the what-if planner.</li>
            <li><b>Outcomes &amp; ROI</b> — whether plans were followed and worked, forecast calibration, and cost.</li>
            <li><b>Capacity &amp; Safety</b> — ED boarding demand against open beds, and safety-event risk by unit.</li>
            <li><b>AcuiPath™</b> — outpatient screening, routing, discharge follow-up, PHQ-9/GAD-7 and outcomes.</li>
            <li><b>New Shift Entry</b> — where staff log census, acuity points, and staffing for AM/PM shifts.</li>
            <li><b>Staff Deployments</b> — a log of who was moved between units and why, for staffing/budget records.</li>
            <li><b>Reports</b> — charts, trends, and downloadable data exports.</li>
            <li><b>AcuiCalc™</b> — score individual patients and push totals directly to ED acuity.</li>
            <li><b>Settings</b> — locations, thresholds, data, FHIR census import, people &amp; access, and the audit log.</li>
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
              sub=""
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

      {/* COMMAND CENTER */}
      <div ref={(el) => (refs.current.command = el)}>
        <Card title="Command Center" sub="Where every unit is heading, and exactly where to move staff">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            The Command Center forecasts each unit six shifts ahead, gives the chance it crosses into RED, and
            recommends a staffing plan. Every forecast is fit to that unit&rsquo;s own history and scored against
            shifts it never saw, and each card says how confident it is and why.
          </div>
          <Step n="1">
            Read the four headline numbers: units at risk, the soonest projected breach, census cap pressure, and
            how many units have enough history to forecast.
          </Step>
          <Step n="2">
            <b>Recommended deployment.</b> Enter how many float staff are available. Choose <b>Act on next shift</b> to
            staff ahead of the predicted surge, or <b>Act on now</b> for the current reading. Each move shows the unit&rsquo;s
            acuity per staff and chance of RED before and after.
          </Step>
          <Step n="3">
            Check the value line under the plan: the RED shifts it is expected to avoid, priced at your cost rates.
          </Step>
          <Step n="4">
            When you act on the plan, choose <b>Record this plan</b>. Acuitas scores it later against the deployments you
            log and the reading that follows. That is the outcome loop in Outcomes &amp; ROI.
          </Step>
          <Step n="5">
            <b>What-if planner.</b> Close beds, add or remove staff, or scale acuity on any unit (or the whole region) and
            see next shift&rsquo;s RED risk and census pressure change, along with the plan Acuitas would recommend. Presets
            cover a region-wide surge, a call-out on every unit, and a bed closure. Nothing in the planner is saved.
          </Step>
          <Illustration label="Reading a unit forecast">
            <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              Solid line: what was logged. Dashed line and shaded band: the prediction and its 80% range. The colored
              strip gives the chance of RED for each of the next six shifts. <b>Why this prediction?</b> names the driver.
              <Pointer>A unit with fewer than six logged shifts gets no forecast, and the card says so</Pointer>
            </div>
          </Illustration>
          <BrandMark />
        </Card>
      </div>

      {/* OUTCOMES */}
      <div ref={(el) => (refs.current.outcomes = el)}>
        <Card title="Outcomes & ROI" sub="Was the advice followed, was it right, and what was it worth?">
          <Step n="1">
            <b>Following the plan</b> compares the RED rate on shifts where the recorded plan was followed with shifts
            where it wasn&rsquo;t. A dark tick on each bar marks what Acuitas predicted, so you can check its own claims.
          </Step>
          <Step n="2">
            <b>Forecast calibration</b> replays each unit&rsquo;s history one shift at a time and checks whether
            &ldquo;30% chance of RED&rdquo; meant RED about 30% of the time. Points on the dashed line are perfectly
            calibrated. The table gives each unit&rsquo;s Brier score (lower is better) and its skill against always
            guessing the unit&rsquo;s base rate.
          </Step>
          <Step n="3">
            <b>Cost &amp; ROI</b> totals RED unit-shifts, deployment labor by source, and ED boarding hours over 7, 30 or 90
            days, each shown as a count times a rate. Open <b>Cost rates</b> to enter your finance figures; the defaults are
            illustrative. Value from followed plans is shown two ways: a model estimate, and an observed estimate once
            there are enough outcomes on both sides.
          </Step>
          <Step n="4">
            <b>Recorded plans</b> lists each plan with every move marked Followed / Partly followed / Not followed, and its
            outcome: Avoided RED, Went RED, or Awaiting reading.
          </Step>
          <Step n="5">
            <b>Outpatient placement outcomes</b> summarizes AcuiPath outcomes and shows any prompt to review a threshold.
          </Step>
          <BrandMark />
        </Card>
      </div>

      {/* CAPACITY & SAFETY */}
      <div ref={(el) => (refs.current.capacity = el)}>
        <Card title="Capacity & Safety" sub="ED boarding demand against open beds, and where the next safety event is likely">
          <Step n="1">
            <b>Beds against ED boarding demand.</b> Teal bars are projected open inpatient beds (each unit&rsquo;s census cap
            minus its forecast census). Violet bars are forecast BH patients boarding in the ED. Each shift is marked OK,
            Tight (under 2 beds of margin) or Boarding, with the chance that demand exceeds open beds.
          </Step>
          <Step n="2">
            To feed it, log <b>BH arrivals</b>, <b>BH patients boarding</b> and <b>boarding hours</b> on ED shift entries,
            and keep census caps current on the Status Board. The forecast appears after about a week of history.
          </Step>
          <Step n="3">
            <b>Safety events by acuity stage</b> shows how often events happen per unit-shift in GREEN, YELLOW and RED,
            and how many times more likely they are on a RED shift. Switch between violence &amp; restraint events and all
            events.
          </Step>
          <Step n="4">
            <b>Next-shift safety risk by unit</b> combines each unit&rsquo;s forecast chance of each stage with those rates
            to give the chance of at least one event next shift.
          </Step>
          <Step n="5">
            <b>Log a safety event</b> by unit, date, shift, type and severity. Never enter patient or staff names.
          </Step>
          <BrandMark />
        </Card>
      </div>

      {/* ACUIPATH */}
      <div ref={(el) => (refs.current.acuipath = el)}>
        <Card title="AcuiPath™ — Outpatient" sub="Two-tier screening, routing, discharge follow-up, measurement-based care and outcomes">
          <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
            AcuiPath has five views, shown as buttons at the top. No patient-identifying information is ever needed:
            use a case number, never a name or MRN.
          </div>
          <Step n="1">
            <b>Screen a patient — Tier 1.</b> A nurse chart review with no patient contact. Check any red flag found in
            the chart. A clean review can be placed directly in the recommended clinic as resident-eligible routine
            outpatient care. Any flag sends the case to Tier 2.
          </Step>
          <Step n="2">
            <b>Tier 2 — in-depth screen</b>, with a phone screen or patient discussion. Rate six dimensions 1–5; every
            rating shows what each level means. The result gives the clinic, whether an attending must be the primary
            physician, an advisory-only PHP/IOP flag, and an acute-safety flag that pulls the case out of routine routing.
          </Step>
          <Step n="3">
            <b>Caseload &amp; assignment</b> matches each case to a provider by role, clinic, specialty, supervision level
            and capacity. Post-discharge bridge cases go first, and new patients go to the least-loaded provider. Administrators
            edit the red-flag triggers, thresholds and clinic list here.
          </Step>
          <Step n="4">
            <b>Discharge bridge.</b> Record each inpatient discharge (de-identified) and add it to the caseload. The worklist
            shows discharges that still need a visit, most urgent first. Book visits, mark them seen, or exclude
            readmissions and transfers. FUH-7 and FUH-30 rates count only windows that have closed.
          </Step>
          <Step n="5">
            <b>PHQ-9 / GAD-7.</b> Record the questionnaires; each item has the standard 0–3 answers. Patients with a
            positive PHQ-9 item 9, a meaningful worsening, or a severe score rise to the top with <b>Re-screen (Tier 2)</b>,
            which reopens their case in Tier 2 and updates it when saved.
          </Step>
          <Step n="6">
            <b>Outcomes.</b> For each case, record first-visit attendance, whether the patient was still in care at 30 days,
            and whether they needed a higher level of care. The breakdown by tier, physician level and clinic shows a
            review prompt when the evidence supports one, for example if Tier 1 direct placements step up much more often.
          </Step>
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
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 8, lineHeight: 1.55 }}>
            <b>ED shifts</b> also take three optional counts: BH arrivals, BH patients boarding, and boarding hours. These
            feed the boarding forecast in Capacity &amp; Safety. If census was imported from your EHR (Settings → FHIR census
            import), it is pre-filled for the matching unit, date and shift; you can change it.
          </div>
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
          <div style={{ fontSize: 12.5, color: theme.sub, marginTop: 8, lineHeight: 1.55 }}>
            Set the <b>Source</b> (float pool, overtime or agency) so Outcomes &amp; ROI can price deployment labor correctly;
            moves from another unit are recorded as reassignments. Deployments logged for a shift also tell the outcome
            loop whether a recorded plan was followed.
          </div>
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
            The Settings screen controls things that affect the whole region: which units exist, their thresholds,
            full data export and import, the FHIR census import, people &amp; access, and the audit log. In the evaluation
            build it is locked with a password held by your administrator; single-sign-on builds rely on your role instead.
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
            backup, or Clear All Data to reset everything (this cannot be undone, so use with care). Exports include
            recorded plans, safety events and all AcuiPath data. <b>Load sample data</b> fills every screen, inpatient and
            outpatient, with a de-identified demonstration region.
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

      {/* ACCESS */}
      <div ref={(el) => (refs.current.access = el)}>
        <Card title="People, Roles & Audit" sub="Who can do what, how sign-in works, and the record of every change">
          <Step n="1">
            <b>Signing in.</b> In the evaluation build, enter your name and choose your role after the access password.
            Use <b>Switch</b> at the bottom of the sidebar to change user. Production builds use your organization&rsquo;s
            single sign-on instead: you sign in once with your work account, and your role comes from your IT groups.
          </Step>
          <Step n="2">
            <b>Roles.</b> Administrator, House supervisor, Charge nurse, Outpatient clinician, Quality &amp; finance, and
            Viewer. Each sees only the screens and actions it needs. Settings → People &amp; access shows the full table.
          </Step>
          <Step n="3">
            <b>Audit log</b> (Settings, for administrators and quality &amp; finance). Every change is recorded: who, in
            which role, what, and when. Choose <b>Verify chain</b> to confirm nothing has been edited or deleted, and
            <b> Export</b> for compliance review.
          </Step>
          <Step n="4">
            <b>FHIR census import</b> (Settings). Load a FHIR Bundle from your EHR, or try the example. Check each FHIR
            location&rsquo;s match to an Acuitas unit, pick the date and shift, and choose <b>Apply census</b>. Logged entries
            get the census; the rest is pre-filled on New Shift Entry.
          </Step>
          <BrandMark />
        </Card>
      </div>

      {/* FAQ */}
      <div ref={(el) => (refs.current.faq = el)}>
        <Card title="Frequently Asked Questions">
          <div style={{ display: 'grid', gap: 6 }}>
            {FAQ.map(([q, a]) => (
              <details key={q} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: '9px 12px', background: theme.panel }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{q}</summary>
                <div style={{ fontSize: 12.8, lineHeight: 1.6, marginTop: 6, color: theme.text }}>{a}</div>
              </details>
            ))}
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
            <li>
              <b>Don&rsquo;t see a screen?</b> The sidebar shows only the screens your role uses. Ask an administrator if you
              need more access.
            </li>
            <li>
              <b>Outcomes look empty?</b> Plans only appear after someone chooses <b>Record this plan</b>, and outcomes fill in
              once the target shift&rsquo;s reading is logged.
            </li>
            <li>
              <b>Want to see everything working?</b> Settings → Load sample data fills every screen with a synthetic region
              and a de-identified outpatient caseload.
            </li>
          </ul>
          <BrandMark />
        </Card>
      </div>
    </div>
  )
}
