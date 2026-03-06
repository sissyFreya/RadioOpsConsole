import { cn } from '../../utils/cn'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/40', className)} />
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  const widths = ['w-16', 'w-32', 'w-24', 'w-20', 'w-28', 'w-12']
  return (
    <tr className="border-t border-border/60">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-3">
          <Skeleton className={cn('h-4', widths[i % widths.length])} />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-3/5" />
      <div className="pt-2 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}
