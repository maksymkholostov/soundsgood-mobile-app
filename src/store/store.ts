import { configureStore } from '@reduxjs/toolkit'

import { appReducer } from './slices/appSlice'
import { authReducer } from './slices/authSlice'
import { settingsReducer } from './slices/settingsSlice'
import { toastReducer } from './slices/toastSlice'

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
    settings: settingsReducer,
    toast: toastReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
