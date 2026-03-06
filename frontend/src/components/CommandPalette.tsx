import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Input } from './ui/input'
import { cn } from '../utils/cn'
import { Activity, LayoutDashboard, Mic, Radio, ScrollText, Server, Shield, Users, X } from 'lucide-react'

type PaletteItem = {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
}

const NAV_ITEMS = [
  { id: 'nav-dashboard', label: 'Dashboard', description: 'Overview', path: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: 'nav-nodes',     label: 'Nodes',     description: 'Agent nodes',  path: '/nodes',    icon: <Server className="h-4 w-4" /> },
  { id: 'nav-radios',    label: 'Radios',    description: 'Radio streams', path: '/radios',   icon: <Radio className="h-4 w-4" /> },
  { id: 'nav-podcasts',  label: 'Podcasts',  description: 'Shows & episodes', path: '/podcasts', icon: <Mic className="h-4 w-4" /> },
  { id: 'nav-logs',      label: 'Logs',      description: 'Real-time log tail', path: '/logs',  icon: <ScrollText className="h-4 w-4" /> },
  { id: 'nav-actions',   label: 'Actions',   description: 'Action history', path: '/actions', icon: <Activity className="h-4 w-4" /> },
  { id: 'nav-audit',     label: 'Audit',     description: 'Security trail', path: '/audit',   icon: <Shield className="h-4 w-4" /> },
  { id: 'nav-users',     label: 'Users',     description: 'User management', path: '/users',  icon: <Users className="h-4 w-4" /> },
]

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function CommandPalette({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [query, setQuery] = React.useState('')
  const [activeIdx, setActiveIdx] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIdx(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const dynamicItems = React.useMemo((): PaletteItem[] => {
    const items: PaletteItem[] = []

    const nodes: { id: number; name: string }[] = qc.getQueryData(['nodes']) ?? []
    for (const n of nodes) {
      items.push({
        id: `node-${n.id}`,
        label: n.name,
        description: `Node #${n.id}`,
        icon: <Server className="h-4 w-4" />,
        action: () => navigate('/nodes'),
      })
    }

    const radios: { id: number; name: string }[] = qc.getQueryData(['radios']) ?? []
    for (const r of radios) {
      items.push({
        id: `radio-${r.id}`,
        label: r.name,
        description: `Radio #${r.id}`,
        icon: <Radio className="h-4 w-4" />,
        action: () => navigate('/radios'),
      })
    }

    return items
  }, [qc, navigate, open])

  const navItems: PaletteItem[] = NAV_ITEMS.map((n) => ({
    ...n,
    action: () => navigate(n.path),
  }))

  const allItems = [...navItems, ...dynamicItems]

  const filtered = React.useMemo(() => {
    if (!query.trim()) return allItems
    return allItems.filter(
      (item) =>
        fuzzyMatch(item.label, query) ||
        fuzzyMatch(item.description ?? '', query)
    )
  }, [allItems, query])

  React.useEffect(() => {
    setActiveIdx(0)
  }, [query])

  function select(item: PaletteItem) {
    item.action()
    onOpenChange(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIdx]) select(filtered[activeIdx])
    } else if (e.key === 'Escape') {
      onOpenChange(false)
    }
  }

  // Scroll active item into view
  React.useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] animate-fade-in"
        onClick={() => onOpenChange(false)}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg animate-dialog-in">
        <div className="mx-4 overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, nodes, radios…"
              className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No results found.</div>
            ) : (
              filtered.map((item, idx) => (
                <button
                  key={item.id}
                  data-idx={idx}
                  onClick={() => select(item)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                    idx === activeIdx
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/50'
                  )}
                >
                  <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                  <span className="flex-1 font-medium">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground">{item.description}</span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground flex items-center gap-3">
            <span><kbd className="rounded bg-muted px-1">↑↓</kbd> navigate</span>
            <span><kbd className="rounded bg-muted px-1">↵</kbd> select</span>
            <span><kbd className="rounded bg-muted px-1">Esc</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
