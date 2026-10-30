import { useAwake } from '~/audio/useAudio'
import { Button } from '~/components/ui/button'
import { Kbd } from '~/components/ui/kbd'
import { Toggle } from '~/components/ui/toggle'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'

interface PlateControlsProps {
  held: boolean
  onHeldChange(b: boolean): void
  onScatter(): void
  onPhoto(): void
  onDescribe(): void
}

/**
 * Hold pattern, Take photo and Scatter sand. Before Listen there is nothing to hold, photograph
 * or scatter, so with JS they keep their place in the foot (nothing moves when they come) but stay
 * invisible, out of the tab order, then fade in once and stay.
 */
export function PlateControls({
  held,
  onHeldChange,
  onScatter,
  onPhoto,
  onDescribe,
}: PlateControlsProps) {
  const awake = useAwake()
  return (
    <div
      className={cn(
        'plate-controls relative grid grid-cols-[repeat(3,auto)] items-center justify-center gap-2 no-js:hidden narrow:gap-1.5 foot-row:grid-cols-3',
        // Visibility flips at once and the opacity fades (instant under reduced motion).
        'transition-opacity duration-(--dur-5) ease-out js:not-data-awake:invisible js:not-data-awake:opacity-0',
      )}
      data-awake={awake || undefined}
    >
      <Toggle
        className="btn btn--toggle narrow:px-3 foot-row:justify-between"
        pressed={held}
        onPressedChange={onHeldChange}
        aria-keyshortcuts="h"
      >
        {COPY.hold}
        <Kbd className="hidden foot-row:inline-flex" aria-hidden="true">
          H
        </Kbd>
      </Toggle>
      {/* A camera on phones, where three labelled pills and the status won't share one row. */}
      <Button
        className="btn btn--photo foot-row:justify-between field-or-compact:size-11 field-or-compact:px-0"
        onClick={onPhoto}
        aria-keyshortcuts="p"
      >
        <Icon name="camera" className="hidden field-or-compact:block" />
        <span className="field-or-compact:sr-only">{COPY.takePhoto}</span>
        <Kbd className="hidden foot-row:inline-flex" aria-hidden="true">
          P
        </Kbd>
      </Button>
      <Button
        className="btn narrow:px-3 foot-row:justify-between"
        aria-disabled={held || undefined}
        onClick={held ? undefined : onScatter}
        aria-keyshortcuts="s"
      >
        {COPY.scatter}
        <Kbd className="hidden foot-row:inline-flex" aria-hidden="true">
          S
        </Kbd>
      </Button>
      <Button
        className={cn(
          // Hidden until focused, like a skip link: it only speaks, through the status region.
          'btn describe-btn pointer-events-none absolute end-0 bottom-[calc(100%+8px)] opacity-0 [clip-path:inset(50%)]',
          'focus:pointer-events-auto focus:opacity-100 focus:[clip-path:none]',
        )}
        onClick={onDescribe}
      >
        {COPY.describe}
      </Button>
    </div>
  )
}
