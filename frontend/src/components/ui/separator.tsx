import { cn } from '../../utils/cn'

export function Separator({
  className,
  orientation = 'horizontal'
}: {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}) {
  return (
    <div
      className={cn(
        'shrink-0 bg-border',
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
        className
      )}
    />
  )
}
