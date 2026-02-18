import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Audio } from 'expo-av'
import { Button, Card, Divider, HelperText, List, Text, TextInput } from 'react-native-paper'

import { useAppSelector } from '../store/hooks'
import {
  fetchPendingClasses,
  fetchPendingRecordings,
  type PendingClass,
  type PendingRecording,
  verifyPendingRecording,
} from '../services/verifySoundsApi'

type LoadState = 'idle' | 'loading' | 'verifying'

function absoluteStreamUrl(apiBaseUrl: string, url?: string) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const base = new URL(apiBaseUrl.replace(/\/+$/, ''))
  // Backend returns paths like "/api/sounds/stream?id=...&token=...".
  return `${base.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

function formatSeconds(sec?: number) {
  const s = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function VerifySoundsScreen({ route }: any) {
  const apiBaseUrl = useAppSelector((s) => s.settings.apiBaseUrl)
  const auth = useAppSelector((s) => s.auth)
  const preselectedClassId = route?.params?.classId as string | undefined

  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [classes, setClasses] = useState<PendingClass[]>([])
  const [classSearch, setClassSearch] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string>('__all__')

  const [recordings, setRecordings] = useState<PendingRecording[]>([])
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [hasNext, setHasNext] = useState(false)

  const playbackRef = useRef<Audio.Sound | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const canUse = auth.isAuthenticated

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase()
    const base = [{ id: '__all__', name: 'All classes' }, ...classes]
    if (!q) return base
    return base.filter((c) => c.name.toLowerCase().includes(q))
  }, [classes, classSearch])

  const ensureAudioPlayback = useCallback(async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    })
  }, [])

  const stopPlayback = useCallback(async () => {
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
  }, [])

  useEffect(() => {
    return () => {
      void stopPlayback()
    }
  }, [stopPlayback])

  const loadClassesAndRecordings = useCallback(async () => {
    if (!canUse) return
    setState('loading')
    setError(null)
    setInfo(null)
    try {
      const cls = await fetchPendingClasses(apiBaseUrl)
      setClasses(cls)
      setSelectedClassId((prev) => (prev ? prev : '__all__'))
      const res = await fetchPendingRecordings(apiBaseUrl, selectedClassId || '__all__', { page: 1, perPage })
      if (!res?.success) throw new Error(res?.error || 'Failed to load pending recordings')
      setRecordings(Array.isArray(res.recordings) ? res.recordings : [])
      setHasNext(Boolean(res.pagination?.has_next))
      setPage(1)
      setInfo('Loaded pending recordings')
    } catch (e: any) {
      setRecordings([])
      setHasNext(false)
      setPage(1)
      setError(String(e?.message || 'Failed to load pending recordings'))
    } finally {
      setState('idle')
    }
  }, [apiBaseUrl, canUse, perPage, selectedClassId])

  const loadRecordings = useCallback(
    async (nextPage: number, append: boolean) => {
      if (!canUse) return
      setState('loading')
      setError(null)
      setInfo(null)
      try {
        const res = await fetchPendingRecordings(apiBaseUrl, selectedClassId || '__all__', { page: nextPage, perPage })
        if (!res?.success) throw new Error(res?.error || 'Failed to load pending recordings')
        const items = Array.isArray(res.recordings) ? res.recordings : []
        setRecordings((prev) => (append ? [...prev, ...items] : items))
        setHasNext(Boolean(res.pagination?.has_next))
        setPage(nextPage)
      } catch (e: any) {
        if (!append) setRecordings([])
        setError(String(e?.message || 'Failed to load pending recordings'))
      } finally {
        setState('idle')
      }
    },
    [apiBaseUrl, canUse, perPage, selectedClassId],
  )

  useEffect(() => {
    if (!canUse) return
    void loadClassesAndRecordings()
  }, [canUse])

  useEffect(() => {
    if (!canUse) return
    void loadRecordings(1, false)
  }, [selectedClassId])

  useEffect(() => {
    if (!canUse) return
    if (!preselectedClassId) return
    setSelectedClassId(preselectedClassId)
  }, [canUse, preselectedClassId])

  const playRecording = useCallback(
    async (rec: PendingRecording) => {
      const url = absoluteStreamUrl(apiBaseUrl, rec.url)
      if (!url) {
        setError('Missing recording URL')
        return
      }

      setError(null)
      setInfo(null)

      if (playingId === rec.id) {
        await stopPlayback()
        return
      }

      await stopPlayback()
      await ensureAudioPlayback()
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return
            if (status.didJustFinish) void stopPlayback()
          },
        )
        playbackRef.current = sound
        setPlayingId(rec.id)
      } catch (e: any) {
        await stopPlayback()
        setError(String(e?.message || 'Playback failed'))
      }
    },
    [apiBaseUrl, ensureAudioPlayback, playingId, stopPlayback],
  )

  const verifyOne = useCallback(
    async (rec: PendingRecording, keep: boolean) => {
      if (!rec?.id) return
      setState('verifying')
      setError(null)
      setInfo(null)
      try {
        await stopPlayback()
        const res = await verifyPendingRecording(apiBaseUrl, { soundInstanceId: rec.id, keep })
        if (!res?.success) throw new Error(res?.error || 'Verification failed')
        setRecordings((prev) => prev.filter((r) => r.id !== rec.id))
        setInfo(keep ? 'Approved' : 'Discarded')
      } catch (e: any) {
        setError(String(e?.message || 'Verification failed'))
      } finally {
        setState('idle')
      }
    },
    [apiBaseUrl, stopPlayback],
  )

  const authWarning = !auth.isAuthenticated ? 'Please sign in first.' : null

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Verify Sounds" subtitle="Approve or discard pending segments" />
        <Card.Content style={{ gap: 10 }}>
          {authWarning ? <HelperText type="error" visible>{authWarning}</HelperText> : null}

          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Tip: Approve at least 10 good samples per class before training.
          </Text>

          <Divider />

          <TextInput
            label="Filter classes"
            value={classSearch}
            onChangeText={setClassSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={{ maxHeight: 220 }}>
            <ScrollView>
              {filteredClasses.map((c) => (
                <List.Item
                  key={c.id}
                  title={c.name}
                  description={c.id === '__all__' ? 'Show all pending segments' : c.id}
                  onPress={() => setSelectedClassId(c.id)}
                  right={() => (c.id === selectedClassId ? <List.Icon icon="check" /> : null)}
                />
              ))}
            </ScrollView>
          </View>

          <Button mode="outlined" disabled={!canUse || state === 'loading'} loading={state === 'loading'} onPress={loadClassesAndRecordings}>
            Refresh
          </Button>

          <HelperText type={error ? 'error' : 'info'} visible>
            {error || info || `Pending loaded: ${recordings.length}`}
          </HelperText>
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Pending Recordings" subtitle={`${recordings.length} item(s)`} />
        <Card.Content style={{ gap: 10 }}>
          {!canUse ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Sign in to load pending recordings.
            </Text>
          ) : recordings.length === 0 ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              No pending recordings found.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {recordings.slice(0, 200).map((rec) => (
                <Card key={rec.id}>
                  <Card.Content style={{ gap: 8 }}>
                    <Text variant="titleSmall">{rec.class_name || 'Unknown class'}</Text>
                    <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                      Duration: {formatSeconds(rec.duration)} · ID: {rec.id}
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        mode="outlined"
                        icon={playingId === rec.id ? 'stop' : 'play'}
                        onPress={() => playRecording(rec)}
                        disabled={state === 'verifying'}
                      >
                        {playingId === rec.id ? 'Stop' : 'Play'}
                      </Button>
                      <Button
                        mode="contained"
                        onPress={() => verifyOne(rec, true)}
                        loading={state === 'verifying'}
                        disabled={state === 'verifying'}
                      >
                        Approve
                      </Button>
                      <Button
                        mode="outlined"
                        onPress={() => verifyOne(rec, false)}
                        disabled={state === 'verifying'}
                      >
                        Discard
                      </Button>
                    </View>
                  </Card.Content>
                </Card>
              ))}
            </View>
          )}

          {hasNext ? (
            <Button
              mode="outlined"
              disabled={!canUse || state !== 'idle'}
              loading={state === 'loading'}
              onPress={() => loadRecordings(page + 1, true)}
            >
              Load more
            </Button>
          ) : null}
        </Card.Content>
      </Card>
    </ScrollView>
  )
}
