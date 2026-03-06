import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../utils/cn'

type DialogCtx = {
  open: boolean
  setOpen: (v: boolean) => void
}

const DialogContext = React.createContext<DialogCtx | null>(null)

export function Dialog({ open, onOpenChange, children }: { open: boolean; onOpenChange: (v: boolean) => void; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ open, setOpen: onOpenChange }), [open, onOpenChange])
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
}

export function DialogTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactElement }) {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error('DialogTrigger must be used within Dialog')
  if (!asChild) return <button onClick={() => ctx.setOpen(true)}>{children}</button>
  return React.cloneElement(children, { onClick: (e: any) => { children.props.onClick?.(e); ctx.setOpen(true) } })
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error('DialogContent must be used within Dialog')
  if (!ctx.open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 animate-fade-in">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" onMouseDown={() => ctx.setOpen(false)} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className={cn('w-[calc(100vw-2rem)] max-w-lg animate-dialog-in rounded-2xl border border-border bg-background p-5 text-foreground shadow-2xl', className)}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5 mb-4">{children}</div>
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex items-center justify-end gap-2">{children}</div>
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-lg font-semibold tracking-tight">{children}</div>
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted-foreground">{children}</div>
}
