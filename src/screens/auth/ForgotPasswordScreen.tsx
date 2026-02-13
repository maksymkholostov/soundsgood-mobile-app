import React, { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, HelperText, Text, TextInput } from 'react-native-paper'

import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { clearAuthError, sendResetEmail } from '../../store/slices/authSlice'
import { AuthCard } from '../../components/AuthCard'
import { GradientScreen } from '../../components/GradientScreen'

export function ForgotPasswordScreen({ navigation }: any) {
  const dispatch = useAppDispatch()
  const auth = useAppSelector((s) => s.auth)

  const [email, setEmail] = useState('')

  const canSubmit = useMemo(() => email.trim().includes('@'), [email])

  const sentTo = auth.lastResetEmailSentTo

  return (
    <GradientScreen>
      <AuthCard title="Forgot password" subtitle="Enter your email to receive a reset link">
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

          <HelperText type={auth.error ? 'error' : 'info'} visible>
            {auth.error ||
              "We’ll email you a password reset link. If you request more than once, only the newest link will work."}
          </HelperText>

          {sentTo ? (
            <Text variant="bodySmall">
              Sent reset email to <Text style={{ fontWeight: '700' }}>{sentTo}</Text>. Check inbox and spam.
            </Text>
          ) : null}

          <Button
            mode="contained"
            loading={auth.isLoading}
            disabled={!canSubmit || auth.isLoading}
            contentStyle={{ paddingVertical: 6 }}
            onPress={() => dispatch(sendResetEmail({ email: email.trim() }))}
          >
            Send reset email
          </Button>

          <Button mode="text" onPress={() => navigation.goBack()}>
            Back
          </Button>
        </View>
      </AuthCard>
    </GradientScreen>
  )
}

const styles = StyleSheet.create({
  form: { gap: 10 },
})
