import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select } from '../components/ui/select'
import { Separator } from '../components/ui/separator'
import { RealtimeLogViewer } from '../components/RealtimeLogViewer'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useCan } from '../components/RoleGate'
import { useToast } from '../contexts/ToastContext'
import { useFavorites } from '../contexts/FavoritesContext'
import { useLocale } from '../contexts/LocaleContext'
import { Star } from 'lucide-react'
import type { ActionOut } from './ActionsPage'

type RadioOut = {
  id: number
  name: string
  description: string | null
  node_id: number
  icecast_service: string
  liquidsoap_service: string
  mounts: string
  public_base_url?: string
  internal_base_url?: string
}

type NodeOut = {
  id: number
  name: string
  agent_url: string
}

type RadioStatus = {
  radio: {
    id: number
    name: string
    node_id: number
    mounts: string[]
    icecast_service: string
    liquidsoap_service: string
    public_base_url: string
    internal_base_url: string
  }
  node: { id: number; name: string; agent_url: string }
  services: Record<string, { name: string; active: boolean; substate?: string }>
  system: Record<string, any>
}

type PodcastShowOut = { id: number; title: string; description: string | null; artwork_url: string | null }

type LiveSessionOut = {
  id: number
  radio_id: number
  show_id: number
  mount: string
  title: string
  description: string | null
  recording_id: string
  output_rel_path: string
  status: string
}

