import { createApiClient } from './apiClient'

export type SoundClassItem = {
  id: string
  name: string
  display_name?: string | null
  language?: string
  description?: string | null
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

export async function fetchSoundClasses(apiBaseUrl: string): Promise<SoundClassItem[]> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const res = await api.get<any>('/sound-classes?page=1&per_page=10000&sort_by=created_at&sort_order=desc')
  return pickItems(res)
}

export async function createSoundClass(apiBaseUrl: string, name: string): Promise<SoundClassItem> {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const res = await api.post<any>('/sound-classes', { name: name.trim() })
  const data = res?.data || res?.data?.data || res?.data?.item || res?.item
  return (data || res?.data || res) as SoundClassItem
}

