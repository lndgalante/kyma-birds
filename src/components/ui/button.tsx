import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * shadcn/ui Button (new-york-v4) with Kyma variants. No variant draws a focus ring: the global
 * :focus-visible rule in app.css does (2px ink outline + dark halo), on every control alike.
 * Disabled-looking buttons use `aria-disabled` (they stay focusable); callers drop onClick.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none transition-[color,background-color,box-shadow,scale] duration-(--dur-1) ease-out aria-disabled:cursor-default [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // hairline text button (Hold, Scatter, Close, Try again)
        outline:
          'rounded-md text-md leading-none font-ui tracking-ui text-ink inset-ring inset-ring-line-2 hover:bg-line active:not-aria-disabled:scale-96 aria-disabled:bg-transparent aria-disabled:text-ink-4 aria-disabled:inset-ring-line forced-colors:border forced-colors:border-[ButtonText]',
        // square icon-only button (pager, mute, dialog close)
        ghost:
          'rounded-md text-ink-2 hover:bg-line hover:text-ink active:not-aria-disabled:scale-96 aria-pressed:text-ink aria-disabled:bg-transparent aria-disabled:text-ink-4 forced-colors:border forced-colors:border-[ButtonText]',
        // the masthead's About and Credits
        nav: 'rounded-md px-2.5 text-md leading-none font-ui tracking-ui text-ink-2 hover:bg-line hover:text-ink aria-[current=page]:text-ink',
        // hairline pill (now playing)
        pill: 'rounded-full text-sm font-ui text-ink inset-ring inset-ring-line hover:bg-line',
        // pill on the photo scrim (Details), hit area extended 6px all round
        scrim:
          'rounded-full text-sm font-ui tracking-ui text-ink bg-scrim/55 inset-ring inset-ring-line-2 hover:bg-scrim/85 active:scale-96 after:absolute after:-inset-1.5 forced-colors:border forced-colors:border-[ButtonText]',
      },
      size: {
        default: 'min-h-10 px-3.5 pointer-coarse:min-h-11',
        sm: 'min-h-8 px-2.5 text-sm pointer-coarse:min-h-11',
        icon: 'size-10 pointer-coarse:size-11',
        nav: 'min-h-10 pointer-coarse:min-h-11',
        pill: 'min-h-9 px-3',
        bare: '',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
)

function Button({
  className,
  variant = 'outline',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: 'button' as const })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
