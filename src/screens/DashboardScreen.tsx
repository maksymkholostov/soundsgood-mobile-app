import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, Divider, HelperText, Text } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'

import { useAppSelector } from '../store/hooks'
import { fetchDashboardStats, type DashboardStats } from '../services/dashboardApi'
import { useToast } from '../hooks/useToast'

function number(n: number | undefined | null) {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function StatCard(props: { title: string; value: number; subtitle?: string; onPress?: () => void }) {
  return (
    <Card style={{ flexGrow: 1, minWidth: 160 }}>
      <Card.Content style={{ gap: 6 }}>
        <Text variant="titleSmall">{props.title}</Text>
        <Text variant="headlineMedium" style={{ fontWeight: '800' }}>
          {props.value.toLocaleString()}
        </Text>
        {props.subtitle ? (
          <Text variant="bodySmall" style={{ opacity: 0.7 }}>
            {props.subtitle}
          </Text>
        ) : null}
      </Card.Content>
      {props.onPress ? (
        <Card.Actions>
          <Button mode="text" onPress={props.onPress}>
            Open
          </Button>
        </Card.Actions>
      ) : null}
    </Card>
  )
}

export function DashboardScreen() {
  const navigation = useNavigation<any>()
  const toast = useToast()
  const apiBaseUrl = useAppSelector((s) => s.settings.apiBaseUrl)
  const auth = useAppSelector((s) => s.auth)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const userId = auth?.user?.id ? String(auth.user.id) : null
      const res = await fetchDashboardStats(apiBaseUrl, userId)
      if (!res?.success || !res?.stats) throw new Error(res?.error || 'Failed to load stats')
      setStats(res.stats)
    } catch (e: any) {
      setStats(null)
      setError(String(e?.message || 'Failed to load stats'))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, auth?.user?.id])

  useEffect(() => {
    void load()
  }, [load])

  const resolved = useMemo(() => {
    const s = stats
    const original = number(s?.original_recordings)
    const augmented = number(s?.augmented_recordings)
    const total = number(s?.total_recordings) || original + augmented
    return {
      original,
      augmented,
      total,
      pending: number(s?.pending_recordings),
      dictionaries: number(s?.dictionaries),
      classes: number(s?.classes),
      models: number(s?.models),
    }
  }, [stats])

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Dashboard" subtitle={auth.user?.email || auth.user?.username || 'SoundsGood'} />
        <Card.Content style={{ gap: 10 }}>
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Workflow: Record sounds → Verify → Train model → Use for predictions / games.
          </Text>
          <Button mode="outlined" loading={loading} disabled={loading} onPress={load}>
            Refresh stats
          </Button>
          <HelperText type={error ? 'error' : 'info'} visible>
            {error || 'Stats are loaded from the staging backend.'}
          </HelperText>
        </Card.Content>
      </Card>

      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <StatCard
          title="Verified (Gold)"
          value={resolved.original}
          subtitle="Approved samples"
          onPress={() => navigation.navigate('Classes')}
        />
        <StatCard
          title="Augmented"
          value={resolved.augmented}
          subtitle="Generated variations"
          onPress={() => navigation.navigate('Classes')}
        />
        <StatCard
          title="Total"
          value={resolved.total}
          subtitle="Gold + augmented"
          onPress={() => navigation.navigate('Classes')}
        />
        <StatCard
          title="Pending"
          value={resolved.pending}
          subtitle="Needs approval"
          onPress={() => navigation.navigate('Verify')}
        />
        <StatCard title="Sound Classes" value={resolved.classes} onPress={() => navigation.navigate('Classes')} />
        <StatCard title="Dictionaries" value={resolved.dictionaries} onPress={() => navigation.navigate('Classes')} />
        <StatCard title="Models" value={resolved.models} onPress={() => navigation.navigate('Classes')} />
      </View>

      {resolved.pending > 0 ? (
        <Card>
          <Card.Title title="Approve recordings" subtitle={`You have ${resolved.pending} pending segment(s)`} />
          <Card.Content style={{ gap: 10 }}>
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Approve good recordings to add them to training data, or discard poor ones.
            </Text>
            <Button mode="contained" onPress={() => navigation.navigate('Verify')}>
              Review now
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      <Card>
        <Card.Title title="Quick actions" />
        <Card.Content style={{ gap: 10 }}>
          <Button mode="contained" onPress={() => navigation.navigate('Record')}>
            Record sounds
          </Button>
          <Button mode="outlined" onPress={() => navigation.navigate('Verify')}>
            Verify sounds
          </Button>
          <Divider />
          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Training/Use is enabled per-class only after you have 10+ approved samples.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button mode="contained" disabled onPress={() => toast('Open a class first to train.', 'info')}>
              Train model
            </Button>
            <Button mode="outlined" disabled onPress={() => toast('Open a class first to use a model.', 'info')}>
              Use model
            </Button>
            <Button mode="text" onPress={() => navigation.navigate('Classes')}>
              Open classes
            </Button>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  )
}
