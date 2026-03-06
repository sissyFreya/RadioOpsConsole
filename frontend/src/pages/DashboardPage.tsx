import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Separator } from '../components/ui/separator'
import { Skeleton, SkeletonCard } from '../components/ui/skeleton'
import { cn } from '../utils/cn'
import { RefreshCw, ServerOff, ServerCrash } from 'lucide-react'
import { useLocale } from '../contexts/LocaleContext'

type AgentStatus = {
  system?: { cpu_load?: number; mem_used_percent?: number; disk_used_percent?: number }
  services?: Record<string, { name: string; active: boolean; substate: string }>
}

type NodeStatusEntry = {
  node: { id: number; name: string; agent_url: string }
  status: AgentStatus | null
  error: string | null
}

type StatusAllResponse = { nodes: NodeStatusEntry[] }

const REFETCH_MS = 10_000
const STALE_MS   = 8_000

export function DashboardPage() {
  const { token } = useAuth()
  const { t } = useLocale()

  const fleet = useQuery({
    queryKey: ['nodes', 'status-all'],
    queryFn: () => apiFetch<StatusAllResponse>('/nodes/status-all', {}, token),
    refetchInterval: REFETCH_MS,
    staleTime: STALE_MS,
  })

  const entries = fleet.data?.nodes ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fleet.refetch()}
          disabled={fleet.isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn('h-4 w-4', fleet.isFetching && 'animate-spin')} />
          {t('dashboard.refresh')}
        </Button>
      </div>

      <Separator />

      {fleet.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : fleet.isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ServerCrash className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <div className="text-sm font-medium text-foreground">{t('dashboard.noBackend')}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.noBackendHint')}</div>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ServerOff className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <div className="text-sm font-medium text-foreground">{t('dashboard.noNodes')}</div>
            <div className="text-xs text-muted-foreground">{t('dashboard.noNodesHint')}</div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {entries.map((entry) => (
            <NodeStatusCard key={entry.node.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeStatusCard({ entry }: { entry: NodeStatusEntry }) {
  const { node, status, error } = entry
  const { t } = useLocale()
  const services = status?.services ?? {}
  const sys = status?.system ?? {}

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{node.name}</CardTitle>
            <CardDescription className="font-mono text-xs">{node.agent_url}</CardDescription>
          </div>
          <Badge variant={error ? 'danger' : 'success'}>{error ? t('status.unreachable') : t('status.online')}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <ServerCrash className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="CPU" value={sys.cpu_load} />
              <Metric label="Memory" value={sys.mem_used_percent} suffix="%" />
              <Metric label="Disk" value={sys.disk_used_percent} suffix="%" />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('dashboard.services')}</div>
              {Object.keys(services).length === 0 ? (
                <div className="text-sm text-muted-foreground">{t('dashboard.noServices')}</div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(services).map(([name, svc]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
                    >
                      <div>
                        <div className="text-sm font-medium">{name}</div>
                        <div className="text-xs text-muted-foreground">{svc.substate}</div>
                      </div>
                      <Badge variant={svc.active ? 'success' : 'danger'}>{svc.active ? t('dashboard.up') : t('dashboard.down2')}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, suffix = '' }: { label: string; value: unknown; suffix?: string }) {
  const num = typeof value === 'number' ? value : null
  const pct = num !== null && suffix === '%' ? Math.min(100, Math.max(0, num)) : null
  const color =
    pct !== null
      ? pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
      : 'bg-primary'

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {num !== null ? (
        <>
          <div className="text-lg font-semibold leading-none">
            {num}{suffix}
          </div>
          {pct !== null && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all duration-700', color)}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </>
      ) : (
        <Skeleton className="h-6 w-10" />
      )}
    </div>
  )
}
