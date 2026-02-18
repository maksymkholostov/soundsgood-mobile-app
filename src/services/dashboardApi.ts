import { createApiClient } from './apiClient'

function normalizeApiBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/api')) return trimmed
  return `${trimmed}/api`
}

export type DashboardStats = {
  total_recordings: number
  original_recordings: number
  augmented_recordings: number
  pending_recordings: number
  dictionaries: number
  classes: number
  models: number
}

export async function fetchDashboardStats(apiBaseUrl: string, userId?: string | null) {
  const api = createApiClient({ baseUrl: normalizeApiBaseUrl(apiBaseUrl) })
  const qs = userId ? `?user_id=${encodeURIComponent(String(userId))}` : ''
  const res = await api.get<any>(`/dashboard/stats${qs}`)
  const data = res?.data && (res?.data?.stats || res?.data?.success !== undefined) ? res.data : res
  return data as { success: boolean; stats?: DashboardStats; error?: string }
}

