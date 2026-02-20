import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Audio } from 'expo-av'
import {
  Button,
  Card,
  Chip,
  Dialog,
  Divider,
  HelperText,
  List,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper'
import { useFocusEffect, useNavigation } from '@react-navigation/native'

import { useAppSelector } from '../store/hooks'
import { useToast } from '../hooks/useToast'
import { createSoundClass, fetchSoundClasses, type SoundClassItem } from '../services/soundClassesApi'
import { uploadNoiseProfile, uploadRecordedSample, type MlRecordResponse } from '../services/recordingApi'

type RecordingMode = 'idle' | 'recording' | 'recorded' | 'uploading' | 'noise_recording' | 'noise_uploading'

function formatMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function RecordSoundsScreen({ route }: any) {
  const navigation = useNavigation<any>()
  const apiBaseUrl = useAppSelector((s) => s.settings.apiBaseUrl)
  const auth = useAppSelector((s) => s.auth)
  const preselectedClassId = route?.params?.classId as string | undefined
  const toast = useToast()

  const [mode, setMode] = useState<RecordingMode>('idle')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [classes, setClasses] = useState<SoundClassItem[]>([])
  const [classesLoading, setClassesLoading] = useState(false)
  const [classSearch, setClassSearch] = useState('')
  const [classListLimit, setClassListLimit] = useState(100)
  const [newClassName, setNewClassName] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [classPickerOpen, setClassPickerOpen] = useState(false)

  const [preprocessingVersion, setPreprocessingVersion] = useState<'v1.0' | 'v2.0'>('v2.0')

  const recordingRef = useRef<Audio.Recording | null>(null)
  const playbackRef = useRef<Audio.Sound | null>(null)
  const [recordingUri, setRecordingUri] = useState<string | null>(null)
  const [recordingMs, setRecordingMs] = useState<number>(0)
  const [noiseSaved, setNoiseSaved] = useState(false)
  const [autoOpenVerify, setAutoOpenVerify] = useState(true)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAtRef = useRef<number>(0)

  const [uploadResult, setUploadResult] = useState<MlRecordResponse | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackMs, setPlaybackMs] = useState(0)
  const [playbackDurationMs, setPlaybackDurationMs] = useState(0)
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null)

  const selectedClass = useMemo(() => classes.find((c) => c.id === selectedClassId) || null, [classes, selectedClassId])
  const selectedGold = selectedClass ? Number(selectedClass.gold_recordings || 0) : 0
  const selectedPending = selectedClass ? Number(selectedClass.pending_recordings || 0) : 0
  const goal = 10
  const remainingToGoal = Math.max(0, goal - selectedGold)

  const filteredClasses = useMemo(() => {
    const q = classSearch.trim().toLowerCase()
    const all = !q ? classes : classes.filter((c) => (c.display_name || c.name || '').toLowerCase().includes(q))
    return all.slice(0, classListLimit)
  }, [classes, classSearch, classListLimit])

  const totalMatches = useMemo(() => {
    const q = classSearch.trim().toLowerCase()
    if (!q) return classes.length
    return classes.filter((c) => (c.display_name || c.name || '').toLowerCase().includes(q)).length
  }, [classes, classSearch])

  const canRecord = Boolean(selectedClassId) && mode !== 'uploading' && mode !== 'noise_recording' && mode !== 'noise_uploading'

  const loadClasses = useCallback(async () => {
    setClassesLoading(true)
    setError(null)
    try {
      const items = await fetchSoundClasses(apiBaseUrl)
      setClasses(items)
      const candidate = preselectedClassId && items.some((c) => c.id === preselectedClassId) ? preselectedClassId : null
      if (candidate) {
        setSelectedClassId(candidate)
      } else if (!selectedClassId && items.length > 0) {
        setSelectedClassId(items[0].id)
      } 
    } catch (e: any) {
      setError(String(e?.message || 'Failed to load classes'))
    } finally {
      setClassesLoading(false)
    }
  }, [apiBaseUrl, preselectedClassId, selectedClassId])

  useEffect(() => {
    void loadClasses()
  }, [loadClasses])

  // Refresh counts after returning from Verify / elsewhere.
  useFocusEffect(
    useCallback(() => {
      void loadClasses()
      return undefined
    }, [loadClasses]),
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      const cleanup = async () => {
        try {
          if (recordingRef.current) {
            await recordingRef.current.stopAndUnloadAsync()
          }
        } catch {
          // ignore
        } finally {
          recordingRef.current = null
        }

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

  const ensureAudioPermissions = useCallback(async () => {
    const perms = await Audio.requestPermissionsAsync()
    if (!perms.granted) throw new Error('Microphone permission is required')
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    })
  }, [])

  const startRecording = useCallback(async () => {
    if (!canRecord) return
    setError(null)
    setInfo(null)
    setUploadResult(null)
    setRecordingUri(null)
    setRecordingMs(0)

    try {
      await ensureAudioPermissions()

      const recording = new Audio.Recording()
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await recording.startAsync()
      recordingRef.current = recording

      recordingStartedAtRef.current = Date.now()
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = setInterval(() => {
        setRecordingMs(Date.now() - recordingStartedAtRef.current)
      }, 250)

      setMode('recording')
    } catch (e: any) {
      setMode('idle')
      setError(String(e?.message || 'Failed to start recording'))
    }
  }, [canRecord, ensureAudioPermissions])

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
      setIsPlaying(false)
      setPlaybackMs(0)
      setPlaybackDurationMs(0)
      setPlayingSegmentId(null)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    setError(null)
    setInfo(null)
    try {
      const rec = recordingRef.current
      if (!rec) return
      await rec.stopAndUnloadAsync()
      const uri = rec.getURI()
      recordingRef.current = null

      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null

      if (!uri) throw new Error('Recording file missing')
      setRecordingUri(uri)
      setMode('recorded')
    } catch (e: any) {
      setMode('idle')
      setError(String(e?.message || 'Failed to stop recording'))
    }
  }, [])

  const cancelRecording = useCallback(async () => {
    setError(null)
    setInfo(null)
    await stopPlayback()
    try {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync()
      }
    } catch {
      // ignore
    } finally {
      recordingRef.current = null
      setMode('idle')
      setRecordingUri(null)
      setRecordingMs(0)
      setUploadResult(null)
    }
  }, [stopPlayback])

  const playOrStopRecording = useCallback(async () => {
    if (!recordingUri) return
    setError(null)
    setInfo(null)

    if (isPlaying) {
      await stopPlayback()
      return
    }

    await stopPlayback()
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: recordingUri },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return
          setPlaybackMs(status.positionMillis || 0)
          setPlaybackDurationMs(status.durationMillis || 0)
          if (status.didJustFinish) void stopPlayback()
        }
      )
      playbackRef.current = sound
      setIsPlaying(true)
    } catch (e: any) {
      setError(String(e?.message || 'Playback failed'))
      await stopPlayback()
    }
  }, [isPlaying, recordingUri, stopPlayback])

  const playSegment = useCallback(
    async (seg: { id?: string; url?: string }) => {
      const url = seg?.url
      if (!url) {
        setError('Missing segment URL')
        return
      }

      const absolute = url.startsWith('http://') || url.startsWith('https://')
        ? url
        : `${new URL(apiBaseUrl).origin}${url.startsWith('/') ? '' : '/'}${url}`

      setError(null)
      setInfo(null)

      if (playingSegmentId && seg.id && playingSegmentId === seg.id) {
        await stopPlayback()
        return
      }

      await stopPlayback()
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: absolute },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return
            setPlaybackMs(status.positionMillis || 0)
            setPlaybackDurationMs(status.durationMillis || 0)
            if (status.didJustFinish) void stopPlayback()
          },
        )
        playbackRef.current = sound
        setPlayingSegmentId(seg.id || '__segment__')
      } catch (e: any) {
        await stopPlayback()
        setError(String(e?.message || 'Playback failed'))
      }
    },
    [apiBaseUrl, playingSegmentId, stopPlayback],
  )

  const createClass = useCallback(async () => {
    const name = newClassName.trim()
    if (!name) return
    if (!auth.isAuthenticated) {
      setError('Please sign in to create a class')
      return
    }
    setError(null)
    setInfo(null)
    try {
      const created = await createSoundClass(apiBaseUrl, name)
      setClasses((prev) => {
        const exists = prev.some((c) => c.id === created.id)
        return exists ? prev : [created, ...prev]
      })
      setSelectedClassId(created.id)
      setNewClassName('')
      setInfo(`Selected class: ${created.display_name || created.name}`)
      toast(`Class created: ${created.display_name || created.name}`, 'success')
    } catch (e: any) {
      setError(String(e?.message || 'Failed to create class'))
      toast(String(e?.message || 'Failed to create class'), 'error')
    }
  }, [apiBaseUrl, auth.isAuthenticated, newClassName, toast])

  const processRecording = useCallback(async () => {
    if (!recordingUri || !selectedClassId) return
    setMode('uploading')
    setError(null)
    setInfo(null)
    setUploadResult(null)
    try {
      await stopPlayback()
      const res = await uploadRecordedSample(apiBaseUrl, {
        soundClassId: selectedClassId,
        audioUri: recordingUri,
        preprocessingVersion,
      })
      setUploadResult(res)
      if (res?.success) {
        setInfo(res?.message || 'Uploaded')
        toast(res?.message || 'Uploaded', 'success')
        const ids = (res?.segments || []).map((s) => s.id).filter(Boolean) as string[]
        if (autoOpenVerify && ids.length > 0) {
          navigation.navigate('Verify', { classId: selectedClassId, focusIds: ids })
        }
      } else {
        setError(res?.message || 'Upload failed')
        toast(res?.message || 'Upload failed', 'error')
      }
      setMode('recorded')
    } catch (e: any) {
      setMode('recorded')
      const msg = String(e?.message || 'Upload failed')
      // Backend can fail on dedup (same audio hash) and returns a generic message.
      const friendly = msg.includes('Failed to save the raw recording')
        ? 'Upload rejected (likely duplicate audio). Please record a slightly different sample and try again.'
        : msg
      setError(friendly)
      toast(friendly, 'error', 4500)
    }
  }, [apiBaseUrl, autoOpenVerify, navigation, preprocessingVersion, recordingUri, selectedClassId, stopPlayback, toast])

  const recordNoiseProfile = useCallback(async () => {
    setError(null)
    setInfo(null)
    setNoiseSaved(false)
    setMode('noise_recording')

    try {
      await ensureAudioPermissions()

      const recording = new Audio.Recording()
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      await recording.startAsync()

      await new Promise((r) => setTimeout(r, 3000))

      await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      if (!uri) throw new Error('Noise profile file missing')

      setMode('noise_uploading')
      const res = await uploadNoiseProfile(apiBaseUrl, { audioUri: uri })
      if (!res?.success) throw new Error(res?.error || 'Failed to upload noise profile')

      setNoiseSaved(true)
      setMode('idle')
      setInfo('Noise profile saved')
    } catch (e: any) {
      setMode('idle')
      setError(String(e?.message || 'Noise profile failed'))
    }
  }, [apiBaseUrl, ensureAudioPermissions])

  const authWarning = !auth.isAuthenticated ? 'Please sign in first.' : null

  return (
    <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Portal>
        <Dialog visible={classPickerOpen} onDismiss={() => setClassPickerOpen(false)}>
          <Dialog.Title>Select sound class</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Search"
              value={classSearch}
              onChangeText={(t) => {
                setClassSearch(t)
                setClassListLimit(100)
              }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={{ maxHeight: 320, marginTop: 10 }}>
              <ScrollView nestedScrollEnabled>
                {classesLoading ? (
                  <List.Item title="Loading classes…" />
                ) : filteredClasses.length === 0 ? (
                  <List.Item title="No classes found" />
                ) : (
                  filteredClasses.map((c) => (
                    <List.Item
                      key={c.id}
                      title={c.display_name || c.name}
                      description={c.id}
                      onPress={() => {
                        setSelectedClassId(c.id)
                        setClassPickerOpen(false)
                      }}
                      right={() => (c.id === selectedClassId ? <List.Icon icon="check" /> : null)}
                    />
                  ))
                )}
              </ScrollView>
            </View>
            {totalMatches > filteredClasses.length ? (
              <Button mode="outlined" onPress={() => setClassListLimit((v) => v + 100)} style={{ marginTop: 8 }}>
                Show more ({filteredClasses.length}/{totalMatches})
              </Button>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setClassPickerOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Card>
        <Card.Title title="Record Sounds" subtitle={selectedClass ? (selectedClass.display_name || selectedClass.name) : 'Select a class'} />
        <Card.Content style={{ gap: 10 }}>
          {authWarning ? <HelperText type="error" visible>{authWarning}</HelperText> : null}

          <Text variant="bodySmall" style={{ opacity: 0.75 }}>
            Step 1: select or create a sound class. Step 2: record and upload samples for verification.
          </Text>

          <Divider />

          <TextInput
            label="Sound class"
            value={selectedClass ? (selectedClass.display_name || selectedClass.name) : ''}
            editable={false}
            right={<TextInput.Icon icon="chevron-down" onPress={() => setClassPickerOpen(true)} />}
            placeholder="Select a class…"
          />

          {selectedClass ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Chip compact icon={remainingToGoal === 0 ? 'check' : 'progress-clock'}>
                Gold: {Math.min(selectedGold, goal)}/{goal}
              </Chip>
              <Chip compact icon="timer-sand">
                Pending: {selectedPending}
              </Chip>
              {remainingToGoal > 0 ? (
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  Need {remainingToGoal} more approved samples before training.
                </Text>
              ) : (
                <Text variant="bodySmall" style={{ opacity: 0.75 }}>
                  Ready for training (10+ approved samples).
                </Text>
              )}
            </View>
          ) : null}

          <Button mode="outlined" loading={classesLoading} disabled={classesLoading} onPress={() => setClassPickerOpen(true)}>
            Select class (dropdown)
          </Button>

          <Button mode="outlined" loading={classesLoading} disabled={classesLoading} onPress={loadClasses}>
            Refresh classes
          </Button>

          <Button mode="text" onPress={() => navigation.navigate('Classes')}>
            Open Sound Classes page
          </Button>

          <Divider />

          <TextInput
            label="Create new class (word)"
            value={newClassName}
            onChangeText={setNewClassName}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button mode="contained" disabled={!newClassName.trim().length} onPress={createClass}>
            Create + select class
          </Button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Title title="Recording" subtitle={`Preprocessing: ${preprocessingVersion}`} />
        <Card.Content style={{ gap: 10 }}>
          <SegmentedButtons
            value={preprocessingVersion}
            onValueChange={(v) => setPreprocessingVersion(v as any)}
            buttons={[
              { value: 'v2.0', label: 'v2.0 (recommended)' },
              { value: 'v1.0', label: 'v1.0' },
            ]}
          />

          <Button
            mode="outlined"
            loading={mode === 'noise_recording' || mode === 'noise_uploading'}
            disabled={!auth.isAuthenticated || mode === 'recording' || mode === 'uploading'}
            onPress={recordNoiseProfile}
          >
            {noiseSaved ? 'Noise profile saved' : 'Record noise profile (3s)'}
          </Button>

          <Divider />

          <Text variant="bodyMedium">
            {mode === 'recording' ? `Recording… ${formatMs(recordingMs)}` : recordingUri ? `Recorded: ${formatMs(recordingMs)}` : 'Ready to record'}
          </Text>

          {mode !== 'recording' ? (
            <Button mode="contained" disabled={!auth.isAuthenticated || !canRecord} onPress={startRecording}>
              Start recording
            </Button>
          ) : (
            <Button mode="contained" buttonColor="#b00020" onPress={stopRecording}>
              Stop recording
            </Button>
          )}

          <Button
            mode="outlined"
            icon={recordingUri ? (isPlaying ? 'stop' : 'play') : undefined}
            disabled={!recordingUri || mode === 'recording' || mode === 'uploading'}
            onPress={playOrStopRecording}
          >
            {recordingUri ? (isPlaying ? `Stop playback (${formatMs(playbackMs)})` : 'Play recording') : 'Play recording'}
          </Button>

          {recordingUri ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Playback: {formatMs(playbackMs)} / {formatMs(playbackDurationMs || recordingMs)}
            </Text>
          ) : null}

          <Button
            mode="outlined"
            disabled={mode === 'uploading' || mode === 'noise_recording' || mode === 'noise_uploading'}
            onPress={cancelRecording}
          >
            Cancel recording
          </Button>

          <Button
            mode="outlined"
            loading={mode === 'uploading'}
            disabled={!auth.isAuthenticated || !recordingUri || mode === 'recording' || mode === 'uploading' || !selectedClassId}
            onPress={processRecording}
          >
            Process raw recording
          </Button>

          <Button
            mode={autoOpenVerify ? 'contained' : 'outlined'}
            icon={autoOpenVerify ? 'check' : 'close'}
            onPress={() => setAutoOpenVerify((v) => !v)}
            disabled={mode === 'uploading' || mode === 'recording'}
          >
            Auto-open Verify after upload: {autoOpenVerify ? 'On' : 'Off'}
          </Button>

          {uploadResult?.success ? (
            <Text variant="bodySmall" style={{ opacity: 0.75 }}>
              Note: Verify page contains extracted segments (not the full raw recording). Use Verify to approve segments.
            </Text>
          ) : null}

          {uploadResult ? (
            <View style={{ gap: 6 }}>
              <Text variant="bodySmall" style={{ opacity: 0.8 }}>
                Result: {uploadResult.success ? 'Success' : 'Failed'} · Segments: {uploadResult.segment_count ?? uploadResult.segments?.length ?? 0}
              </Text>
              {(uploadResult.segments || []).slice(0, 10).map((seg, idx) => (
                <View key={`${seg.id || idx}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text variant="bodySmall">
                    - {seg.id || '(no id)'} {seg.duration ? `(${seg.duration.toFixed?.(2) || seg.duration}s)` : ''}
                  </Text>
                  {seg.url ? (
                    <Button
                      mode="text"
                      compact
                      icon={playingSegmentId === (seg.id || '__segment__') ? 'stop' : 'play'}
                      onPress={() => playSegment(seg)}
                    >
                      {playingSegmentId === (seg.id || '__segment__') ? 'Stop' : 'Play seg'}
                    </Button>
                  ) : null}
                </View>
              ))}
              {(uploadResult.segments || []).length > 10 ? (
                <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                  …and {(uploadResult.segments || []).length - 10} more
                </Text>
              ) : null}

              {uploadResult.success && (uploadResult.segments || []).length > 0 ? (
                <Button
                  mode="contained"
                  onPress={() =>
                    navigation.navigate('Verify', {
                      classId: selectedClassId,
                      focusIds: (uploadResult.segments || []).map((s) => s.id).filter(Boolean),
                    })
                  }
                >
                  Verify these segments
                </Button>
              ) : null}
            </View>
          ) : null}

          <HelperText type={error ? 'error' : 'info'} visible>
            {error || info || 'Tip: Record clearly and vary pronunciation. Approve at least 10 good samples per class.'}
          </HelperText>
        </Card.Content>
      </Card>
    </ScrollView>
  )
}
