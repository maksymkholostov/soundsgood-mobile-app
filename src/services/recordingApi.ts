import { createApiClient } from './apiClient'

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

export type MlRecordResponse = {
  success: boolean
  message?: string
  segment_count?: number
  segments?: Array<{
    id?: string
    url?: string
    duration?: number
    status?: string
    type?: string
    filename?: string
    path?: string
  }>
}

export async function uploadRecordedSample(
  apiBaseUrl: string,
  params: { soundClassId: string; audioUri: string; preprocessingVersion?: 'v1.0' | 'v2.0' }
): Promise<MlRecordResponse> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })

  const form = new FormData()
  const uri = params.audioUri
  const name = uri.split('/').pop() || 'recording.m4a'
  const type = name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/m4a'

  form.append('audio', { uri, name, type } as any)
  form.append('sound_class_id', params.soundClassId)
  form.append('preprocessing_version', params.preprocessingVersion || 'v2.0')

  return api.postFormData<MlRecordResponse>('/ml/record', form)
}

export async function uploadNoiseProfile(
  apiBaseUrl: string,
  params: { audioUri: string }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })

  const form = new FormData()
  const uri = params.audioUri
  const name = uri.split('/').pop() || 'noise_profile.m4a'
  const type = name.endsWith('.wav') ? 'audio/wav' : name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/m4a'
  form.append('noise_profile', { uri, name, type } as any)

  return api.postFormData('/sounds/noise_profile', form)
}

