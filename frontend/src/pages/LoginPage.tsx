import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Radio, Loader2 } from 'lucide-react'

export function LoginPage() {
  const { login, token } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (token) nav('/')
  }, [token, nav])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      nav('/')
    } catch (err: any) {
      setError(err?.message ?? 'Invalid credentials')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.36 0.14 279 / 0.25) 0%, transparent 70%)',
        }}
      />

      <div className="relative flex min-h-screen flex-col items-center justify-center p-6">
        {/* Logo mark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 shadow-sm ring-1 ring-primary/20">
            <Radio className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <div className="text-xl font-semibold tracking-tight">RadioOps</div>
            <div className="text-sm text-muted-foreground">Operations Console</div>
          </div>
        </div>

        {/* Card */}
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="mb-5">
            <h1 className="text-base font-semibold">Sign in</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Enter your credentials to continue</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
