import * as React from 'react'
import { cn } from '../../utils/cn'

export function Badge({ className, variant='default', ...props }: React.HTMLAttributes<HTMLSpanElement> & {variant?: 'default'|'success'|'warning'|'danger'}) {
  const variants: Record<string,string> = {
    default: 'bg-muted text-muted-foreground border-border',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    danger: 'bg-red-500/15 text-red-300 border-red-500/30',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', variants[variant], className)} {...props} />
  )
}
