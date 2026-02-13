import React, { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, HelperText, TextInput } from 'react-native-paper'

import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { clearAuthError, registerUser } from '../../store/slices/authSlice'
import { AuthCard } from '../../components/AuthCard'
import { GradientScreen } from '../../components/GradientScreen'

export function RegisterScreen({ navigation }: any) {
  const dispatch = useAppDispatch()
  const auth = useAppSelector((s) => s.auth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const passwordMismatch = password.length > 0 && confirm.length > 0 && password !== confirm

  const canSubmit = useMemo(() => {
    if (!email.trim().includes('@')) return false
    if (password.length < 6) return false
    if (passwordMismatch) return false
    return true
  }, [email, password, passwordMismatch])

  return (
    <GradientScreen>
      <AuthCard title="Create account" subtitle="Firebase email/password">
        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t)
              if (auth.error) dispatch(clearAuthError())
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextInput
            label="Password (min 6 chars)"
            value={password}
            onChangeText={(t) => {
              setPassword(t)
              if (auth.error) dispatch(clearAuthError())
            }}
            secureTextEntry
          />
          <TextInput label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />

          <HelperText type={passwordMismatch || auth.error ? 'error' : 'info'} visible>
            {passwordMismatch
              ? 'Passwords do not match'
              : auth.error || 'Account is created in Firebase and synced to backend.'}
          </HelperText>

          <Button
            mode="contained"
            loading={auth.isLoading}
            disabled={!canSubmit || auth.isLoading}
            contentStyle={{ paddingVertical: 6 }}
            onPress={async () => {
              const action = await dispatch(registerUser({ email: email.trim(), password }))
              if ((action as any).meta?.requestStatus === 'fulfilled') {
                navigation.goBack()
              }
            }}
          >
            Create account
          </Button>

          <View style={styles.links}>
            <Button mode="text" onPress={() => navigation.goBack()}>
              Back
            </Button>
          </View>
        </View>
      </AuthCard>
    </GradientScreen>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  links: { flexDirection: 'row', justifyContent: 'flex-end' },
})
