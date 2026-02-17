import { createApiClient } from './apiClient'

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

export type PendingClass = {
  id: string
  name: string
}

export type PendingRecording = {
  id: string
  class_id?: string
  class_name?: string
  url?: string
  duration?: number
  created_at?: string | null
}

export type PendingRecordingsResponse = {
  success: boolean
  recordings?: PendingRecording[]
  pagination?: {
    page: number
    per_page: number
    total_count: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
  error?: string
}

export async function fetchPendingClasses(apiBaseUrl: string): Promise<PendingClass[]> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const res = await api.get<any>('/sounds/pending/classes')
  const data = res?.data && res?.data?.classes ? res.data : res
  const ok = Boolean(res?.success || data?.success)
  return ok && Array.isArray(data?.classes) ? (data.classes as PendingClass[]) : []
}

export async function fetchPendingRecordings(
  apiBaseUrl: string,
  classId: string,
  params: { page?: number; perPage?: number } = {}
): Promise<PendingRecordingsResponse> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const page = params.page ?? 1
  const perPage = params.perPage ?? 50
  const res = await api.get<any>(`/sounds/pending/${encodeURIComponent(classId)}?page=${page}&per_page=${perPage}`)
  const data = res?.data && res?.data?.recordings ? res.data : res
  return (data || res) as PendingRecordingsResponse
}

export async function verifyPendingRecording(
  apiBaseUrl: string,
  params: { soundInstanceId: string; keep: boolean }
): Promise<{ success: boolean; message?: string; error?: string }> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  return api.post('/sounds/verify', { sound_instance_id: params.soundInstanceId, keep: params.keep })
}

