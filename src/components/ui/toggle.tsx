import { Toggle as TogglePrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'
import { buttonVariants } from './button'

/** Kyma's pressed state: the control fills with ink (Highlight in forced colours). */
const PRESSED =
  'data-[state=on]:bg-ink data-[state=on]:text-ground data-[state=on]:inset-ring-ink forced-colors:data-[state=on]:forced-color-adjust-none forced-colors:data-[state=on]:bg-[Highlight] forced-colors:data-[state=on]:text-[HighlightText]'

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
