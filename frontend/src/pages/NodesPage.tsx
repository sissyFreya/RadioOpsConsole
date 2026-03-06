import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useCan } from '../components/RoleGate'
import { useToast } from '../contexts/ToastContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Select } from '../components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Zap, Star } from 'lucide-react'
import { useFavorites } from '../contexts/FavoritesContext'
import { useLocale } from '../contexts/LocaleContext'
import type { ActionOut } from './ActionsPage'

type NodeOut = { id: number; name: string; agent_url: string; created_at: string }

type NodeStatus = {
  node: { id: number; name: string; agent_url: string }
  status: {
    services: Record<string, { name: string; active: boolean; substate?: string; since?: string }>
    system: Record<string, any>
  }
}

type StatusRecord = {
  data: NodeStatus | null
  loading: boolean
  error?: string
  updatedAt?: string
}

type NodeState = {
  key: 'healthy' | 'degraded' | 'down' | 'unknown'
  label: string
  variant: 'success' | 'warning' | 'danger' | 'default'
}

function getErrorMessage(err: unknown) {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: string }).message)
  return 'Request failed'
}

function formatDateTime(value?: string | null) {
  if (!value) return '--'
  const d = new Date(value)
  if (Number.isNaN(d.valueOf())) return '--'
  return d.toLocaleString()
}

