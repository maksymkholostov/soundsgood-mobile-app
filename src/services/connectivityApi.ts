import { getFirebaseConfigFromEnv } from '../config/env'

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

async function firebasePost(path: string, body: any) {
  const { apiKey } = getFirebaseConfigFromEnv()
  const url = `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    },
    8000,
  )
  const text = await res.text()
  const json = text ? safeJsonParse(text) : null
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || json?.message || `HTTP ${res.status}`
    throw new Error(String(msg))
  }
  return json
}

export async function testBackendApi(apiBaseUrl: string) {
  const url = `${normalizeApiBaseUrl(apiBaseUrl).replace(/\/+$/, '')}/dashboard/stats`
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    },
    8000,
  )
  const text = await res.text()
  const json = text ? safeJsonParse(text) : null
  if (!res.ok) {
    throw new Error(String(json?.error || json?.message || `HTTP ${res.status}`))
  }
  if (!json?.success) throw new Error(String(json?.error || 'Backend test failed'))
  return json
}

export async function testFirebaseRest() {
  // This does NOT create a user; it only tests that the API key is valid/reachable.
  const identifier = `connectivity-${Date.now()}@example.com`
  const continueUri = 'https://soundsgood.health'
  return firebasePost('accounts:createAuthUri', { identifier, continueUri })
}
