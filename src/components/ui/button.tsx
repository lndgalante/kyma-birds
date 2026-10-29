import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'
import { PART, PART_LIFT } from './surface'

/**
 * shadcn/ui Button (new-york-v4) with Kyma's variants. No variant draws a focus ring: the global
 * :focus-visible rule in app.css does, on every control alike. Disabled-looking buttons use
 * `aria-disabled` (they stay focusable); callers drop onClick. A press scales a button to 96%
 * (the masthead's text links excepted); reduced motion makes it instant.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 text-sm leading-none font-medium whitespace-nowrap select-none transition-[color,background-color,box-shadow,filter,scale] duration-(--dur-1) ease-out aria-disabled:cursor-default [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The quiet pill (Hold, Take photo, Scatter sand, Close, Try again, the pages' way back).
        // Disabled, it loses its fill and its ring dims. Pressed (Hold, a Toggle), it sinks to the
        // room's sunken step, its label lights in the signal and a 2px ring closes round it, so
        // the state shows by more than colour.
        outline: [
          PART,
          PART_LIFT,
          'rounded-full active:not-aria-disabled:scale-96',
          'aria-disabled:bg-transparent aria-disabled:text-ink-4 aria-disabled:inset-ring-line',
          'aria-pressed:bg-ground-sunken aria-pressed:text-signal aria-pressed:inset-ring-2 aria-pressed:inset-ring-signal/55',
        ],
        // A round icon-only button (pager, mute, dialog close).
        ghost:
          'rounded-full text-ink-2 hover:bg-line hover:text-ink active:not-aria-disabled:scale-96 aria-pressed:text-ink aria-disabled:bg-transparent aria-disabled:text-ink-4 forced-colors:border forced-colors:border-[ButtonText]',
        // The masthead's About and Credits: no fill, the text lights.
        nav: 'rounded-full px-3 text-[0.9375rem] text-ink-3 hover:text-ink aria-[current=page]:text-ink',
        // A hairline pill (now playing).
        pill: 'rounded-full text-ink inset-ring inset-ring-line-2 hover:bg-line active:not-aria-disabled:scale-96',
        // A pill on the photo's scrim (Details), its hit area extended 6px all round: 44px
        // round a 32px pill.
        scrim:
          'rounded-full bg-scrim/55 text-ink inset-ring inset-ring-ink/16 hover:bg-scrim/85 active:scale-96 after:absolute after:-inset-1.5 forced-colors:border forced-colors:border-[ButtonText]',
      },
      size: {
        default: 'min-h-10 px-4 pointer-coarse:min-h-11',
        sm: 'min-h-8 px-3 pointer-coarse:min-h-11',
        icon: 'size-10 pointer-coarse:size-11',
        nav: 'min-h-10 pointer-coarse:min-h-11',
        pill: 'min-h-8 px-3',
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
