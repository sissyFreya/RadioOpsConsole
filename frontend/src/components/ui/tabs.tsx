import * as React from 'react'
import { cn } from '../../utils/cn'

type TabsContextValue = { value: string; setValue: (v: string) => void }
const TabsContext = React.createContext<TabsContextValue | null>(null)

export function Tabs({ value, onValueChange, children, className }: {value: string; onValueChange: (v: string)=>void; children: React.ReactNode; className?: string}) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={cn(className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-2xl border border-border bg-muted p-1', className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('TabsTrigger must be used within Tabs')
  const active = ctx.value === value
  return (
    <button
      type="button"
      onClick={() => ctx.setValue(value)}
      className={cn(
        'h-9 px-3 rounded-2xl text-sm transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error('TabsContent must be used within Tabs')
  if (ctx.value !== value) return null
  return <div className={cn('mt-4', className)}>{children}</div>
}
