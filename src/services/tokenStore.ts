import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const TOKEN_KEY = 'soundsgood.backend_jwt'
const ENV_KEY = 'soundsgood.env_override'
const API_BASE_URL_KEY = 'soundsgood.api_base_url_override'

type StoredSettings = {
  envOverride?: string | null
  apiBaseUrlOverride?: string | null
}

function getWebStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export async function getBackendToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getWebStorage()?.getItem(TOKEN_KEY) || null
  }
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function setBackendToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.setItem(TOKEN_KEY, token)
    return
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token)
}

export async function clearBackendToken(): Promise<void> {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(TOKEN_KEY)
    return
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY)
}

export async function getStoredSettings(): Promise<StoredSettings> {
  if (Platform.OS === 'web') {
    const storage = getWebStorage()
    return {
      envOverride: storage?.getItem(ENV_KEY) || null,
      apiBaseUrlOverride: storage?.getItem(API_BASE_URL_KEY) || null,
    }
  }

  const [envOverride, apiBaseUrlOverride] = await Promise.all([
    SecureStore.getItemAsync(ENV_KEY),
    SecureStore.getItemAsync(API_BASE_URL_KEY),
  ])

  return { envOverride, apiBaseUrlOverride }
}

export async function setStoredSettings(settings: StoredSettings): Promise<void> {
  const envOverride = settings.envOverride ?? null
  const apiBaseUrlOverride = settings.apiBaseUrlOverride ?? null

  if (Platform.OS === 'web') {
    const storage = getWebStorage()
    if (!storage) return
    if (envOverride) storage.setItem(ENV_KEY, envOverride)
    else storage.removeItem(ENV_KEY)
    if (apiBaseUrlOverride) storage.setItem(API_BASE_URL_KEY, apiBaseUrlOverride)
    else storage.removeItem(API_BASE_URL_KEY)
    return
  }

  if (envOverride) await SecureStore.setItemAsync(ENV_KEY, envOverride)
  else await SecureStore.deleteItemAsync(ENV_KEY)

  if (apiBaseUrlOverride) await SecureStore.setItemAsync(API_BASE_URL_KEY, apiBaseUrlOverride)
  else await SecureStore.deleteItemAsync(API_BASE_URL_KEY)
}

