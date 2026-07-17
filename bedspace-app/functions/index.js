// Optional Cloud Functions for BedSpace — the "Server-Side Confidentiality"
// upgrade described in HANDOFF.md. Deploy these once you have a real Firebase
// project so the disallowed-resident list is genuinely confidential (never
// downloaded by hospital-side clients at all), not just hidden in the UI.
//
// Deploy with:
//   firebase deploy --only functions
//
// Before deploying, set the Bethesda PIN hash as a runtime secret:
//   firebase functions:secrets:set BETHESDA_PIN_HASH
// (paste the SHA-256 hex digest of the PIN — see HANDOFF.md for how to
// generate it; use the same value already in src/components/BethesdaLock.jsx
// so both gates accept the same PIN.)

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const crypto = require('crypto')

admin.initializeApp()
const db = admin.firestore()

const BETHESDA_PIN_HASH = defineSecret('BETHESDA_PIN_HASH')

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

// Called by BethesdaLock.jsx after the user enters the correct PIN, so the
// resulting Firebase Auth ID token carries role: "bethesda" and Firestore
// security rules can enforce access to disallowedList/screeningLog server-side.
exports.claimBethesdaRole = onCall({ secrets: [BETHESDA_PIN_HASH] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const pin = request.data?.pin || ''
  if (sha256(pin) !== BETHESDA_PIN_HASH.value()) {
    throw new HttpsError('permission-denied', 'Incorrect PIN.')
  }
  await admin.auth().setCustomUserClaims(request.auth.uid, { role: 'bethesda' })
  return { ok: true }
})

// Called from the Screening tool / Admit form instead of reading
// disallowedList directly. Hospital-side clients call this and only ever
// receive one of three outcomes — the list itself never leaves this function.
exports.screenResident = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const query = normalizeName(request.data?.name)
  if (!query) return { result: null }

  const snap = await db.collection('disallowedList').get()

  for (const doc of snap.docs) {
    const target = normalizeName(doc.data().name)
    if (target && target === query) {
      return { result: 'not_accepted', matchedEntryId: doc.id }
    }
  }

  let bestDistance = Infinity
  let bestId = null
  for (const doc of snap.docs) {
    const target = normalizeName(doc.data().name)
    if (!target) continue
    const threshold = target.length <= 5 ? 1 : 2
    const distance = levenshtein(query, target)
    if (distance <= threshold && distance < bestDistance) {
      bestDistance = distance
      bestId = doc.id
    }
  }
  if (bestId) return { result: 'possible_match', matchedEntryId: bestId }

  return { result: 'accepted', matchedEntryId: null }
})
