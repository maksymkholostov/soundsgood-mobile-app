import { getBackendToken } from './tokenStore'

export class ApiError extends Error {
  status: number
  body: any

  constructor(message: string, status: number, body: any) {
    super(message)
    this.status = status
    this.body = body
  }
}

export type ApiClientConfig = {
  baseUrl: string
}

export function createApiClient(config: ApiClientConfig) {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getBackendToken()
    const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`

    const initHeaders = (init.headers || {}) as Record<string, string>
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...initHeaders,
    }

    if (!headers['Content-Type'] && init.body) headers['Content-Type'] = 'application/json'

    // Allow callers to override Authorization (e.g. Firebase sync uses an ID token).
    if (!headers.Authorization && token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { ...init, headers })
    const text = await res.text()
    const body = text ? safeJsonParse(text) : null

    if (!res.ok) {
      throw new ApiError(body?.error || body?.message || `HTTP ${res.status}`, res.status, body)
    }

    return (body as T) ?? ({} as T)
  }

  return {
    get: <T>(path: string, init: RequestInit = {}) => request<T>(path, { ...init, method: 'GET' }),
    post: <T>(path: string, json?: any, init: RequestInit = {}) =>
      request<T>(path, {
        ...init,
        method: 'POST',
        body: json === undefined ? undefined : JSON.stringify(json),
      }),
  }
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
