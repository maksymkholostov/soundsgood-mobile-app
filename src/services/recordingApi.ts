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

async function withRetries<T>(fn: () => Promise<T>, opts: { tries?: number; baseDelayMs?: number } = {}): Promise<T> {
  const tries = opts.tries ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 400
  let lastError: any
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastError = e
      const status = Number(e?.status || e?.statusCode || 0)
      const retryable =
        status >= 500 ||
        String(e?.message || '').toLowerCase().includes('network request failed') ||
        String(e?.message || '').toLowerCase().includes('failed to fetch')
      if (!retryable || i === tries - 1) throw e
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)))
    }
  }
  throw lastError
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

  return withRetries(() => api.postFormData<MlRecordResponse>('/ml/record', form), { tries: 3 })
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

  return withRetries(() => api.postFormData('/sounds/noise_profile', form), { tries: 3 })
}
