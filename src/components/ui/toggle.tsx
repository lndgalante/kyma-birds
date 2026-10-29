import { Toggle as TogglePrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'
import { buttonVariants } from './button'

/**
 * The pressed state: Radix sets aria-pressed, which the outline variant's `aria-pressed:` classes
 * style (button.tsx). Forced colours drop fills and rings, so there the pill fills with Highlight.
 */
const PRESSED =
  'forced-colors:data-[state=on]:forced-color-adjust-none forced-colors:data-[state=on]:bg-[Highlight] forced-colors:data-[state=on]:text-[HighlightText]'

function Toggle({ className, ...props }: React.ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(buttonVariants({ variant: 'outline' }), PRESSED, className)}
      {...props}
    />
  )
}

export { Toggle }
