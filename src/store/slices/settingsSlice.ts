import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { getDefaultApiBaseUrl, getDefaultEnvName, type AppEnvName } from '../../config/env'
import { getStoredSettings, setStoredSettings } from '../../services/tokenStore'

export type SettingsState = {
  isLoaded: boolean
  envName: AppEnvName
  apiBaseUrl: string
  envOverride: AppEnvName | null
  apiBaseUrlOverride: string | null
}

const initialState: SettingsState = {
  isLoaded: false,
  envName: getDefaultEnvName(),
  apiBaseUrl: getDefaultApiBaseUrl(),
  envOverride: null,
  apiBaseUrlOverride: null,
}

export const bootstrapSettings = createAsyncThunk('settings/bootstrap', async () => {
  const stored = await getStoredSettings()
  return {
    envOverride: (stored.envOverride as AppEnvName | null | undefined) ?? null,
    apiBaseUrlOverride: stored.apiBaseUrlOverride ?? null,
  }
})

export const persistSettings = createAsyncThunk(
  'settings/persist',
  async (settings: { envOverride: AppEnvName | null; apiBaseUrlOverride: string | null }) => {
    await setStoredSettings(settings)
    return settings
  }
)

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setEnvOverride: (state, action: PayloadAction<AppEnvName | null>) => {
      state.envOverride = action.payload
      state.envName = action.payload ?? getDefaultEnvName()
    },
    setApiBaseUrlOverride: (state, action: PayloadAction<string | null>) => {
      state.apiBaseUrlOverride = action.payload
      state.apiBaseUrl = action.payload ?? getDefaultApiBaseUrl()
    },
  },
  extraReducers: (builder) => {
    builder.addCase(bootstrapSettings.fulfilled, (state, action) => {
      state.isLoaded = true
      state.envOverride = action.payload.envOverride
      state.apiBaseUrlOverride = action.payload.apiBaseUrlOverride
      state.envName = action.payload.envOverride ?? getDefaultEnvName()
      state.apiBaseUrl = action.payload.apiBaseUrlOverride ?? getDefaultApiBaseUrl()
    })

    builder.addCase(bootstrapSettings.rejected, (state) => {
      state.isLoaded = true
    })

    builder.addCase(persistSettings.fulfilled, (state, action) => {
      state.envOverride = action.payload.envOverride
      state.apiBaseUrlOverride = action.payload.apiBaseUrlOverride
      state.envName = action.payload.envOverride ?? getDefaultEnvName()
      state.apiBaseUrl = action.payload.apiBaseUrlOverride ?? getDefaultApiBaseUrl()
    })
  },
})

export const { setEnvOverride, setApiBaseUrlOverride } = settingsSlice.actions
export const settingsReducer = settingsSlice.reducer

