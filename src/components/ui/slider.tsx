import { Slider as SliderPrimitive } from 'radix-ui'
import type * as React from 'react'
import { cn } from '~/lib/utils'

/**
 * One-thumb Kyma slider (the volume), behaving like a native range: 2px --line-2 track, ink fill,
 * and a 12px ink dot whose centre travels 6px in from each end and follows the pointer; a press
 * beside the dot moves it there. The thumb, the element with role="slider" that gets `aria-label`
 * and `aria-valuetext`, is a 24px target that paints the dot, but only the dot grabs. `muted`
 * empties the fill and dims the dot without moving it.
 *
 * The caller's className sizes the outer span. Radix maps the pointer over the root, so the root
 * is inset 6px; its ::before still takes presses there and the track reaches back out to the
 * span's ends. Radix also pulls the thumb inward by up to half its width, which the thumb's
 * translate undoes; hence `value` only, no `defaultValue`.
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
        className="absolute inset-x-1.5 inset-y-0 flex cursor-pointer touch-none items-center select-none before:absolute before:inset-y-0 before:-inset-x-1.5 forced-colors:forced-color-adjust-none"
        {...props}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative -mx-1.5 h-0.5 grow overflow-hidden rounded-[2px] bg-line-2 forced-colors:bg-[GrayText]"
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className="absolute h-full bg-ink group-data-muted/slider:bg-transparent forced-colors:bg-[CanvasText]"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-label={ariaLabel}
          aria-valuetext={ariaValueText}
          style={{ '--fraction': fraction } as React.CSSProperties}
          className="pointer-events-none relative block size-6 translate-x-[calc(var(--fraction)*24px-12px)] rounded-full before:pointer-events-auto before:absolute before:inset-1.5 before:rounded-full before:bg-ink group-data-muted/slider:before:bg-ink-3 forced-colors:before:bg-[CanvasText]"
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
