import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * shadcn/ui Badge with the Kyma chips. `iucn` is the two-part Red List chip: the code on a
 * `--status` fill, then the label (StatusChip.tsx renders the parts). `iucn-step` is one step of
 * the Details meter: a bar, dim unless it is the current step, over its code. Both take their
 * colour from `--status`, which the caller sets with a literal class such as
 * `[--status:var(--iucn-cr)]` (StatusChip.tsx keeps the map).
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-part whitespace-nowrap [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        iucn: 'h-6 items-stretch gap-0 bg-ground/72 align-middle text-shadow-none inset-ring inset-ring-(--status)/45 forced-colors:border forced-colors:border-[CanvasText]',
        'iucn-step':
          'grid w-auto content-start justify-items-stretch gap-1.5 text-center text-xs leading-none font-medium tabular-nums text-ink-3 before:h-2 before:rounded-full before:bg-(--status)/25 data-current:text-ink data-current:before:bg-(--status) forced-colors:before:bg-[GrayText] forced-colors:data-current:before:bg-[CanvasText]',
      },
    },
    defaultVariants: { variant: 'iucn' },
  },
)

function Badge({
  className,
  variant = 'iucn',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span'
  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge }
