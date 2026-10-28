import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

type Props = {
  label: string
  icon: IconName
  pressed?: boolean
  size?: 'sm' | 'md' | 'lg'
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed'>

/** A square icon-only button. `aria-disabled` keeps it focusable where a native `disabled` would not. */
export function IconButton({
  label,
  icon,
  pressed,
  size = 'md',
  className,
  onClick,
  ...rest
}: Props) {
  const disabled = rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${size}${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={pressed}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}
