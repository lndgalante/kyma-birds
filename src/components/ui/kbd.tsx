import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * shadcn/ui Kbd as Kyma's key cap: flat, a translucent sand fill a step lighter than what it
 * sits on (the room, a tooltip) inside a hairline.
 */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-part bg-ink/6 px-1.5 align-middle font-sans text-xs leading-none font-medium tabular-nums text-ink-2 inset-ring inset-ring-line-2 select-none',
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
