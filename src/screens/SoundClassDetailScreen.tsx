import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Audio } from 'expo-av'
import { Button, Card, Chip, Divider, HelperText, SegmentedButtons, Text } from 'react-native-paper'
import { useNavigation } from '@react-navigation/native'

import { useAppSelector } from '../store/hooks'
import { useToast } from '../hooks/useToast'
import {
  fetchSoundClassDetail,
  type SoundClassDetailRecording,
  type SoundClassItem,
} from '../services/soundClassesApi'

type StatusTab = 'pending' | 'gold' | 'raw' | 'augmented' | 'training'

function n(v?: number | null) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function absoluteStreamUrl(apiBaseUrl: string, url?: string) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = new URL(apiBaseUrl.replace(/\/+$/, ''))
  return `${base.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

export function SoundClassDetailScreen({ route }: any) {
  const navigation = useNavigation<any>()
  const toast = useToast()
  const apiBaseUrl = useAppSelector((s) => s.settings.apiBaseUrl)
  const auth = useAppSelector((s) => s.auth)

  const classId = route?.params?.classId as string | undefined
  const [tab, setTab] = useState<StatusTab>('pending')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [soundClass, setSoundClass] = useState<SoundClassItem | null>(null)
  const [recordings, setRecordings] = useState<SoundClassDetailRecording[]>([])

  const playbackRef = useRef<Audio.Sound | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const goal = 10
  const gold = n(soundClass?.gold_recordings)
  const pending = n(soundClass?.pending_recordings)
  const remaining = Math.max(0, goal - gold)
  const ready = remaining === 0

  const load = useCallback(async () => {
    if (!classId) return
    if (!auth.isAuthenticated) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSoundClassDetail(apiBaseUrl, classId, { status: tab, page: 1, perPage: 50 })
      if (!res?.success || !res?.data) throw new Error(res?.error || 'Failed to load class')
      setSoundClass(res.data.sound_class)
      setRecordings(res.data.recordings.items || [])
    } catch (e: any) {
      setSoundClass(null)
      setRecordings([])
      setError(String(e?.message || 'Failed to load class'))
    } finally {
      setLoading(false)
    }
  }, [apiBaseUrl, auth.isAuthenticated, classId, tab])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      const cleanup = async () => {
        try {
          if (playbackRef.current) {
            await playbackRef.current.stopAsync()
            await playbackRef.current.unloadAsync()
          }
        } catch {
          // ignore
        } finally {
          playbackRef.current = null
        }
      }
      void cleanup()
    }
  }, [])

  const play = useCallback(
    async (rec: SoundClassDetailRecording) => {
      const url = absoluteStreamUrl(apiBaseUrl, rec.url)
      if (!url) {
        toast('Missing audio URL', 'error')
        return
      }

      const stop = async () => {
        try {
          if (playbackRef.current) {
            await playbackRef.current.stopAsync()
            await playbackRef.current.unloadAsync()
          }
        } catch {
          // ignore
        } finally {
          playbackRef.current = null
          setPlayingId(null)
        }
      }

      if (playingId === rec.id) {
        await stop()
        return
      }

      await stop()
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      })

      const tryPlay = async () => {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return
            if (status.didJustFinish) void stop()
          },
        )
        playbackRef.current = sound
        setPlayingId(rec.id)
      }

      try {
        await tryPlay()
      } catch {
        // one retry for flaky streaming
        try {
          await new Promise((r) => setTimeout(r, 400))
          await tryPlay()
        } catch (e: any) {
          await stop()
          toast(String(e?.message || 'Playback failed'), 'error')
        }
      }
    },
    [apiBaseUrl, playingId, toast],
  )

  const headerSubtitle = useMemo(() => {
    if (!soundClass) return classId || 'Sound class'
    return soundClass.display_name || soundClass.name
  }, [classId, soundClass])

  const authWarning = !auth.isAuthenticated ? 'Please sign in first.' : null

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Sound Class" subtitle={headerSubtitle} />
        <Card.Content style={{ gap: 10 }}>
          {authWarning ? <HelperText type="error" visible>{authWarning}</HelperText> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip compact icon={ready ? 'check' : 'progress-clock'}>
              Gold: {Math.min(gold, goal)}/{goal}
            </Chip>
            <Chip compact icon="timer-sand">Pending: {pending}</Chip>
            <Chip compact icon="music-note">Raw: {n(soundClass?.raw_recordings)}</Chip>
            <Chip compact icon="shuffle-variant">Aug: {n(soundClass?.augmented_recordings)}</Chip>
            <Chip compact icon="star">Avail: {n(soundClass?.training_recordings)}</Chip>
          </View>
          {!ready ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Need {remaining} more approved samples before training.
            </Text>
          ) : (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Ready for training (10+ approved samples).
            </Text>
          )}
          <Button mode="outlined" loading={loading} disabled={loading || !auth.isAuthenticated} onPress={load}>
            Refresh
          </Button>
          {error ? <HelperText type="error" visible>{error}</HelperText> : null}
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Quick actions" />
        <Card.Content style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button mode="contained" disabled={!classId} onPress={() => navigation.navigate('MainTabs', { screen: 'Record', params: { classId } })}>
              Record more
            </Button>
            <Button mode="outlined" disabled={!classId} onPress={() => navigation.navigate('MainTabs', { screen: 'Verify', params: { classId } })}>
              Verify pending
            </Button>
          </View>

          <Divider />

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              mode="contained"
              disabled={!ready}
              onPress={() => toast('Training screen not implemented yet (next).', 'info')}
            >
              Train model
            </Button>
            <Button
              mode="outlined"
              disabled={!ready}
              onPress={() => toast('Use model screen not implemented yet (next).', 'info')}
            >
              Use model
            </Button>
          </View>
          {!ready ? (
            <Text variant="bodySmall" style={{ opacity: 0.7 }}>
              Training/Use is blocked until you have at least 10 approved samples.
            </Text>
          ) : null}
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Recent recordings" subtitle={`Status: ${tab}`} />
        <Card.Content style={{ gap: 10 }}>
          <SegmentedButtons
            value={tab}
            onValueChange={(v) => setTab(v as StatusTab)}
            buttons={[
              { value: 'pending', label: 'Pending' },
              { value: 'gold', label: 'Gold' },
              { value: 'raw', label: 'Raw' },
              { value: 'augmented', label: 'Aug' },
              { value: 'training', label: 'Avail' },
            ]}
          />

          {loading ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Loading…
            </Text>
          ) : recordings.length === 0 ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              No recordings found for this status.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {recordings.slice(0, 30).map((rec) => (
                <Card key={rec.id}>
                  <Card.Content style={{ gap: 6 }}>
                    <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                      {rec.fileName || rec.id}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        mode="outlined"
                        icon={playingId === rec.id ? 'stop' : 'play'}
                        onPress={() => play(rec)}
                      >
                        {playingId === rec.id ? 'Stop' : 'Play'}
                      </Button>
                      <Button mode="text" onPress={() => toast(`ID: ${rec.id}`, 'info', 2000)}>
                        Copy ID
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  )
}

