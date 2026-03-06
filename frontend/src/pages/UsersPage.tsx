import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../api/client'
import { RoleGate } from '../components/RoleGate'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { useToast } from '../contexts/ToastContext'
import { useLocale } from '../contexts/LocaleContext'

type User = { id: number; email: string; role: string; is_active: boolean }

export function UsersPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const { push } = useToast()
  const { t } = useLocale()

  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState('viewer')

  const usersQ = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<User[]>('/users/', {}, token),
    enabled: !!token,
    staleTime: 60_000
  })

  const createM = useMutation({
    mutationFn: () => apiFetch<User>('/users/', { method: 'POST', body: JSON.stringify({ email, password, role }) }, token),
    onSuccess: () => {
      push({ title: 'User created', variant: 'success' })
      setOpen(false)
      setEmail('')
      setPassword('')
      setRole('viewer')
      qc.invalidateQueries({ queryKey: ['users'] })
    }
  })

  const updateM = useMutation({
    mutationFn: (payload: { id: number; role?: string; is_active?: boolean }) => apiFetch<User>(`/users/${payload.id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token),
    onSuccess: () => {
      push({ title: 'User updated', variant: 'success' })
      qc.invalidateQueries({ queryKey: ['users'] })
    }
  })

  return (
    <RoleGate roles={['admin']} fallback={<div className="text-zinc-300">Forbidden</div>}>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('users.title')}</h1>
            <p className="text-sm text-zinc-400">{t('users.subtitle')}</p>
          </div>
          <Button onClick={() => setOpen(true)}>{t('users.newUser')}</Button>
        </div>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>{t('users.accounts')}</CardTitle>
            <CardDescription>{t('users.accountsDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950/60">
                  <tr className="text-left text-zinc-400">
                    <th className="p-3">ID</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">{t('profile.role')}</th>
                    <th className="p-3">{t('status.active')}</th>
                    <th className="p-3">{t('users.rotateRole', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersQ.data || []).map((u) => (
                    <tr key={u.id} className="border-t border-zinc-800/60">
                      <td className="p-3 text-zinc-300">{u.id}</td>
                      <td className="p-3 text-zinc-200">{u.email}</td>
                      <td className="p-3">
                        <Badge variant={u.role === 'admin' ? 'danger' : u.role === 'ops' ? 'warning' : 'default'}>{u.role}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'active' : 'disabled'}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => updateM.mutate({ id: u.id, role: u.role === 'viewer' ? 'ops' : u.role === 'ops' ? 'admin' : 'viewer' })}
                            disabled={updateM.isPending}
                          >
                            {t('users.rotateRole')}
                          </Button>
                          <Button
                            size="sm"
                            variant={u.is_active ? 'destructive' : 'secondary'}
                            onClick={() => updateM.mutate({ id: u.id, is_active: !u.is_active })}
                            disabled={updateM.isPending}
                          >
                            {u.is_active ? t('users.disable') : t('users.enable')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {usersQ.isLoading ? <div className="text-sm text-zinc-500 mt-3">{t('common.loading')}</div> : null}
            {usersQ.isError ? <div className="text-sm text-red-300 mt-3">{t('users.failed')}</div> : null}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('users.createTitle')}</DialogTitle>
              <DialogDescription>{t('users.createDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Email</div>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@domain" />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">{t('users.userPassword')}</div>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="********" />
              </div>
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Role</div>
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="viewer">viewer</option>
                  <option value="ops">ops</option>
                  <option value="admin">admin</option>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={createM.isPending}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => createM.mutate()} disabled={!email || password.length < 8 || createM.isPending}>
                {createM.isPending ? t('users.creating') : t('common.create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGate>
  )
}
