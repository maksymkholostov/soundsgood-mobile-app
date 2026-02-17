import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, initializeAuth, type Auth, type Persistence } from '@firebase/auth'

import { getFirebaseConfigFromEnv } from './env'

const firebaseConfig = getFirebaseConfigFromEnv()

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

// `getReactNativePersistence()` isn't present in the public type surface for all builds.
// Use a minimal AsyncStorage-backed persistence adapter instead.
const asyncStoragePersistence: Persistence = {
  type: 'LOCAL',
  _isAvailable: async () => true,
  _set: async (key: string, value: string) => {
    await AsyncStorage.setItem(key, value)
  },
  _get: async (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  _remove: async (key: string) => {
    await AsyncStorage.removeItem(key)
  },
} as any

function initNativeAuth(): Auth {
  // initializeAuth throws if Auth is already initialized for this app.
  try {
    return initializeAuth(firebaseApp, {
      persistence: asyncStoragePersistence,
    })
  } catch {
    return getAuth(firebaseApp)
  }
}

export const firebaseAuth: Auth = initNativeAuth()
