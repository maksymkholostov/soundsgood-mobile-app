import Constants from 'expo-constants'

export type AppEnvName = 'local' | 'staging' | 'prod'

type ExtraConfig = {
  apiBaseUrl?: string
  envName?: AppEnvName
  firebase?: {
    apiKey?: string
    authDomain?: string
    projectId?: string
    storageBucket?: string
    messagingSenderId?: string
    appId?: string
  }
}

function getExtra(): ExtraConfig {
  const expoConfig = Constants.expoConfig
  const extra = (expoConfig?.extra || {}) as ExtraConfig
  return extra
}

export function getDefaultEnvName(): AppEnvName {
  const extra = getExtra()
  return (
    extra.envName ||
    (process.env.EXPO_PUBLIC_ENV_NAME as AppEnvName | undefined) ||
    'staging'
  )
}

export function getDefaultApiBaseUrl(): string {
  const extra = getExtra()
  return (
    extra.apiBaseUrl ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    'http://localhost:3003/api'
  )
}

export function getFirebaseConfigFromEnv() {
  const extra = getExtra()

  // Defaults match the current web project config; these values are public identifiers.
  return {
    apiKey:
      extra.firebase?.apiKey ||
      process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
      'AIzaSyALd2fIp-RFco92lQvDfY-I6fUQZrJYVAk',
    authDomain:
      extra.firebase?.authDomain ||
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
      'soundclassifiers-prod.firebaseapp.com',
    projectId:
      extra.firebase?.projectId ||
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
      'soundclassifiers-prod',
    storageBucket:
      extra.firebase?.storageBucket ||
      process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      'soundclassifiers-prod.firebasestorage.app',
    messagingSenderId:
      extra.firebase?.messagingSenderId ||
      process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      '896365702413',
    appId:
      extra.firebase?.appId ||
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
      '1:896365702413:web:f095092c8d9ff13e4c9444',
  }
}

