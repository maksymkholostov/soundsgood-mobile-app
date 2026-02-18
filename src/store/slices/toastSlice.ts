import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type ToastVariant = 'info' | 'success' | 'error'

export type ToastItem = {
  id: string
  message: string
  variant: ToastVariant
  durationMs?: number
}

export type ToastState = {
  queue: ToastItem[]
}

const initialState: ToastState = {
  queue: [],
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    enqueueToast: (
      state,
      action: PayloadAction<{ message: string; variant?: ToastVariant; durationMs?: number }>
    ) => {
      const variant = action.payload.variant ?? 'info'
      state.queue.push({
        id: makeId(),
        message: action.payload.message,
        variant,
        durationMs: action.payload.durationMs,
      })
    },
    shiftToast: (state) => {
      state.queue.shift()
    },
    clearToasts: (state) => {
      state.queue = []
    },
  },
})

export const { enqueueToast, shiftToast, clearToasts } = toastSlice.actions
export const toastReducer = toastSlice.reducer

