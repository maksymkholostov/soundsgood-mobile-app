import React, { useMemo, useState } from 'react'
import { Platform, View } from 'react-native'
import { Button, Card, HelperText, Text, TextInput } from 'react-native-paper'

import { useAppDispatch, useAppSelector } from '../store/hooks'
import { useToast } from '../hooks/useToast'
import { logoutUser } from '../store/slices/authSlice'
import { persistSettings } from '../store/slices/settingsSlice'
import { testBackendApi, testFirebaseRest } from '../services/connectivityApi'

export function SettingsScreen() {
  const dispatch = useAppDispatch()
  const toast = useToast()
  const settings = useAppSelector((s) => s.settings)
  const auth = useAppSelector((s) => s.auth)

  const [apiBaseUrlOverride, setApiBaseUrlOverride] = useState<string>(settings.apiBaseUrlOverride ?? '')
  const [testing, setTesting] = useState(false)

  const apiBaseUrlError = useMemo(() => {
    const trimmed = apiBaseUrlOverride.trim()
    if (!trimmed) return null
    try {
      // Accept http(s) URLs only.
      const u = new URL(trimmed)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Use http:// or https://'
      return null
    } catch {
      return 'Invalid URL'
    }
  }, [apiBaseUrlOverride])

  const saveDisabled = Boolean(apiBaseUrlError)

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Settings" />
        <Card.Content>
          <Text variant="bodyMedium">Environment: {settings.envName}</Text>
          <Text variant="bodyMedium">API base URL: {settings.apiBaseUrl}</Text>
          <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.75 }}>
            Tip: For local dev over SSH, set this to your public IP (or a tunnel URL) + `/api`.
          </Text>
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Connectivity test" subtitle="Check backend + Firebase reachability" />
        <Card.Content>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Runs lightweight checks: backend `/dashboard/stats` and Firebase REST `createAuthUri`.
          </Text>
        </Card.Content>
        <Card.Actions>
          <Button
            mode="contained"
            loading={testing}
            disabled={testing}
            onPress={async () => {
              setTesting(true)
              try {
                await testBackendApi(settings.apiBaseUrl)
                toast('Backend API reachable', 'success')
              } catch (e: any) {
                toast(`Backend test failed: ${e?.message || 'unknown error'}`, 'error', 4000)
              } finally {
                setTesting(false)
              }
            }}
          >
            Test backend
          </Button>
          <Button
            mode="outlined"
            loading={testing}
            disabled={testing}
            onPress={async () => {
              setTesting(true)
              try {
                await testFirebaseRest()
                toast('Firebase REST reachable', 'success')
              } catch (e: any) {
                toast(`Firebase test failed: ${e?.message || 'unknown error'}`, 'error', 4000)
              } finally {
                setTesting(false)
              }
            }}
          >
            Test Firebase
          </Button>
        </Card.Actions>
      </Card>

      <Card>
        <Card.Title title="Auth" />
        <Card.Content>
          <Text variant="bodyMedium">
            Status: {auth.isAuthenticated ? 'Signed in' : 'Signed out'}
          </Text>
          {auth.user?.email ? <Text variant="bodyMedium">Email: {auth.user.email}</Text> : null}
          {auth.user?.username ? <Text variant="bodyMedium">Username: {auth.user.username}</Text> : null}
        </Card.Content>
        {auth.isAuthenticated ? (
          <Card.Actions>
            <Button mode="outlined" onPress={() => dispatch(logoutUser())}>
              Sign out
            </Button>
          </Card.Actions>
        ) : null}
      </Card>

      <Card>
        <Card.Title title="API Override" subtitle={Platform.OS === 'web' ? 'Stored in localStorage' : 'Stored in SecureStore'} />
        <Card.Content>
          <TextInput
            label="API base URL override (optional)"
            value={apiBaseUrlOverride}
            onChangeText={setApiBaseUrlOverride}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="https://staging.soundsgood.health/api"
          />
          <HelperText type={apiBaseUrlError ? 'error' : 'info'} visible>
            {apiBaseUrlError || 'Leave blank to use the default from EXPO_PUBLIC_API_BASE_URL / app.json.'}
          </HelperText>
        </Card.Content>
        <Card.Actions>
          <Button
            mode="contained"
            disabled={saveDisabled}
            onPress={() =>
              dispatch(
                persistSettings({
                  envOverride: settings.envOverride,
                  apiBaseUrlOverride: apiBaseUrlOverride.trim() ? apiBaseUrlOverride.trim() : null,
                })
              )
            }
          >
            Save
          </Button>
          <Button
            mode="text"
            onPress={() => {
              setApiBaseUrlOverride('')
              dispatch(
                persistSettings({
                  envOverride: settings.envOverride,
                  apiBaseUrlOverride: null,
                })
              )
            }}
          >
            Clear
          </Button>
        </Card.Actions>
      </Card>
    </View>
  )
}
