import { getApp, getApps, initializeApp } from 'firebase/app'
import { browserLocalPersistence, getAuth, setPersistence, type Auth } from 'firebase/auth'
import { Platform } from 'react-native'

import { getFirebaseConfigFromEnv } from './env'

const firebaseConfig = getFirebaseConfigFromEnv()

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const firebaseAuth: Auth = getAuth(firebaseApp)

if (Platform.OS === 'web') {
  // Best-effort persistence on web.
  setPersistence(firebaseAuth, browserLocalPersistence).catch(() => {})
}
