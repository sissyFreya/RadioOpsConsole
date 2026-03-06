import * as React from 'react'
import { apiFetch, getWsBase } from '../api/client'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

export function RealtimeLogViewer({
  token,
  nodeId,
  service,
  height = 360
}: {
  token: string
  nodeId: number
  service: string
  height?: number
}) {
  const [lines, setLines] = React.useState<string[]>([])
  const [paused, setPaused] = React.useState(false)
  const [connected, setConnected] = React.useState(false)
  const [autoScroll, setAutoScroll] = React.useState(true)
  const [filter, setFilter] = React.useState('')
  const boxRef = React.useRef<HTMLDivElement | null>(null)
  const wsRef = React.useRef<WebSocket | null>(null)

  const connect = React.useCallback(async () => {
    if (!token || !nodeId || !service) return

    // Obtain a short-lived one-time ticket so the JWT is never exposed in the WS URL
    let wsTicket: string
    try {
      const resp = await apiFetch<{ ticket: string }>('/ws/ticket', { method: 'POST' }, token)
      wsTicket = resp.ticket
    } catch {
      setConnected(false)
      return
    }

    const url = `${getWsBase()}/ws/logs/tail?node_id=${encodeURIComponent(String(nodeId))}&service=${encodeURIComponent(service)}&ticket=${encodeURIComponent(wsTicket)}`

    wsRef.current?.close()
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (ev) => {
      if (paused) return
      const line = String(ev.data)
      setLines((prev) => {
        const next = [...prev, line]
        // Keep memory bounded
        if (next.length > 2000) return next.slice(next.length - 2000)
        return next
      })
    }
  }, [token, nodeId, service, paused])

  React.useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  const visibleLines = React.useMemo(() => {
    if (!filter.trim()) return lines
    const needle = filter.toLowerCase()
    return lines.filter((l) => l.toLowerCase().includes(needle))
  }, [lines, filter])

  React.useEffect(() => {
    if (!autoScroll) return
    const el = boxRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleLines, autoScroll])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          Logs
          <Badge variant={connected ? 'success' : 'danger'}>{connected ? 'live' : 'offline'}</Badge>
          <span className="text-xs text-muted-foreground">{service}</span>
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Filter logs…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 w-44 text-xs"
          />
          {filter && (
            <span className="text-xs text-muted-foreground">
              {visibleLines.length}/{lines.length}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setLines([])}>
            Clear
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAutoScroll((s) => !s)}>
            Auto-scroll: {autoScroll ? 'On' : 'Off'}
          </Button>
          <Button variant="ghost" size="sm" onClick={connect}>
            Reconnect
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={boxRef}
          className="rounded-2xl border border-border bg-muted p-3 font-mono text-xs text-foreground overflow-auto"
          style={{ height }}
        >
          {visibleLines.length === 0 ? (
            <div className="text-muted-foreground">
              {lines.length > 0 ? 'No lines match the filter.' : 'No log lines yet.'}
            </div>
          ) : (
            visibleLines.map((l, idx) => (
              <div key={idx} className="whitespace-pre-wrap break-words">
                {filter ? (
                  <HighlightMatch line={l} needle={filter} />
                ) : l}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function HighlightMatch({ line, needle }: { line: string; needle: string }) {
  const idx = line.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return <>{line}</>
  return (
    <>
      {line.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-foreground rounded-sm">{line.slice(idx, idx + needle.length)}</mark>
      {line.slice(idx + needle.length)}
    </>
  )
}
