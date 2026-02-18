import { useCallback } from 'react'

import { useAppDispatch } from '../store/hooks'
import { enqueueToast, type ToastVariant } from '../store/slices/toastSlice'

export function useToast() {
  const dispatch = useAppDispatch()

  return useCallback(
    (message: string, variant: ToastVariant = 'info', durationMs?: number) => {
      dispatch(enqueueToast({ message, variant, durationMs }))
    },
    [dispatch],
  )
}

