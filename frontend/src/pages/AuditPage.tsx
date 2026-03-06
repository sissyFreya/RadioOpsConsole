import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Button } from '../components/ui/button'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { RoleGate } from '../components/RoleGate'
import { SkeletonRow } from '../components/ui/skeleton'
import { Download, Shield } from 'lucide-react'
import { useLocale } from '../contexts/LocaleContext'

function exportCsv(rows: AuditEvent[]) {
  const header = 'id,actor,event,target,result,details,created_at'
  const lines = rows.map((a) =>
    [a.id, a.actor, a.event, a.target || '', a.result, (a.details || '').replace(/"/g, '""'), a.created_at]
      .map((v) => `"${v}"`)
      .join(',')
  )
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url
  el.download = 'audit.csv'
  el.click()
  URL.revokeObjectURL(url)
}

type AuditEvent = {
  id: number
  actor: string
  event: string
  target: string | null
  result: string
  details: string | null
  created_at: string
}

export function AuditPage() {
  const { token, user } = useAuth()
  const { t } = useLocale()
  const queryClient = useQueryClient()
  const [actor, setActor] = React.useState('')
  const [event, setEvent] = React.useState('')
  const [result, setResult] = React.useState('')

  const [purgeOpen, setPurgeOpen] = React.useState(false)
  const [purgeDays, setPurgeDays] = React.useState(90)
  const [purgeBusy, setPurgeBusy] = React.useState(false)

  const q = useQuery({
    queryKey: ['audit', actor, event, result],
    queryFn: () => {
      const params = new URLSearchParams()
      if (actor) params.set('actor', actor)
      if (event) params.set('event', event)
      if (result) params.set('result', result)
      return apiFetch<AuditEvent[]>(`/audit/?${params.toString()}`, {}, token)
    },
    enabled: !!token,
    refetchInterval: 8000,
    staleTime: 7_000
  })

  async function handlePurge() {
    setPurgeBusy(true)
    try {
      await apiFetch(`/audit/purge?older_than_days=${purgeDays}`, { method: 'DELETE' }, token)
      queryClient.invalidateQueries({ queryKey: ['audit'] })
      setPurgeOpen(false)
    } finally {
      setPurgeBusy(false)
    }
  }

  const badge = (r: string) => (r === 'ok' ? 'success' : r === 'error' ? 'danger' : r === 'warning' ? 'warning' : 'default')

  const events = (q.data ?? []).slice(0, 400)

  return (
    <RoleGate roles={['admin', 'ops']} fallback={<div className="text-muted-foreground">Forbidden</div>}>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('audit.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('audit.subtitle')}</p>
          </div>
          {user?.role === 'admin' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">{t('audit.olderThan')}</label>
              <Input
                type="number"
                min={1}
                max={3650}
                value={purgeDays}
                onChange={(e) => setPurgeDays(Number(e.target.value))}
                className="h-8 w-20 text-sm"
              />
              <span className="text-xs text-muted-foreground">{t('audit.days')}</span>
              <Button variant="destructive" size="sm" onClick={() => setPurgeOpen(true)}>
                {t('audit.purge')}
              </Button>
            </div>
          )}
        </div>
        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>{t('audit.filters')}</CardTitle>
            <CardDescription>{t('audit.filtersDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{t('audit.actor')}</div>
              <Input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="admin@local" />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{t('audit.auditEvent')}</div>
              <Input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="radio.create" />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{t('profile.activity.result')}</div>
              <Select value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="">{t('audit.any')}</option>
                <option value="ok">ok</option>
                <option value="error">error</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('audit.events')}</CardTitle>
                <CardDescription>{t('audit.eventsDesc')}</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportCsv(events)}
                disabled={events.length === 0}
              >
                <Download className="h-4 w-4" />
                {t('audit.exportCsv')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/30">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('audit.time')}</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('audit.actor')}</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('audit.auditEvent')}</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('audit.target')}</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('profile.activity.result')}</th>
                    <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('profile.activity.target', 'Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                  ) : events.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                          <Shield className="h-8 w-8 text-muted-foreground/30" />
                          <div className="text-sm text-muted-foreground">{t('audit.noEvents')}</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    events.map((a) => (
                      <tr key={a.id} className="border-t border-border/60 transition-colors hover:bg-muted/20">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-foreground">{a.actor}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{a.event}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 font-mono text-xs text-muted-foreground" title={a.target || ''}>
                          {a.target || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={badge(a.result) as any}>{a.result}</Badge>
                        </td>
                        <td className="max-w-[380px] truncate px-4 py-3 text-xs text-muted-foreground" title={a.details || ''}>
                          {a.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {q.isError ? (
              <div className="mt-3 text-sm text-destructive">{t('audit.failed')}</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        title={t('audit.purgeTitle')}
        description={`${t('audit.olderThan')} ${purgeDays} ${t('audit.days')}.`}
        confirmText={t('audit.purge')}
        confirmVariant="destructive"
        onConfirm={handlePurge}
        busy={purgeBusy}
      />
    </RoleGate>
  )
}
