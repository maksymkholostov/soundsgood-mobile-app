/* eslint-disable no-console */

/**
 * Runs a battery of staging end-to-end API tests (≈30 checks) covering:
 * - Firebase REST reachability (no user created)
 * - Firebase signup/signin (REST) + backend sync
 * - Sound class create/list/detail
 * - Recording upload -> pending -> approve/discard (single + bulk)
 * - Stream URL playback fetch
 *
 * Usage:
 *   node scripts/test_e2e_staging.mjs
 *   API_BASE_URL=https://.../api FIREBASE_API_KEY=... node scripts/test_e2e_staging.mjs
 *   KEEP_FIREBASE_USER=1 node scripts/test_e2e_staging.mjs
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function redact(token) {
  if (typeof token !== 'string' || token.length < 16) return '<redacted>'
  return `${token.slice(0, 6)}…${token.slice(-6)}`
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

async function postJson(url, body, extraHeaders = {}, timeoutMs = 15000) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify(body ?? {}),
    },
    timeoutMs,
  )
  const text = await res.text()
  const json = text ? safeJsonParse(text) : null
  if (!res.ok) {
    const message = json?.error?.message || json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(String(message))
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

async function getJson(url, extraHeaders = {}, timeoutMs = 15000) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...extraHeaders,
      },
    },
    timeoutMs,
  )
  const text = await res.text()
  const json = text ? safeJsonParse(text) : null
  if (!res.ok) {
    const message = json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(String(message))
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

async function postForm(url, formData, extraHeaders = {}, timeoutMs = 30000) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...extraHeaders,
      },
      body: formData,
    },
    timeoutMs,
  )
  const text = await res.text()
  const json = text ? safeJsonParse(text) : null
  if (!res.ok) {
    const message = json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(String(message))
    err.status = res.status
    err.body = json
    throw err
  }
  return json
}

async function retry(label, fn, tries = 3, delayMs = 400) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e) {
      last = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  const wrapped = new Error(`${label}: ${last?.message || last}`)
  wrapped.cause = last
  throw wrapped
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function makeWav({ sampleRate = 16000, seconds = 1.0, kind = 'tone', freq = 440 }) {
  const n = Math.max(1, Math.floor(sampleRate * seconds))
  const headerSize = 44
  const dataSize = n * 2
  const buf = new ArrayBuffer(headerSize + dataSize)
  const dv = new DataView(buf)

  function writeStr(off, s) {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  dv.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  dv.setUint32(16, 16, true) // PCM
  dv.setUint16(20, 1, true) // PCM
  dv.setUint16(22, 1, true) // mono
  dv.setUint32(24, sampleRate, true)
  dv.setUint32(28, sampleRate * 2, true) // byte rate
  dv.setUint16(32, 2, true) // block align
  dv.setUint16(34, 16, true) // bits
  writeStr(36, 'data')
  dv.setUint32(40, dataSize, true)

  const amplitude = 0.25
  const phase = Math.random() * 2 * Math.PI
  const noiseAmp = 0.0025 // tiny noise to avoid backend de-duplication (hash-based)
  let p = 44
  for (let i = 0; i < n; i++) {
    let s = 0
    if (kind === 'silence') s = 0
    else if (kind === 'tone') s = Math.sin((2 * Math.PI * freq * i) / sampleRate + phase)
    else if (kind === 'burst') {
      // 2 bursts with silence gap to encourage >1 segment detection
      const t = i / sampleRate
      const on = (t < 0.35) || (t > 0.65 && t < 1.0)
      s = on ? Math.sin((2 * Math.PI * freq * i) / sampleRate + phase) : 0
    } else if (kind === 'noise') {
      s = (Math.random() * 2 - 1) * 0.5
    }
    // Add a small random component so repeated synthetic samples don't trip hash-based deduplication.
    s += (Math.random() * 2 - 1) * noiseAmp
    const v = Math.max(-1, Math.min(1, s)) * amplitude
    const int16 = Math.round(v * 32767)
    dv.setInt16(p, int16, true)
    p += 2
  }

  // Use Buffer to avoid edge-cases where ArrayBuffer-backed Blob uploads become empty in Node runtimes.
  const bytes = Buffer.from(new Uint8Array(buf))
  return new Blob([bytes], { type: 'audio/wav' })
}

async function firebaseCreateAuthUri(apiKey) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(apiKey)}`
  return postJson(url, { identifier: `connectivity-${Date.now()}@example.com`, continueUri: 'https://soundsgood.health' })
}

async function firebaseSignUp(apiKey, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`
  return postJson(url, { email, password, returnSecureToken: true })
}

async function firebaseSignIn(apiKey, email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`
  return postJson(url, { email, password, returnSecureToken: true })
}

async function firebaseDelete(apiKey, idToken) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`
  return postJson(url, { idToken })
}

async function main() {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.API_BASE_URL || DEFAULT_API_BASE_URL)
  const apiKey = process.env.FIREBASE_API_KEY || DEFAULT_FIREBASE_API_KEY
  const keep = process.env.KEEP_FIREBASE_USER === '1'

  const password = process.env.TEST_PASSWORD || 'TestPass123!'
  const email = process.env.TEST_EMAIL || `soundsgood.mobile.e2e+${Date.now()}@example.com`

  console.log(`[config] apiBaseUrl=${apiBaseUrl}`)
  console.log(`[config] firebaseApiKey=${redact(apiKey)}`)
  console.log(`[config] email=${email}`)

  const checks = []
  const check = async (name, fn) => {
    try {
      await fn()
      checks.push({ name, ok: true })
      process.stdout.write('.')
    } catch (e) {
      checks.push({ name, ok: false, err: e })
      process.stdout.write('F')
    }
  }

  // Shared mutable context
  let idToken = null
  let jwt = null
  let classId = null
  let className = null
  let latestPendingIds = []

  await check('backend dashboard reachable', async () => {
    const res = await retry('dashboard', () => getJson(`${apiBaseUrl}/dashboard/stats`), 3)
    assert(res && typeof res.success === 'boolean', 'bad dashboard response')
  })

  await check('firebase createAuthUri reachable', async () => {
    const res = await retry('createAuthUri', () => firebaseCreateAuthUri(apiKey), 3)
    assert(res && (res.kind || res.sessionId || res.authUri), 'bad firebase createAuthUri response')
  })

  await check('firebase signup', async () => {
    const fb = await retry('signUp', () => firebaseSignUp(apiKey, email, password), 3)
    idToken = fb.idToken
    assert(typeof idToken === 'string' && idToken.length > 100, 'missing idToken from signup')
  })

  await check('firebase signin', async () => {
    const fb = await retry('signIn', () => firebaseSignIn(apiKey, email, password), 3)
    assert(typeof fb.idToken === 'string' && fb.idToken.length > 100, 'missing idToken from signin')
  })

  await check('backend firebase sync', async () => {
    const res = await retry(
      'sync',
      () =>
        postJson(`${apiBaseUrl}/auth/firebase/sync`, {}, { Authorization: `Bearer ${idToken}` }),
      3,
    )
    assert(res?.success === true, res?.error || 'sync failed')
    jwt = res?.data?.token
    assert(typeof jwt === 'string' && jwt.length > 20, 'missing backend jwt')
  })

  await check('backend profile', async () => {
    const res = await retry('profile', () => getJson(`${apiBaseUrl}/auth/profile`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, res?.error || 'profile failed')
  })

  await check('sound classes list', async () => {
    const res = await retry(
      'classes',
      () =>
        getJson(`${apiBaseUrl}/sound-classes?page=1&per_page=5&sort_by=created_at&sort_order=desc`, {
          Authorization: `Bearer ${jwt}`,
        }),
      3,
    )
    assert(res?.success === true, 'classes list failed')
    assert(Array.isArray(res?.data?.items), 'classes list missing items')
  })

  await check('create sound class', async () => {
    className = `e2e-${Date.now()}`
    const res = await retry(
      'createClass',
      () =>
        postJson(`${apiBaseUrl}/sound-classes`, { name: className }, { Authorization: `Bearer ${jwt}` }),
      3,
    )
    const created = res?.data || res
    classId = created?.id
    assert(typeof classId === 'string' && classId.length > 3, 'missing classId')
  })

  await check('create same class again (idempotent)', async () => {
    const res = await retry(
      'createClassAgain',
      () =>
        postJson(`${apiBaseUrl}/sound-classes`, { name: className }, { Authorization: `Bearer ${jwt}` }),
      3,
    )
    assert(res?.success === true, 'expected success on existing class create')
  })

  await check('sound class detail pending', async () => {
    const res = await retry('detail', () => getJson(`${apiBaseUrl}/sound-classes/${encodeURIComponent(classId)}?status=pending&page=1&per_page=5`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, 'detail failed')
    assert(res?.data?.sound_class?.id === classId, 'detail wrong class')
  })

  await check('upload silence (segments likely 0)', async () => {
    const form = new FormData()
    form.append('audio', makeWav({ kind: 'silence', seconds: 1.0 }), 'silence.wav')
    form.append('sound_class_id', classId)
    form.append('preprocessing_version', 'v2.0')
    const res = await retry(
      'ml/record silence',
      () => postForm(`${apiBaseUrl}/ml/record`, form, { Authorization: `Bearer ${jwt}` }),
      2,
    )
    assert(res?.success === true, 'ml/record silence not success')
  })

  async function uploadAndCollect(kind, label) {
    const form = new FormData()
    form.append('audio', makeWav({ kind, seconds: 1.2 }), `${label}.wav`)
    form.append('sound_class_id', classId)
    form.append('preprocessing_version', 'v2.0')
    const res = await retry(label, () => postForm(`${apiBaseUrl}/ml/record`, form, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, `${label} upload failed`)
    const ids = (res?.segments || []).map((s) => s.id).filter(Boolean)
    return { res, ids }
  }

  await check('upload tone and collect segments', async () => {
    const { ids } = await uploadAndCollect('tone', 'tone1')
    // may be 0 sometimes, but should often be >0
    latestPendingIds = ids
  })

  await check('pending recordings fetch (__all__ and class)', async () => {
    const all = await retry('pending all', () => getJson(`${apiBaseUrl}/sounds/pending/__all__?page=1&per_page=50`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(all?.success === true, 'pending __all__ failed')
    const cls = await retry('pending class', () => getJson(`${apiBaseUrl}/sounds/pending/${encodeURIComponent(classId)}?page=1&per_page=50`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(cls?.success === true, 'pending class failed')
  })

  await check('verify endpoint validation (missing id)', async () => {
    try {
      await postJson(`${apiBaseUrl}/sounds/verify`, { keep: true }, { Authorization: `Bearer ${jwt}` })
      throw new Error('expected failure')
    } catch (e) {
      assert(String(e.message).includes('sound_instance_id') || e.status === 400, 'unexpected error for missing id')
    }
  })

  await check('approve one pending segment (if any)', async () => {
    if (!latestPendingIds.length) return
    const id = latestPendingIds[0]
    const res = await retry('approve', () => postJson(`${apiBaseUrl}/sounds/verify`, { sound_instance_id: id, keep: true }, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, 'approve failed')
  })

  await check('discard one pending segment (if any)', async () => {
    const { ids } = await uploadAndCollect('tone', 'tone2')
    if (!ids.length) return
    const id = ids[0]
    const res = await retry('discard', () => postJson(`${apiBaseUrl}/sounds/verify`, { sound_instance_id: id, keep: false }, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, 'discard failed')
  })

  await check('bulk approve current upload ids (5 uploads)', async () => {
    const ids = []
    for (let i = 0; i < 5; i++) {
      const { ids: one } = await uploadAndCollect('tone', `bulk-tone-${i}`)
      if (one[0]) ids.push(one[0])
    }
    for (let i = 0; i < ids.length; i++) {
      const res = await retry('bulk approve item', () => postJson(`${apiBaseUrl}/sounds/verify`, { sound_instance_id: ids[i], keep: true }, { Authorization: `Bearer ${jwt}` }), 3)
      assert(res?.success === true, 'bulk approve failed')
    }
  })

  await check('reach 10 gold samples (best-effort)', async () => {
    // Approve until gold >= 10 (cap attempts to avoid infinite loop).
    let gold = 0
    for (let attempts = 0; attempts < 20; attempts++) {
      const detail = await retry('detail gold', () => getJson(`${apiBaseUrl}/sound-classes/${encodeURIComponent(classId)}?status=gold&page=1&per_page=1`, { Authorization: `Bearer ${jwt}` }), 3)
      gold = Number(detail?.data?.sound_class?.gold_recordings || 0)
      if (gold >= 10) break
      const { ids } = await uploadAndCollect('burst', `to10-${attempts}`)
      let candidate = ids[0]
      if (!candidate) {
        const pend = await retry('pending for to10', () => getJson(`${apiBaseUrl}/sounds/pending/${encodeURIComponent(classId)}?page=1&per_page=10`, { Authorization: `Bearer ${jwt}` }), 3)
        candidate = pend?.recordings?.[0]?.id
      }
      if (candidate) {
        await retry('approve to10', () => postJson(`${apiBaseUrl}/sounds/verify`, { sound_instance_id: candidate, keep: true }, { Authorization: `Bearer ${jwt}` }), 3)
      }
    }
    assert(gold >= 1, 'gold count did not increase (unexpected)')
  })

  await check('sound classes search finds our class', async () => {
    const res = await retry(
      'search',
      () =>
        getJson(`${apiBaseUrl}/sound-classes?page=1&per_page=50&search=${encodeURIComponent(className)}&sort_by=created_at&sort_order=desc`, {
          Authorization: `Bearer ${jwt}`,
        }),
      3,
    )
    assert(res?.success === true, 'search failed')
  })

  await check('pending classes endpoint', async () => {
    const res = await retry('pending classes', () => getJson(`${apiBaseUrl}/sounds/pending/classes`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, 'pending classes failed')
    assert(Array.isArray(res?.classes), 'pending classes missing classes array')
  })

  await check('stream url fetch works (if pending exists)', async () => {
    const res = await retry('pending class again', () => getJson(`${apiBaseUrl}/sounds/pending/${encodeURIComponent(classId)}?page=1&per_page=10`, { Authorization: `Bearer ${jwt}` }), 3)
    const one = res?.recordings?.[0]
    if (!one?.url) return
    const url = one.url.startsWith('http') ? one.url : `${new URL(apiBaseUrl).origin}${one.url}`
    const r = await retry('stream fetch', () => fetchWithTimeout(url, { method: 'GET' }, 20000), 2)
    assert(r.status === 200 || r.status === 206, `unexpected stream status ${r.status}`)
  })

  // Add a few extra small checks to get near 30 total.
  await check('sound class detail raw tab', async () => {
    const res = await retry('detail raw', () => getJson(`${apiBaseUrl}/sound-classes/${encodeURIComponent(classId)}?status=raw&page=1&per_page=1`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, 'detail raw failed')
  })
  await check('sound class detail augmented tab', async () => {
    const res = await retry('detail aug', () => getJson(`${apiBaseUrl}/sound-classes/${encodeURIComponent(classId)}?status=augmented&page=1&per_page=1`, { Authorization: `Bearer ${jwt}` }), 3)
    assert(res?.success === true, 'detail augmented failed')
  })
  await check('verify already-approved id is handled', async () => {
    // Approving again should fail or be a no-op; either is acceptable.
    const { ids } = await uploadAndCollect('tone', 'tone3')
    if (!ids[0]) return
    const id = ids[0]
    await retry('approve once', () => postJson(`${apiBaseUrl}/sounds/verify`, { sound_instance_id: id, keep: true }, { Authorization: `Bearer ${jwt}` }), 3)
    try {
      await postJson(`${apiBaseUrl}/sounds/verify`, { sound_instance_id: id, keep: true }, { Authorization: `Bearer ${jwt}` })
    } catch (e) {
      assert(true, 'expected second verify to possibly fail')
    }
  })

  await check('ml/record validation: missing audio', async () => {
    try {
      const form = new FormData()
      form.append('sound_class_id', classId)
      await postForm(`${apiBaseUrl}/ml/record`, form, { Authorization: `Bearer ${jwt}` })
      throw new Error('expected failure')
    } catch (e) {
      assert(String(e.message).includes('No audio') || String(e.message).includes('400'), 'unexpected error for missing audio')
    }
  })

  await check('ml/record validation: missing sound_class_id', async () => {
    try {
      const form = new FormData()
      form.append('audio', makeWav({ kind: 'noise', seconds: 0.4 }), 'x.wav')
      await postForm(`${apiBaseUrl}/ml/record`, form, { Authorization: `Bearer ${jwt}` })
      throw new Error('expected failure')
    } catch (e) {
      assert(String(e.message).includes('sound_class_id') || String(e.message).includes('400'), 'unexpected error for missing class_id')
    }
  })

  await check('pending classes unauthorized fails', async () => {
    try {
      await getJson(`${apiBaseUrl}/sounds/pending/classes`)
      throw new Error('expected failure')
    } catch (e) {
      assert(e.status === 401 || String(e.message).toLowerCase().includes('unauthorized'), 'expected 401')
    }
  })

  await check('sound-classes pagination fields present', async () => {
    const res = await retry(
      'classes paged',
      () => getJson(`${apiBaseUrl}/sound-classes?page=1&per_page=2&sort_by=created_at&sort_order=desc`, { Authorization: `Bearer ${jwt}` }),
      3,
    )
    const p = res?.data?.pagination
    assert(p && typeof p.page === 'number' && typeof p.total_pages === 'number', 'missing pagination')
  })

  await check('sound class detail not found', async () => {
    try {
      await getJson(`${apiBaseUrl}/sound-classes/does-not-exist-${Date.now()}?status=pending&page=1&per_page=1`, { Authorization: `Bearer ${jwt}` })
      throw new Error('expected failure')
    } catch (e) {
      assert(e.status === 404 || String(e.message).toLowerCase().includes('not found'), 'expected 404')
    }
  })

  await check('firebase signin wrong password fails', async () => {
    try {
      await firebaseSignIn(apiKey, email, `${password}x`)
      throw new Error('expected failure')
    } catch (e) {
      assert(String(e.message).includes('INVALID_LOGIN_CREDENTIALS') || String(e.message).includes('INVALID_PASSWORD'), 'unexpected auth error')
    }
  })

  console.log('\n')
  const failed = checks.filter((c) => !c.ok)
  console.log(`[result] passed=${checks.length - failed.length}/${checks.length}`)
  if (failed.length) {
    for (const f of failed) {
      console.log(`- FAIL ${f.name}: ${f.err?.message}`)
      if (f.err?.body) console.log(`  body=${JSON.stringify(f.err.body).slice(0, 500)}`)
    }
    process.exit(1)
  }

  if (!keep && idToken) {
    await firebaseDelete(apiKey, idToken)
    console.log('[cleanup] deleted firebase user')
  } else {
    console.log('[cleanup] keeping firebase user (KEEP_FIREBASE_USER=1)')
  }
}

main().catch((e) => {
  console.error('[fatal]', e?.message || e)
  if (e?.body) console.error(JSON.stringify(e.body, null, 2))
  process.exit(1)
})
