import { COPY } from '~/lib/copy'
import { pad2 } from '~/lib/format'
import { IconButton } from '../shell/IconButton'

interface PickerPagerProps {
  index: number
  total: number
  onPrev(): void
  onNext(): void
}

/** Prev/next stay focusable at the ends (`aria-disabled`), so focus never drops to <body>. */
export function PickerPager({ index, total, onPrev, onNext }: PickerPagerProps) {
  const atStart = index <= 0
  const atEnd = index >= total - 1
  return (
    <div className="pager">
      <IconButton
        label={COPY.pagerPrev}
        icon="chevron-left"
        aria-controls="bird-track"
        aria-disabled={atStart || undefined}
        onClick={onPrev}
        className="pager__btn"
      />
      <p className="counter" aria-hidden="true">
        <span className="counter__now">{pad2(index + 1)}</span>
        <span className="counter__total"> / {pad2(total)}</span>
      </p>
      <IconButton
        label={COPY.pagerNext}
        icon="chevron-right"
        aria-controls="bird-track"
        aria-disabled={atEnd || undefined}
        onClick={onNext}
        className="pager__btn"
      />
    </div>
  )
}
