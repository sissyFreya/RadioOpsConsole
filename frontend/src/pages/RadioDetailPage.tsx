
import * as React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getApiBase } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useCan } from '../components/RoleGate'
import { useToast } from '../contexts/ToastContext'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { LabelWithHint } from '../components/ui/tooltip'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Textarea } from '../components/ui/textarea'
import { Separator } from '../components/ui/separator'
import { RealtimeLogViewer } from '../components/RealtimeLogViewer'
import { ConfirmDialog } from '../components/ConfirmDialog'
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

type TakeoverStatus = {
  radio_id: number
  enabled: boolean
  connected: boolean
  raw: string
  ingest: { host: string; port: number; mount: string; password_hint: string }
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

type RadioTrackOut = {
  name: string
  rel_path: string
  size_bytes: number
  modified_at: string
}

type RadioHealth = {
  label: string
  variant: 'success' | 'warning' | 'danger' | 'default'
  activeCount: number
  total: number
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

function formatBytes(bytes: number) {
  if (!bytes || bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
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

function getRadioHealth(_radio: RadioOut, status?: RadioStatus, loading?: boolean, error?: boolean): RadioHealth {
  if (loading) return { label: 'Checking', variant: 'warning', activeCount: 0, total: 0 }
  if (error) return { label: 'Unreachable', variant: 'danger', activeCount: 0, total: 0 }
  if (!status) return { label: 'Unknown', variant: 'default', activeCount: 0, total: 0 }
  // Use all services reported by the agent — avoids false "Degraded" when configured
  // service names (e.g. "icecast2") differ from what the agent actually reports ("icecast").
  const allServices = Object.values(status.services || {})
  if (!allServices.length) return { label: 'No services', variant: 'warning', activeCount: 0, total: 0 }
  const activeCount = allServices.filter((s) => s.active).length
  const total = allServices.length
  if (activeCount === total) return { label: 'Healthy', variant: 'success', activeCount, total }
  if (activeCount === 0) return { label: 'Down', variant: 'danger', activeCount, total }
  return { label: 'Degraded', variant: 'warning', activeCount, total }
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

export function RadioDetailPage() {
  const { id } = useParams()
  const radioId = Number(id)
  const nav = useNavigate()
  const { token } = useAuth()
  const qc = useQueryClient()
  const canOps = useCan('admin', 'ops')
  const { push } = useToast()

  const [tab, setTab] = React.useState('overview')
  const [selectedService, setSelectedService] = React.useState<string>('')
  const [mount, setMount] = React.useState('/stream')
  const [confirmSvc, setConfirmSvc] = React.useState<{ open: boolean; action: 'restart' | 'reload' | null }>({
    open: false,
    action: null
  })
  const [confirmDeleteTrack, setConfirmDeleteTrack] = React.useState<RadioTrackOut | null>(null)
  const [confirmDeleteRadio, setConfirmDeleteRadio] = React.useState(false)
  const [uploadFiles, setUploadFiles] = React.useState<File[]>([])
  const [trackSearch, setTrackSearch] = React.useState('')
  const [trackSort, setTrackSort] = React.useState<'recent' | 'name' | 'size'>('recent')
  const [fileInputKey, setFileInputKey] = React.useState(0)

  const [liveShowId, setLiveShowId] = React.useState<number>(0)
  const [liveTitle, setLiveTitle] = React.useState('Live session')
  const [liveDesc, setLiveDesc] = React.useState('')

  const [draft, setDraft] = React.useState<RadioOut | null>(null)

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

  const nodesQ = useQuery({
    queryKey: ['nodes'],
    queryFn: () => apiFetch<NodeOut[]>('/nodes/', {}, token),
    staleTime: 30_000
  })

  const takeoverQ = useQuery({
    queryKey: ['takeover', radioId],
    queryFn: () => apiFetch<TakeoverStatus>(`/radios/${radioId}/takeover/status`, {}, token),
    enabled: !!radioId,
    refetchInterval: 2000,
    staleTime: 1_500
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

  const tracksQ = useQuery({
    queryKey: ['radio-tracks', radioId],
    queryFn: () => apiFetch<RadioTrackOut[]>(`/radios/${radioId}/tracks`, {}, token),
    enabled: !!radioId && !!token,
    staleTime: 30_000
  })

  React.useEffect(() => {
    if (!radioQ.data) return
    setSelectedService(radioQ.data.icecast_service)
    setDraft(radioQ.data)
  }, [radioQ.data])

  React.useEffect(() => {
    if (showsQ.data?.length) setLiveShowId(showsQ.data[0].id)
  }, [showsQ.data])

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

  const takeoverEnableM = useMutation({
    mutationFn: () => apiFetch<any>(`/radios/${radioId}/takeover/enable`, { method: 'POST' }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['takeover', radioId] })
      push({ title: 'On-air enabled', description: 'Takeover enabled. If your PC is connected, it will go live.', variant: 'success' })
    }
  })

  const takeoverDisableM = useMutation({
    mutationFn: () => apiFetch<any>(`/radios/${radioId}/takeover/disable`, { method: 'POST' }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['takeover', radioId] })
      push({ title: 'On-air disabled', description: 'Takeover disabled. AutoDJ remains on air.', variant: 'default' })
    }
  })

  const uploadTrackM = useMutation({
    mutationFn: async (files: File[]) => {
      const uploaded: RadioTrackOut[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const track = await apiFetch<RadioTrackOut>(`/radios/${radioId}/tracks/upload`, { method: 'POST', body: fd }, token)
        uploaded.push(track)
      }
      return uploaded
    },
    onSuccess: (tracks) => {
      setUploadFiles([])
      setFileInputKey((k) => k + 1)
      qc.invalidateQueries({ queryKey: ['radio-tracks', radioId] })
      push({ title: 'Tracks uploaded', description: `${tracks.length} file(s)`, variant: 'success' })
    }
  })

  const deleteTrackM = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ ok: boolean }>(`/radios/${radioId}/tracks/${encodeURIComponent(name)}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['radio-tracks', radioId] })
      push({ title: 'Track deleted', variant: 'success' })
    }
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
      push({ title: 'Live recording started', description: 'Recording in progress', variant: 'success' })
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
      push({ title: 'Live recording stopped', description: `Episode #${r.episode_id} created`, variant: 'success' })
    }
  })

  const updateRadioM = useMutation({
    mutationFn: (payload: Partial<RadioOut>) =>
      apiFetch<RadioOut>(`/radios/${radioId}`, { method: 'PUT', body: JSON.stringify(payload) }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['radio', radioId] })
      qc.invalidateQueries({ queryKey: ['radio-status', radioId] })
      push({ title: 'Radio updated', description: 'Changes saved', variant: 'success' })
    }
  })

  const deleteRadioM = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>(`/radios/${radioId}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      nav('/radios')
    }
  })

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

  const r = radioQ.data
  const st = statusQ.data

  const mounts = React.useMemo(() => {
    const fromStatus = (st?.radio?.mounts || []).map((m) => m.trim()).filter(Boolean)
    if (fromStatus.length) return fromStatus
    return getMountList(r?.mounts)
  }, [st?.radio?.mounts, r?.mounts])

  React.useEffect(() => {
    if (!mounts.length) return
    if (!mounts.includes(mount)) setMount(mounts[0])
  }, [mounts.join('|'), mount])

  // When agent service list loads, reset selected service if its name no longer matches
  React.useEffect(() => {
    const keys = Object.keys(st?.services || {})
    if (!keys.length) return
    if (!keys.includes(selectedService)) setSelectedService(keys[0])
  }, [st?.services])

  if (!r) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  const publicBase = st?.radio?.public_base_url || r.public_base_url || 'http://localhost:8000'
  const internalBase = st?.radio?.internal_base_url || r.internal_base_url || 'http://icecast:8000'
  const listenUrl = buildListenUrl({ ...r, public_base_url: publicBase }, mount)
  const listenPageUrl = `${publicBase.replace(/\/$/, '')}${mount}/listen`

  const health = getRadioHealth(r, st, statusQ.isLoading, statusQ.isError)
  // Services as reported by the agent — avoids name-mismatch with radio config fields
  const agentServices = Object.entries(st?.services || {})
  // Fallback to radio config names when status not yet loaded
  const services = agentServices.length
    ? agentServices.map(([key]) => key)
    : [r.icecast_service, r.liquidsoap_service]

  const system = st?.system || {}
  const systemMetrics = [
    { label: 'CPU load', value: system.cpu_load },
    { label: 'Mem used', value: system.mem_used_percent, suffix: '%' },
    { label: 'Disk used', value: system.disk_used_percent, suffix: '%' }
  ].filter((metric) => metric.value !== undefined && metric.value !== null)

  const trackList = tracksQ.data || []
  const totalTrackSize = trackList.reduce((acc, t) => acc + t.size_bytes, 0)
  const filteredTracks = trackList
    .filter((t) => t.name.toLowerCase().includes(trackSearch.trim().toLowerCase()))
    .sort((a, b) => {
      if (trackSort === 'name') return a.name.localeCompare(b.name)
      if (trackSort === 'size') return b.size_bytes - a.size_bytes
      return new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime()
    })

  const draftRadio = draft || r
  const isDirty =
    draftRadio.name !== r.name ||
    (draftRadio.description || '') !== (r.description || '') ||
    draftRadio.node_id !== r.node_id ||
    (draftRadio.mounts || '') !== (r.mounts || '') ||
    (draftRadio.public_base_url || '') !== (r.public_base_url || '') ||
    (draftRadio.internal_base_url || '') !== (r.internal_base_url || '') ||
    draftRadio.icecast_service !== r.icecast_service ||
    draftRadio.liquidsoap_service !== r.liquidsoap_service

  const saveChanges = () => {
    if (!draft) return
    const payload: Partial<RadioOut> = {}
    if (draft.name !== r.name) payload.name = draft.name
    if ((draft.description || '') !== (r.description || '')) payload.description = draft.description || null
    if (draft.node_id !== r.node_id) payload.node_id = draft.node_id
    if ((draft.mounts || '') !== (r.mounts || '')) payload.mounts = draft.mounts
    if ((draft.public_base_url || '') !== (r.public_base_url || '')) payload.public_base_url = draft.public_base_url || ''
    if ((draft.internal_base_url || '') !== (r.internal_base_url || '')) payload.internal_base_url = draft.internal_base_url || ''
    if (draft.icecast_service !== r.icecast_service) payload.icecast_service = draft.icecast_service
    if (draft.liquidsoap_service !== r.liquidsoap_service) payload.liquidsoap_service = draft.liquidsoap_service

    if (!Object.keys(payload).length) return
    updateRadioM.mutate(payload)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{r.name}</h1>
            <Badge variant={health.variant}>{health.label}</Badge>
            <Badge variant="default">#{r.id}</Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Node #{r.node_id} · Mounts: {mounts.join(', ')}
          </div>
          {r.description ? <div className="text-sm text-muted-foreground">{r.description}</div> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => statusQ.refetch()}>
            Refresh status
          </Button>
          <Button variant="ghost" onClick={() => copyValue(listenUrl)}>
            Copy stream
          </Button>
          <Button variant="ghost" onClick={() => window.open(listenUrl, '_blank', 'noopener,noreferrer')}>
            Open stream
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Services</div>
            <div className="text-2xl font-semibold">
              {health.activeCount}/{health.total || services.length}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {agentServices.length ? (
                agentServices.map(([svc, state]) => (
                  <Badge key={svc} variant={state.active ? 'success' : 'danger'}>
                    {svc}: {state.substate || (state.active ? 'active' : 'down')}
                  </Badge>
                ))
              ) : (
                services.map((svc) => (
                  <Badge key={svc} variant="default">{svc}: unknown</Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Primary stream</div>
            <div className="text-sm font-medium text-foreground break-all">{listenUrl}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => copyValue(listenUrl)}>
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.open(listenPageUrl, '_blank', 'noopener,noreferrer')}>
                Listener page
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Library</div>
            <div className="text-2xl font-semibold">{trackList.length}</div>
            <div className="text-xs text-muted-foreground mt-2">Total size: {formatBytes(totalTrackSize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">On-air mode</div>
            <div className="text-lg font-semibold">
              {takeoverQ.data?.enabled && takeoverQ.data?.connected ? 'DJ live' : 'AutoDJ'}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={takeoverQ.data?.enabled ? 'success' : 'default'}>
                {takeoverQ.data?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
              <Badge variant={takeoverQ.data?.connected ? 'success' : 'default'}>
                {takeoverQ.data?.connected ? 'PC connected' : 'PC offline'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Service controls</CardTitle>
              <CardDescription>Whitelisted operations only. Actions are audited.</CardDescription>
            </div>
            <HelpTip text="Reload re-reads config without a full restart when supported." />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}>
              <option value="" disabled>
                Select service
              </option>
              {services.map((svc) => (
                <option key={svc} value={svc}>
                  {svc}
                </option>
              ))}
            </Select>
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
          {!canOps ? <div className="text-xs text-muted-foreground">Your role does not permit service actions.</div> : null}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="listen">Listen</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
          <TabsTrigger value="live">Live record</TabsTrigger>
          <TabsTrigger value="onair">On air</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Node</CardTitle>
                <CardDescription>{st?.node?.name || `#${r.node_id}`}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <div>Agent: {st?.node?.agent_url || '--'}</div>
                <div>Internal base: {internalBase}</div>
                <div>Public base: {publicBase}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Mounts</CardTitle>
                <CardDescription>Declared mountpoints</CardDescription>
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
                <CardTitle>System metrics</CardTitle>
                <CardDescription>From agent</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
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
                  <div>No system metrics reported.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="listen">
          <Card>
            <CardHeader>
              <CardTitle>Listen</CardTitle>
              <CardDescription>Play the stream directly from your browser.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Mount</div>
                  <Select value={mount} onChange={(e) => setMount(e.target.value)}>
                    {mounts.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">URL</div>
                  <div className="flex gap-2">
                    <Input readOnly value={listenUrl} />
                    <Button variant="secondary" onClick={() => copyValue(listenUrl)}>
                      Copy
                    </Button>
                  </div>
                </div>
              </div>

              <audio controls preload="none" src={listenUrl} className="w-full" />

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => window.open(listenUrl, '_blank', 'noopener,noreferrer')}>
                  Open stream
                </Button>
                <Button variant="ghost" onClick={() => window.open(listenPageUrl, '_blank', 'noopener,noreferrer')}>
                  Open listener page
                </Button>
                <HelpTip text="Listener page requires the Icecast proxy container to expose /listen." />
              </div>

              <div className="text-xs text-muted-foreground">
                If playback fails, open the URL in a new tab or use VLC. Icecast can be strict about headers.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library">
          <Card>
            <CardHeader>
              <CardTitle>AutoDJ library</CardTitle>
              <CardDescription>Upload tracks for the AutoDJ playlist. Liquidsoap reloads every ~10 seconds.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  key={fileInputKey}
                  className="block w-full max-w-[420px] text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-2xl file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground hover:file:bg-accent"
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                />
                <Button
                  onClick={() => uploadTrackM.mutate(uploadFiles)}
                  disabled={!canOps || !uploadFiles.length || uploadTrackM.isPending}
                >
                  {uploadTrackM.isPending ? 'Uploading...' : `Upload ${uploadFiles.length || ''}`}
                </Button>
                <Button variant="secondary" onClick={() => tracksQ.refetch()} disabled={tracksQ.isFetching}>
                  Refresh
                </Button>
                <Button variant="ghost" onClick={() => setUploadFiles([])} disabled={!uploadFiles.length}>
                  Clear selection
                </Button>
                {!canOps ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}
              </div>

              <div className="text-xs text-muted-foreground">
                AutoDJ reads <span className="text-foreground">/data/radios/radio_{r.id}/tracks</span>. Ensure the Liquidsoap
                container uses <span className="text-foreground">RADIO_ID={r.id}</span>.
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_160px]">
                <Input placeholder="Search tracks" value={trackSearch} onChange={(e) => setTrackSearch(e.target.value)} />
                <Select value={trackSort} onChange={(e) => setTrackSort(e.target.value as 'recent' | 'name' | 'size')}>
                  <option value="recent">Newest</option>
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                </Select>
              </div>

              <div className="overflow-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-left text-muted-foreground">
                      <th className="p-3">Track</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Updated</th>
                      <th className="p-3">Preview</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTracks.map((t) => {
                      const url = encodeURI(`${getApiBase()}/media/${t.rel_path}`)
                      return (
                        <tr key={t.name} className="border-t border-border">
                          <td className="p-3 text-foreground font-medium">{t.name}</td>
                          <td className="p-3 text-muted-foreground">{formatBytes(t.size_bytes)}</td>
                          <td className="p-3 text-muted-foreground">{formatDateTime(t.modified_at)}</td>
                          <td className="p-3">
                            <audio controls preload="none" src={url} className="w-full max-w-[220px]" />
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="ghost" size="sm" onClick={() => copyValue(url)}>
                                Copy URL
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={!canOps || deleteTrackM.isPending}
                                onClick={() => setConfirmDeleteTrack(t)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {!filteredTracks.length ? (
                      <tr>
                        <td className="p-6 text-muted-foreground" colSpan={5}>
                          No tracks found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {tracksQ.isLoading ? <div className="text-sm text-muted-foreground">Loading tracks...</div> : null}
              {tracksQ.isError ? <div className="text-sm text-destructive">{getErrorMessage(tracksQ.error)}</div> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="live">
          <Card>
            <CardHeader>
              <CardTitle>Live recording</CardTitle>
              <CardDescription>Record a live stream and auto-create a podcast episode.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeLiveQ.data?.status === 'running' ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{activeLiveQ.data.title}</div>
                        <div className="text-xs text-muted-foreground">
                          mount: {activeLiveQ.data.mount} · rec: {activeLiveQ.data.recording_id}
                        </div>
                      </div>
                      <Badge variant="warning">RUNNING</Badge>
                    </div>
                    {activeLiveQ.data.description ? (
                      <div className="text-xs text-muted-foreground mt-2">{activeLiveQ.data.description}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground mt-2 break-all">
                      file: {activeLiveQ.data.output_rel_path}
                    </div>
                  </div>

                  <Button variant="destructive" disabled={!canOps || stopLiveM.isPending} onClick={() => stopLiveM.mutate()}>
                    {stopLiveM.isPending ? 'Stopping...' : 'Stop and create episode'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Show</div>
                      <Select value={String(liveShowId)} onChange={(e) => setLiveShowId(Number(e.target.value))}>
                        {(showsQ.data || []).map((s) => (
                          <option key={s.id} value={s.id}>
                            #{s.id} - {s.title}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Mount</div>
                      <Select value={mount} onChange={(e) => setMount(e.target.value)}>
                        {mounts.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="text-xs text-muted-foreground mb-1">Title</div>
                      <Input value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Description (optional)</div>
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
                    {startLiveM.isPending ? 'Starting...' : 'Start live recording'}
                  </Button>

                  {!canOps ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onair">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>DJ Live takeover</CardTitle>
                <CardDescription>
                  AutoDJ runs 24/7. Connecting your PC does not cut the stream until you enable takeover.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={takeoverQ.data?.enabled ? 'success' : 'default'}>
                    {takeoverQ.data?.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Badge variant={takeoverQ.data?.connected ? 'success' : 'default'}>
                    {takeoverQ.data?.connected ? 'PC connected' : 'PC offline'}
                  </Badge>
                  <Badge variant={takeoverQ.data?.enabled && takeoverQ.data?.connected ? 'warning' : 'default'}>
                    {takeoverQ.data?.enabled && takeoverQ.data?.connected ? 'ON AIR' : 'AutoDJ ON AIR'}
                  </Badge>

                  <div className="ml-auto flex items-center gap-2">
                    <Button variant="secondary" onClick={() => takeoverQ.refetch()} disabled={takeoverQ.isFetching}>
                      Refresh
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => takeoverDisableM.mutate()}
                      disabled={!canOps || takeoverDisableM.isPending}
                    >
                      Disable takeover
                    </Button>
                    <Button onClick={() => takeoverEnableM.mutate()} disabled={!canOps || takeoverEnableM.isPending}>
                      Enable takeover
                    </Button>
                  </div>
                </div>

                {!canOps ? <div className="text-xs text-muted-foreground">Your role does not permit on-air operations.</div> : null}

                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                  <div className="text-sm font-medium">Listener URL</div>
                  <div className="text-sm text-muted-foreground break-all">{listenUrl}</div>
                  <Button variant="ghost" size="sm" onClick={() => copyValue(listenUrl)}>
                    Copy URL
                  </Button>
                </div>

                <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                  <div className="text-sm font-medium">Connect your PC (Icecast source)</div>
                  <div className="text-sm text-muted-foreground">Use BUTT, OBS, or another Icecast source client.</div>
                  <div className="grid gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between gap-2">
                      <span>Server</span>
                      <span className="font-mono text-foreground">{takeoverQ.data?.ingest.host || '--'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Port</span>
                      <span className="font-mono text-foreground">{takeoverQ.data?.ingest.port ?? 8001}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Mount</span>
                      <span className="font-mono text-foreground">{takeoverQ.data?.ingest.mount || '/live'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span>Password</span>
                      <span className="font-mono text-foreground">{takeoverQ.data?.ingest.password_hint || 'djpass'}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Do not connect to /stream as a source or you will disconnect AutoDJ.
                  </div>
                </div>

                {takeoverQ.data?.raw ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Raw status</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words">{takeoverQ.data.raw}</pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Operational safety</CardTitle>
                <CardDescription>Recommended flow</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div>
                  <span className="font-medium text-foreground">Default:</span> takeover disabled (AutoDJ on air)
                </div>
                <div>
                  <span className="font-medium text-foreground">Soundcheck:</span> connect PC to harbor (AutoDJ stays on)
                </div>
                <div>
                  <span className="font-medium text-foreground">Go live:</span> enable takeover
                </div>
                <div>
                  <span className="font-medium text-foreground">Return:</span> disable takeover
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          {token ? (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Streaming logs for: <span className="text-foreground">{selectedService || 'Select a service'}</span>
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
              <CardDescription>Review or update radio configuration.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canOps ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Name</div>
                  <Input
                    value={draftRadio.name}
                    onChange={(e) => setDraft({ ...draftRadio, name: e.target.value })}
                    disabled={!canOps}
                  />
                </div>
                <div className="space-y-1">
                  <LabelWithHint
                    label="Node"
                    hint="Serveur qui héberge cette radio. L'agent sur ce nœud sera utilisé pour contrôler les services et enregistrer les streams."
                    side="right"
                  />
                  <Select
                    value={String(draftRadio.node_id)}
                    onChange={(e) => setDraft({ ...draftRadio, node_id: Number(e.target.value) })}
                    disabled={!canOps}
                  >
                    {(nodesQ.data || []).map((n) => (
                      <option key={n.id} value={n.id}>
                        #{n.id} - {n.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <LabelWithHint
                    label="Mounts (comma-separated)"
                    hint="Points de montage Icecast. Ex: /stream,/backup. Doit correspondre au mount configuré dans Liquidsoap (radio.liq). Un auditeur accède à http://host:8000/stream."
                    side="right"
                  />
                  <Input
                    value={draftRadio.mounts}
                    onChange={(e) => setDraft({ ...draftRadio, mounts: e.target.value })}
                    disabled={!canOps}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Description</div>
                <Textarea
                  value={draftRadio.description || ''}
                  onChange={(e) => setDraft({ ...draftRadio, description: e.target.value || null })}
                  disabled={!canOps}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <LabelWithHint
                    label="Public base URL (listener)"
                    hint="URL qu'utilisent les auditeurs. Ex: http://radio.example.com:8000 — visible dans les lecteurs et le flux RSS."
                    side="right"
                  />
                  <Input
                    value={draftRadio.public_base_url || ''}
                    onChange={(e) => setDraft({ ...draftRadio, public_base_url: e.target.value })}
                    disabled={!canOps}
                    placeholder="http://localhost:8000"
                  />
                </div>
                <div className="space-y-1">
                  <LabelWithHint
                    label="Internal base URL (stack)"
                    hint="URL interne utilisée par le backend pour contacter Icecast (stats, enregistrement). En Docker Compose: http://icecast:8000. Ne doit pas être exposée aux auditeurs."
                    side="right"
                  />
                  <Input
                    value={draftRadio.internal_base_url || ''}
                    onChange={(e) => setDraft({ ...draftRadio, internal_base_url: e.target.value })}
                    disabled={!canOps}
                    placeholder="http://icecast:8000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <LabelWithHint
                    label="Icecast service label"
                    hint="Nom exact du service Icecast tel que rapporté par l'agent (ex: icecast). Doit correspondre à la clé dans status.services. En Docker Compose: icecast."
                    side="right"
                  />
                  <Input
                    value={draftRadio.icecast_service}
                    onChange={(e) => setDraft({ ...draftRadio, icecast_service: e.target.value })}
                    disabled={!canOps}
                    placeholder="icecast"
                  />
                </div>
                <div className="space-y-1">
                  <LabelWithHint
                    label="Liquidsoap service label"
                    hint="Nom exact du service Liquidsoap tel que rapporté par l'agent (ex: liquidsoap). Une incohérence affiche faussement le statut Degraded."
                    side="right"
                  />
                  <Input
                    value={draftRadio.liquidsoap_service}
                    onChange={(e) => setDraft({ ...draftRadio, liquidsoap_service: e.target.value })}
                    disabled={!canOps}
                    placeholder="liquidsoap"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground">Comment trouver les bons labels de service ?</div>
                <div>Allez sur la page <strong>Nodes</strong>, consultez les badges Services du nœud associé. Les noms affichés (ex. <code className="rounded bg-muted px-1">icecast</code>, <code className="rounded bg-muted px-1">liquidsoap</code>) sont ceux à saisir ici.</div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={saveChanges} disabled={!canOps || !isDirty || updateRadioM.isPending}>
                  {updateRadioM.isPending ? 'Saving...' : 'Save changes'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDraft(r)}
                  disabled={!canOps || !isDirty || updateRadioM.isPending}
                >
                  Reset
                </Button>
                {updateRadioM.isError ? (
                  <div className="text-sm text-destructive">{getErrorMessage(updateRadioM.error)}</div>
                ) : null}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="text-sm font-semibold text-foreground">Danger zone</div>
                <div className="text-xs text-muted-foreground">
                  Deleting a radio removes it from the database and detaches associated resources.
                </div>
                <Button
                  variant="destructive"
                  disabled={!canOps || deleteRadioM.isPending}
                  onClick={() => setConfirmDeleteRadio(true)}
                >
                  Delete radio
                </Button>
              </div>
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
        open={!!confirmDeleteTrack}
        onOpenChange={(v) => {
          if (!v) setConfirmDeleteTrack(null)
        }}
        title="Delete track"
        description={confirmDeleteTrack ? `Track: ${confirmDeleteTrack.name}` : undefined}
        confirmText="Delete"
        confirmVariant="destructive"
        busy={deleteTrackM.isPending}
        onConfirm={() => {
          if (!confirmDeleteTrack) return
          deleteTrackM.mutate(confirmDeleteTrack.name)
          setConfirmDeleteTrack(null)
        }}
      />

      <ConfirmDialog
        open={confirmDeleteRadio}
        onOpenChange={setConfirmDeleteRadio}
        title="Delete radio"
        description="This removes the radio and its configuration."
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
        <div className="overflow-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-muted-foreground">
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
                  <tr key={a.id} className="border-t border-border">
                    <td className="p-3 text-foreground">{a.id}</td>
                    <td className="p-3 text-foreground">{a.service}</td>
                    <td className="p-3 text-foreground">{a.action}</td>
                    <td className="p-3">
                      <Badge variant={badge(a.status) as any}>{a.status}</Badge>
                    </td>
                    <td className="p-3 text-muted-foreground max-w-[500px] truncate" title={a.output || ''}>
                      {a.output || ''}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {actionsQ.isError ? <div className="mt-3 text-sm text-destructive">{getErrorMessage(actionsQ.error)}</div> : null}
      </CardContent>
    </Card>
  )
}
