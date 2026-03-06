
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, getApiBase } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCan } from '../components/RoleGate'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select } from '../components/ui/select'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Plus, Upload, Trash2, Pencil, Copy, ExternalLink } from 'lucide-react'

type PodcastShowOut = {
  id: number
  title: string
  description: string | null
  artwork_url: string | null
  created_at: string
}

type PodcastEpisodeOut = {
  id: number
  show_id: number
  title: string
  description: string | null
  audio_rel_path: string
  source: string
  recorded_from_radio_id: number | null
  created_at: string
  size_bytes?: number | null
  modified_at?: string | null
}

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

type TakeoverStatus = {
  radio_id: number
  enabled: boolean
  connected: boolean
  raw: string
  ingest: { host: string; port: number; mount: string; password_hint: string }
}

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

function getErrorMessage(err: unknown) {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: string }).message)
  return 'Request failed'
}

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(2)} GB`
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

export function PodcastsPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const { push } = useToast()
  const canWrite = useCan('admin', 'ops')

  const [showSearch, setShowSearch] = React.useState('')
  const [episodeSearch, setEpisodeSearch] = React.useState('')
  const [sourceFilter, setSourceFilter] = React.useState('all')
  const [episodeSort, setEpisodeSort] = React.useState<'newest' | 'title' | 'size'>('newest')
  const [tab, setTab] = React.useState('episodes')

  const [selectedRadioId, setSelectedRadioId] = React.useState<number | null>(null)
  const [selectedMount, setSelectedMount] = React.useState('/stream')
  const [liveTitle, setLiveTitle] = React.useState('Live session')
  const [liveDesc, setLiveDesc] = React.useState('')
  const [ingestTab, setIngestTab] = React.useState('butt')

  const [browserMicStatus, setBrowserMicStatus] = React.useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle')
  const [browserMicError, setBrowserMicError] = React.useState<string | null>(null)
  const browserWsRef = React.useRef<WebSocket | null>(null)
  const browserRecorderRef = React.useRef<MediaRecorder | null>(null)
  const browserStreamRef = React.useRef<MediaStream | null>(null)

  const [selectedShowId, setSelectedShowId] = React.useState<number | null>(null)
  const [showDraft, setShowDraft] = React.useState<PodcastShowOut | null>(null)

  const [newTitle, setNewTitle] = React.useState('')
  const [newDesc, setNewDesc] = React.useState('')
  const [newArtwork, setNewArtwork] = React.useState('')

  const [uploadFiles, setUploadFiles] = React.useState<File[]>([])
  const [fileInputKey, setFileInputKey] = React.useState(0)
  const [epTitle, setEpTitle] = React.useState('')
  const [epDesc, setEpDesc] = React.useState('')

  const [editEp, setEditEp] = React.useState<PodcastEpisodeOut | null>(null)

  const [confirmDeleteShow, setConfirmDeleteShow] = React.useState<{ open: boolean; id?: number; title?: string }>({
    open: false
  })
  const [confirmDeleteEp, setConfirmDeleteEp] = React.useState<{ open: boolean; id?: number; title?: string }>({
    open: false
  })

  const showsQ = useQuery({
    queryKey: ['podcast-shows'],
    queryFn: () => apiFetch<PodcastShowOut[]>('/podcasts/shows', {}, token),
    refetchInterval: 10000,
    staleTime: 9_000
  })

  const shows = showsQ.data || []

  const radiosQ = useQuery({
    queryKey: ['radios'],
    queryFn: () => apiFetch<RadioOut[]>('/radios', {}, token),
    refetchInterval: 15000,
    staleTime: 14_000
  })

  const radios = radiosQ.data || []

  React.useEffect(() => {
    if (!selectedShowId && shows.length) setSelectedShowId(shows[0].id)
  }, [shows, selectedShowId])

  const selectedShow = shows.find((s) => s.id === selectedShowId) || null

  React.useEffect(() => {
    if (!selectedRadioId && radios.length) setSelectedRadioId(radios[0].id)
  }, [radios, selectedRadioId])

  const selectedRadio = radios.find((r) => r.id === selectedRadioId) || null

  const episodesQ = useQuery({
    queryKey: ['podcast-episodes', selectedShowId],
    queryFn: () => apiFetch<PodcastEpisodeOut[]>(`/podcasts/shows/${selectedShowId}/episodes`, {}, token),
    enabled: !!selectedShowId,
    refetchInterval: 10000,
    staleTime: 9_000
  })

  const takeoverQ = useQuery({
    queryKey: ['takeover', selectedRadioId],
    queryFn: () => apiFetch<TakeoverStatus>(`/radios/${selectedRadioId}/takeover/status`, {}, token),
    enabled: !!selectedRadioId,
    refetchInterval: 2000,
    staleTime: 1_500
  })

  const liveActiveQ = useQuery({
    queryKey: ['live-active', selectedRadioId],
    queryFn: () => apiFetch<LiveSessionOut | null>(`/live/active?radio_id=${selectedRadioId}`, {}, token),
    enabled: !!selectedRadioId,
    refetchInterval: 3000,
    staleTime: 2_500
  })

  const episodes = episodesQ.data || []

  const isBrowserMicSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  const agentWsBase = React.useMemo(() => {
    const envBase = import.meta.env.VITE_AGENT_WS_BASE as string | undefined
    if (envBase) return envBase.replace(/\/$/, '')
    if (typeof window === 'undefined') return ''
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${window.location.hostname}:9000`
  }, [])

  const mounts = React.useMemo(() => getMountList(selectedRadio?.mounts), [selectedRadio?.mounts])

  React.useEffect(() => {
    if (!mounts.length) return
    if (!mounts.includes(selectedMount)) setSelectedMount(mounts[0])
  }, [mounts.join('|'), selectedMount])

  React.useEffect(() => {
    if (selectedShow) setShowDraft(selectedShow)
  }, [selectedShow?.id])

  React.useEffect(() => {
    setEditEp(null)
    setUploadFiles([])
    setEpTitle('')
    setEpDesc('')
    setEpisodeSearch('')
    setSourceFilter('all')
  }, [selectedShowId])

  const recordedCount = episodes.filter((ep) => ep.source === 'record').length
  const uploadedCount = episodes.filter((ep) => ep.source !== 'record').length
  const totalSize = episodes.reduce((acc, ep) => acc + (ep.size_bytes || 0), 0)
  const lastUpdated = episodes.length ? episodes[0].modified_at || episodes[0].created_at : null

  const feedUrl = selectedShow ? `${getApiBase()}/podcasts/shows/${selectedShow.id}/feed` : ''
  const listenUrl = selectedRadio ? buildListenUrl(selectedRadio, selectedMount) : ''
  const publicLiveUrl =
    typeof window !== 'undefined' && selectedRadio ? `${window.location.origin}/live/${selectedRadio.id}` : ''
  const onAirLive = !!takeoverQ.data?.enabled && !!takeoverQ.data?.connected
  const ingestHost = takeoverQ.data?.ingest.host || 'localhost'
  const ingestPort = takeoverQ.data?.ingest.port ?? 8001
  const ingestMount = takeoverQ.data?.ingest.mount || '/live'
  const ingestPassword = takeoverQ.data?.ingest.password_hint || 'djpass'
  const ingestMountPath = ingestMount.startsWith('/') ? ingestMount : `/${ingestMount}`
  const ingestUrl = `icecast://source:${ingestPassword}@${ingestHost}:${ingestPort}${ingestMountPath}`
  const ffmpegCommand = `ffmpeg -re -i input.mp3 -c:a libmp3lame -b:a 192k -content_type audio/mpeg -f mp3 ${ingestUrl}`

  const visibleShows = shows.filter((show) => {
    const needle = showSearch.trim().toLowerCase()
    if (!needle) return true
    const hay = `${show.title} ${show.description || ''}`.toLowerCase()
    return hay.includes(needle)
  })

  const getEpisodeTime = (ep: PodcastEpisodeOut) => {
    const stamp = ep.modified_at || ep.created_at
    const t = new Date(stamp || 0).getTime()
    return Number.isNaN(t) ? 0 : t
  }

  const filteredEpisodes = episodes
    .filter((ep) => {
      if (sourceFilter !== 'all' && ep.source !== sourceFilter) return false
      const needle = episodeSearch.trim().toLowerCase()
      if (!needle) return true
      const hay = `${ep.title} ${ep.description || ''}`.toLowerCase()
      return hay.includes(needle)
    })
    .sort((a, b) => {
      if (episodeSort === 'title') return a.title.localeCompare(b.title)
      if (episodeSort === 'size') return (b.size_bytes || 0) - (a.size_bytes || 0)
      return getEpisodeTime(b) - getEpisodeTime(a)
    })

  const latestEpisode = episodes[0]
  const recordedRadioIds = Array.from(
    new Set(episodes.map((ep) => ep.recorded_from_radio_id).filter((id): id is number => typeof id === 'number'))
  )
  const showForm = showDraft || selectedShow

  const refreshAll = () => {
    showsQ.refetch()
    if (selectedShowId) episodesQ.refetch()
    radiosQ.refetch()
    if (selectedRadioId) {
      takeoverQ.refetch()
      liveActiveQ.refetch()
    }
  }

  const showDirty =
    !!showDraft &&
    !!selectedShow &&
    (showDraft.title !== selectedShow.title ||
      (showDraft.description || '') !== (selectedShow.description || '') ||
      (showDraft.artwork_url || '') !== (selectedShow.artwork_url || ''))

  const createShowM = useMutation({
    mutationFn: () =>
      apiFetch<PodcastShowOut>(
        '/podcasts/shows',
        {
          method: 'POST',
          body: JSON.stringify({
            title: newTitle.trim(),
            description: newDesc.trim() ? newDesc.trim() : null,
            artwork_url: newArtwork.trim() ? newArtwork.trim() : null
          })
        },
        token
      ),
    onSuccess: (show) => {
      setNewTitle('')
      setNewDesc('')
      setNewArtwork('')
      qc.invalidateQueries({ queryKey: ['podcast-shows'] })
      setSelectedShowId(show.id)
      push({ title: 'Show created', description: show.title, variant: 'success' })
    }
  })

  const updateShowM = useMutation({
    mutationFn: (payload: { id: number; title: string; description: string | null; artwork_url: string | null }) =>
      apiFetch<PodcastShowOut>(
        `/podcasts/shows/${payload.id}`,
        { method: 'PUT', body: JSON.stringify({ title: payload.title, description: payload.description, artwork_url: payload.artwork_url }) },
        token
      ),
    onSuccess: (show) => {
      qc.invalidateQueries({ queryKey: ['podcast-shows'] })
      setShowDraft(show)
      push({ title: 'Show updated', description: 'Changes saved', variant: 'success' })
    }
  })

  const deleteShowM = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean }>(`/podcasts/shows/${id}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['podcast-shows'] })
      qc.invalidateQueries({ queryKey: ['podcast-episodes'] })
      setSelectedShowId(null)
      push({ title: 'Show deleted', variant: 'success' })
    }
  })

  const uploadEpisodeM = useMutation({
    mutationFn: async (payload: { files: File[]; title: string; description: string }) => {
      if (!selectedShowId) throw new Error('No show selected')
      if (!payload.files.length) throw new Error('No files selected')

      const uploaded: PodcastEpisodeOut[] = []
      for (const file of payload.files) {
        const fd = new FormData()
        fd.append('file', file)

        const qs = new URLSearchParams()
        if (payload.files.length === 1) {
          if (payload.title.trim()) qs.set('title', payload.title.trim())
          if (payload.description.trim()) qs.set('description', payload.description.trim())
        }

        const url = `/podcasts/shows/${selectedShowId}/episodes/upload${qs.toString() ? `?${qs.toString()}` : ''}`
        const ep = await apiFetch<PodcastEpisodeOut>(url, { method: 'POST', body: fd }, token)
        uploaded.push(ep)
      }
      return uploaded
    },
    onSuccess: (eps) => {
      setUploadFiles([])
      setFileInputKey((k) => k + 1)
      setEpTitle('')
      setEpDesc('')
      qc.invalidateQueries({ queryKey: ['podcast-episodes', selectedShowId] })
      push({ title: 'Episodes uploaded', description: `${eps.length} file(s)`, variant: 'success' })
    },
    onError: (err) => {
      push({ title: 'Upload failed', description: getErrorMessage(err), variant: 'danger' })
    }
  })

  const updateEpM = useMutation({
    mutationFn: (payload: { id: number; title: string; description: string | null }) =>
      apiFetch<PodcastEpisodeOut>(
        `/podcasts/episodes/${payload.id}`,
        { method: 'PUT', body: JSON.stringify({ title: payload.title, description: payload.description }) },
        token
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['podcast-episodes', selectedShowId] })
      setEditEp(null)
      push({ title: 'Episode updated', variant: 'success' })
    }
  })

  const deleteEpM = useMutation({
    mutationFn: (id: number) => apiFetch<{ ok: boolean }>(`/podcasts/episodes/${id}`, { method: 'DELETE' }, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['podcast-episodes', selectedShowId] })
      push({ title: 'Episode deleted', variant: 'success' })
    }
  })

  const takeoverEnableM = useMutation({
    mutationFn: () => {
      if (!selectedRadioId) throw new Error('No radio selected')
      return apiFetch<any>(`/radios/${selectedRadioId}/takeover/enable`, { method: 'POST' }, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['takeover', selectedRadioId] })
      push({ title: 'On-air enabled', description: 'Takeover enabled. If your PC is connected, it will go live.', variant: 'success' })
    },
    onError: (err) => {
      push({ title: 'Enable failed', description: getErrorMessage(err), variant: 'danger' })
    }
  })

  const takeoverDisableM = useMutation({
    mutationFn: () => {
      if (!selectedRadioId) throw new Error('No radio selected')
      return apiFetch<any>(`/radios/${selectedRadioId}/takeover/disable`, { method: 'POST' }, token)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['takeover', selectedRadioId] })
      push({ title: 'On-air disabled', description: 'Takeover disabled. AutoDJ remains on air.', variant: 'default' })
    },
    onError: (err) => {
      push({ title: 'Disable failed', description: getErrorMessage(err), variant: 'danger' })
    }
  })

  const startLiveM = useMutation({
    mutationFn: () => {
      if (!selectedRadioId) throw new Error('No radio selected')
      if (!selectedShowId) throw new Error('No show selected')
      return apiFetch<LiveSessionOut>(
        '/live/start',
        {
          method: 'POST',
          body: JSON.stringify({
            radio_id: selectedRadioId,
            show_id: selectedShowId,
            mount: selectedMount,
            title: liveTitle.trim(),
            description: liveDesc.trim() ? liveDesc.trim() : null
          })
        },
        token
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live-active', selectedRadioId] })
      push({ title: 'Live recording started', description: 'Recording in progress', variant: 'success' })
    },
    onError: (err) => {
      push({ title: 'Live recording failed', description: getErrorMessage(err), variant: 'danger' })
    }
  })

  const stopLiveM = useMutation({
    mutationFn: () => {
      if (!selectedRadioId) throw new Error('No radio selected')
      return apiFetch<{ ok: boolean; episode_id: number; audio_rel_path: string }>(
        '/live/stop',
        { method: 'POST', body: JSON.stringify({ radio_id: selectedRadioId }) },
        token
      )
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['live-active', selectedRadioId] })
      qc.invalidateQueries({ queryKey: ['podcast-episodes'] })
      push({ title: 'Live recording stopped', description: `Episode #${r.episode_id} created`, variant: 'success' })
    },
    onError: (err) => {
      push({ title: 'Stop failed', description: getErrorMessage(err), variant: 'danger' })
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

  const removeUploadFile = (index: number) => {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const buildAudioUrl = (ep: PodcastEpisodeOut) => `${getApiBase()}/media/${ep.audio_rel_path}`

  const stopBrowserMic = React.useCallback((preserveStatus?: boolean) => {
    try {
      if (browserRecorderRef.current && browserRecorderRef.current.state !== 'inactive') {
        browserRecorderRef.current.stop()
      }
    } catch {
      // ignore
    }
    browserRecorderRef.current = null

    if (browserStreamRef.current) {
      browserStreamRef.current.getTracks().forEach((t) => t.stop())
      browserStreamRef.current = null
    }

    if (browserWsRef.current) {
      try {
        browserWsRef.current.close()
      } catch {
        // ignore
      }
      browserWsRef.current = null
    }

    if (!preserveStatus) {
      setBrowserMicStatus('idle')
      setBrowserMicError(null)
    }
  }, [])

  React.useEffect(() => {
    return () => stopBrowserMic(true)
  }, [stopBrowserMic])

  const startBrowserMic = async () => {
    if (!canWrite) {
      setBrowserMicError('Role required: admin/ops')
      setBrowserMicStatus('error')
      return
    }
    if (!isBrowserMicSupported) {
      setBrowserMicError('Browser mic streaming is not supported in this browser.')
      setBrowserMicStatus('error')
      return
    }
    if (!agentWsBase) {
      setBrowserMicError('Agent WebSocket base URL is not configured.')
      setBrowserMicStatus('error')
      return
    }
    if (browserMicStatus === 'connecting' || browserMicStatus === 'streaming') return

    setBrowserMicError(null)
    setBrowserMicStatus('connecting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      browserStreamRef.current = stream

      const candidates = [
        { mime: 'audio/webm;codecs=opus', format: 'webm' },
        { mime: 'audio/webm', format: 'webm' },
        { mime: 'audio/ogg;codecs=opus', format: 'ogg' },
        { mime: 'audio/ogg', format: 'ogg' }
      ]
      const picked = candidates.find((c) => MediaRecorder.isTypeSupported(c.mime))
      const mimeType = picked?.mime
      const format = picked?.format || 'webm'

      const wsUrl = `${agentWsBase.replace(/\/$/, '')}/stream/browser?format=${encodeURIComponent(format)}&mount=${encodeURIComponent(ingestMountPath)}`
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      browserWsRef.current = ws

      ws.onmessage = (evt) => {
        if (typeof evt.data !== 'string') return
        try {
          const msg = JSON.parse(evt.data)
          if (msg.type === 'ready') setBrowserMicStatus('streaming')
          if (msg.type === 'error') {
            setBrowserMicStatus('error')
            setBrowserMicError(msg.message || 'Browser mic streaming failed')
          }
        } catch {
          // ignore
        }
      }
      ws.onerror = () => {
        setBrowserMicStatus('error')
        setBrowserMicError('WebSocket error')
        stopBrowserMic(true)
      }
      ws.onclose = () => {
        if (browserMicStatus === 'streaming' || browserMicStatus === 'connecting') {
          stopBrowserMic()
        }
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      browserRecorderRef.current = recorder

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return
        if (ws.readyState !== WebSocket.OPEN) return
        const buf = await event.data.arrayBuffer()
        ws.send(buf)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
      }

      ws.onopen = () => {
        recorder.start(500)
      }
    } catch (err) {
      setBrowserMicStatus('error')
      setBrowserMicError(getErrorMessage(err))
      stopBrowserMic(true)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Podcasts</h1>
          <p className="text-sm text-muted-foreground">Professional studio for shows, episodes, and distribution.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={refreshAll}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={() => nav('/radios')}>
            Go to radios
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Shows</div>
            <div className="text-2xl font-semibold">{shows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Episodes</div>
            <div className="text-2xl font-semibold">{episodes.length}</div>
            <div className="text-xs text-muted-foreground mt-2">Selected show only</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Sources</div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-semibold">{recordedCount}</div>
              <Badge variant="warning">recorded</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Uploaded: {uploadedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground">Storage</div>
            <div className="text-2xl font-semibold">{formatBytes(totalSize)}</div>
            <div className="text-xs text-muted-foreground mt-2">Last update: {formatDateTime(lastUpdated)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Shows</CardTitle>
            <CardDescription>Manage show catalog and metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search shows"
              value={showSearch}
              onChange={(e) => setShowSearch(e.target.value)}
            />

            <div className="space-y-2">
              {visibleShows.map((show) => {
                const active = selectedShowId === show.id
                return (
                  <button
                    key={show.id}
                    type="button"
                    onClick={() => setSelectedShowId(show.id)}
                    className={
                      'w-full rounded-2xl border px-3 py-3 text-left transition-colors ' +
                      (active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/60')
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl border border-border bg-muted">
                        {show.artwork_url ? (
                          <img src={show.artwork_url} alt={show.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            No art
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{show.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{show.description || 'No description'}</div>
                        <div className="text-[11px] text-muted-foreground">Created {formatDateTime(show.created_at)}</div>
                      </div>
                    </div>
                  </button>
                )
              })}
              {!visibleShows.length ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                  No shows match this filter.
                </div>
              ) : null}
            </div>

            {showsQ.isError ? (
              <div className="text-sm text-destructive">{getErrorMessage(showsQ.error)}</div>
            ) : null}

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                Create show
                <HelpTip text="Artwork URL is used in RSS feeds and players." />
              </div>
              <Input placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <Textarea
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <Input
                placeholder="Artwork URL (optional)"
                value={newArtwork}
                onChange={(e) => setNewArtwork(e.target.value)}
              />
              <Button disabled={!canWrite || !newTitle.trim() || createShowM.isPending} onClick={() => createShowM.mutate()}>
                <Plus className="h-4 w-4" />
                {createShowM.isPending ? 'Creating...' : 'Create'}
              </Button>
              {!canWrite ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}
              {createShowM.isError ? <div className="text-xs text-destructive">{getErrorMessage(createShowM.error)}</div> : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedShow ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="h-20 w-20 overflow-hidden rounded-2xl border border-border bg-muted">
                        {selectedShow.artwork_url ? (
                          <img src={selectedShow.artwork_url} alt={selectedShow.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                            No artwork
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <CardTitle>{selectedShow.title}</CardTitle>
                        <CardDescription>{selectedShow.description || 'No description provided.'}</CardDescription>
                        <div className="text-xs text-muted-foreground">Created {formatDateTime(selectedShow.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyValue(feedUrl)}>
                        <Copy className="h-4 w-4" />
                        Copy feed
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => window.open(feedUrl, '_blank', 'noopener,noreferrer')}>
                        <ExternalLink className="h-4 w-4" />
                        Open feed
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setTab('settings')}>
                        <Pencil className="h-4 w-4" />
                        Edit show
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge variant="default">{episodes.length} episodes</Badge>
                  <Badge variant="warning">{recordedCount} recorded</Badge>
                  <Badge variant="secondary">{uploadedCount} uploaded</Badge>
                  {latestEpisode ? (
                    <Badge variant="default">Latest: {formatDateTime(latestEpisode.created_at)}</Badge>
                  ) : null}
                </CardContent>
              </Card>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex flex-wrap w-full">
                  <TabsTrigger value="episodes">Episodes</TabsTrigger>
                  <TabsTrigger value="live">Live</TabsTrigger>
                  <TabsTrigger value="distribution">Distribution</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="episodes">
                  <Card>
                    <CardHeader>
                      <CardTitle>Upload episodes</CardTitle>
                      <CardDescription>Upload audio files and publish them to the selected show.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          placeholder="Title (single file)"
                          value={epTitle}
                          onChange={(e) => setEpTitle(e.target.value)}
                          disabled={uploadFiles.length > 1}
                        />
                        <Input
                          placeholder="Description (single file)"
                          value={epDesc}
                          onChange={(e) => setEpDesc(e.target.value)}
                          disabled={uploadFiles.length > 1}
                        />
                        <input
                          key={fileInputKey}
                          className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-2xl file:border-0 file:text-sm file:font-medium file:bg-muted file:text-foreground hover:file:bg-accent"
                          type="file"
                          accept="audio/*"
                          multiple
                          onChange={(e) => setUploadFiles(Array.from(e.target.files || []))}
                        />
                      </div>

                      {uploadFiles.length > 1 ? (
                        <div className="text-xs text-muted-foreground">
                          Title and description apply only when a single file is selected.
                        </div>
                      ) : null}

                      {uploadFiles.length ? (
                        <div className="rounded-2xl border border-border bg-muted/30 p-3 space-y-2">
                          {uploadFiles.map((file, idx) => (
                            <div key={`${file.name}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                              <div className="text-foreground truncate">{file.name}</div>
                              <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                              <Button variant="ghost" size="sm" onClick={() => removeUploadFile(idx)}>
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">No files selected.</div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          onClick={() => uploadEpisodeM.mutate({ files: uploadFiles, title: epTitle, description: epDesc })}
                          disabled={!canWrite || !uploadFiles.length || uploadEpisodeM.isPending}
                        >
                          <Upload className="h-4 w-4" />
                          {uploadEpisodeM.isPending ? 'Uploading...' : 'Upload'}
                        </Button>
                        <Button variant="ghost" onClick={() => setUploadFiles([])} disabled={!uploadFiles.length}>
                          Clear selection
                        </Button>
                        {!canWrite ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="mt-4">
                    <CardHeader>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <CardTitle>Episodes</CardTitle>
                          <CardDescription>Search, filter, and manage the library.</CardDescription>
                        </div>
                        <div className="grid gap-2 md:grid-cols-[220px_150px_150px]">
                          <Input
                            placeholder="Search episodes"
                            value={episodeSearch}
                            onChange={(e) => setEpisodeSearch(e.target.value)}
                          />
                          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                            <option value="all">All sources</option>
                            <option value="upload">Uploaded</option>
                            <option value="record">Recorded</option>
                          </Select>
                          <Select value={episodeSort} onChange={(e) => setEpisodeSort(e.target.value as 'newest' | 'title' | 'size')}>
                            <option value="newest">Newest</option>
                            <option value="title">Title</option>
                            <option value="size">Size</option>
                          </Select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-auto rounded-2xl border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/60">
                            <tr className="text-left text-muted-foreground">
                              <th className="p-3">Episode</th>
                              <th className="p-3">Source</th>
                              <th className="p-3">Player</th>
                              <th className="p-3">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredEpisodes.map((ep) => {
                              const url = buildAudioUrl(ep)
                              return (
                                <tr key={ep.id} className="border-t border-border">
                                  <td className="p-3">
                                    <div className="text-foreground font-medium">{ep.title}</div>
                                    {ep.description ? (
                                      <div className="text-xs text-muted-foreground mt-1">{ep.description}</div>
                                    ) : null}
                                    <div className="text-xs text-muted-foreground mt-2">
                                      Size: {formatBytes(ep.size_bytes)} | Updated: {formatDateTime(ep.modified_at || ep.created_at)}
                                    </div>
                                  </td>
                                  <td className="p-3">
                                    <Badge variant={ep.source === 'record' ? 'warning' : 'default'}>{ep.source}</Badge>
                                    {ep.recorded_from_radio_id ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="mt-2"
                                        onClick={() => nav(`/radios/${ep.recorded_from_radio_id}`)}
                                      >
                                        Radio #{ep.recorded_from_radio_id}
                                      </Button>
                                    ) : (
                                      <div className="text-xs text-muted-foreground mt-2">-</div>
                                    )}
                                  </td>
                                  <td className="p-3">
                                    <audio controls preload="none" src={url} className="w-full max-w-[240px]" />
                                  </td>
                                  <td className="p-3">
                                    <div className="flex flex-wrap gap-2">
                                      <Button variant="ghost" size="sm" onClick={() => copyValue(url)}>
                                        <Copy className="h-4 w-4" />
                                        Copy URL
                                      </Button>
                                      <Button variant="secondary" size="sm" onClick={() => setEditEp(ep)} disabled={!canWrite}>
                                        <Pencil className="h-4 w-4" />
                                        Edit
                                      </Button>
                                      <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setConfirmDeleteEp({ open: true, id: ep.id, title: ep.title })}
                                        disabled={!canWrite}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                            {!filteredEpisodes.length ? (
                              <tr>
                                <td className="p-6 text-muted-foreground" colSpan={4}>
                                  No episodes found.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>

                      {episodesQ.isLoading ? <div className="mt-3 text-sm text-muted-foreground">Loading episodes...</div> : null}
                      {episodesQ.isError ? <div className="mt-3 text-sm text-destructive">{getErrorMessage(episodesQ.error)}</div> : null}

                      {editEp ? (
                        <Card className="mt-4">
                          <CardHeader>
                            <CardTitle>Edit episode</CardTitle>
                            <CardDescription>ID #{editEp.id}</CardDescription>
                          </CardHeader>
                          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Input value={editEp.title} onChange={(e) => setEditEp({ ...editEp, title: e.target.value })} />
                            <Input
                              value={editEp.description || ''}
                              onChange={(e) => setEditEp({ ...editEp, description: e.target.value || null })}
                              placeholder="Description"
                            />
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => updateEpM.mutate({ id: editEp.id, title: editEp.title, description: editEp.description })}
                                disabled={!canWrite || updateEpM.isPending}
                              >
                                Save
                              </Button>
                              <Button variant="secondary" onClick={() => setEditEp(null)}>
                                Cancel
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ) : null}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="live">
                  <div className="space-y-4">
                    {selectedRadio ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-border bg-muted/30 p-4">
                          <div className="text-xs text-muted-foreground">On air</div>
                          <div className="text-lg font-semibold">{onAirLive ? 'DJ live' : 'AutoDJ'}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant={takeoverQ.data?.enabled ? 'success' : 'default'}>
                              Takeover {takeoverQ.data?.enabled ? 'enabled' : 'disabled'}
                            </Badge>
                            <Badge variant={takeoverQ.data?.connected ? 'success' : 'default'}>
                              {takeoverQ.data?.connected ? 'PC connected' : 'PC offline'}
                            </Badge>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Listeners hear AutoDJ or DJ when takeover is enabled.
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/30 p-4">
                          <div className="text-xs text-muted-foreground">Selected show</div>
                          <div className="text-lg font-semibold">{selectedShow?.title || 'No show selected'}</div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            New recordings publish here.
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/30 p-4">
                          <div className="text-xs text-muted-foreground">Recording</div>
                          <div className="text-lg font-semibold">
                            {liveActiveQ.data?.status === 'running' ? 'Running' : 'Idle'}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {liveActiveQ.data?.status === 'running'
                              ? `mount ${liveActiveQ.data.mount}`
                              : 'Start a recording when ready.'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <Card>
                        <CardHeader>
                          <CardTitle>No radio selected</CardTitle>
                          <CardDescription>Create or select a radio to unlock live controls.</CardDescription>
                        </CardHeader>
                      </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>Live listen</CardTitle>
                          <CardDescription>Stream preview and public share link.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {radiosQ.isLoading ? (
                            <div className="text-xs text-muted-foreground">Loading radios...</div>
                          ) : null}

                          {selectedRadio ? (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Radio</div>
                                  <Select
                                    value={selectedRadioId ? String(selectedRadioId) : ''}
                                    onChange={(e) => setSelectedRadioId(Number(e.target.value))}
                                  >
                                    <option value="" disabled>
                                      Select radio
                                    </option>
                                    {radios.map((radio) => (
                                      <option key={radio.id} value={radio.id}>
                                        #{radio.id} - {radio.name}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                <div>
                                  <div className="text-xs text-muted-foreground mb-1">Mount</div>
                                  <Select value={selectedMount} onChange={(e) => setSelectedMount(e.target.value)}>
                                    {mounts.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                <div className="md:col-span-3">
                                  <div className="text-xs text-muted-foreground mb-1">Stream URL</div>
                                  <div className="flex flex-wrap gap-2">
                                    <Input readOnly value={listenUrl} />
                                    <Button variant="secondary" onClick={() => copyValue(listenUrl)} disabled={!listenUrl}>
                                      <Copy className="h-4 w-4" />
                                      Copy
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={() => window.open(listenUrl, '_blank', 'noopener,noreferrer')}
                                      disabled={!listenUrl}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      Open
                                    </Button>
                                  </div>
                                </div>
                                <div className="md:col-span-3">
                                  <div className="text-xs text-muted-foreground mb-1">Public live page</div>
                                  <div className="flex flex-wrap gap-2">
                                    <Input readOnly value={publicLiveUrl} />
                                    <Button variant="secondary" onClick={() => copyValue(publicLiveUrl)} disabled={!publicLiveUrl}>
                                      <Copy className="h-4 w-4" />
                                      Copy
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={() => window.open(publicLiveUrl, '_blank', 'noopener,noreferrer')}
                                      disabled={!publicLiveUrl}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                      Open
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <audio controls preload="none" src={listenUrl} className="w-full" />

                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={onAirLive ? 'warning' : 'default'}>{onAirLive ? 'DJ live' : 'AutoDJ'}</Badge>
                                <Badge variant={takeoverQ.data?.enabled ? 'success' : 'default'}>
                                  Takeover {takeoverQ.data?.enabled ? 'enabled' : 'disabled'}
                                </Badge>
                                <Badge variant={takeoverQ.data?.connected ? 'success' : 'default'}>
                                  {takeoverQ.data?.connected ? 'PC connected' : 'PC offline'}
                                </Badge>
                              </div>

                              {takeoverQ.isError ? (
                                <div className="text-xs text-destructive">{getErrorMessage(takeoverQ.error)}</div>
                              ) : null}
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              No radios found. Create one in the Radios section.
                            </div>
                          )}

                          {radiosQ.isError ? (
                            <div className="text-xs text-destructive">{getErrorMessage(radiosQ.error)}</div>
                          ) : null}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Live control</CardTitle>
                          <CardDescription>Connect your PC, enable takeover, and record into the show.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {selectedRadio ? (
                            <>
                              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                                <div className="text-sm font-medium">Step 1 - Connect your PC</div>
                                <div className="text-xs text-muted-foreground">
                                  Use BUTT, OBS, or ffmpeg as an Icecast source. You can stay connected before going live.
                                </div>
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
                                    <span className="font-mono text-foreground">
                                      {takeoverQ.data?.ingest.password_hint || 'djpass'}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">Do not connect to /stream as a source.</div>

                                <Separator />

                                <div className="space-y-3">
                                  <div className="text-sm font-medium">Quick setup</div>
                                  <Tabs value={ingestTab} onValueChange={setIngestTab}>
                                    <TabsList className="flex flex-wrap w-full">
                                      <TabsTrigger value="butt">BUTT</TabsTrigger>
                                      <TabsTrigger value="ffmpeg">ffmpeg</TabsTrigger>
                                      <TabsTrigger value="obs">OBS</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="butt">
                                      <div className="space-y-2 text-xs text-muted-foreground">
                                        <div>Server: <span className="text-foreground">{ingestHost}</span></div>
                                        <div>Port: <span className="text-foreground">{ingestPort}</span></div>
                                        <div>Mount: <span className="text-foreground">{ingestMountPath}</span></div>
                                        <div>Password: <span className="text-foreground">{ingestPassword}</span></div>
                                        <div>Encoder: MP3 128-192 kbps, 44.1 kHz, stereo.</div>
                                      </div>
                                    </TabsContent>

                                    <TabsContent value="ffmpeg">
                                      <div className="space-y-2">
                                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
{ffmpegCommand}
                                        </pre>
                                        <Button variant="secondary" size="sm" onClick={() => copyValue(ffmpegCommand)}>
                                          <Copy className="h-4 w-4" />
                                          Copy command
                                        </Button>
                                      </div>
                                    </TabsContent>

                                    <TabsContent value="obs">
                                      <div className="space-y-2 text-xs text-muted-foreground">
                                        <div>Use OBS to mix audio, then stream with BUTT or ffmpeg.</div>
                                        <div>Virtual audio output from OBS should be your input device.</div>
                                        <div>Keep takeover disabled until you are ready to go on air.</div>
                                      </div>
                                    </TabsContent>
                                  </Tabs>
                                </div>

                                <Separator />

                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-medium">Browser mic (beta)</div>
                                      <div className="text-xs text-muted-foreground">
                                        Stream audio directly from this browser to the live ingest.
                                      </div>
                                    </div>
                                    <Badge
                                      variant={
                                        browserMicStatus === 'streaming'
                                          ? 'success'
                                          : browserMicStatus === 'connecting'
                                          ? 'warning'
                                          : browserMicStatus === 'error'
                                          ? 'danger'
                                          : 'default'
                                      }
                                    >
                                      {browserMicStatus === 'streaming'
                                        ? 'Streaming'
                                        : browserMicStatus === 'connecting'
                                        ? 'Connecting'
                                        : browserMicStatus === 'error'
                                        ? 'Error'
                                        : 'Idle'}
                                    </Badge>
                                  </div>

                                  {!isBrowserMicSupported ? (
                                    <div className="text-xs text-muted-foreground">
                                      This browser does not support MediaRecorder.
                                    </div>
                                  ) : null}

                                  {browserMicError ? (
                                    <div className="text-xs text-destructive">{browserMicError}</div>
                                  ) : null}

                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      onClick={startBrowserMic}
                                      disabled={!isBrowserMicSupported || browserMicStatus === 'connecting' || browserMicStatus === 'streaming'}
                                    >
                                      Start mic
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={() => stopBrowserMic()}
                                      disabled={browserMicStatus === 'idle'}
                                    >
                                      Stop mic
                                    </Button>
                                  </div>

                                  <div className="text-xs text-muted-foreground">
                                    Your mic feeds {ingestMountPath}. Enable takeover to go live.
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-medium">Step 2 - Enable takeover</div>
                                  <Badge variant={takeoverQ.data?.enabled ? 'success' : 'default'}>
                                    {takeoverQ.data?.enabled ? 'Enabled' : 'Disabled'}
                                  </Badge>
                                  <Badge variant={takeoverQ.data?.connected ? 'success' : 'default'}>
                                    {takeoverQ.data?.connected ? 'PC connected' : 'PC offline'}
                                  </Badge>
                                  <Badge variant={onAirLive ? 'warning' : 'default'}>
                                    {onAirLive ? 'ON AIR' : 'AutoDJ ON AIR'}
                                  </Badge>
                                  <div className="ml-auto flex items-center gap-2">
                                    <Button variant="secondary" onClick={() => takeoverQ.refetch()} disabled={takeoverQ.isFetching}>
                                      Refresh
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={() => takeoverDisableM.mutate()}
                                      disabled={!canWrite || takeoverDisableM.isPending}
                                    >
                                      Disable
                                    </Button>
                                    <Button onClick={() => takeoverEnableM.mutate()} disabled={!canWrite || takeoverEnableM.isPending}>
                                      Enable
                                    </Button>
                                  </div>
                                </div>
                                {!canWrite ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}
                              </div>

                              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                                <div className="text-sm font-medium">Step 3 - Record and publish</div>
                                <div className="text-xs text-muted-foreground">
                                  Recording captures whatever is on air (AutoDJ or DJ live).
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Recording show: <span className="text-foreground">{selectedShow?.title || 'No show selected'}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Mount: <span className="text-foreground">{selectedMount}</span>
                                </div>

                                {liveActiveQ.data?.status === 'running' ? (
                                  <div className="rounded-2xl border border-border p-4 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div>
                                        <div className="text-sm font-medium text-foreground">{liveActiveQ.data.title}</div>
                                        <div className="text-xs text-muted-foreground">
                                          mount: {liveActiveQ.data.mount} | rec: {liveActiveQ.data.recording_id}
                                        </div>
                                      </div>
                                      <Badge variant="warning">RUNNING</Badge>
                                    </div>
                                    {liveActiveQ.data.description ? (
                                      <div className="text-xs text-muted-foreground">{liveActiveQ.data.description}</div>
                                    ) : null}
                                    <div className="text-xs text-muted-foreground break-all">
                                      file: {liveActiveQ.data.output_rel_path}
                                    </div>
                                    <Button
                                      variant="destructive"
                                      disabled={!canWrite || stopLiveM.isPending}
                                      onClick={() => stopLiveM.mutate()}
                                    >
                                      {stopLiveM.isPending ? 'Stopping...' : 'Stop and publish'}
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <Input value={liveTitle} onChange={(e) => setLiveTitle(e.target.value)} placeholder="Episode title" />
                                    <Textarea
                                      value={liveDesc}
                                      onChange={(e) => setLiveDesc(e.target.value)}
                                      placeholder="Description (optional)"
                                    />
                                    <Button
                                      disabled={
                                        !canWrite ||
                                        !selectedShowId ||
                                        !selectedRadioId ||
                                        !liveTitle.trim() ||
                                        startLiveM.isPending
                                      }
                                      onClick={() => startLiveM.mutate()}
                                    >
                                      {startLiveM.isPending ? 'Starting...' : 'Start recording'}
                                    </Button>
                                    {!selectedShowId ? (
                                      <div className="text-xs text-muted-foreground">Select a show on the left first.</div>
                                    ) : null}
                                  </div>
                                )}

                                {liveActiveQ.isError ? (
                                  <div className="text-xs text-destructive">{getErrorMessage(liveActiveQ.error)}</div>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">Select a radio to enable live operations.</div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="distribution">
                  <Card>
                    <CardHeader>
                      <CardTitle>Distribution</CardTitle>
                      <CardDescription>RSS feed, embeds, and public links.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">RSS feed URL</div>
                        <div className="flex flex-wrap gap-2">
                          <Input readOnly value={feedUrl} />
                          <Button variant="secondary" onClick={() => copyValue(feedUrl)}>
                            <Copy className="h-4 w-4" />
                            Copy
                          </Button>
                          <Button variant="ghost" onClick={() => window.open(feedUrl, '_blank', 'noopener,noreferrer')}>
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                          <div className="text-sm font-medium">Latest episode player</div>
                          {latestEpisode ? (
                            <audio controls preload="none" src={buildAudioUrl(latestEpisode)} className="w-full" />
                          ) : (
                            <div className="text-xs text-muted-foreground">No episodes published yet.</div>
                          )}
                        </div>
                        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                          <div className="text-sm font-medium">Embed snippet</div>
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
{latestEpisode ? `<audio controls src="${buildAudioUrl(latestEpisode)}"></audio>` : 'Publish an episode to generate an embed.'}
                          </pre>
                          {latestEpisode ? (
                            <Button variant="ghost" size="sm" onClick={() => copyValue(`<audio controls src="${buildAudioUrl(latestEpisode)}"></audio>`)}>
                              Copy embed
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {recordedRadioIds.length ? (
                        <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
                          <div className="text-sm font-medium">Recorded from radios</div>
                          <div className="flex flex-wrap gap-2">
                            {recordedRadioIds.map((id) => (
                              <Button key={id} variant="ghost" size="sm" onClick={() => nav(`/radios/${id}`)}>
                                Radio #{id}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings">
                  <Card>
                    <CardHeader>
                      <CardTitle>Show settings</CardTitle>
                      <CardDescription>Update metadata and artwork.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!canWrite ? <div className="text-xs text-muted-foreground">Role required: admin/ops</div> : null}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Title</div>
                          <Input
                            value={showForm?.title || ''}
                            onChange={(e) => showForm && setShowDraft({ ...showForm, title: e.target.value })}
                            disabled={!canWrite}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Artwork URL</div>
                          <Input
                            value={showForm?.artwork_url || ''}
                            onChange={(e) => showForm && setShowDraft({ ...showForm, artwork_url: e.target.value || null })}
                            disabled={!canWrite}
                          />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <div className="text-xs text-muted-foreground">Description</div>
                          <Textarea
                            value={showForm?.description || ''}
                            onChange={(e) => showForm && setShowDraft({ ...showForm, description: e.target.value || null })}
                            disabled={!canWrite}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          onClick={() =>
                            showForm &&
                            updateShowM.mutate({
                              id: showForm.id,
                              title: showForm.title,
                              description: showForm.description || null,
                              artwork_url: showForm.artwork_url || null
                            })
                          }
                          disabled={!canWrite || !showDirty || updateShowM.isPending}
                        >
                          {updateShowM.isPending ? 'Saving...' : 'Save changes'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => selectedShow && setShowDraft(selectedShow)}
                          disabled={!canWrite || !showDirty || updateShowM.isPending}
                        >
                          Reset
                        </Button>
                        {updateShowM.isError ? (
                          <div className="text-sm text-destructive">{getErrorMessage(updateShowM.error)}</div>
                        ) : null}
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <div className="text-sm font-semibold text-foreground">Danger zone</div>
                        <div className="text-xs text-muted-foreground">Deleting a show removes all episodes from the database.</div>
                        <Button
                          variant="destructive"
                          disabled={!canWrite}
                          onClick={() =>
                            setConfirmDeleteShow({ open: true, id: selectedShow.id, title: selectedShow.title })
                          }
                        >
                          Delete show
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No show selected</CardTitle>
                <CardDescription>Select or create a show to manage episodes.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Choose a show from the left panel to start working on episodes and distribution.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteShow.open}
        onOpenChange={(v) => setConfirmDeleteShow((p) => ({ ...p, open: v }))}
        title="Delete show"
        description={`Show: ${confirmDeleteShow.title || ''}. This also deletes its episodes.`}
        confirmText="Delete"
        confirmVariant="destructive"
        busy={deleteShowM.isPending}
        onConfirm={() => {
          if (!confirmDeleteShow.id) return
          deleteShowM.mutate(confirmDeleteShow.id)
          setConfirmDeleteShow({ open: false })
        }}
      />

      <ConfirmDialog
        open={confirmDeleteEp.open}
        onOpenChange={(v) => setConfirmDeleteEp((p) => ({ ...p, open: v }))}
        title="Delete episode"
        description={`Episode: ${confirmDeleteEp.title || ''}. File deletion is best effort.`}
        confirmText="Delete"
        confirmVariant="destructive"
        busy={deleteEpM.isPending}
        onConfirm={() => {
          if (!confirmDeleteEp.id) return
          deleteEpM.mutate(confirmDeleteEp.id)
          setConfirmDeleteEp({ open: false })
        }}
      />
    </div>
  )
}
