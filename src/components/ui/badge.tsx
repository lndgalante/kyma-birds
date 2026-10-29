import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * shadcn/ui Badge with the Kyma chips. `iucn` is the two-part Red List chip and `iucn-step` a
 * step of the Details scale; both take their colour from `--status`, which the caller sets
 * with a literal class such as `[--status:var(--iucn-cr)]` (StatusChip.tsx keeps the map).
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-sm whitespace-nowrap [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        iucn: 'h-6 items-stretch gap-0 bg-ground/72 align-middle text-shadow-none inset-ring inset-ring-(--status)/55 forced-colors:border forced-colors:border-[CanvasText]',
        'iucn-step':
          'grid h-[26px] w-auto place-items-center font-mono text-2xs leading-none font-semibold tracking-chip text-ink-3 inset-ring inset-ring-line-2 data-current:bg-(--status) data-current:text-on-status data-current:inset-ring-0',
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
