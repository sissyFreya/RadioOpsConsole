import * as React from 'react'
import { cn } from '../../utils/cn'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[96px] w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'
