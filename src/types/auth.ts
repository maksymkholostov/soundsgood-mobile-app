export type BackendUser = {
  id: string
  username?: string
  email?: string
  is_admin?: boolean
  created_at?: string | null
  updated_at?: string | null
}

export type AuthResponse = {
  user: BackendUser
  token: string
}

// Most backend APIs return { success, data?, error?, message? }.
export type ApiEnvelope<T> = {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export type AuthResponseEnvelope = ApiEnvelope<AuthResponse>

