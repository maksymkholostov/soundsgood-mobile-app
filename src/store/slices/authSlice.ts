import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

import type { RootState } from '../store'
import type { BackendUser } from '../../types/auth'
import { clearBackendToken, getBackendToken } from '../../services/tokenStore'
import { applyBackendAuthFromEnvelope, login, logoutEverywhere, register, requestPasswordReset } from '../../services/authApi'
import { createApiClient } from '../../services/apiClient'

export type AuthState = {
  isLoaded: boolean
  isAuthenticated: boolean
  token: string | null
  user: BackendUser | null
  isLoading: boolean
  error: string | null
  lastResetEmailSentTo: string | null
}

const initialState: AuthState = {
  isLoaded: false,
  isAuthenticated: false,
  token: null,
  user: null,
  isLoading: false,
  error: null,
  lastResetEmailSentTo: null,
}

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

export const bootstrapAuth = createAsyncThunk('auth/bootstrap', async (_, { getState }) => {
  const token = await getBackendToken()
  const apiBaseUrl = normalizeApiBaseUrl((getState() as RootState).settings.apiBaseUrl)

  if (!token) {
    return { token: null, user: null }
  }

  // Best-effort profile load; if it fails, treat as signed-out.
  try {
    const api = createApiClient({ baseUrl: apiBaseUrl })
    const res = await api.get<{ success: boolean; user?: BackendUser; error?: string }>('/auth/profile')
    if (res?.success && res.user) {
      return { token, user: res.user }
    }
  } catch {
    // ignore
  }

  await clearBackendToken()
  return { token: null, user: null }
})

export const loginUser = createAsyncThunk(
  'auth/login',
  async (payload: { identifier: string; password: string }, { getState, rejectWithValue }) => {
    try {
      const apiBaseUrl = (getState() as RootState).settings.apiBaseUrl
      const res = await login(apiBaseUrl, payload.identifier, payload.password)
      if (!res?.success) {
        return rejectWithValue(res?.error || 'Login failed')
      }
      const token = await applyBackendAuthFromEnvelope(res)
      const user = res.data?.user || null
      if (!token) {
        return rejectWithValue('Login succeeded but no token returned')
      }
      return { token, user }
    } catch (e: any) {
      const message = String(e?.message || 'Login failed')
      // Firebase common auth errors
      if (message.includes('auth/invalid-credential') || message.includes('INVALID_LOGIN_CREDENTIALS')) {
        return rejectWithValue('Invalid email/password (or this account does not have a password set).')
      }
      if (message.includes('auth/user-not-found')) {
        return rejectWithValue('No Firebase account found for this email.')
      }
      if (message.includes('auth/wrong-password')) {
        return rejectWithValue('Wrong password.')
      }
      if (message.includes('auth/network-request-failed')) {
        return rejectWithValue('Network error while contacting Firebase. Check connectivity and try again.')
      }

      // Backend fetch failures (often CORS or wrong API base URL in web dev)
      if (message === 'Failed to fetch' || message.toLowerCase().includes('network request failed')) {
        return rejectWithValue(
          'Backend API unreachable. Check Settings → API base URL (should be your staging backend URL ending with /api) and ensure backend CORS allows this origin.'
        )
      }

      return rejectWithValue(message)
    }
  }
)

export const registerUser = createAsyncThunk(
  'auth/register',
  async (payload: { email: string; password: string }, { getState, rejectWithValue }) => {
    try {
      const apiBaseUrl = (getState() as RootState).settings.apiBaseUrl
      const res = await register(apiBaseUrl, payload.email, payload.password)
      if (!res?.success) {
        return rejectWithValue(res?.error || 'Registration failed')
      }
      const token = await applyBackendAuthFromEnvelope(res)
      const user = res.data?.user || null
      if (!token) {
        return rejectWithValue('Registration succeeded but no token returned')
      }
      return { token, user }
    } catch (e: any) {
      return rejectWithValue(e?.message || 'Registration failed')
    }
  }
)

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  await logoutEverywhere()
})

export const sendResetEmail = createAsyncThunk(
  'auth/sendResetEmail',
  async (payload: { email: string; continueUrl?: string }, { rejectWithValue }) => {
    try {
      await requestPasswordReset(payload.email, payload.continueUrl)
      return { email: payload.email.trim() }
    } catch (e: any) {
      return rejectWithValue(e?.message || 'Failed to send reset email')
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder.addCase(bootstrapAuth.pending, (state) => {
      state.isLoaded = false
    })
    builder.addCase(bootstrapAuth.fulfilled, (state, action) => {
      state.isLoaded = true
      state.token = action.payload.token
      state.user = action.payload.user
      state.isAuthenticated = Boolean(action.payload.token)
    })
    builder.addCase(bootstrapAuth.rejected, (state) => {
      state.isLoaded = true
      state.token = null
      state.user = null
      state.isAuthenticated = false
    })

    builder.addCase(loginUser.pending, (state) => {
      state.isLoading = true
      state.error = null
      state.lastResetEmailSentTo = null
    })
    builder.addCase(loginUser.fulfilled, (state, action) => {
      state.isLoading = false
      state.isAuthenticated = true
      state.token = action.payload.token
      state.user = action.payload.user
    })
    builder.addCase(loginUser.rejected, (state, action) => {
      state.isLoading = false
      state.isAuthenticated = false
      state.token = null
      state.user = null
      state.error = (action.payload as string) || 'Login failed'
    })

    builder.addCase(registerUser.pending, (state) => {
      state.isLoading = true
      state.error = null
      state.lastResetEmailSentTo = null
    })
    builder.addCase(registerUser.fulfilled, (state, action) => {
      state.isLoading = false
      state.isAuthenticated = true
      state.token = action.payload.token
      state.user = action.payload.user
    })
    builder.addCase(registerUser.rejected, (state, action) => {
      state.isLoading = false
      state.isAuthenticated = false
      state.token = null
      state.user = null
      state.error = (action.payload as string) || 'Registration failed'
    })

    builder.addCase(logoutUser.fulfilled, (state) => {
      state.isAuthenticated = false
      state.token = null
      state.user = null
      state.error = null
      state.lastResetEmailSentTo = null
    })

    builder.addCase(sendResetEmail.pending, (state) => {
      state.isLoading = true
      state.error = null
      state.lastResetEmailSentTo = null
    })
    builder.addCase(sendResetEmail.fulfilled, (state, action) => {
      state.isLoading = false
      state.lastResetEmailSentTo = action.payload.email
    })
    builder.addCase(sendResetEmail.rejected, (state, action) => {
      state.isLoading = false
      state.error = (action.payload as string) || 'Failed to send reset email'
    })
  },
})

export const { clearAuthError } = authSlice.actions
export const authReducer = authSlice.reducer
