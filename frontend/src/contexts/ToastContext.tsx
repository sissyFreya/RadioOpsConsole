import * as React from 'react'
import { cn } from '../utils/cn'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type Variant = 'default' | 'success' | 'danger' | 'warning'

type Toast = {
  id: string
  title: string
  description?: string
  variant?: Variant
}

type ToastCtx = {
  push: (t: Omit<Toast, 'id'>) => void
}

const ToastContext = React.createContext<ToastCtx | null>(null)

const ICONS: Record<Variant, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />,
  danger:  <XCircle       className="h-4 w-4 shrink-0 text-red-400" />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />,
  default: <Info          className="h-4 w-4 shrink-0 text-muted-foreground" />,
}

const BORDERS: Record<Variant, string> = {
  success: 'border-emerald-500/40',
  danger:  'border-red-500/40',
  warning: 'border-amber-500/40',
  default: 'border-border',
}

const PROGRESS: Record<Variant, string> = {
  success: 'bg-emerald-500',
  danger:  'bg-red-500',
  warning: 'bg-amber-500',
  default: 'bg-primary',
}

const DURATION = 5000

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const v = toast.variant ?? 'default'
  return (
    <div
      className={cn(
        'animate-toast-in relative overflow-hidden rounded-2xl border bg-card shadow-lg',
        BORDERS[v]
      )}
    >
      <div className="flex items-start gap-3 p-4 pr-10">
        {ICONS[v]}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{toast.title}</div>
          {toast.description ? (
            <div className="mt-0.5 text-xs text-muted-foreground">{toast.description}</div>
          ) : null}
        </div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="absolute right-3 top-3 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-border/60">
        <div className={cn('h-full animate-shrink', PROGRESS[v])} />
      </div>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, ...t }])
    window.setTimeout(() => dismiss(id), DURATION)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-[360px] max-w-[calc(100%-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
