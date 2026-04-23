import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../api/client'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import { Skeleton } from '../components/ui/skeleton'
import { cn } from '../utils/cn'
import { RefreshCw, Database, HardDrive, Server, Boxes, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'
import { useLocale } from '../contexts/LocaleContext'

type ComponentStatus =
  | { ok: true;  latency_ms?: number }
  | { ok: false; error?: string }
  | { ok: null }

type RedisStatus = ComponentStatus & { available: boolean; note?: string }
type StorageStatus = { ok: boolean; type: string; free_gb?: number; free_pct?: number; bucket?: string; path?: string; error?: string }
type AgentStatus   = { node: string; ok: boolean; latency_ms?: number; error?: string }

type SystemHealth = {
  ok: boolean
  db: { ok: boolean; latency_ms?: number; error?: string }
  redis: RedisStatus
  storage: StorageStatus
  agents: AgentStatus[]
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === true)  return <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
  if (ok === false) return <XCircle      className="h-5 w-5 text-red-500 shrink-0" />
  return                   <MinusCircle  className="h-5 w-5 text-zinc-400 shrink-0" />
}

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === true)  return <Badge variant="success">OK</Badge>
  if (ok === false) return <Badge variant="danger">Error</Badge>
  return                   <Badge variant="secondary">N/A</Badge>
}

function HealthCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon: React.ElementType
  title: string
  status: boolean | null
  children: React.ReactNode
}) {
  return (
    <Card className={cn(status === false && 'border-red-500/30 bg-red-500/5')}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="ml-auto">
            <StatusBadge ok={status} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground/70">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  )
}

export function SystemHealthPage() {
  const { token } = useAuth()
  const { t } = useLocale()

  const query = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiFetch<SystemHealth>('/system/health', {}, token),
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const data = query.data

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('health.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('health.subtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => query.refetch()} disabled={query.isFetching} className="gap-2">
          <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
          {t('health.refresh')}
        </Button>
      </div>

      <Separator />

      {/* Overall banner */}
      {data && (
        <div className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium',
          data.ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            : 'border-red-500/30 bg-red-500/10 text-red-400',
        )}>
          <StatusIcon ok={data.ok} />
          {data.ok ? t('health.overall.ok') : t('health.overall.degraded')}
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {t('health.error')}
        </div>
      )}

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {/* DB */}
          <HealthCard icon={Database} title={t('health.db')} status={data.db.ok}>
            <StatusIcon ok={data.db.ok} />
            {data.db.latency_ms !== undefined && (
              <Detail label={t('health.latency')} value={`${data.db.latency_ms} ms`} />
            )}
            {data.db.error && (
              <p className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400 font-mono break-all">{data.db.error}</p>
            )}
          </HealthCard>

          {/* Redis */}
          <HealthCard icon={Boxes} title={t('health.redis')} status={data.redis.available ? data.redis.ok : null}>
            {!data.redis.available ? (
              <span className="text-xs text-muted-foreground/60">{t('health.notConfigured')}</span>
            ) : (
              <>
                <StatusIcon ok={data.redis.ok} />
                {(data.redis as any).latency_ms !== undefined && (
                  <Detail label={t('health.latency')} value={`${(data.redis as any).latency_ms} ms`} />
                )}
                {(data.redis as any).error && (
                  <p className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400 font-mono break-all">{(data.redis as any).error}</p>
                )}
              </>
            )}
          </HealthCard>

          {/* Storage */}
          <HealthCard icon={HardDrive} title={t('health.storage')} status={data.storage.ok}>
            <Detail label="Type" value={data.storage.type.toUpperCase()} />
            {data.storage.type === 'local' && data.storage.free_gb !== undefined && (
              <>
                <Detail label={t('health.freeSpace')} value={`${data.storage.free_gb} GB (${data.storage.free_pct}%)`} />
                {data.storage.free_pct !== undefined && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        data.storage.free_pct < 10 ? 'bg-red-500' : data.storage.free_pct < 20 ? 'bg-amber-500' : 'bg-emerald-500',
                      )}
                      style={{ width: `${data.storage.free_pct}%` }}
                    />
                  </div>
                )}
              </>
            )}
            {data.storage.type === 's3' && data.storage.bucket && (
              <Detail label={t('health.bucket')} value={data.storage.bucket} />
            )}
            {data.storage.error && (
              <p className="mt-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-400 font-mono break-all">{data.storage.error}</p>
            )}
          </HealthCard>

          {/* Agents */}
          <HealthCard
            icon={Server}
            title={t('health.agents')}
            status={data.agents.length > 0 ? data.agents.every(a => a.ok) : null}
          >
            {data.agents.length === 0 ? (
              <span className="text-xs text-muted-foreground/60">No nodes registered</span>
            ) : (
              <div className="space-y-2">
                {data.agents.map(agent => (
                  <div key={agent.node} className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
                    <StatusIcon ok={agent.ok} />
                    <span className="flex-1 text-xs font-medium text-foreground">{agent.node}</span>
                    {agent.latency_ms !== undefined && (
                      <span className="text-[10px] text-muted-foreground font-mono">{agent.latency_ms}ms</span>
                    )}
                    {agent.error && (
                      <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={agent.error}>{agent.error}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </HealthCard>
        </div>
      ) : null}
    </div>
  )
}
