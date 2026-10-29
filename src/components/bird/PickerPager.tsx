import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { ArrowKey } from '../shell/Icon'
import { IconButton } from '../shell/IconButton'

interface PickerPagerProps {
  index: number
  total: number
  onPrev(): void
  onNext(): void
  className?: string
}

/**
 * Where the rail is hidden (Field, Compact): the arrows and the position ("7 / 12") in one pill,
 * as tall as its round buttons so their hover fills sit concentric in its ends. Elsewhere the
 * arrows stand at the rail's ends.
 */
export function PickerPager({ index, total, onPrev, onNext, className }: PickerPagerProps) {
  return (
    <div
      className={cn(
        'pager flex flex-none items-center rounded-full bg-scrim/72 inset-ring inset-ring-ink/16 no-js:hidden',
        className,
      )}
    >
      <PagerButton
        dir="prev"
        index={index}
        total={total}
        onClick={onPrev}
        className={PILL_BUTTON}
      />
      <p
        className="counter min-w-[3.75rem] text-center font-display text-[0.9375rem] leading-none whitespace-nowrap tabular-nums"
        aria-hidden="true"
      >
        <span className="counter__now text-ink">{index + 1}</span>
        <span className="counter__total text-ink-3"> / {total}</span>
      </p>
      <PagerButton
        dir="next"
        index={index}
        total={total}
        onClick={onNext}
        className={PILL_BUTTON}
      />
    </div>
  )
}

/** The pill's arrows take full ink on its scrim. */
const PILL_BUTTON = 'text-ink aria-disabled:text-ink-4'

interface PagerButtonProps {
  dir: 'prev' | 'next'
  index: number
  total: number
  onClick(): void
  className?: string
}

/**
 * Previous or next bird. It stays focusable at the ends (`aria-disabled`), so focus never drops
 * to <body>; its tooltip shows the arrow key. Hidden without JS, which has no track to move.
 */
export function PagerButton({ dir, index, total, onClick, className }: PagerButtonProps) {
  const prev = dir === 'prev'
  const side = prev ? 'left' : 'right'
  return (
    <IconButton
      label={prev ? COPY.pagerPrev : COPY.pagerNext}
      icon={prev ? 'chevron-left' : 'chevron-right'}
      shortcut={{
        keys: <ArrowKey side={side} size={11} />,
        spoken: prev ? 'Left arrow' : 'Right arrow',
      }}
      aria-controls="bird-track"
      aria-disabled={(prev ? index <= 0 : index >= total - 1) || undefined}
      onClick={onClick}
      className={cn('pager__btn no-js:hidden', className)}
    />
  )
}
