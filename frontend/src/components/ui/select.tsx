import * as React from 'react'
import { cn } from '../../utils/cn'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'
