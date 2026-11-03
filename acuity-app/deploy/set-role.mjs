#!/usr/bin/env node
// Acuitas — give people their role on the shared (Firebase) database.
//
// Roles are stored as a Firebase custom claim, acuitasRole, which
// firestore.rules check on every read and write. Run this from a computer
// signed in to Google Cloud as a project owner or Firebase admin:
//
//   gcloud auth application-default login         (once)
//   npm install --no-save firebase-admin          (once)
//
//   node deploy/set-role.mjs --project <project-id> person@hospital.org supervisor
//   node deploy/set-role.mjs --project <project-id> --file deploy/roles.csv
//   node deploy/set-role.mjs --project <project-id> --list
//
// roles.csv is one "email,role" per line (see roles.example.csv).
// Each person must have signed in to Acuitas once (that creates their account),
// and must sign out and back in afterwards for a new role to take effect.

const ROLES = ['admin', 'supervisor', 'charge', 'screener', 'analyst', 'viewer']

function usage(msg) {
  if (msg) console.error(`\n  ${msg}\n`)
  console.error('  Usage:')
  console.error('    node deploy/set-role.mjs --project <id> <email> <role>')
  console.error('    node deploy/set-role.mjs --project <id> --file roles.csv')
  console.error('    node deploy/set-role.mjs --project <id> --list')
  console.error(`  Roles: ${ROLES.join(', ')}  (or "none" to remove a role)\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const take = (flag) => {
  const i = args.indexOf(flag)
  if (i < 0) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const project = take('--project') || process.env.GOOGLE_CLOUD_PROJECT
const file = take('--file')
const list = args.includes('--list')
if (list) args.splice(args.indexOf('--list'), 1)
if (!project) usage('Missing --project <your Firebase project id>.')

let admin
try {
  admin = (await import('firebase-admin')).default
} catch {
  usage('firebase-admin is not installed. Run: npm install --no-save firebase-admin')
}
admin.initializeApp({ projectId: project, credential: admin.credential.applicationDefault() })
const auth = admin.auth()

if (list) {
  let token
  do {
    const page = await auth.listUsers(1000, token)
    for (const u of page.users) console.log(`${u.email || u.uid},${u.customClaims?.acuitasRole || 'viewer (default)'}`)
    token = page.pageToken
  } while (token)
  process.exit(0)
}

let pairs = []
if (file) {
  const { readFileSync } = await import('node:fs')
  pairs = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !/^email\s*,/i.test(l))
    .map((l) => l.split(',').map((s) => s.trim()))
} else if (args.length === 2) {
  pairs = [args]
} else {
  usage()
}

let failed = 0
for (const [email, rawRole] of pairs) {
  const role = String(rawRole || '').toLowerCase()
  if (role !== 'none' && !ROLES.includes(role)) {
    console.error(`✗ ${email}: "${rawRole}" is not a role (${ROLES.join(', ')}, none)`)
    failed++
    continue
  }
  try {
    const user = await auth.getUserByEmail(email)
    const claims = { ...(user.customClaims || {}) }
    if (role === 'none') delete claims.acuitasRole
    else claims.acuitasRole = role
    await auth.setCustomUserClaims(user.uid, claims)
    console.log(`✓ ${email} → ${role}`)
  } catch (err) {
    const why = err?.code === 'auth/user-not-found' ? 'has not signed in to Acuitas yet' : err?.message || err
    console.error(`✗ ${email}: ${why}`)
    failed++
  }
}
if (failed) console.error(`\n${failed} not updated.`)
process.exit(failed ? 1 : 0)
