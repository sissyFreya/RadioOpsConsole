import * as React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { apiFetch } from '../api/client'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { cn } from '../utils/cn'
import { Radio, Server, Activity, ScrollText, LogOut, Users, Shield, Mic, KeyRound, Menu, X, HelpCircle, UserCircle } from 'lucide-react'
import { RoleGate } from './RoleGate'
import { CommandPalette } from './CommandPalette'
import { HelpDrawer } from './HelpDrawer'
import { useLocale } from '../contexts/LocaleContext'

const NavItem = ({ to, icon: Icon, label, onClick }: { to: string; icon: any; label: string; onClick?: () => void }) => {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 border-l-2',
          isActive
            ? 'border-primary bg-sidebar-accent text-sidebar-accent-foreground'
            : 'border-transparent text-sidebar-foreground/60 hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}

function UserAvatar({ email }: { email: string }) {
  const initials = email
    .split('@')[0]
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase()
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
      {initials}
    </div>
  )
}

function SidebarContent({
  onNavClick,
  onHelpOpen,
}: {
  onNavClick?: () => void
  onHelpOpen?: () => void
}) {
  const { user, logout, token } = useAuth()
  const { t } = useLocale()

  const [cpOpen, setCpOpen] = React.useState(false)
  const [cpCurrent, setCpCurrent] = React.useState('')
  const [cpNew, setCpNew] = React.useState('')
  const [cpConfirm, setCpConfirm] = React.useState('')
  const [cpBusy, setCpBusy] = React.useState(false)
  const [cpError, setCpError] = React.useState<string | null>(null)
  const [cpSuccess, setCpSuccess] = React.useState(false)

  function openCp() {
    setCpCurrent('')
    setCpNew('')
    setCpConfirm('')
    setCpError(null)
    setCpSuccess(false)
    setCpOpen(true)
  }

  async function submitCp(e: React.FormEvent) {
    e.preventDefault()
    if (cpNew !== cpConfirm) { setCpError('New passwords do not match.'); return }
    if (cpNew.length < 8) { setCpError('New password must be at least 8 characters.'); return }
    setCpBusy(true)
    setCpError(null)
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: cpCurrent, new_password: cpNew }),
      }, token)
      setCpSuccess(true)
      setTimeout(() => setCpOpen(false), 1200)
    } catch (err: any) {
      setCpError(err?.message || 'Failed to change password.')
    } finally {
      setCpBusy(false)
    }
  }

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
          <Radio className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">RadioOps</div>
          <div className="text-[10px] leading-none text-muted-foreground">Operations Console</div>
        </div>
      </div>

      <div className="mx-4 h-px bg-sidebar-border/60" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <NavItem to="/"         icon={Activity}   label={t('nav.dashboard')} onClick={onNavClick} />
        <NavItem to="/nodes"    icon={Server}      label={t('nav.nodes')}     onClick={onNavClick} />
        <NavItem to="/radios"   icon={Radio}       label={t('nav.radios')}    onClick={onNavClick} />
        <NavItem to="/podcasts" icon={Mic}         label={t('nav.podcasts')}  onClick={onNavClick} />
        <NavItem to="/logs"     icon={ScrollText}  label={t('nav.logs')}      onClick={onNavClick} />
        <NavItem to="/actions"  icon={Activity}    label={t('nav.actions')}   onClick={onNavClick} />
        <RoleGate roles={['admin', 'ops']}>
          <NavItem to="/audit"  icon={Shield}      label={t('nav.audit')}     onClick={onNavClick} />
        </RoleGate>
        <RoleGate roles={['admin']}>
          <NavItem to="/users"  icon={Users}       label={t('nav.users')}     onClick={onNavClick} />
        </RoleGate>
        <NavItem to="/profile" icon={UserCircle}   label={t('nav.profile')}   onClick={onNavClick} />
      </nav>

      {/* User footer */}
      <div className="mx-4 h-px bg-sidebar-border/60" />
      <div className="p-4">
        <div className="flex items-center gap-2.5">
          <UserAvatar email={user?.email ?? 'user'} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-sidebar-foreground">{user?.email}</div>
            <div className="text-[10px] capitalize text-muted-foreground">{user?.role}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-1">
          <Button variant="ghost" size="sm" onClick={openCp} title={t('sidebar.password')} className="flex-1 justify-start gap-2 text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            {t('sidebar.password')}
          </Button>
          <Button variant="ghost" size="sm" onClick={onHelpOpen} title={t('nav.help')} className="flex-1 justify-start gap-2 text-xs">
            <HelpCircle className="h-3.5 w-3.5" />
            {t('nav.help')}
          </Button>
          <Button variant="ghost" size="sm" onClick={logout} className="flex-1 justify-start gap-2 text-xs">
            <LogOut className="h-3.5 w-3.5" />
            {t('sidebar.logout')}
          </Button>
        </div>
      </div>

      <Dialog open={cpOpen} onOpenChange={setCpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          {cpSuccess ? (
            <div className="py-4 text-center text-emerald-400 text-sm">Password changed successfully.</div>
          ) : (
            <form onSubmit={submitCp} className="space-y-3 mt-1">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Current password</label>
                <Input type="password" value={cpCurrent} onChange={(e) => setCpCurrent(e.target.value)}
                  required autoComplete="current-password" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">New password</label>
                <Input type="password" value={cpNew} onChange={(e) => setCpNew(e.target.value)}
                  required minLength={8} autoComplete="new-password" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Confirm new password</label>
                <Input type="password" value={cpConfirm} onChange={(e) => setCpConfirm(e.target.value)}
                  required autoComplete="new-password" />
              </div>
              {cpError && <div className="text-xs text-destructive">{cpError}</div>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setCpOpen(false)} disabled={cpBusy}>Cancel</Button>
                <Button type="submit" disabled={cpBusy}>{cpBusy ? 'Saving…' : 'Change Password'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)

  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="min-h-screen">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
          <SidebarContent onHelpOpen={() => setHelpOpen(true)} />
        </aside>

        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile sidebar drawer */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="absolute right-3 top-3 z-10">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SidebarContent onNavClick={() => setMobileOpen(false)} onHelpOpen={() => { setMobileOpen(false); setHelpOpen(true) }} />
        </aside>

        <main className="flex-1 overflow-y-auto">
          {/* Mobile topbar */}
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
            <Button variant="ghost" size="sm" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">RadioOps</span>
            </div>
            <div className="ml-auto">
              <Button variant="ghost" size="sm" onClick={() => setPaletteOpen(true)}>
                <span className="text-xs text-muted-foreground">⌘K</span>
              </Button>
            </div>
          </div>

          <div className="mx-auto max-w-6xl p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
