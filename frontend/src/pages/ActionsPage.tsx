import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { SkeletonRow } from '../components/ui/skeleton'
import { Activity, Download } from 'lucide-react'
import { useLocale } from '../contexts/LocaleContext'

function exportCsv(rows: ActionOut[]) {
  const header = 'id,requested_by,node_id,service,action,status,output'
  const lines = rows.map((a) =>
    [a.id, a.requested_by, a.node_id, a.service, a.action, a.status, (a.output || '').replace(/"/g, '""')]
      .map((v) => `"${v}"`)
      .join(',')
  )
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'actions.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export type ActionOut = {
  id: number
  requested_by: string
  node_id: number
  service: string
  action: string
  status: string
  output: string | null
}

export function ActionsPage() {
  const { token } = useAuth()
  const { t } = useLocale()

  const actionsQ = useQuery({
    queryKey: ['actions'],
    queryFn: () => apiFetch<ActionOut[]>('/actions/', {}, token),
    refetchInterval: 3000,
    staleTime: 2_500
  })

  const badge = (status: string) => {
    if (status === 'ok') return 'success'
    if (status === 'running') return 'warning'
    if (status === 'error') return 'danger'
    return 'default'
  }

  const actions = actionsQ.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('actions.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('actions.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('actions.history')}</CardTitle>
              <CardDescription>{t('actions.historyDesc')}</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => exportCsv(actions)}
              disabled={actions.length === 0}
            >
              <Download className="h-4 w-4" />
              {t('actions.exportCsv')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">ID</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('actions.requestedBy')}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('actions.node')}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('actions.service')}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('actions.action')}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('actions.status')}</th>
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('actions.output')}</th>
                </tr>
              </thead>
              <tbody>
                {actionsQ.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : actions.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="flex flex-col items-center gap-2 py-12 text-center">
                        <Activity className="h-8 w-8 text-muted-foreground/30" />
                        <div className="text-sm text-muted-foreground">{t('actions.noActions')}</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  actions.map((a) => (
                    <tr key={a.id} className="border-t border-border/60 transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{a.id}</td>
                      <td className="px-4 py-3 text-foreground">{a.requested_by}</td>
                      <td className="px-4 py-3 text-muted-foreground">#{a.node_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground">{a.service}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-muted/40 px-1.5 py-0.5 font-mono text-xs">{a.action}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={badge(a.status) as any}>{a.status}</Badge>
                      </td>
                      <td className="max-w-[400px] truncate px-4 py-3 font-mono text-xs text-muted-foreground" title={a.output || ''}>
                        {a.output || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {actionsQ.isError ? (
            <div className="mt-3 text-sm text-destructive">{t('actions.failed')}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
