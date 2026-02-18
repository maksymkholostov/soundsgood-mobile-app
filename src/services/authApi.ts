import { getFirebaseConfigFromEnv } from '../config/env'
import { createApiClient } from './apiClient'
import { clearBackendToken, setBackendToken } from './tokenStore'
import type { AuthResponseEnvelope } from '../types/auth'

function isEmail(identifier: string) {
  return identifier.includes('@')
}

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

async function firebasePost<T>(path: string, body: any): Promise<T> {
  const { apiKey } = getFirebaseConfigFromEnv()
  const url = `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

  const text = await res.text()
  const json = text ? safeJsonParse(text) : null

  if (!res.ok) {
    const message = String(json?.error?.message || json?.error || json?.message || `HTTP ${res.status}`)
    const err = new Error(message)
    ;(err as any).code = message
    ;(err as any).body = json
    throw err
  }

  return json as T
}

async function firebaseRestSignIn(email: string, password: string) {
  return firebasePost<{ idToken: string; localId: string; email: string }>('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  })
}

async function firebaseRestSignUp(email: string, password: string) {
  return firebasePost<{ idToken: string; localId: string; email: string }>('accounts:signUp', {
    email,
    password,
    returnSecureToken: true,
  })
}

async function firebaseRestSendPasswordReset(email: string) {
  return firebasePost('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email })
}

export async function firebaseLoginAndSync(apiBaseUrl: string, email: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  let idToken: string

  try {
    const signedIn = await firebaseRestSignIn(email.trim(), password)
    idToken = signedIn.idToken
  } catch (e: any) {
    const message = String(e?.message || e)

    const isUserNotFound =
      message.includes('auth/user-not-found') || message.includes('USER_NOT_FOUND')

    // Migration path: if the account exists in backend DB but not in Firebase yet,
    // verify credentials against backend, then create the Firebase user and sync.
    if (isUserNotFound) {
      await backendUsernameLogin(normalizedApiBaseUrl, email.trim(), password)
      const created = await firebaseRestSignUp(email.trim(), password)
      idToken = created.idToken
    } else {
      throw e
    }
  }

  const api = createApiClient({ baseUrl: normalizedApiBaseUrl })
  return api.post<AuthResponseEnvelope>(
    '/auth/firebase/sync',
    {},
    { headers: { Authorization: `Bearer ${idToken}` } },
  )
}

export async function firebaseRegisterAndSync(apiBaseUrl: string, email: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const created = await firebaseRestSignUp(email.trim(), password)
  const idToken = created.idToken

  const api = createApiClient({ baseUrl: normalizedApiBaseUrl })
  return api.post<AuthResponseEnvelope>(
    '/auth/firebase/sync',
    {},
    { headers: { Authorization: `Bearer ${idToken}` } },
  )
}

export async function backendUsernameLogin(apiBaseUrl: string, usernameOrEmail: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const api = createApiClient({ baseUrl: normalizedApiBaseUrl })
  return api.post<any>('/login/auth', { username: usernameOrEmail, password })
}

export async function applyBackendAuthFromEnvelope(envelope: any) {
  const token = envelope?.data?.token || envelope?.data?.data?.token || envelope?.token
  if (typeof token === 'string' && token.length > 0) {
    await setBackendToken(token)
  }
  return token
}

export async function login(apiBaseUrl: string, identifier: string, password: string) {
  const normalized = identifier.trim()
  if (isEmail(normalized)) return firebaseLoginAndSync(apiBaseUrl, normalized, password)
  return backendUsernameLogin(apiBaseUrl, normalized, password)
}

export async function register(apiBaseUrl: string, email: string, password: string) {
  return firebaseRegisterAndSync(apiBaseUrl, email.trim(), password)
}

export async function requestPasswordReset(email: string, continueUrl?: string) {
  // Uses Firebase Identity Toolkit REST API. continueUrl is ignored for now.
  void continueUrl
  await firebaseRestSendPasswordReset(email.trim())
}

export async function logoutEverywhere() {
  await clearBackendToken()
}

