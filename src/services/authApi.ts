import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from '@firebase/auth'

import { firebaseAuth } from '../config/firebase'
import { createApiClient } from './apiClient'
import { setBackendToken, clearBackendToken } from './tokenStore'
import type { AuthResponseEnvelope } from '../types/auth'

function isEmail(identifier: string) {
  return identifier.includes('@')
}

function normalizeApiBaseUrl(apiBaseUrl: string) {
  // Accept either ".../api" or "..." and normalize to ".../api"
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

export async function firebaseLoginAndSync(apiBaseUrl: string, email: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  let credential
  try {
    credential = await signInWithEmailAndPassword(firebaseAuth, email, password)
  } catch (e: any) {
    const code = String(e?.code || '')
    const message = String(e?.message || '')

    const isUserNotFound =
      code === 'auth/user-not-found' || message.includes('auth/user-not-found') || message.includes('USER_NOT_FOUND')

    // Migration path: if the account exists in backend DB but not in Firebase yet,
    // verify credentials against backend, then create the Firebase user and sync.
    if (isUserNotFound) {
      await backendUsernameLogin(normalizedApiBaseUrl, email.trim(), password)
      credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
    } else {
      throw e
    }
  }

  const idToken = await credential.user.getIdToken()

  const api = createApiClient({ baseUrl: normalizedApiBaseUrl })
  const res = await api.post<AuthResponseEnvelope>(
    '/auth/firebase/sync',
    {},
    { headers: { Authorization: `Bearer ${idToken}` } }
  )
  return res
}

export async function firebaseRegisterAndSync(apiBaseUrl: string, email: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password)
  const idToken = await credential.user.getIdToken()

  const api = createApiClient({ baseUrl: normalizedApiBaseUrl })
  const res = await api.post<AuthResponseEnvelope>(
    '/auth/firebase/sync',
    {},
    { headers: { Authorization: `Bearer ${idToken}` } }
  )
  return res
}

export async function backendUsernameLogin(apiBaseUrl: string, usernameOrEmail: string, password: string) {
  const normalizedApiBaseUrl = normalizeApiBaseUrl(apiBaseUrl)
  const api = createApiClient({ baseUrl: normalizedApiBaseUrl })
  // Backend expects /api/login/auth with { username, password } (and also supports email)
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
  if (isEmail(normalized)) {
    return firebaseLoginAndSync(apiBaseUrl, normalized, password)
  }
  return backendUsernameLogin(apiBaseUrl, normalized, password)
}

export async function register(apiBaseUrl: string, email: string, password: string) {
  return firebaseRegisterAndSync(apiBaseUrl, email.trim(), password)
}

export async function requestPasswordReset(email: string, continueUrl?: string) {
  // Firebase handles email sending; in web we use a continueUrl to our /reset-password.
  // For mobile, you can pass a deep-link URL when ready (e.g. soundsgood://reset-password).
  const options = continueUrl ? { url: continueUrl, handleCodeInApp: true } : undefined
  await sendPasswordResetEmail(firebaseAuth, email.trim(), options as any)
}

export async function logoutEverywhere() {
  await clearBackendToken()
  try {
    await signOut(firebaseAuth)
  } catch {
    // ignore
  }
}
