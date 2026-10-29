import { COPY } from '~/lib/copy'
import { pad2 } from '~/lib/format'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'
import { IconButton } from '../shell/IconButton'

interface PickerPagerProps {
  index: number
  total: number
  onPrev(): void
  onNext(): void
}

const BUTTON =
  'pager__btn field-or-compact:rounded-full field-or-compact:text-ink field-or-compact:aria-disabled:text-ink-4'

/** Prev/next stay focusable at the ends (`aria-disabled`), so focus never drops to <body>. */
export function PickerPager({ index, total, onPrev, onNext }: PickerPagerProps) {
  const atStart = index <= 0
  const atEnd = index >= total - 1
  return (
    <div
      className={cn(
        'pager ms-auto flex flex-none items-center gap-0.5 no-js:hidden',
        'field-or-compact:gap-0 field-or-compact:rounded-full field-or-compact:bg-scrim/72 field-or-compact:p-0.5 field-or-compact:inset-ring field-or-compact:inset-ring-line',
      )}
    >
      <IconButton
        label={COPY.pagerPrev}
        icon="chevron-left"
        shortcut={{
          keys: <Icon name="arrow-left" size={11} role="img" aria-label="Left arrow" />,
          spoken: 'Left arrow',
        }}
        aria-controls="bird-track"
        aria-disabled={atStart || undefined}
        onClick={onPrev}
        className={BUTTON}
      />
      <p
        className="counter min-w-[7.2ch] text-center font-mono text-xs leading-none whitespace-nowrap tabular-nums field-or-compact:min-w-[6.4ch]"
        aria-hidden="true"
      >
        <span className="counter__now text-ink">{pad2(index + 1)}</span>
        <span className="counter__total text-ink-3"> / {pad2(total)}</span>
      </p>
      <IconButton
        label={COPY.pagerNext}
        icon="chevron-right"
        shortcut={{
          keys: <Icon name="arrow-right" size={11} role="img" aria-label="Right arrow" />,
          spoken: 'Right arrow',
        }}
        aria-controls="bird-track"
        aria-disabled={atEnd || undefined}
        onClick={onNext}
        className={BUTTON}
      />
    </div>
  )
}
