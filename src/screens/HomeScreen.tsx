import React from 'react'
import { View } from 'react-native'
import { Button, Card, Text } from 'react-native-paper'

import { useAppDispatch, useAppSelector } from '../store/hooks'
import { increment } from '../store/slices/appSlice'
import { createApiClient } from '../services/apiClient'

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

export function HomeScreen() {
  const dispatch = useAppDispatch()
  const counter = useAppSelector((s) => s.app.counter)
  const auth = useAppSelector((s) => s.auth)
  const apiBaseUrl = useAppSelector((s) => s.settings.apiBaseUrl)

  const [apiResult, setApiResult] = React.useState<string>('')
  const [apiLoading, setApiLoading] = React.useState(false)

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Mobile App Skeleton" subtitle="Expo + EAS + Paper + Navigation" />
        <Card.Content>
          <Text variant="bodyMedium">
            Starter mobile app: Firebase auth → backend sync is wired. Next: recording, upload, verify, and games.
          </Text>
          {auth.isAuthenticated ? (
            <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.75 }}>
              Signed in {auth.user?.email ? `as ${auth.user.email}` : ''}
            </Text>
          ) : (
            <Text variant="bodySmall" style={{ marginTop: 8, opacity: 0.75 }}>
              Not signed in.
            </Text>
          )}
        </Card.Content>
        <Card.Actions>
          <Button mode="contained" onPress={() => dispatch(increment())}>
            Counter: {counter}
          </Button>
        </Card.Actions>
      </Card>

        <Card>
        <Card.Title title="Backend Check" subtitle={normalizeApiBaseUrl(apiBaseUrl)} />
        <Card.Content>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Requires auth for most endpoints. This calls `/api/sound-classes` to confirm API wiring.
          </Text>
          {apiResult ? (
            <Text variant="bodySmall" style={{ marginTop: 8 }}>
              {apiResult}
            </Text>
          ) : null}
        </Card.Content>
        <Card.Actions>
          <Button
            mode="outlined"
            loading={apiLoading}
            disabled={apiLoading}
            onPress={async () => {
              setApiLoading(true)
              setApiResult('')
              try {
                const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
                const res = await api.get<any>('/sound-classes?page=1&per_page=5&sort_by=created_at&sort_order=desc')
                const items = res?.data?.items || []
                setApiResult(`OK: ${items.length} sound classes returned`)
              } catch (e: any) {
                setApiResult(`ERROR: ${e?.message || 'request failed'}`)
              } finally {
                setApiLoading(false)
              }
            }}
          >
            Fetch sound classes
          </Button>
        </Card.Actions>
      </Card>
    </View>
  )
}
