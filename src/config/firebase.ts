import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, type Auth } from '@firebase/auth'

import { getFirebaseConfigFromEnv } from './env'

const firebaseConfig = getFirebaseConfigFromEnv()

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const firebaseAuth: Auth = getAuth(firebaseApp)
