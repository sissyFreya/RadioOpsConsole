import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { RealtimeLogViewer } from '../components/RealtimeLogViewer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { useLocale } from '../contexts/LocaleContext'

type NodeOut = { id: number; name: string; agent_url: string }

export function LogsPage() {
  const { token } = useAuth()
  const { t } = useLocale()

  const nodesQ = useQuery({
    queryKey: ['nodes'],
    queryFn: () => apiFetch<NodeOut[]>('/nodes/', {}, token),
    staleTime: 30_000
  })

  const [nodeId, setNodeId] = React.useState<number>(1)
  const [service, setService] = React.useState<string>('icecast2')

  React.useEffect(() => {
    if (nodesQ.data?.length) setNodeId(nodesQ.data[0].id)
  }, [nodesQ.data])

  if (!token) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('logs.title')}</h1>
        <p className="text-sm text-zinc-400">{t('logs.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('logs.filtersTitle')}</CardTitle>
          <CardDescription>{t('logs.filtersDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <select
              className="h-10 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 text-sm"
              value={nodeId}
              onChange={(e) => setNodeId(Number(e.target.value))}
            >
              {(nodesQ.data || []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>
          <Input placeholder="Service (systemd unit)" value={service} onChange={(e) => setService(e.target.value)} />
          <div className="text-sm text-zinc-500 flex items-center">
            {t('logs.tip')}
          </div>
        </CardContent>
      </Card>

      <RealtimeLogViewer token={token} nodeId={nodeId} service={service} height={520} />
    </div>
  )
}
