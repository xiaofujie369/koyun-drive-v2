import * as React from 'react'
import { cn } from '@/lib/utils'

/** Native select styled like shadcn inputs (keeps mobile pickers usable). */
export const NativeSelect = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn('flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}
    {...props}
  />
))
NativeSelect.displayName = 'NativeSelect'
