import * as React from 'react'
import { apiFetch } from '../api/client'

type UserMe = { id: number; email: string; role: string }

type AuthContextValue = {
  token: string | null
  user: UserMe | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

/** Decode the `exp` claim from a JWT without a library. Returns unix seconds or null. */
function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // Reject tokens without exp claim
    if (typeof payload.exp !== 'number') return null
    return payload.exp
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(() => sessionStorage.getItem('radioops_token'))
  const [user, setUser] = React.useState<UserMe | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable reference so it can be called recursively from inside the timeout.
  const scheduleRefresh = React.useCallback((tkn: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const exp = getTokenExp(tkn)
    if (!exp) return
    // Refresh 5 minutes before expiry (or immediately if already past that point).
    const delay = Math.max(0, exp * 1000 - Date.now() - 5 * 60 * 1000)
    refreshTimerRef.current = setTimeout(async () => {
      try {
        const resp = await apiFetch<{ access_token: string }>('/auth/refresh', { method: 'POST' }, tkn)
        const newTkn = resp.access_token
        setToken(newTkn)
        sessionStorage.setItem('radioops_token', newTkn)
        scheduleRefresh(newTkn)
      } catch {
        // Refresh failed (token already expired server-side). The user will be
        // naturally logged out on the next authenticated API call returning 401.
      }
    }, delay)
  }, [])  // setToken is a stable setter; no deps needed

  // Cancel the refresh timer on unmount.
  React.useEffect(() => {
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current) }
  }, [])

  const refreshMe = React.useCallback(async () => {
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const me = await apiFetch<UserMe>('/auth/me', {}, token)
      setUser(me)
      scheduleRefresh(token)
    } catch {
      setUser(null)
      setToken(null)
      sessionStorage.removeItem('radioops_token')
    } finally {
      setLoading(false)
    }
  }, [token, scheduleRefresh])

  React.useEffect(() => {
    refreshMe()
  }, [refreshMe])

  const login = React.useCallback(async (email: string, password: string) => {
    const resp = await apiFetch<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    setToken(resp.access_token)
    sessionStorage.setItem('radioops_token', resp.access_token)
    // Trigger /me fetch in next effect tick
    setLoading(true)
  }, [])

  const logout = React.useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    setToken(null)
    setUser(null)
    sessionStorage.removeItem('radioops_token')
  }, [])

  const value: AuthContextValue = { token, user, loading, login, logout, refreshMe }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
