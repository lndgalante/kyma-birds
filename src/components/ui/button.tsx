import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'
import { LIT, METAL, METAL_LIFT } from './surface'

/**
 * shadcn/ui Button (new-york-v4) with Kyma's variants. No variant draws a focus ring: the global
 * :focus-visible rule in app.css does, on every control alike. Disabled-looking buttons use
 * `aria-disabled` (they stay focusable); callers drop onClick. The transition eases the metal
 * gradient's stops too, so a hover lifts rather than flips.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center gap-2 text-sm leading-none font-medium whitespace-nowrap select-none transition-[color,background-color,border-color,box-shadow,filter,translate,scale,--tw-gradient-from,--tw-gradient-to] duration-(--dur-1) ease-out aria-disabled:cursor-default [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // The metal pill (Hold, Scatter sand, Close, Try again, the pages' way back). Flat when
        // disabled; pressed (Hold, a Toggle), it sinks into a bed and lights in the signal.
        outline: [
          METAL,
          METAL_LIFT,
          'rounded-full active:not-aria-disabled:translate-y-px',
          'aria-disabled:border-line aria-disabled:bg-none aria-disabled:text-ink-4 aria-disabled:shadow-none',
          'aria-pressed:border-line aria-pressed:bg-none aria-pressed:bg-ground-sunken aria-pressed:text-signal aria-pressed:shadow-bed',
          'forced-colors:border-[ButtonText]',
        ],
        // A round icon-only button (pager, mute, dialog close).
        ghost:
          'rounded-full text-ink-2 hover:bg-line hover:text-ink active:not-aria-disabled:scale-96 aria-pressed:text-ink aria-disabled:bg-transparent aria-disabled:text-ink-4 forced-colors:border forced-colors:border-[ButtonText]',
        // The masthead's About and Credits: no fill, the text lights.
        nav: 'rounded-full px-3 text-[0.9375rem] text-ink-3 hover:text-ink aria-[current=page]:text-ink',
        // A hairline pill (now playing).
        pill: 'rounded-full text-ink inset-ring inset-ring-line-2 hover:bg-line',
        // A pill on the photo's scrim (Details), its hit area extended 6px all round.
        scrim:
          'rounded-full bg-scrim/55 text-ink inset-ring inset-ring-ink/16 hover:bg-scrim/85 active:scale-96 after:absolute after:-inset-1.5 forced-colors:border forced-colors:border-[ButtonText]',
        // The Listen disc's LIT recipe as a button; nothing else is lit.
        lit: [
          LIT,
          'rounded-full hover:brightness-105 active:not-aria-disabled:translate-y-px forced-colors:border forced-colors:border-[ButtonText]',
        ],
      },
      size: {
        default: 'min-h-10 px-4 pointer-coarse:min-h-11',
        sm: 'min-h-8 px-3 pointer-coarse:min-h-11',
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
