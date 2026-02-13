/* eslint-disable no-console */

/**
 * End-to-end auth smoke test:
 * 1) Create (or sign in) a Firebase email/password user via REST
 * 2) Call backend `/api/auth/firebase/sync` with Firebase ID token
 * 3) Call backend `/api/auth/profile` with backend JWT to confirm auth wiring
 * 4) Optionally delete the Firebase user (default: delete)
 *
 * Usage:
 *   API_BASE_URL=https://.../api node scripts/test_auth_staging.mjs
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=... node scripts/test_auth_staging.mjs
 *   KEEP_FIREBASE_USER=1 node scripts/test_auth_staging.mjs
 */

const DEFAULT_API_BASE_URL =
  'https://soundclassifiers-backend-staging-896365702413.us-central1.run.app/api'

const DEFAULT_FIREBASE_API_KEY = 'AIzaSyALd2fIp-RFco92lQvDfY-I6fUQZrJYVAk'

function normalizeApiBaseUrl(apiBaseUrl) {
  const trimmed = String(apiBaseUrl || '').replace(/\/+$/, '')
  if (!trimmed) return DEFAULT_API_BASE_URL
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

function redactToken(token) {
  if (typeof token !== 'string' || token.length < 16) return '<redacted>'
  return `${token.slice(0, 6)}…${token.slice(-6)}`
}

async function postJson(url, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body ?? {}),
  })

  const text = await res.text()
  const json = text ? safeJsonParse(text) : null

  if (!res.ok) {
    const message =
      json?.error?.message || json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.body = json
    throw err
  }

  return json
}

async function getJson(url, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...extraHeaders,
    },
  })

  const text = await res.text()
  const json = text ? safeJsonParse(text) : null

  if (!res.ok) {
    const message = json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.body = json
    throw err
  }

  return json
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function firebaseHeaders() {
  // If the API key is restricted by HTTP referrer, set FIREBASE_REFERER to an allowed origin.
  const ref = process.env.FIREBASE_REFERER
  return ref ? { Referer: ref } : {}
}

async function firebaseSignUp(apiKey, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`
  return postJson(
    url,
    { email, password, returnSecureToken: true },
    firebaseHeaders()
  )
}

async function firebaseSignIn(apiKey, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`
  return postJson(
    url,
    { email, password, returnSecureToken: true },
    firebaseHeaders()
  )
}

async function firebaseDelete(apiKey, idToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`
  return postJson(url, { idToken }, firebaseHeaders())
}

async function main() {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.API_BASE_URL || DEFAULT_API_BASE_URL)
  const firebaseApiKey = process.env.FIREBASE_API_KEY || DEFAULT_FIREBASE_API_KEY

  const password = process.env.TEST_PASSWORD || 'TestPass123!'
  const email =
    process.env.TEST_EMAIL ||
    `soundsgood.mobile.test+${Date.now()}@example.com`

  console.log(`[config] apiBaseUrl=${apiBaseUrl}`)
  console.log(`[config] firebaseApiKey=${firebaseApiKey ? redactToken(firebaseApiKey) : '<missing>'}`)
  console.log(`[config] email=${email}`)

  let firebase
  try {
    firebase = await firebaseSignUp(firebaseApiKey, email, password)
    console.log('[firebase] created user')
  } catch (e) {
    const message = String(e?.message || e)
    if (message.includes('EMAIL_EXISTS')) {
      firebase = await firebaseSignIn(firebaseApiKey, email, password)
      console.log('[firebase] signed in existing user')
    } else {
      throw e
    }
  }

  const idToken = firebase?.idToken
  if (!idToken) throw new Error('Firebase did not return idToken')
  console.log(`[firebase] idToken=${redactToken(idToken)}`)

  const sync = await postJson(
    `${apiBaseUrl}/auth/firebase/sync`,
    {},
    { Authorization: `Bearer ${idToken}` }
  )
  if (!sync?.success) throw new Error(sync?.error || 'Backend sync failed')

  const backendJwt = sync?.data?.token
  const backendUser = sync?.data?.user
  if (!backendJwt) throw new Error('Backend did not return JWT token from sync')

  console.log(`[backend] sync ok user=${backendUser?.email || backendUser?.username || '<unknown>'}`)
  console.log(`[backend] jwt=${redactToken(backendJwt)}`)

  const profile = await getJson(`${apiBaseUrl}/auth/profile`, {
    Authorization: `Bearer ${backendJwt}`,
  })

  if (!profile?.success) throw new Error(profile?.error || 'Profile fetch failed')
  console.log(`[backend] profile ok email=${profile?.user?.email || '<none>'} username=${profile?.user?.username || '<none>'}`)

  const keep = process.env.KEEP_FIREBASE_USER === '1'
  if (!keep) {
    await firebaseDelete(firebaseApiKey, idToken)
    console.log('[firebase] deleted user (KEEP_FIREBASE_USER=1 to keep it)')
  } else {
    console.log('[firebase] keeping user (KEEP_FIREBASE_USER=1)')
  }

  console.log('[done] auth flow looks healthy')
}

main().catch((e) => {
  console.error('[error]', e?.message || e)
  if (e?.body) console.error('[error:body]', JSON.stringify(e.body, null, 2))
  process.exit(1)
})

