// Acuitas™ data service — who is calling.
//
// The service never runs its own sign-in. It sits behind the organization's
// single sign-on and reads the identity that layer has already verified:
//
//   swa    Azure Static Web Apps with Microsoft Entra ID. SWA signs the user in
//          and passes the verified identity to the API in the
//          x-ms-client-principal header. Clients cannot forge it: SWA replaces
//          it on every request, and the managed API is reachable only through
//          SWA.
//   proxy  An identity-aware proxy (for example oauth2-proxy, or IIS with
//          Windows authentication) in front of the service on-premises. The
//          proxy passes the user and groups in headers it sets itself; the
//          service must not be reachable except through that proxy, and can
//          additionally require a shared secret header from it.
//   dev    Local development and automated tests only. Refused when
//          NODE_ENV=production.
//
// Directory groups or app roles map to Acuitas roles with the same table the
// browser uses (ACUITAS_ROLE_MAP here, VITE_ROLE_MAP in the build), so both
// sides always agree on a person's role.

// Same order and defaults as src/lib/roles.js (a test checks they match).
export const ROLE_ORDER = ['admin', 'supervisor', 'charge', 'screener', 'analyst', 'viewer']
export const DEFAULT_ROLE_MAP = {
  'acuitas-admin': 'admin',
  'acuitas-supervisor': 'supervisor',
  'acuitas-charge': 'charge',
  'acuitas-screener': 'screener',
  'acuitas-analyst': 'analyst',
  'acuitas-viewer': 'viewer',
}

export function parseRoleMap(raw) {
  if (!raw) return DEFAULT_ROLE_MAP
  try {
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw
    const out = {}
    for (const [k, v] of Object.entries(m || {})) if (ROLE_ORDER.includes(v)) out[k] = v
    return Object.keys(out).length ? out : DEFAULT_ROLE_MAP
  } catch {
    return DEFAULT_ROLE_MAP
  }
}

/** Highest-capability Acuitas role among the claims; 'viewer' when none map. */
export function roleFromClaims(claims, roleMap = DEFAULT_ROLE_MAP) {
  const mapped = (claims || []).map(String).map((c) => roleMap[c] || roleMap[c.toLowerCase()]).filter(Boolean)
  return ROLE_ORDER.find((r) => mapped.includes(r)) || 'viewer'
}

function header(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  const v = key ? headers[key] : undefined
  return Array.isArray(v) ? v[0] : v
}

function fromSwa(headers, roleMap) {
  const raw = header(headers, 'x-ms-client-principal')
  if (!raw) return null
  let cp
  try {
    cp = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    return null
  }
  const name = cp?.userDetails
  if (!name) return null
  const claims = (cp.userRoles || []).filter((r) => r !== 'anonymous' && r !== 'authenticated')
  // rolesSource (below) has already turned directory groups into acuitas-*
  // roles, so those names always count, alongside any organization mapping.
  return { name, role: roleFromClaims(claims, { ...DEFAULT_ROLE_MAP, ...roleMap }), claims, source: 'swa' }
}

function fromProxy(headers, roleMap, cfg) {
  if (cfg.proxySecret && header(headers, cfg.proxySecretHeader) !== cfg.proxySecret) return null
  const name = header(headers, cfg.proxyUserHeader)
  if (!name) return null
  const claims = String(header(headers, cfg.proxyGroupsHeader) || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return { name, role: roleFromClaims(claims, roleMap), claims, source: 'proxy' }
}

function fromDev(headers) {
  const name = header(headers, 'x-acuitas-dev-user')
  const role = header(headers, 'x-acuitas-dev-role')
  if (!name || !ROLE_ORDER.includes(role)) return null
  return { name, role, claims: [], source: 'dev' }
}

export function principalConfig(env = process.env) {
  const mode = env.ACUITAS_AUTH || 'swa'
  if (mode === 'dev' && env.NODE_ENV === 'production') {
    throw new Error('ACUITAS_AUTH=dev is for local development only and is refused when NODE_ENV=production.')
  }
  if (!['swa', 'proxy', 'dev'].includes(mode)) throw new Error(`Unknown ACUITAS_AUTH mode "${mode}". Use swa, proxy or dev.`)
  return {
    mode,
    roleMap: parseRoleMap(env.ACUITAS_ROLE_MAP),
    proxyUserHeader: env.ACUITAS_PROXY_USER_HEADER || 'x-forwarded-email',
    proxyGroupsHeader: env.ACUITAS_PROXY_GROUPS_HEADER || 'x-forwarded-groups',
    proxySecretHeader: env.ACUITAS_PROXY_SECRET_HEADER || 'x-acuitas-proxy-secret',
    proxySecret: env.ACUITAS_PROXY_SECRET || '',
  }
}

/** The verified caller, or null when the request carries no identity. */
export function principalFrom(headers, cfg) {
  if (cfg.mode === 'swa') return fromSwa(headers, cfg.roleMap)
  if (cfg.mode === 'proxy') return fromProxy(headers, cfg.roleMap, cfg)
  if (cfg.mode === 'dev') return fromDev(headers)
  return null
}

/**
 * Static Web Apps "rolesSource": SWA calls this after sign-in with the user's
 * token claims and assigns the roles it returns. Entra ID group (or app-role)
 * claims are mapped to acuitas-* roles here, so the browser's /.auth/me and
 * the API both see the same roles.
 */
export function rolesForSignIn(body, roleMap = DEFAULT_ROLE_MAP) {
  const claims = (body?.claims || [])
    .filter((c) => c && (c.typ === 'groups' || c.typ === 'roles' || /\/claims\/(groups|role)$/.test(String(c.typ))))
    .map((c) => String(c.val))
  const role = roleFromClaims(claims, roleMap)
  return { roles: [`acuitas-${role}`] }
}
