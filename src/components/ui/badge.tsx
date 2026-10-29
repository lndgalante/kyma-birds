import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * shadcn/ui Badge with Kyma's one variant, `iucn-step`: one step of the Details Red List meter, a
 * bar, dim unless it is the current step, over its code. It takes its colour from `--status`,
 * which the caller sets with a literal class such as `[--status:var(--iucn-cr)]` (IucnStatus.tsx
 * keeps the map).
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center overflow-hidden rounded-part whitespace-nowrap [&>svg]:pointer-events-none',
  {
    variants: {
      variant: {
        'iucn-step':
          'grid w-auto content-start justify-items-stretch gap-1.5 text-center text-xs leading-none font-medium tabular-nums text-ink-3 before:h-2 before:rounded-full before:bg-(--status)/25 data-current:text-ink data-current:before:bg-(--status) forced-colors:before:bg-[GrayText] forced-colors:data-current:before:bg-[CanvasText]',
      },
    },
    defaultVariants: { variant: 'iucn-step' },
  },
)

function Badge({
  className,
  variant = 'iucn-step',
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
