import * as React from 'react'
import { cn } from '../../utils/cn'

// ── Generic hover tooltip ──────────────────────────────────────────────────
export function Tooltip({
  children,
  content,
  side = 'top',
  className,
}: {
  children: React.ReactNode
  content: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}) {
  const pos: Record<string, string> = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute z-50 w-max max-w-[260px] rounded-xl border border-border bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-lg',
          'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
          pos[side]
        )}
      >
        {content}
      </span>
    </span>
  )
}

// ── Inline ? icon that reveals a tooltip ─────────────────────────────────
export function FieldHint({
  text,
  side = 'top',
}: {
  text: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <Tooltip content={text} side={side}>
      <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-border bg-background text-[10px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary">
        ?
      </span>
    </Tooltip>
  )
}

// ── Inline label + hint row ───────────────────────────────────────────────
export function LabelWithHint({
  label,
  hint,
  side = 'right',
}: {
  label: string
  hint: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {label}
      <FieldHint text={hint} side={side} />
    </div>
  )
}
