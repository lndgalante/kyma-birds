import { Slider as SliderPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * One-thumb Kyma fader (the volume), behaving like a native range: the signal glows in a sunk
 * track up to the level, and an opaque sand thumb with a dark index line follows the pointer, its
 * centre 7px (half its width) in from each end; a press beside the thumb moves it there. The
 * thumb is the element with role="slider" that gets `aria-label` and `aria-valuetext`. `muted`
 * empties the glow and dims the thumb without moving it.
 *
 * The caller's className sizes the outer span. Radix maps the pointer over the root, so the root
 * is inset 7px; its ::before still takes presses there and 10px above and below (a 44px target),
 * and the track reaches back out to the span's ends. Radix also pulls the thumb inward by up to
 * half its width, which the thumb's translate undoes; hence `value` only, no `defaultValue`.
 */
function Slider({
  className,
  muted,
  value,
  min = 0,
  max = 100,
  step = 1,
  onKeyDown,
  onValueChange,
  onValueCommit,
  'aria-label': ariaLabel,
  'aria-valuetext': ariaValueText,
  ...props
}: Omit<React.ComponentProps<typeof SliderPrimitive.Root>, 'defaultValue' | 'value'> & {
  value: number[]
  muted?: boolean
}) {
  const fraction = (value[0] - min) / (max - min)
  // A native range moves one step on Shift+Arrow; Radix would move ten.
  const onShiftArrow = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    onKeyDown?.(e)
    const direction = ARROW_DIRECTION[e.key]
    if (!e.shiftKey || !direction || e.defaultPrevented || props.disabled) return
    e.preventDefault()
    const next = Math.min(max, Math.max(min, value[0] + direction * step))
    if (next === value[0]) return
    onValueChange?.([next])
    onValueCommit?.([next])
  }
  return (
    <span
      data-slot="slider"
      data-muted={muted || undefined}
      className={cn('group/slider relative block h-6 w-full', className)}
    >
      <SliderPrimitive.Root
        data-slot="slider-root"
        value={value}
        min={min}
        max={max}
        step={step}
        onKeyDown={onShiftArrow}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        className="absolute inset-x-[7px] inset-y-0 flex cursor-pointer touch-none items-center select-none before:absolute before:-inset-x-[7px] before:-inset-y-2.5 forced-colors:forced-color-adjust-none"
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative -mx-[7px] h-1.5 grow overflow-hidden rounded-full bg-ground-sunken shadow-bed forced-colors:bg-[GrayText]"
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="absolute h-full bg-linear-to-r from-signal/25 to-signal group-data-muted/slider:invisible forced-colors:bg-[CanvasText] forced-colors:bg-none"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-label={ariaLabel}
          aria-valuetext={ariaValueText}
          style={{ '--fraction': fraction } as React.CSSProperties}
          className={cn(
            'relative block h-[22px] w-3.5 translate-x-[calc(var(--fraction)*14px-7px)] rounded-part bg-ink-2 transition-[background-color] duration-(--dur-2) ease-out group-data-muted/slider:bg-ink-3',
            'before:absolute before:inset-y-[5px] before:start-1/2 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-ground-sunken',
            'forced-colors:bg-[CanvasText] forced-colors:before:bg-[Canvas]',
          )}
        />
      </SliderPrimitive.Root>
    </span>
  )
}

/** How each arrow key steps a horizontal, left-to-right range. */
const ARROW_DIRECTION: Partial<Record<string, 1 | -1>> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
}

export { Slider }
