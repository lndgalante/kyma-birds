import type { ComponentProps, ReactNode } from 'react'
import { Button } from '~/components/ui/button'
import { Kbd } from '~/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { cn } from '~/lib/utils'
import { Icon, type IconName } from './Icon'

type Props = {
  label: string
  icon: IconName
  pressed?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** A keyboard shortcut: shown as a tooltip with the label, spoken as the button's description. */
  shortcut?: { keys: ReactNode; spoken: string }
} & Omit<ComponentProps<'button'>, 'aria-label' | 'aria-pressed'>

/** A round icon-only button. `aria-disabled` keeps it focusable where a native `disabled` would not. */
export function IconButton({
  label,
  icon,
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
      <Icon name={icon} />
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