function getNodeState(record?: StatusRecord): NodeState {
  if (!record) return { key: 'unknown', label: 'Unknown', variant: 'default' }
  if (record.loading) return { key: 'unknown', label: 'Checking', variant: 'warning' }
  if (record.error) return { key: 'down', label: 'Unreachable', variant: 'danger' }
  const services = Object.values(record.data?.status.services || {})
  if (!services.length) return { key: 'unknown', label: 'No data', variant: 'warning' }
  const active = services.filter((svc) => svc.active).length
  if (active === services.length) return { key: 'healthy', label: 'Healthy', variant: 'success' }
  if (active === 0) return { key: 'down', label: 'Down', variant: 'danger' }
  return { key: 'degraded', label: 'Degraded', variant: 'warning' }
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[11px] font-semibold text-muted-foreground">
        ?
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-56 -translate-x-1/2 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function NodesPage() {
  const { token, user } = useAuth()
  const qc = useQueryClient()
  const canManage = useCan('admin', 'ops')
  const canDelete = useCan('admin')
  const { push } = useToast()
  const { isFavorite, toggle: toggleFav } = useFavorites()
  const { t } = useLocale()

  const [name, setName] = React.useState('')
  const [agentUrl, setAgentUrl] = React.useState('http://agent:9000')
  const [search, setSearch] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const [refreshInterval, setRefreshInterval] = React.useState(15000)
  const [lastRefreshAt, setLastRefreshAt] = React.useState<string | null>(null)
  const [statusById, setStatusById] = React.useState<Record<number, StatusRecord>>({})
  const [serviceByNode, setServiceByNode] = React.useState<Record<number, string>>({})
  const [actionByNode, setActionByNode] = React.useState<Record<number, 'restart' | 'reload'>>({})

  const [editOpen, setEditOpen] = React.useState(false)
  const [editTarget, setEditTarget] = React.useState<NodeOut | null>(null)
  const [editName, setEditName] = React.useState('')
  const [editAgentUrl, setEditAgentUrl] = React.useState('')

  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<NodeOut | null>(null)

  // Bulk actions
  const [bulkService, setBulkService] = React.useState('icecast2')
  const [bulkAction, setBulkAction] = React.useState<'restart' | 'reload'>('restart')
  const [bulkSelected, setBulkSelected] = React.useState<Set<number>>(new Set())

  const nodesQ = useQuery({
    queryKey: ['nodes'],
    queryFn: () => apiFetch<NodeOut[]>('/nodes/', {}, token),
    staleTime: 30_000
  })

  const createM = useMutation({
    mutationFn: () =>
      apiFetch<NodeOut>(
        '/nodes/',
        { method: 'POST', body: JSON.stringify({ name: name.trim(), agent_url: agentUrl.trim() }) },
        token
      ),
    onSuccess: () => {
      setName('')
      qc.invalidateQueries({ queryKey: ['nodes'] })
    }
  })

  const updateM = useMutation({
    mutationFn: (payload: { id: number; name: string; agent_url: string }) =>
      apiFetch<NodeOut>(
        `/nodes/${payload.id}`,
        { method: 'PATCH', body: JSON.stringify({ name: payload.name, agent_url: payload.agent_url }) },
        token
      ),
    onSuccess: (node) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      setEditOpen(false)
      setEditTarget(null)
      setStatusById((prev) => {
        const existing = prev[node.id]
        if (!existing?.data) return prev
        return {
          ...prev,
          [node.id]: {
            ...existing,
            data: {
              ...existing.data,
              node: { id: node.id, name: node.name, agent_url: node.agent_url }
            }
          }
        }
      })
    }
  })

  const deleteM = useMutation({
    mutationFn: (nodeId: number) => apiFetch<void>(`/nodes/${nodeId}`, { method: 'DELETE' }, token),
    onSuccess: (_data, nodeId) => {
      qc.invalidateQueries({ queryKey: ['nodes'] })
      setDeleteOpen(false)
      setDeleteTarget(null)
      setStatusById((prev) => {
        const next = { ...prev }
        delete next[nodeId]
        return next
      })
    }
  })

  const actionM = useMutation({
    mutationFn: (payload: { node_id: number; service: string; action: 'restart' | 'reload' }) =>
      apiFetch<ActionOut>('/actions/', { method: 'POST', body: JSON.stringify(payload) }, token),
    onSuccess: (act) => {
      qc.invalidateQueries({ queryKey: ['actions'] })
      push({
        title: 'Action queued',
        description: `#${act.id} ${act.service} ${act.action}`,
        variant: act.status === 'ok' ? 'success' : act.status === 'error' ? 'danger' : 'default'
      })
    },
    onError: (err) => {
      push({ title: 'Action failed', description: getErrorMessage(err), variant: 'danger' })
    }
  })

  const bulkM = useMutation({
    mutationFn: (items: { node_id: number; service: string; action: string }[]) =>
      apiFetch<ActionOut[]>('/actions/bulk', { method: 'POST', body: JSON.stringify(items) }, token),
    onSuccess: (acts) => {
      qc.invalidateQueries({ queryKey: ['actions'] })
      const errors = acts.filter((a) => a.status === 'error').length
      push({
        title: errors ? `Bulk done (${errors} error${errors > 1 ? 's' : ''})` : 'Bulk actions done',
        description: `${acts.length} action${acts.length > 1 ? 's' : ''} executed`,
        variant: errors ? 'warning' : 'success'
      })
      setBulkSelected(new Set())
    },
    onError: (err) => {
      push({ title: 'Bulk action failed', description: getErrorMessage(err), variant: 'danger' })
    }
  })

  const loadStatus = React.useCallback(
    async (id: number) => {
      setStatusById((prev) => {
        const previous = prev[id]
        return {
          ...prev,
          [id]: {
            data: previous?.data ?? null,
            loading: true,
            error: undefined,
            updatedAt: previous?.updatedAt
          }
        }
      })
      try {
        const data = await apiFetch<NodeStatus>(`/nodes/${id}/status`, {}, token)
        const now = new Date().toISOString()
        setStatusById((prev) => ({ ...prev, [id]: { data, loading: false, error: undefined, updatedAt: now } }))
        setLastRefreshAt(now)
      } catch (err) {
        const now = new Date().toISOString()
        setStatusById((prev) => ({
          ...prev,
          [id]: { data: prev[id]?.data ?? null, loading: false, error: getErrorMessage(err), updatedAt: now }
        }))
        setLastRefreshAt(now)
      }
    },
    [token]
  )

  const refreshAll = React.useCallback(async () => {
    const nodes = nodesQ.data || []
    if (!nodes.length) return
    await Promise.all(nodes.map((n) => loadStatus(n.id)))
  }, [nodesQ.data, loadStatus])

  const hasBootstrapped = React.useRef(false)
  React.useEffect(() => {
    if (!nodesQ.data?.length || hasBootstrapped.current) return
    hasBootstrapped.current = true
    refreshAll()
  }, [nodesQ.data, refreshAll])

  React.useEffect(() => {
    if (!autoRefresh) return
    const nodes = nodesQ.data || []
    if (!nodes.length) return
    const timer = window.setInterval(() => {
      nodes.forEach((node) => loadStatus(node.id))
    }, refreshInterval)
    return () => window.clearInterval(timer)
  }, [autoRefresh, refreshInterval, nodesQ.data, loadStatus])

  const openEdit = (node: NodeOut) => {
    setEditTarget(node)
    setEditName(node.name)
    setEditAgentUrl(node.agent_url)
    setEditOpen(true)
  }

  const openDelete = (node: NodeOut) => {
    setDeleteTarget(node)
    setDeleteOpen(true)
  }

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      push({ title: 'Copied', description: value, variant: 'success' })
    } catch {
      const input = document.createElement('input')
      input.value = value
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      push({ title: 'Copied', description: value, variant: 'success' })
    }
  }

  const nodes = nodesQ.data || []

  const summary = React.useMemo(() => {
    return nodes.reduce(
      (acc, node) => {
        const state = getNodeState(statusById[node.id])
        acc.total += 1
        acc[state.key] += 1
        return acc
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }
    )
  }, [nodes, statusById])

  const visibleNodes = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return nodes
      .filter((node) => {
        if (needle) {
          const hay = `${node.name} ${node.agent_url}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        if (statusFilter !== 'all') {
          const state = getNodeState(statusById[node.id]).key
          if (state !== statusFilter) return false
        }
        return true
      })
      .sort((a, b) => a.id - b.id)
  }, [nodes, search, statusFilter, statusById])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('nodes.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('nodes.filtersDesc')}
          </p>
          <div className="text-xs text-muted-foreground">
            Logged as {user?.email || 'unknown'} ({user?.role || 'unknown'})
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => refreshAll()} disabled={!nodes.length}>
            {t('nodes.refreshAll')}
          </Button>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input bg-background"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            {t('nodes.autoRefresh')}
          </label>
          <Select
            value={String(refreshInterval)}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="w-[140px]"
          >
            <option value="5000">Every 5s</option>
            <option value="15000">Every 15s</option>
            <option value="30000">Every 30s</option>
            <option value="60000">Every 60s</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{t('nodes.totalNodes')}</div>
            <div className="text-2xl font-semibold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{t('status.healthy')}</div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold">{summary.healthy}</div>
              <Badge variant="success">{t('status.healthy')}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{t('status.degraded')} / {t('status.down')}</div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold">{summary.degraded + summary.down}</div>
              <Badge variant="warning">{t('nodes.attention', 'attention')}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{t('nodes.lastRefresh')}</div>
            <div className="text-sm text-foreground">{formatDateTime(lastRefreshAt)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t('nodes.registerTitle')}</CardTitle>
                <CardDescription>
                  {t('nodes.registerDesc')}
                </CardDescription>
              </div>
              <HelpTip text="Agent URL should be reachable from the backend network (mTLS or VPN recommended)." />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('nodes.name')}</div>
              <Input placeholder="Paris-edge-01" value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Agent URL <HelpTip text="Example: http://agent:9000 or https://10.0.0.12:9000" />
              </div>
              <Input
                placeholder="http://agent:9000"
                value={agentUrl}
                onChange={(e) => setAgentUrl(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => createM.mutate()}
                disabled={!canManage || !name.trim() || !agentUrl.trim() || createM.isPending}
                className="w-full md:w-auto"
              >
                {createM.isPending ? t('nodes.creating') : t('common.create')}
              </Button>
            </div>
            {createM.isError ? (
              <div className="md:col-span-3 text-sm text-destructive">
                {getErrorMessage(createM.error)}
              </div>
            ) : null}
            {!canManage ? (
              <div className="md:col-span-3 text-xs text-muted-foreground">
                {t('nodes.readOnly')}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('nodes.filtersTitle')}</CardTitle>
            <CardDescription>{t('nodes.filtersDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('common.search')}</div>
              <Input placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Status filter <HelpTip text="Healthy: all services active. Degraded: partial outage. Down: no services active or node unreachable." />
              </div>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="healthy">Healthy</option>
                <option value="degraded">Degraded</option>
                <option value="down">Down</option>
                <option value="unknown">Unknown</option>
              </Select>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {t('nodes.filtersDesc')}
            </div>
          </CardContent>
        </Card>
      </div>

      {canManage && nodes.length > 0 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle>{t('nodes.bulkTitle')}</CardTitle>
            </div>
            <CardDescription>
              {t('nodes.bulkDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Service</div>
                <Input
                  placeholder="e.g. icecast2"
                  value={bulkService}
                  onChange={(e) => setBulkService(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Action</div>
                <Select
                  value={bulkAction}
                  onChange={(e) => setBulkAction(e.target.value as 'restart' | 'reload')}
                >
                  <option value="restart">Restart</option>
                  <option value="reload">Reload</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() =>
                    bulkM.mutate(
                      Array.from(bulkSelected).map((nid) => ({
                        node_id: nid,
                        service: bulkService.trim(),
                        action: bulkAction
                      }))
                    )
                  }
                  disabled={bulkSelected.size === 0 || !bulkService.trim() || bulkM.isPending}
                  className="w-full"
                >
                  {bulkM.isPending ? t('common.loading') : `${t('nodes.runAction')} (${bulkSelected.size})`}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkSelected(new Set(nodes.map((n) => n.id)))}
              >
                {t('nodes.selectAll')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkSelected(new Set())}
                disabled={bulkSelected.size === 0}
              >
                {t('common.reset')}
              </Button>
              {nodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() =>
                    setBulkSelected((prev) => {
                      const next = new Set(prev)
                      if (next.has(node.id)) next.delete(node.id)
                      else next.add(node.id)
                      return next
                    })
                  }
                  className={`rounded-xl border px-3 py-1 text-xs transition-colors ${
                    bulkSelected.has(node.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {node.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {nodesQ.isLoading ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">{t('common.loading')}</CardContent>
          </Card>
        ) : null}

        {nodesQ.isError ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">
              {getErrorMessage(nodesQ.error)}
            </CardContent>
          </Card>
        ) : null}

        {!nodesQ.isLoading && !nodesQ.isError && !visibleNodes.length ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t('nodes.noMatch')}
            </CardContent>
          </Card>
        ) : null}

        {visibleNodes.map((node) => {
          const record = statusById[node.id]
          const state = getNodeState(record)
          const services = Object.values(record?.data?.status.services || {})
          const serviceNames = services.map((svc) => svc.name)
          const activeCount = services.filter((svc) => svc.active).length
          const system = record?.data?.status.system || {}
          const systemMetrics = [
            { label: 'CPU load', value: system.cpu_load },
            { label: 'Memory used', value: system.mem_used_percent, suffix: '%' },
            { label: 'Disk used', value: system.disk_used_percent, suffix: '%' }
          ].filter((metric) => metric.value !== undefined && metric.value !== null)
          const selectedService =
            serviceNames.includes(serviceByNode[node.id]) ? serviceByNode[node.id] : services[0]?.name || ''
          const selectedAction = actionByNode[node.id] || 'restart'

          return (
            <Card key={node.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => toggleFav('node', node.id, node.name)}
                        title={isFavorite('node', node.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        className="text-muted-foreground hover:text-yellow-400 transition-colors"
                      >
                        <Star className={`h-4 w-4 ${isFavorite('node', node.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      </button>
                      <CardTitle>{node.name}</CardTitle>
                      <Badge variant={state.variant}>{state.label}</Badge>
                      <Badge variant="default">#{node.id}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Agent URL: <span className="font-mono">{node.agent_url}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{t('nodes.createdAt')} {formatDateTime(node.created_at)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => loadStatus(node.id)}
                      disabled={record?.loading}
                    >
                      {record?.loading ? t('status.checking') : t('common.refresh')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyValue(node.agent_url)}>
                      {t('nodes.copyUrl')}
                    </Button>
                    {canManage ? (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(node)}>
                        {t('common.edit')}
                      </Button>
                    ) : null}
                    {canDelete ? (
                      <Button variant="destructive" size="sm" onClick={() => openDelete(node)}>
                        {t('common.delete')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!record?.data && !record?.error ? (
                  <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {t('nodes.noStatusYet')}
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="text-xs text-muted-foreground">{t('nodes.services')}</div>
                      <div className="mt-2 text-sm font-semibold">
                        {services.length ? `${activeCount}/${services.length} active` : 'No services reported'}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {services.map((svc) => (
                          <Badge key={svc.name} variant={svc.active ? 'success' : 'danger'}>
                            {svc.name}{svc.substate ? ` (${svc.substate})` : ''}
                          </Badge>
                        ))}
                        {!services.length ? (
                          <span className="text-xs text-muted-foreground">{t('nodes.noServicesReported')}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="text-xs text-muted-foreground">{t('nodes.system')}</div>
                      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {systemMetrics.length ? (
                          systemMetrics.map((metric) => (
                            <div key={metric.label} className="flex items-center justify-between">
                              <span>{metric.label}</span>
                              <span className="font-mono text-foreground">
                                {metric.value}
                                {metric.suffix || ''}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div>{t('nodes.noSystemMetrics')}</div>
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="text-xs text-muted-foreground">Status</div>
                      <div className="mt-2 text-sm">
                        Last check: <span className="font-mono">{formatDateTime(record?.updatedAt)}</span>
                      </div>
                      {record?.error ? (
                        <div className="mt-2 text-xs text-destructive">{record.error}</div>
                      ) : (
                        <div className="mt-2 text-xs text-muted-foreground">{t('nodes.noErrors')}</div>
                      )}
                    </div>
                  </div>
                )}

                {record?.data ? (
                  <details className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Diagnostics (raw)
                    </summary>
                    <pre className="mt-2 max-h-64 overflow-auto text-xs text-muted-foreground">
                      {JSON.stringify(record.data.status, null, 2)}
                    </pre>
                  </details>
                ) : null}

                {canManage ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">{t('nodes.serviceActions')}</div>
                      <HelpTip text="Restart will fully restart the service. Reload re-reads config without full restart when supported." />
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <Select
                        value={selectedService}
                        onChange={(e) =>
                          setServiceByNode((prev) => ({ ...prev, [node.id]: e.target.value }))
                        }
                        disabled={!services.length}
                      >
                        <option value="" disabled>
                          Select service
                        </option>
                        {services.map((svc) => (
                          <option key={svc.name} value={svc.name}>
                            {svc.name}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={selectedAction}
                        onChange={(e) =>
                          setActionByNode((prev) => ({
                            ...prev,
                            [node.id]: e.target.value as 'restart' | 'reload'
                          }))
                        }
                      >
                        <option value="restart">Restart</option>
                        <option value="reload">Reload</option>
                      </Select>
                      <Button
                        onClick={() =>
                          actionM.mutate({
                            node_id: node.id,
                            service: selectedService,
                            action: selectedAction
                          })
                        }
                        disabled={!selectedService || actionM.isPending}
                      >
                        {actionM.isPending ? t('common.loading') : t('nodes.runAction')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {t('nodes.readOnly')}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('nodes.editTitle')}</DialogTitle>
            <DialogDescription>{t('nodes.agentUrl')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Node name</div>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Agent URL</div>
              <Input value={editAgentUrl} onChange={(e) => setEditAgentUrl(e.target.value)} />
            </div>
            {updateM.isError ? (
              <div className="text-sm text-destructive">{getErrorMessage(updateM.error)}</div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={updateM.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() =>
                editTarget &&
                updateM.mutate({
                  id: editTarget.id,
                  name: editName.trim(),
                  agent_url: editAgentUrl.trim()
                })
              }
              disabled={!editName.trim() || !editAgentUrl.trim() || updateM.isPending}
            >
              {updateM.isPending ? t('nodes.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete node"
        description={`${t('nodes.deleteTitle')}: ${deleteTarget?.name || ''}. ${t('nodes.deleteWarn')}`}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        onConfirm={() => deleteTarget && deleteM.mutate(deleteTarget.id)}
        busy={deleteM.isPending}
      />
    </div>
  )
}
