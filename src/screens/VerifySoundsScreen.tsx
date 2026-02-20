import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Audio } from 'expo-av'
import { Button, Card, Chip, Divider, HelperText, List, Text, TextInput } from 'react-native-paper'

import { useAppSelector } from '../store/hooks'
import { useToast } from '../hooks/useToast'
import { fetchSoundClassDetail } from '../services/soundClassesApi'
import {
  fetchPendingClasses,
  fetchPendingRecordings,
  type PendingClass,
  type PendingRecording,
  verifyPendingRecording,
} from '../services/verifySoundsApi'

type LoadState = 'idle' | 'loading'

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
  const focusIds = (route?.params?.focusIds as string[] | undefined) || undefined
  const toast = useToast()

  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  const [classes, setClasses] = useState<PendingClass[]>([])
  const [classSearch, setClassSearch] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string>('__all__')

  const [recordings, setRecordings] = useState<PendingRecording[]>([])
  const [page, setPage] = useState(1)
  const [perPage] = useState(focusIds && focusIds.length > 0 ? 200 : 50)
  const [hasNext, setHasNext] = useState(false)
  const [counts, setCounts] = useState<{ gold: number; pending: number } | null>(null)
  const [bulk, setBulk] = useState<{ mode: 'approve' | 'discard'; done: number; total: number } | null>(null)

  const playbackRef = useRef<Audio.Sound | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  const canUse = auth.isAuthenticated
  const goal = 10
  const remainingToGoal = Math.max(0, goal - (counts?.gold || 0))

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
        let items = Array.isArray(res.recordings) ? res.recordings : []
        if (focusIds && focusIds.length > 0) {
          const order = new Map(focusIds.map((id, idx) => [id, idx]))
          items = items.slice().sort((a, b) => {
            const ai = order.has(a.id) ? (order.get(a.id) as number) : 1e9
            const bi = order.has(b.id) ? (order.get(b.id) as number) : 1e9
            return ai - bi
          })
        }
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
    [apiBaseUrl, canUse, focusIds, perPage, selectedClassId],
  )

  const loadCounts = useCallback(async () => {
    if (!canUse) return
    if (!selectedClassId || selectedClassId === '__all__') {
      setCounts(null)
      return
    }
    try {
      const res = await fetchSoundClassDetail(apiBaseUrl, selectedClassId, { status: 'pending', page: 1, perPage: 1 })
      const sc = res?.data?.sound_class
      if (res?.success && sc) {
        setCounts({ gold: Number(sc.gold_recordings || 0), pending: Number(sc.pending_recordings || 0) })
      }
    } catch {
      // ignore
    }
  }, [apiBaseUrl, canUse, selectedClassId])

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

  useEffect(() => {
    void loadCounts()
  }, [loadCounts])

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
        const tryPlay = async () => {
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
        }
        await tryPlay()
      } catch (e: any) {
        // One retry for flaky stream fetches.
        try {
          await new Promise((r) => setTimeout(r, 400))
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
        } catch (e2: any) {
          await stopPlayback()
          setError(String(e2?.message || e?.message || 'Playback failed'))
        }
      }
    },
    [apiBaseUrl, ensureAudioPlayback, playingId, stopPlayback],
  )

  const verifyOne = useCallback(
    async (rec: PendingRecording, keep: boolean) => {
      if (!rec?.id) return
      setVerifyingId(rec.id)
      setError(null)
      setInfo(null)
      try {
        await stopPlayback()
        const res = await verifyPendingRecording(apiBaseUrl, { soundInstanceId: rec.id, keep })
        if (!res?.success) throw new Error(res?.error || 'Verification failed')
        setRecordings((prev) => prev.filter((r) => r.id !== rec.id))
        setInfo(keep ? 'Approved' : 'Discarded')
        toast(keep ? 'Approved recording' : 'Discarded recording', 'success')
        // Update counts locally for selected class for live "remaining-to-10".
        setCounts((prev) => {
          if (!prev) return prev
          const pendingNext = Math.max(0, prev.pending - 1)
          const goldNext = keep ? prev.gold + 1 : prev.gold
          return { gold: goldNext, pending: pendingNext }
        })
      } catch (e: any) {
        setError(String(e?.message || 'Verification failed'))
        toast(String(e?.message || 'Verification failed'), 'error')
      } finally {
        setVerifyingId(null)
      }
    },
    [apiBaseUrl, stopPlayback, toast],
  )

  const bulkVerify = useCallback(
    async (mode: 'approve' | 'discard') => {
      if (!focusIds || focusIds.length === 0) return
      const keep = mode === 'approve'
      const ids = focusIds.slice()
      setBulk({ mode, done: 0, total: ids.length })
      setError(null)
      setInfo(null)
      try {
        await stopPlayback()
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i]
          setVerifyingId(id)
          let res: any
          try {
            res = await verifyPendingRecording(apiBaseUrl, { soundInstanceId: id, keep })
          } catch (e: any) {
            // If the item was already verified elsewhere, treat it as done.
            const msg = String(e?.message || e)
            if (e?.status === 404 || msg.toLowerCase().includes('not found') || msg.includes('404')) {
              res = { success: true }
            } else {
              throw e
            }
          }
          if (!res?.success) throw new Error(res?.error || 'Verification failed')
          setRecordings((prev) => prev.filter((r) => r.id !== id))
          setCounts((prev) => {
            if (!prev) return prev
            const pendingNext = Math.max(0, prev.pending - 1)
            const goldNext = keep ? prev.gold + 1 : prev.gold
            return { gold: goldNext, pending: pendingNext }
          })
          setBulk({ mode, done: i + 1, total: ids.length })
        }
        toast(keep ? 'Approved all uploaded segments' : 'Discarded all uploaded segments', 'success')
      } catch (e: any) {
        setError(String(e?.message || 'Bulk verify failed'))
        toast(String(e?.message || 'Bulk verify failed'), 'error')
      } finally {
        setVerifyingId(null)
        setBulk(null)
      }
    },
    [apiBaseUrl, focusIds, stopPlayback, toast],
  )

  const authWarning = !auth.isAuthenticated ? 'Please sign in first.' : null

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Card.Title title="Verify Sounds" subtitle={focusIds?.length ? 'Showing your latest uploaded segments first' : 'Approve or discard pending segments'} />
        <Card.Content style={{ gap: 10 }}>
          {authWarning ? <HelperText type="error" visible>{authWarning}</HelperText> : null}

          {counts && selectedClassId !== '__all__' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Chip compact icon={remainingToGoal === 0 ? 'check' : 'progress-clock'}>
                Gold: {Math.min(counts.gold, goal)}/{goal}
              </Chip>
              <Chip compact icon="timer-sand">Pending: {counts.pending}</Chip>
              {remainingToGoal > 0 ? (
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  Need {remainingToGoal} more approved samples.
                </Text>
              ) : (
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  Ready for training.
                </Text>
              )}
            </View>
          ) : null}

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

          {focusIds?.length ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button
                mode="contained"
                disabled={Boolean(verifyingId) || Boolean(bulk)}
                loading={bulk?.mode === 'approve'}
                onPress={() => bulkVerify('approve')}
              >
                Approve all (upload)
              </Button>
              <Button
                mode="outlined"
                disabled={Boolean(verifyingId) || Boolean(bulk)}
                loading={bulk?.mode === 'discard'}
                onPress={() => bulkVerify('discard')}
              >
                Discard all (upload)
              </Button>
              {bulk ? (
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  {bulk.mode === 'approve' ? 'Approving' : 'Discarding'} {bulk.done}/{bulk.total}…
                </Text>
              ) : null}
            </View>
          ) : null}

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
                        disabled={Boolean(verifyingId)}
                      >
                        {playingId === rec.id ? 'Stop' : 'Play'}
                      </Button>
                      <Button
                        mode="contained"
                        onPress={() => verifyOne(rec, true)}
                        loading={verifyingId === rec.id}
                        disabled={Boolean(verifyingId)}
                      >
                        Approve
                      </Button>
                      <Button
                        mode="outlined"
                        onPress={() => verifyOne(rec, false)}
                        loading={verifyingId === rec.id}
                        disabled={Boolean(verifyingId)}
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
