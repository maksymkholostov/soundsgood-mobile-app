import React, { useEffect, useMemo, useState } from 'react'
import { Snackbar, Text } from 'react-native-paper'

import { useAppDispatch, useAppSelector } from '../store/hooks'
import { shiftToast } from '../store/slices/toastSlice'

export function ToastHost() {
  const dispatch = useAppDispatch()
  const toast = useAppSelector((s) => s.toast.queue[0] || null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(Boolean(toast))
  }, [toast?.id])

  const bg = useMemo(() => {
    if (!toast) return undefined
    if (toast.variant === 'success') return '#2e7d32'
    if (toast.variant === 'error') return '#b00020'
    return '#1e1e1e'
  }, [toast])

  if (!toast) return null

  return (
    <Snackbar
      visible={visible}
      duration={toast.durationMs ?? 2500}
      onDismiss={() => {
        setVisible(false)
        dispatch(shiftToast())
      }}
      style={{ backgroundColor: bg }}
      action={{
        label: 'OK',
        onPress: () => {
          setVisible(false)
          dispatch(shiftToast())
        },
      }}
    >
      <Text style={{ color: 'white' }}>{toast.message}</Text>
    </Snackbar>
  )
}

