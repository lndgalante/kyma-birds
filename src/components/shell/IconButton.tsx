import type { ComponentProps, ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import { Kbd } from '~/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { Icon, type IconName } from './Icon'

type Props = {
  label: string
  pressed?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** A keyboard shortcut: shown as a tooltip with the label, spoken as the button's description. */
  shortcut?: { keys: ReactNode; spoken: string }
} & (
  | { icon: IconName; icons?: never }
  /** A toggle's two glyphs, cross-faded: the first while unpressed, the second while pressed. */
  | { icon?: never; icons: [IconName, IconName] }
) &
  Omit<ComponentProps<'button'>, 'aria-label' | 'aria-pressed'>

/** A round icon-only button. `aria-disabled` keeps it focusable where a native `disabled` would not. */
export function IconButton({
  label,
  icon,
  icons,
  pressed,
  size = 'md',
  shortcut,
  className,
  onClick,
  ...rest
}: Props) {
  const disabled = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'
  const button = (
    <Button
      variant="ghost"
      size="icon"
      className={cn('icon-btn', `icon-btn--${size}`, className)}
      aria-label={label}
      aria-pressed={pressed}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {icons ? (
        <IconSwap names={icons} active={icons[pressed ? 1 : 0]} className="size-5" />
      ) : (
        icon && <Icon name={icon} />
      )}
    </Button>
  )
  if (!shortcut) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent aria-label={`Shortcut: ${shortcut.spoken}`}>
        {label}
        <Kbd>{shortcut.keys}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Glyphs stacked in one box with only `active` showing. A change cross-fades them (scale, opacity,
 * a little blur); reduced motion swaps them at once (base.css). The caller's className sizes the
 * box.
 */
export function IconSwap({
  names,
  active,
  size,
  className,
}: {
  names: readonly IconName[]
  active: IconName
  size?: number
  className?: string
}) {
  return (
    <span className={cn('icon-swap relative', className)}>
      {names.map((name) => (
        <Icon
          key={name}
          name={name}
          size={size}
          className={cn(
            'absolute inset-0 size-full transition-[opacity,filter,scale] duration-(--dur-3) ease-[cubic-bezier(0.2,0,0,1)]',
            name === active ? 'scale-100 opacity-100 blur-[0px]' : 'scale-25 opacity-0 blur-[4px]',
          )}
        />
      ))}
    </span>
  )
}
