import * as React from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Select } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { ExternalLink, Users, Radio as RadioIcon } from 'lucide-react'

type RadioPublicOut = {
  id: number
  name: string
  description: string | null
  mounts: string
  public_base_url: string
}

type IcecastStats = {
  radio_id: number
  total_listeners: number
  mounts: { mount: string; listeners: number; title: string | null; bitrate: number | null }[]
}

function getErrorMessage(err: unknown) {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: string }).message)
  return 'Request failed'
}

function getMountList(mounts: string | null | undefined) {
  const list = (mounts || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
  return list.length ? list : ['/stream']
}

function buildListenUrl(radio: RadioPublicOut, mount: string) {
  const base = radio.public_base_url || 'http://localhost:8000'
  const clean = base.replace(/\/$/, '')
  return `${clean}${mount.startsWith('/') ? mount : `/${mount}`}`
}

export function LivePage() {
  const { id } = useParams()
  const initialId = id ? Number(id) : null
  const [selectedRadioId, setSelectedRadioId] = React.useState<number | null>(initialId)
  const [mount, setMount] = React.useState('/stream')
  const [copied, setCopied] = React.useState(false)

  const radiosQ = useQuery({
    queryKey: ['public-radios'],
    queryFn: () => apiFetch<RadioPublicOut[]>('/radios/public'),
    staleTime: 60_000
  })

  const radios = radiosQ.data || []

  React.useEffect(() => {
    if (!selectedRadioId && radios.length) setSelectedRadioId(radios[0].id)
  }, [radios, selectedRadioId])

  React.useEffect(() => {
    if (initialId) setSelectedRadioId(initialId)
  }, [initialId])

  const selectedRadio = radios.find((r) => r.id === selectedRadioId) || null
  const mounts = React.useMemo(() => getMountList(selectedRadio?.mounts), [selectedRadio?.mounts])

  React.useEffect(() => {
    if (!mounts.length) return
    if (!mounts.includes(mount)) setMount(mounts[0])
  }, [mounts.join('|'), mount])

  const statsQ = useQuery({
    queryKey: ['icecast-stats-public', selectedRadioId],
    queryFn: () => apiFetch<IcecastStats>(`/radios/${selectedRadioId}/icecast-stats`),
    enabled: !!selectedRadioId,
    refetchInterval: 10_000,
    staleTime: 9_000,
    retry: false,
  })

  const mountStats = statsQ.data?.mounts.find((m_) => m_.mount === mount) ?? null
  const listenersForMount = mountStats?.listeners ?? null
  const trackTitle = mountStats?.title ?? null

  const listenUrl = selectedRadio ? buildListenUrl(selectedRadio, mount) : ''
  const shareUrl =
    typeof window !== 'undefined' && selectedRadio
      ? `${window.location.origin}/live/${selectedRadio.id}`
      : ''

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      const input = document.createElement('input')
      input.value = value
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground">
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">RadioOps Live</div>
            <h1 className="text-3xl font-semibold tracking-tight">Live Stream</h1>
            <p className="text-sm text-muted-foreground">
              Listen in real time and share the on-air link with your audience.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Admin login</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card className="border-border/60 bg-background/60 backdrop-blur">
            <CardHeader>
              <CardTitle>Now streaming</CardTitle>
              <CardDescription>{selectedRadio?.description || 'Live broadcast'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {radiosQ.isError ? (
                <div className="text-sm text-destructive">{getErrorMessage(radiosQ.error)}</div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-3">
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
                  <Select value={mount} onChange={(e) => setMount(e.target.value)}>
                    {mounts.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default">On air</Badge>
                    {listenersForMount !== null ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {listenersForMount}
                      </span>
                    ) : statsQ.isFetching ? (
                      <span className="text-xs text-muted-foreground">…</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {trackTitle ? (
                <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2">
                  <RadioIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="text-xs text-foreground truncate">{trackTitle}</span>
                </div>
              ) : null}

              <audio controls preload="none" src={listenUrl} className="w-full" />

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="text-foreground">{selectedRadio?.name || 'Radio'}</span>
                <span> | </span>
                <span>{listenUrl}</span>
                {statsQ.data && (
                  <>
                    <span> | </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {statsQ.data.total_listeners} total
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-background/60 backdrop-blur">
            <CardHeader>
              <CardTitle>Share this live page</CardTitle>
              <CardDescription>Send the link to your audience or embed it anywhere.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Shareable URL</div>
                <Input readOnly value={shareUrl} />
              </div>
              <Button
                variant="secondary"
                onClick={() => copyValue(shareUrl)}
                disabled={!shareUrl}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => window.open(listenUrl, '_blank', 'noopener,noreferrer')}
                disabled={!listenUrl}
              >
                <ExternalLink className="h-4 w-4" />
                Open stream
              </Button>

              {statsQ.data && statsQ.data.mounts.length > 0 ? (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-3 space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Live listeners</div>
                  {statsQ.data.mounts.map((m_) => (
                    <div key={m_.mount} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">{m_.mount}</span>
                      <span className="flex items-center gap-1 text-foreground">
                        <Users className="h-3 w-3" />
                        {m_.listeners}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 bg-background/50 backdrop-blur">
          <CardHeader>
            <CardTitle>Embed snippet</CardTitle>
            <CardDescription>Paste this in your website or newsletter.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
{listenUrl ? `<audio controls src="${listenUrl}"></audio>` : 'Select a radio to generate the embed snippet.'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
