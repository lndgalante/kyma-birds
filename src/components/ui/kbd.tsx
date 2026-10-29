import type * as React from 'react'
import { cn } from '~/lib/utils'

/** shadcn/ui Kbd as Kyma's key cap: Martian Mono 11px, 20px tall, a --line-2 hairline. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-[2.1em] items-center justify-center gap-0.5 rounded-sm px-[5px] align-middle font-mono text-2xs font-medium text-ink-2 inset-ring inset-ring-line-2 select-none in-data-[slot=tooltip-content]:text-ground in-data-[slot=tooltip-content]:inset-ring-ground/30',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