export function RadioDetailPage() {
  const { id } = useParams()
  const radioId = Number(id)
  const { token } = useAuth()
  const qc = useQueryClient()
  const canOps = useCan('admin', 'ops')
  const { push } = useToast()

  const [tab, setTab] = React.useState('listen')
  const [selectedService, setSelectedService] = React.useState<string>('')

  const radioQ = useQuery({
    queryKey: ['radio', radioId],
    queryFn: () => apiFetch<RadioOut>(`/radios/${radioId}`, {}, token),
    enabled: !!radioId,
    staleTime: 30_000
  })

  const statusQ = useQuery({
    queryKey: ['radio-status', radioId],
    queryFn: () => apiFetch<RadioStatus>(`/radios/${radioId}/status`, {}, token),
    enabled: !!radioId,
    refetchInterval: 5000,
    staleTime: 4_500
  })

  React.useEffect(() => {
    const r = radioQ.data
    if (!r) return
    setSelectedService(r.icecast_service)
  }, [radioQ.data])

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
    }
  })

  const showsQ = useQuery({
    queryKey: ['podcast-shows'],
    queryFn: () => apiFetch<PodcastShowOut[]>('/podcasts/shows', {}, token),
    refetchInterval: 15000,
    staleTime: 14_000
  })

  const activeLiveQ = useQuery({
    queryKey: ['live-active', radioId],
    queryFn: () => apiFetch<LiveSessionOut | null>(`/live/active?radio_id=${radioId}`, {}, token),
    enabled: !!radioId,
    refetchInterval: 3000,
    staleTime: 2_500
  })

  const startLiveM = useMutation({
    mutationFn: (payload: { show_id: number; mount: string; title: string; description: string | null }) =>
      apiFetch<LiveSessionOut>(
        '/live/start',
        { method: 'POST', body: JSON.stringify({ radio_id: radioId, ...payload }) },
        token
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-active', radioId] })
      push({ title: 'Live démarré', description: 'Enregistrement en cours', variant: 'success' })
    }
  })

  const stopLiveM = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; episode_id: number; audio_rel_path: string }>(
      '/live/stop',
      { method: 'POST', body: JSON.stringify({ radio_id: radioId }) },
      token
    ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['live-active', radioId] })
      push({ title: 'Live arrêté', description: `Épisode créé (#${r.episode_id})`, variant: 'success' })
    }
  })

  const updateRadioM = useMutation({
    mutationFn: (payload: Partial<RadioOut>) =>
      apiFetch<RadioOut>(`/radios/${radioId}`, { method: 'PUT', body: JSON.stringify(payload) }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['radio', radioId] })
      qc.invalidateQueries({ queryKey: ['radio-status', radioId] })
      push({ title: 'Radio mise à jour', description: 'OK', variant: 'success' })
    }
  })

  const deleteRadioM = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(`/radios/${radioId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      window.location.href = '/radios'
    }
  })

  const [confirmSvc, setConfirmSvc] = React.useState<{ open: boolean; action: 'restart' | 'reload' | null }>({
    open: false,
    action: null
  })
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  const r = radioQ.data
  const st = statusQ.data
  const services = r ? [r.icecast_service, r.liquidsoap_service] : []

  const mounts = (st?.radio?.mounts?.length ? st.radio.mounts : (r?.mounts || '').split(',').map((m) => m.trim()).filter(Boolean)) || ['/stream']
  const [mount, setMount] = React.useState<string>(mounts[0] || '/stream')
  React.useEffect(() => {
    if (mounts.length && !mounts.includes(mount)) setMount(mounts[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.radio?.mounts?.join(','), r?.mounts])

  // Live form
  const [liveShowId, setLiveShowId] = React.useState<number>(() => showsQ.data?.[0]?.id || 1)
  React.useEffect(() => {
    if (showsQ.data?.length) setLiveShowId(showsQ.data[0].id)
  }, [showsQ.data])

  const [liveTitle, setLiveTitle] = React.useState('Live Session')
  const [liveDesc, setLiveDesc] = React.useState('')

  if (!r) return <div className="text-zinc-300">Loading…</div>

  const publicBase = st?.radio?.public_base_url || r.public_base_url || 'http://localhost:8000'
  const listenUrl = `${publicBase.replace(/\/$/, '')}${mount.startsWith('/') ? mount : `/${mount}`}`

  const svcBadge = (active?: boolean) => (active ? 'success' : 'danger')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{r.name}</h1>
          <p className="text-sm text-zinc-400">
            Node #{r.node_id} • Mounts: {mounts.join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => statusQ.refetch()}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Ops Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ops cockpit</CardTitle>
          <CardDescription>Actions whitelistes, status services, et commandes live.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {services.map((svc) => (
              <button
                key={svc}
                type="button"
                className={
                  'px-3 h-9 rounded-2xl border text-sm transition-colors ' +
                  (selectedService === svc
                    ? 'bg-zinc-100 text-zinc-900 border-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:bg-zinc-900')
                }
                onClick={() => setSelectedService(svc)}
              >
                {svc}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmSvc({ open: true, action: 'reload' })}
                disabled={!canOps || !selectedService || actionM.isPending}
              >
                Reload
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmSvc({ open: true, action: 'restart' })}
                disabled={!canOps || !selectedService || actionM.isPending}
              >
                Restart
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {services.map((svc) => {
              const svcState = st?.services?.[svc]
              return (
                <Badge key={svc} variant={svcBadge(svcState?.active) as any}>
                  {svc}: {svcState?.active ? 'active' : 'down'}
                </Badge>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="listen">Listen</TabsTrigger>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="listen">
          <Card>
            <CardHeader>
              <CardTitle>Radio Player</CardTitle>
              <CardDescription>Écoute directe depuis Icecast.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Mount</div>
                  <Select value={mount} onChange={(e) => setMount(e.target.value)}>
                    {mounts.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-zinc-500 mb-1">URL</div>
                  <Input readOnly value={listenUrl} />
                </div>
              </div>

              <audio controls preload="none" src={listenUrl} className="w-full" />

              <div className="text-xs text-zinc-500">
                Si le player ne démarre pas, teste l’URL dans un onglet (Icecast peut dépendre des headers/proxy selon navigateur).
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardHeader>
              <CardTitle>Podcast live → épisode</CardTitle>
              <CardDescription>Démarre/arrête un enregistrement du stream, puis crée un épisode automatiquement.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeLiveQ.data?.status === 'running' ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-zinc-800 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-zinc-200 font-medium">{activeLiveQ.data.title}</div>
                        <div className="text-xs text-zinc-500">mount: {activeLiveQ.data.mount} • rec: {activeLiveQ.data.recording_id}</div>
                      </div>
                      <Badge variant="warning" as any>RUNNING</Badge>
                    </div>
                    {activeLiveQ.data.description ? <div className="text-xs text-zinc-400 mt-2">{activeLiveQ.data.description}</div> : null}
                    <div className="text-xs text-zinc-500 mt-2 break-all">file: {activeLiveQ.data.output_rel_path}</div>
                  </div>

                  <Button variant="destructive" disabled={!canOps || stopLiveM.isPending} onClick={() => stopLiveM.mutate()}>
                    {stopLiveM.isPending ? 'Stopping…' : 'Stop & create episode'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Show</div>
                      <Select value={String(liveShowId)} onChange={(e) => setLiveShowId(Number(e.target.value))}>
                        {(showsQ.data || []).map((s) => (
                          <option key={s.id} value={s.id}>
                            #{s.id} — {s.title}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Mount</div>
                      <Select value={mount} onChange={(e) => setMount(e.target.value)}>
                        {mounts.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-zinc-500 mb-1">Titre</div>
                      <Input value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-zinc-500 mb-1">Description (optionnel)</div>
                    <Textarea value={liveDesc} onChange={(e) => setLiveDesc(e.target.value)} />
                  </div>

                  <Button
                    disabled={!canOps || startLiveM.isPending || !liveShowId || !liveTitle.trim()}
                    onClick={() =>
                      startLiveM.mutate({
                        show_id: liveShowId,
                        mount,
                        title: liveTitle.trim(),
                        description: liveDesc.trim() ? liveDesc.trim() : null
                      })
                    }
                  >
                    {startLiveM.isPending ? 'Starting…' : 'Start live recording'}
                  </Button>

                  {!canOps ? <div className="text-xs text-zinc-500">Rôle requis : admin/ops</div> : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Node</CardTitle>
                <CardDescription>{st?.node?.name || `#${r.node_id}`}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-zinc-300">Agent: {st?.node?.agent_url || '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Mountpoints</CardTitle>
                <CardDescription>Declared mounts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {mounts.map((m) => (
                    <Badge key={m}>{m}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>System</CardTitle>
                <CardDescription>From agent</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-zinc-400 whitespace-pre-wrap break-words">{JSON.stringify(st?.system || {}, null, 2)}</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          {token ? (
            <div className="space-y-4">
              <div className="text-sm text-zinc-400">
                Streaming logs for: <span className="text-zinc-200">{selectedService}</span>
              </div>
              <RealtimeLogViewer token={token} nodeId={r.node_id} service={selectedService} height={420} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="actions">
          <ActionsInline nodeId={r.node_id} token={token} />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Radio settings</CardTitle>
              <CardDescription>CRUD complet (admin/ops).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canOps ? <div className="text-xs text-zinc-500">Rôle requis : admin/ops</div> : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Name</div>
                  <Input value={r.name} onChange={(e) => updateRadioM.mutate({ name: e.target.value })} disabled={!canOps} />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Mounts (comma-separated)</div>
                  <Input value={r.mounts} onChange={(e) => updateRadioM.mutate({ mounts: e.target.value })} disabled={!canOps} />
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500 mb-1">Description</div>
                <Textarea value={r.description || ''} onChange={(e) => updateRadioM.mutate({ description: e.target.value || null })} disabled={!canOps} />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Public base URL (browser)</div>
                  <Input
                    value={r.public_base_url || ''}
                    onChange={(e) => updateRadioM.mutate({ public_base_url: e.target.value })}
                    disabled={!canOps}
                    placeholder="http://localhost:8000"
                  />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Internal base URL (compose)</div>
                  <Input
                    value={r.internal_base_url || ''}
                    onChange={(e) => updateRadioM.mutate({ internal_base_url: e.target.value })}
                    disabled={!canOps}
                    placeholder="http://icecast:8000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Icecast service label</div>
                  <Input value={r.icecast_service} onChange={(e) => updateRadioM.mutate({ icecast_service: e.target.value })} disabled={!canOps} />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Liquidsoap service label</div>
                  <Input value={r.liquidsoap_service} onChange={(e) => updateRadioM.mutate({ liquidsoap_service: e.target.value })} disabled={!canOps} />
                </div>
              </div>

              <Separator />

              <Button variant="destructive" disabled={!canOps || deleteRadioM.isPending} onClick={() => setConfirmDelete(true)}>
                Delete radio
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmSvc.open}
        onOpenChange={(v) => setConfirmSvc((p) => ({ ...p, open: v }))}
        title={confirmSvc.action === 'restart' ? 'Confirm restart' : 'Confirm reload'}
        description={`Service: ${selectedService}. This operation is audited.`}
        confirmText={confirmSvc.action === 'restart' ? 'Restart service' : 'Reload service'}
        confirmVariant={confirmSvc.action === 'restart' ? 'destructive' : 'secondary'}
        busy={actionM.isPending}
        onConfirm={() => {
          if (!confirmSvc.action) return
          actionM.mutate({ node_id: r.node_id, service: selectedService, action: confirmSvc.action })
          setConfirmSvc({ open: false, action: null })
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Confirm delete"
        description="Cette radio sera supprimée (DB)."
        confirmText="Delete"
        confirmVariant="destructive"
        busy={deleteRadioM.isPending}
        onConfirm={() => deleteRadioM.mutate()}
      />
    </div>
  )
}

function ActionsInline({ nodeId, token }: { nodeId: number; token: string | null }) {
  const actionsQ = useQuery({
    queryKey: ['actions'],
    queryFn: () => apiFetch<ActionOut[]>('/actions/', {}, token),
    refetchInterval: 3000,
    staleTime: 2_500
  })
  const badge = (status: string) => (status === 'ok' ? 'success' : status === 'running' ? 'warning' : status === 'error' ? 'danger' : 'default')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent actions</CardTitle>
        <CardDescription>Filtered for node #{nodeId}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950/60">
              <tr className="text-left text-zinc-400">
                <th className="p-3">ID</th>
                <th className="p-3">Service</th>
                <th className="p-3">Action</th>
                <th className="p-3">Status</th>
                <th className="p-3">Output</th>
              </tr>
            </thead>
            <tbody>
              {(actionsQ.data || [])
                .filter((a) => a.node_id === nodeId)
                .slice(0, 50)
                .map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800/60">
                    <td className="p-3 text-zinc-300">{a.id}</td>
                    <td className="p-3 text-zinc-300">{a.service}</td>
                    <td className="p-3 text-zinc-300">{a.action}</td>
                    <td className="p-3">
                      <Badge variant={badge(a.status) as any}>{a.status}</Badge>
                    </td>
                    <td className="p-3 text-zinc-400 max-w-[500px] truncate" title={a.output || ''}>
                      {a.output || ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

type StatusRecord = {
  data: RadioStatus | null
  loading: boolean
  error?: string
  updatedAt?: string
}

type RadioHealth = {
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

function getMountList(mounts: string | null | undefined) {
  const list = (mounts || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return list.length ? list : ['/stream']
}

function buildListenUrl(radio: RadioOut, mount: string) {
  const base = radio.public_base_url || 'http://localhost:8000'
  const clean = base.replace(/\/$/, '')
  return `${clean}${mount.startsWith('/') ? mount : `/${mount}`}`
}

function getRadioHealth(radio: RadioOut, record?: StatusRecord): RadioHealth {
  if (!record) return { key: 'unknown', label: 'Unknown', variant: 'default' }
  if (record.loading) return { key: 'unknown', label: 'Checking', variant: 'warning' }
  if (record.error) return { key: 'down', label: 'Unreachable', variant: 'danger' }
  const services = record.data?.services || {}
  const expected = [radio.icecast_service, radio.liquidsoap_service]
  const activeCount = expected.filter((svc) => services[svc]?.active).length
  if (!expected.length) return { key: 'unknown', label: 'No services', variant: 'warning' }
  if (activeCount === expected.length) return { key: 'healthy', label: 'Healthy', variant: 'success' }
  if (activeCount === 0) return { key: 'down', label: 'Down', variant: 'danger' }
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

export function RadiosPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const canWrite = useCan('admin', 'ops')
  const { push } = useToast()
  const { isFavorite, toggle: toggleFav } = useFavorites()
  const { t } = useLocale()

  const radiosQ = useQuery({
    queryKey: ['radios'],
    queryFn: () => apiFetch<RadioOut[]>('/radios/', {}, token),
    staleTime: 30_000
  })

  const nodesQ = useQuery({
    queryKey: ['nodes'],
    queryFn: () => apiFetch<NodeOut[]>('/nodes/', {}, token),
    staleTime: 30_000
  })

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [nodeId, setNodeId] = React.useState('')
  const [mounts, setMounts] = React.useState('/stream')
  const [icecastService, setIcecastService] = React.useState('icecast2')
  const [liquidsoapService, setLiquidsoapService] = React.useState('liquidsoap')
  const [publicBaseUrl, setPublicBaseUrl] = React.useState('')
  const [internalBaseUrl, setInternalBaseUrl] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [nodeFilter, setNodeFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [sortKey, setSortKey] = React.useState<'name' | 'id' | 'node'>('name')
  const [autoRefresh, setAutoRefresh] = React.useState(true)
  const [refreshInterval, setRefreshInterval] = React.useState(15000)
  const [lastRefreshAt, setLastRefreshAt] = React.useState<string | null>(null)
  const [statusById, setStatusById] = React.useState<Record<number, StatusRecord>>({})

  React.useEffect(() => {
    if (nodeId || !nodesQ.data?.length) return
    setNodeId(String(nodesQ.data[0].id))
  }, [nodeId, nodesQ.data])

  const createM = useMutation({
    mutationFn: () =>
      apiFetch<RadioOut>(
        '/radios/',
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() ? description.trim() : null,
            node_id: Number(nodeId),
            mounts: mounts.trim() || '/stream',
            icecast_service: icecastService.trim() || 'icecast2',
            liquidsoap_service: liquidsoapService.trim() || 'liquidsoap',
            public_base_url: publicBaseUrl.trim() ? publicBaseUrl.trim() : null,
            internal_base_url: internalBaseUrl.trim() ? internalBaseUrl.trim() : null
          })
        },
        token
      ),
    onSuccess: (created) => {
      push({ title: 'Radio created', description: created.name, variant: 'success' })
      setName('')
      setDescription('')
      setNodeId('')
      setMounts('/stream')
      setIcecastService('icecast2')
      setLiquidsoapService('liquidsoap')
      setPublicBaseUrl('')
      setInternalBaseUrl('')
      qc.invalidateQueries({ queryKey: ['radios'] })
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
        const data = await apiFetch<RadioStatus>(`/radios/${id}/status`, {}, token)
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
    const radios = radiosQ.data || []
    if (!radios.length) return
    await Promise.all(radios.map((r) => loadStatus(r.id)))
  }, [radiosQ.data, loadStatus])

  const hasBootstrapped = React.useRef(false)
  React.useEffect(() => {
    if (!radiosQ.data?.length || hasBootstrapped.current) return
    hasBootstrapped.current = true
    refreshAll()
  }, [radiosQ.data, refreshAll])

  React.useEffect(() => {
    if (!autoRefresh) return
    const radios = radiosQ.data || []
    if (!radios.length) return
    const timer = window.setInterval(() => {
      radios.forEach((radio) => loadStatus(radio.id))
    }, refreshInterval)
    return () => window.clearInterval(timer)
  }, [autoRefresh, refreshInterval, radiosQ.data, loadStatus])

  const nodeById = React.useMemo(() => {
    const map: Record<number, NodeOut> = {}
    for (const n of nodesQ.data || []) map[n.id] = n
    return map
  }, [nodesQ.data])

  const radios = radiosQ.data || []

  const summary = React.useMemo(() => {
    return radios.reduce(
      (acc, radio) => {
        const state = getRadioHealth(radio, statusById[radio.id])
        acc.total += 1
        acc[state.key] += 1
        acc.mounts += getMountList(radio.mounts).length
        acc.nodes.add(radio.node_id)
        return acc
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0, mounts: 0, nodes: new Set<number>() }
    )
  }, [radios, statusById])

  const visibleRadios = React.useMemo(() => {
    const needle = search.trim().toLowerCase()
    return radios
      .filter((radio) => {
        if (needle) {
          const hay = `${radio.name} ${radio.description || ''} ${nodeById[radio.node_id]?.name || ''}`.toLowerCase()
          if (!hay.includes(needle)) return false
        }
        if (nodeFilter !== 'all' && String(radio.node_id) !== nodeFilter) return false
        if (statusFilter !== 'all') {
          const state = getRadioHealth(radio, statusById[radio.id]).key
          if (state !== statusFilter) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortKey === 'name') return a.name.localeCompare(b.name)
        if (sortKey === 'node') return a.node_id - b.node_id
        return a.id - b.id
      })
  }, [radios, search, nodeFilter, statusFilter, nodeById, statusById, sortKey])

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

  const applyTemplate = (radio: RadioOut) => {
    setName(`${radio.name} copy`)
    setDescription(radio.description || '')
    setNodeId(String(radio.node_id))
    setMounts(radio.mounts || '/stream')
    setIcecastService(radio.icecast_service || 'icecast2')
    setLiquidsoapService(radio.liquidsoap_service || 'liquidsoap')
    setPublicBaseUrl(radio.public_base_url || '')
    setInternalBaseUrl(radio.internal_base_url || '')
  }

  const canSubmit = canWrite && name.trim() && nodeId && !createM.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('radios.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('radios.filtersDesc')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => refreshAll()} disabled={!radios.length}>
            {t('radios.refreshStatus')}
          </Button>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input bg-background"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            {t('radios.autoRefresh')}
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
            <div className="text-xs text-muted-foreground">{t('radios.totalRadios')}</div>
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
            <div className="text-xs text-muted-foreground">{t('radios.attention')}</div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold">{summary.degraded + summary.down}</div>
              <Badge variant="warning">{t('status.degraded')}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">{t('radios.nodesUsed')}</div>
            <div className="text-2xl font-semibold">{summary.nodes.size}</div>
            <div className="text-xs text-muted-foreground mt-2">Last refresh: {formatDateTime(lastRefreshAt)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{t('radios.createTitle')}</CardTitle>
                <CardDescription>{t('radios.createDesc')}</CardDescription>
              </div>
              <HelpTip text="Defaults are applied if base URLs are left blank. Use a trusted node or VPN endpoint." />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">{t('radios.nameLabel')}</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Studio One" disabled={!canWrite} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t('radios.nodeLabel')} <HelpTip text="The node defines where the agent runs for service control and recordings." />
                </div>
                <Select value={nodeId} onChange={(e) => setNodeId(e.target.value)} disabled={!nodesQ.data?.length || !canWrite}>
                  <option value="" disabled>
                    {t('radios.selectNode')}
                  </option>
                  {(nodesQ.data || []).map((n) => (
                    <option key={n.id} value={String(n.id)}>
                      #{n.id} - {n.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {t('radios.mountsLabel')} <HelpTip text="Comma-separated list of mounts. Example: /stream,/hq" />
                </div>
                <Input value={mounts} onChange={(e) => setMounts(e.target.value)} placeholder="/stream" disabled={!canWrite} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('radios.descriptionLabel')}</div>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" disabled={!canWrite} />
            </div>

            <details className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
              <summary className="cursor-pointer text-sm text-muted-foreground">{t('radios.advanced')}</summary>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Icecast service label</div>
                  <Input value={icecastService} onChange={(e) => setIcecastService(e.target.value)} placeholder="icecast2" disabled={!canWrite} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Liquidsoap service label</div>
                  <Input value={liquidsoapService} onChange={(e) => setLiquidsoapService(e.target.value)} placeholder="liquidsoap" disabled={!canWrite} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Public base URL (listeners)</div>
                  <Input value={publicBaseUrl} onChange={(e) => setPublicBaseUrl(e.target.value)} placeholder="http://localhost:8000" disabled={!canWrite} />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Internal base URL (stack)</div>
                  <Input value={internalBaseUrl} onChange={(e) => setInternalBaseUrl(e.target.value)} placeholder="http://icecast:8000" disabled={!canWrite} />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => createM.mutate()} disabled={!canSubmit}>
                {createM.isPending ? t('radios.creating') : t('common.create')}
              </Button>
              {!canWrite ? <div className="text-xs text-muted-foreground">{t('radios.noRole')}</div> : null}
              {!nodesQ.data?.length ? <div className="text-xs text-muted-foreground">{t('radios.noNode')}</div> : null}
            </div>

            {createM.isError ? (
              <div className="text-sm text-destructive">{getErrorMessage(createM.error)}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('radios.filtersTitle')}</CardTitle>
            <CardDescription>{t('radios.filtersDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('radios.searchLabel')}</div>
              <Input placeholder={t('radios.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('radios.nodeFilter')}</div>
              <Select value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}>
                <option value="all">{t('radios.allNodes')}</option>
                {(nodesQ.data || []).map((n) => (
                  <option key={n.id} value={String(n.id)}>
                    #{n.id} - {n.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Status filter <HelpTip text="Healthy means both Icecast and Liquidsoap are active. Degraded means partial service health." />
              </div>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="healthy">Healthy</option>
                <option value="degraded">Degraded</option>
                <option value="down">Down</option>
                <option value="unknown">Unknown</option>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{t('radios.sort')}</div>
              <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as 'name' | 'id' | 'node')}>
                <option value="name">{t('radios.nameLabel')}</option>
                <option value="id">ID</option>
                <option value="node">{t('radios.nodeLabel')}</option>
              </Select>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {t('radios.tip')}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {radiosQ.isLoading ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">{t('common.loading')}</CardContent>
          </Card>
        ) : null}

        {radiosQ.isError ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">
              {getErrorMessage(radiosQ.error)}
            </CardContent>
          </Card>
        ) : null}

        {!radiosQ.isLoading && !radiosQ.isError && !visibleRadios.length ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t('radios.noMatch')}
            </CardContent>
          </Card>
        ) : null}

        {visibleRadios.map((radio) => {
          const node = nodeById[radio.node_id]
          const record = statusById[radio.id]
          const state = getRadioHealth(radio, record)
          const mountsList = getMountList(radio.mounts)
          const primaryMount = mountsList[0] || '/stream'
          const listenUrl = buildListenUrl(radio, primaryMount)
          const services = record?.data?.services || {}

          return (
            <Card key={radio.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => toggleFav('radio', radio.id, radio.name)}
                        title={isFavorite('radio', radio.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        className="text-muted-foreground hover:text-yellow-400 transition-colors"
                      >
                        <Star className={`h-4 w-4 ${isFavorite('radio', radio.id) ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                      </button>
                      <CardTitle>{radio.name}</CardTitle>
                      <Badge variant={state.variant}>{state.label}</Badge>
                      <Badge variant="default">#{radio.id}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Node: <span className="text-foreground">{node ? node.name : `#${radio.node_id}`}</span>
                    </div>
                    {radio.description ? (
                      <div className="text-xs text-muted-foreground">{radio.description}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => nav(`/radios/${radio.id}`)}>
                      {t('radios.open', 'Open')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => copyValue(listenUrl)}>
                      {t('radios.copyStream')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => loadStatus(radio.id)}
                      disabled={record?.loading}
                    >
                      {record?.loading ? t('status.checking') : t('common.refresh')}
                    </Button>
                    {canWrite ? (
                      <Button variant="ghost" size="sm" onClick={() => applyTemplate(radio)}>
                        {t('radios.useTemplate')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">Mounts</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mountsList.map((m) => (
                        <Badge key={m}>{m}</Badge>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      Primary stream: <span className="font-mono text-foreground">{listenUrl}</span>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">Services</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[radio.icecast_service, radio.liquidsoap_service].map((svc) => {
                        const svcState = services[svc]
                        return (
                          <Badge key={svc} variant={svcState?.active ? 'success' : record?.data ? 'danger' : 'default'}>
                            {svc}: {svcState?.active ? 'active' : record?.data ? 'down' : 'unknown'}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Last check: <span className="font-mono text-foreground">{formatDateTime(record?.updatedAt)}</span>
                    </div>
                    {record?.error ? (
                      <div className="mt-2 text-xs text-destructive">{record.error}</div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">{t('radios.noErrors')}</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
