import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { useFavorites } from '../contexts/FavoritesContext'
import { useToast } from '../contexts/ToastContext'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Separator } from '../components/ui/separator'
import { Radio, Server, Star, Globe, Shield, Activity, KeyRound, Trash2, ExternalLink } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

type AuditEvent = {
  id: number
  actor: string
  event: string
  target: string | null
  result: string
  details: string | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateTime(v?: string | null) {
  if (!v) return '--'
  const d = new Date(v)
  return Number.isNaN(d.valueOf()) ? '--' : d.toLocaleString()
}

function RoleBadge({ role }: { role?: string }) {
  const variant =
    role === 'admin' ? 'danger' : role === 'ops' ? 'warning' : 'default'
  return <Badge variant={variant}>{role || 'viewer'}</Badge>
}

function UserAvatar({ email, size = 'lg' }: { email: string; size?: 'sm' | 'lg' }) {
  const initials = email
    .split('@')[0]
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase()
  const cls =
    size === 'lg'
      ? 'h-16 w-16 rounded-2xl text-xl'
      : 'h-8 w-8 rounded-xl text-xs'
  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-primary font-bold text-primary-foreground ${cls}`}
    >
      {initials}
    </div>
  )
}

// ── Tab: Preferences ─────────────────────────────────────────────────────

function PreferencesTab() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <CardTitle>{t('profile.language')}</CardTitle>
          </div>
          <CardDescription>
            {locale === 'fr'
              ? 'Choisissez la langue d\'affichage de l\'interface.'
              : 'Choose the display language for the interface.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {(['fr', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-medium transition-all ${
                  locale === lang
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                <span className="text-xl">{lang === 'fr' ? '🇫🇷' : '🇬🇧'}</span>
                <div className="text-left">
                  <div className="font-semibold">{t(`profile.language.${lang}`)}</div>
                  <div className="text-xs text-muted-foreground">
                    {lang === 'fr' ? 'Interface en français' : 'English interface'}
                  </div>
                </div>
                {locale === lang && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {locale === 'fr'
              ? 'La préférence est enregistrée localement dans votre navigateur.'
              : 'Preference is saved locally in your browser.'}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Tab: Favorites ────────────────────────────────────────────────────────

function FavoritesTab() {
  const { t } = useLocale()
  const { radios, nodes, remove } = useFavorites()

  const FavList = ({
    items,
    type,
    icon: Icon,
    label,
    linkBase,
  }: {
    items: ReturnType<typeof useFavorites>['radios']
    type: 'radio' | 'node'
    icon: any
    label: string
    linkBase: string
  }) => (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">{label}</CardTitle>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {items.length}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Star className="h-4 w-4 opacity-40" />
            {t('profile.favorites.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-muted/20 px-4 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium text-foreground">{fav.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      #{fav.id} · {formatDateTime(fav.addedAt)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`${linkBase}/${fav.id}`} className="flex items-center gap-1.5 text-xs">
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('profile.favorites.go')}
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(type, fav.id)}
                    className="text-destructive hover:text-destructive"
                    title={t('profile.favorites.remove')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-4">
      <FavList
        items={radios}
        type="radio"
        icon={Radio}
        label={t('profile.favorites.radios')}
        linkBase="/radios"
      />
      <FavList
        items={nodes}
        type="node"
        icon={Server}
        label={t('profile.favorites.nodes')}
        linkBase="/nodes"
      />
    </div>
  )
}

// ── Tab: Security (change password) ──────────────────────────────────────

function SecurityTab() {
  const { t } = useLocale()
  const { token } = useAuth()
  const { push } = useToast()

  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) { setError(t('profile.security.mismatch')); return }
    if (next.length < 8) { setError(t('profile.security.minLen')); return }
    setBusy(true)
    setError(null)
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      }, token)
      setSuccess(true)
      setCurrent(''); setNext(''); setConfirm('')
      push({ title: t('profile.security.success'), variant: 'success' })
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err?.message || t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <CardTitle>{t('profile.security.change')}</CardTitle>
        </div>
        <CardDescription>{t('profile.security.minLen')}</CardDescription>
      </CardHeader>
      <CardContent>
        {success && (
          <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {t('profile.security.success')}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('profile.security.current')}</label>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('profile.security.new')}</label>
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t('profile.security.confirm')}</label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          {error && <div className="text-xs text-destructive">{error}</div>}
          <Button type="submit" disabled={busy}>
            {busy ? '…' : t('profile.security.change')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Tab: Activity ─────────────────────────────────────────────────────────

function ActivityTab() {
  const { t } = useLocale()
  const { token, user } = useAuth()

  const q = useQuery({
    queryKey: ['audit-me', user?.email],
    queryFn: () => {
      const params = new URLSearchParams()
      if (user?.email) params.set('actor', user.email)
      params.set('limit', '50')
      return apiFetch<AuditEvent[]>(`/audit/?${params.toString()}`, {}, token)
    },
    enabled: !!token && !!user?.email,
    staleTime: 10_000,
  })

  const badge = (r: string) =>
    r === 'ok' ? 'success' : r === 'error' ? 'danger' : r === 'warning' ? 'warning' : 'default'

  const events = q.data ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle>{t('profile.activity.title')}</CardTitle>
        </div>
        <CardDescription>
          {t('profile.tab.activity')} · {user?.email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {q.isLoading && (
          <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
        )}
        {!q.isLoading && events.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('profile.activity.empty')}
          </div>
        )}
        {events.length > 0 && (
          <div className="overflow-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-3">{t('profile.activity.event')}</th>
                  <th className="p-3">{t('profile.activity.target')}</th>
                  <th className="p-3">{t('profile.activity.result')}</th>
                  <th className="p-3 whitespace-nowrap">{t('profile.activity.date')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-t border-border">
                    <td className="p-3 font-mono text-xs text-foreground">{ev.event}</td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[180px] truncate">
                      {ev.target || '—'}
                    </td>
                    <td className="p-3">
                      <Badge variant={badge(ev.result) as any}>{ev.result}</Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(ev.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export function ProfilePage() {
  const { user } = useAuth()
  const { t, locale } = useLocale()
  const { radios: favRadios, nodes: favNodes } = useFavorites()
  const totalFavs = favRadios.length + favNodes.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-4">
          <UserAvatar email={user?.email ?? 'user'} size="lg" />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{user?.email}</h1>
              <RoleBadge role={user?.role} />
            </div>
            <div className="text-sm text-muted-foreground">{t('profile.subtitle')}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              {locale === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
              <Separator orientation="vertical" className="h-3" />
              <Star className="h-3.5 w-3.5" />
              {totalFavs} {locale === 'fr' ? 'favori(s)' : 'favorite(s)'}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="preferences">
        <TabsList className="flex flex-wrap w-full">
          <TabsTrigger value="preferences" className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {t('profile.tab.preferences')}
          </TabsTrigger>
          <TabsTrigger value="favorites" className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5" />
            {t('profile.tab.favorites')}
            {totalFavs > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                {totalFavs}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            {t('profile.tab.security')}
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            {t('profile.tab.activity')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preferences" className="mt-4">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="favorites" className="mt-4">
          <FavoritesTab />
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <SecurityTab />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ActivityTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
