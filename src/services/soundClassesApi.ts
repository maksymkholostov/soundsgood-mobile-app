import { createApiClient } from './apiClient'

export type SoundClassItem = {
  id: string
  name: string
  display_name?: string | null
  language?: string
  description?: string | null
  owner_id?: string | null
  recorder_display?: string | null
  total_recordings?: number
  pending_recordings?: number
  gold_recordings?: number
  raw_recordings?: number
  augmented_recordings?: number
  training_recordings?: number
}

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

function pickItems(payload: any): SoundClassItem[] {
  const items = payload?.data?.items || payload?.items || payload?.data?.data?.items
  if (Array.isArray(items)) return items
  return []
}

export type SoundClassesPagination = {
  page: number
  per_page: number
  total_count: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
  next_page?: number | null
  prev_page?: number | null
}

export async function fetchSoundClassesPage(
  apiBaseUrl: string,
  params: { page?: number; perPage?: number; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {}
): Promise<{ items: SoundClassItem[]; pagination: SoundClassesPagination | null }> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const page = params.page ?? 1
  const perPage = params.perPage ?? 100
  const search = params.search?.trim() ? `&search=${encodeURIComponent(params.search.trim())}` : ''
  const sortBy = params.sortBy || 'created_at'
  const sortOrder = params.sortOrder || 'desc'
  const res = await api.get<any>(
    `/sound-classes?page=${page}&per_page=${perPage}&sort_by=${encodeURIComponent(sortBy)}&sort_order=${encodeURIComponent(sortOrder)}${search}`
  )
  const items = pickItems(res)
  const pagination = res?.data?.pagination || res?.pagination || res?.data?.data?.pagination || null
  return { items, pagination }
}

export async function fetchSoundClasses(apiBaseUrl: string): Promise<SoundClassItem[]> {
  const { items } = await fetchSoundClassesPage(apiBaseUrl, { page: 1, perPage: 10000, sortBy: 'name', sortOrder: 'asc' })
  return items
}

export async function createSoundClass(apiBaseUrl: string, name: string): Promise<SoundClassItem> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const res = await api.post<any>('/sound-classes', { name: name.trim() })
  const data = res?.data || res?.data?.data || res?.data?.item || res?.item
  return (data || res?.data || res) as SoundClassItem
}
