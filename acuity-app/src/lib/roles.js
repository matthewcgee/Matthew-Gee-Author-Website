// Acuitas™ Roles & Permissions
//
// Who can do what. Roles shape the interface everywhere. Whether they are also
// a security boundary depends on where the identity comes from:
//
//   local    — the user picks a name and role after the access gate. Good for
//              evaluation and training. It is self-asserted, so the app labels
//              it as a convenience, not access control.
//   gateway  — the app sits behind the organization's single sign-on (for
//              example Microsoft Entra ID via Azure Static Web Apps, or Okta via
//              an identity-aware proxy). Identity and roles come from the IdP,
//              and the gateway blocks anyone who has not signed in.
//   firebase — internal builds on the Firebase backend sign in through Firebase
//              Authentication with an OIDC or SAML provider. Roles are custom
//              claims, which the shipped Firestore security rules enforce on
//              the server.

export const ROLES = {
  admin: { id: 'admin', label: 'Administrator', blurb: 'Everything, including settings, users and the audit log.' },
  supervisor: { id: 'supervisor', label: 'House supervisor', blurb: 'Runs the region: deployments, plans, scenarios, capacity and safety.' },
  charge: { id: 'charge', label: 'Charge nurse', blurb: 'Logs shifts, deployments and safety events for their units.' },
  screener: { id: 'screener', label: 'Outpatient clinician', blurb: 'AcuiPath screening, discharge follow-up, PHQ-9/GAD-7 and outcomes.' },
  analyst: { id: 'analyst', label: 'Quality & finance', blurb: 'Outcomes, cost and ROI, scenarios and the audit log. Read-mostly.' },
  viewer: { id: 'viewer', label: 'Viewer', blurb: 'Read-only access to the boards and reports.' },
}

export const ROLE_ORDER = ['admin', 'supervisor', 'charge', 'screener', 'analyst', 'viewer']

export const PERMISSIONS = {
  view: 'See boards, forecasts and reports',
  'enter-shift': 'Log shift entries',
  deploy: 'Log staff deployments',
  calc: 'Use AcuiCalc and push to ED points',
  'plan-record': 'Record deployment plans for the outcome loop',
  scenario: 'Run what-if scenarios',
  'outcomes-view': 'See outcomes, calibration and ROI',
  'cost-edit': 'Set cost rates',
  'safety-log': 'Log safety events',
  'remove-records': 'Remove logged shift entries, deployments and safety events',
  'op-view': 'See AcuiPath caseloads',
  'op-screen': 'Screen and place outpatient referrals',
  'op-manage': 'Manage providers, clinics, triggers and thresholds',
  discharge: 'Record discharges and follow-up visits',
  mbc: 'Record PHQ-9 and GAD-7',
  'op-outcomes': 'Record outpatient outcomes',
  import: 'Import data, including FHIR census',
  settings: 'Change settings and locations',
  'audit-view': 'See and verify the audit log',
}

const ALL = Object.keys(PERMISSIONS)

const MATRIX = {
  admin: ALL,
  supervisor: ['view', 'enter-shift', 'deploy', 'calc', 'plan-record', 'scenario', 'outcomes-view', 'safety-log', 'remove-records', 'op-view', 'import'],
  charge: ['view', 'enter-shift', 'deploy', 'calc', 'safety-log'],
  screener: ['view', 'op-view', 'op-screen', 'discharge', 'mbc', 'op-outcomes'],
  analyst: ['view', 'scenario', 'outcomes-view', 'cost-edit', 'op-view', 'audit-view'],
  viewer: ['view'],
}

export function permissionsFor(role) {
  return new Set(MATRIX[role] || MATRIX.viewer)
}

export function can(role, permission) {
  return permissionsFor(role).has(permission)
}

// Which tab needs which permission to appear in the navigation.
export const TAB_PERMISSION = {
  status: 'view',
  command: 'view',
  outcomes: 'outcomes-view',
  capacity: 'view',
  levelofcare: 'op-view',
  entry: 'enter-shift',
  deployments: 'deploy',
  reports: 'view',
  calculator: 'calc',
  help: 'view',
  settings: 'settings',
}

export function canSeeTab(role, tabId) {
  const perm = TAB_PERMISSION[tabId]
  return !perm || can(role, perm)
}

/* ---------------------------------------------------- identity from the IdP */

// Default mapping from IdP role or group names to Acuitas roles. An
// organization overrides it with VITE_ROLE_MAP (JSON) to match its own groups.
export const DEFAULT_ROLE_MAP = {
  'acuitas-admin': 'admin',
  'acuitas-supervisor': 'supervisor',
  'acuitas-charge': 'charge',
  'acuitas-screener': 'screener',
  'acuitas-analyst': 'analyst',
  'acuitas-viewer': 'viewer',
}

/**
 * Map an identity document from a sign-in gateway to an Acuitas identity.
 *
 * Understands Azure Static Web Apps' /.auth/me ({ clientPrincipal:
 * { userDetails, userRoles } }) and the common userinfo shape ({ email |
 * preferred_username | name, roles | groups }). When the user holds several
 * mapped roles, the most capable wins. A signed-in user with no mapped role
 * gets 'viewer', never more.
 */
export function identityFromPrincipal(doc, roleMap = DEFAULT_ROLE_MAP) {
  if (!doc) return null
  const cp = doc.clientPrincipal !== undefined ? doc.clientPrincipal : doc
  if (!cp) return null
  const name = cp.userDetails || cp.preferred_username || cp.email || cp.name || cp.sub || null
  if (!name) return null
  const claims = [...(cp.userRoles || []), ...(cp.roles || []), ...(cp.groups || [])].map(String)
  const mapped = claims.map((c) => roleMap[c] || roleMap[c.toLowerCase()]).filter(Boolean)
  const role = ROLE_ORDER.find((r) => mapped.includes(r)) || 'viewer'
  return { name, role, source: 'gateway', claims }
}

export function parseRoleMap(raw) {
  if (!raw) return DEFAULT_ROLE_MAP
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw
    const out = {}
    for (const [k, v] of Object.entries(m || {})) if (ROLES[v]) out[k] = v
    return Object.keys(out).length ? out : DEFAULT_ROLE_MAP
  } catch {
    return DEFAULT_ROLE_MAP
  }
}
