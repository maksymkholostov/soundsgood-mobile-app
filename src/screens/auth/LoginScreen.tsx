import React, { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput } from 'react-native-paper'

import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { clearAuthError, loginUser } from '../../store/slices/authSlice'
import { AuthCard } from '../../components/AuthCard'
import { GradientScreen } from '../../components/GradientScreen'

export function LoginScreen({ navigation }: any) {
  const dispatch = useAppDispatch()
  const auth = useAppSelector((s) => s.auth)

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')

  const canSubmit = useMemo(() => identifier.trim().length > 0 && password.length >= 6, [identifier, password])

  return (
    <GradientScreen>
      <AuthCard title="SoundsGood" subtitle="Sign in to your account">
        <View style={styles.form}>
          <TextInput
            label="Email or username"
            value={identifier}
            onChangeText={(t) => {
              setIdentifier(t)
              if (auth.error) dispatch(clearAuthError())
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={(t) => {
              setPassword(t)
              if (auth.error) dispatch(clearAuthError())
            }}
            secureTextEntry
          />

          <HelperText type={auth.error ? 'error' : 'info'} visible>
            {auth.error || 'Email sign-in uses Firebase and then syncs to the backend.'}
          </HelperText>

          <Button
            mode="contained"
            loading={auth.isLoading}
            disabled={!canSubmit || auth.isLoading}
            onPress={() => dispatch(loginUser({ identifier: identifier.trim(), password }))}
            contentStyle={{ paddingVertical: 6 }}
          >
            Sign in
          </Button>

          <View style={styles.links}>
            <Button mode="text" onPress={() => navigation.navigate('Register')}>
              Create account
            </Button>
            <Button mode="text" onPress={() => navigation.navigate('ForgotPassword')}>
              Forgot password?
            </Button>
          </View>

          <Text variant="bodySmall" style={styles.hint}>
            Tip: You can change the API URL in Settings.
          </Text>
        </View>
      </AuthCard>
    </GradientScreen>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  links: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hint: { opacity: 0.75, marginTop: 6 },
})
