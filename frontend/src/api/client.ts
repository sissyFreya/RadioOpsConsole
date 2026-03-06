// VITE_API_BASE: set at build time for Docker (e.g. "http://localhost:8081").
// In local dev (npm run dev) leave it unset — requests go through the Vite proxy
// defined in vite.config.ts, which forwards to localhost:8081 without CORS.
const API_BASE = import.meta.env.VITE_API_BASE || ''

export type ApiError = { status: number; message: string }

export function getApiBase() {
  return API_BASE
}

/** Returns the WebSocket base URL.
 *  - When API_BASE is an absolute URL (Docker build), replaces http(s) with ws(s).
 *  - When API_BASE is '' (local dev / Vite proxy), derives from the current page origin.
 */
export function getWsBase() {
  if (API_BASE) {
    return API_BASE.replace('https://', 'wss://').replace('http://', 'ws://')
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}`
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(opts.headers || {})

  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData
  if (!isFormData && !headers.has('Content-Type') && opts.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
  if (!res.ok) {
    const raw = await res.text()
    let message = raw || res.statusText

    try {
      const data = raw ? JSON.parse(raw) : null
      if (data && typeof data.detail === 'string') {
        message = data.detail
      } else if (data && Array.isArray(data.detail) && data.detail.length) {
        const first = data.detail[0]
        message = first?.msg ? String(first.msg) : JSON.stringify(data.detail)
      } else if (data) {
        message = JSON.stringify(data)
      }
    } catch {
      // keep raw message
    }

    throw { status: res.status, message } as ApiError
  }
  // 204 no content
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
