import { Button } from '~/components/ui/button'
import { Toggle } from '~/components/ui/toggle'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'

interface PlateControlsProps {
  held: boolean
  onHeldChange(b: boolean): void
  onScatter(): void
  onDescribe(): void
}

export function PlateControls({ held, onHeldChange, onScatter, onDescribe }: PlateControlsProps) {
  return (
    <div
      className={cn(
        'plate-controls relative flex flex-wrap items-center justify-center gap-2 no-js:hidden',
        'foot-row:ms-auto field-or-compact:gap-1.5 split:ms-0',
      )}
    >
      <Toggle className="btn btn--toggle" pressed={held} onPressedChange={onHeldChange}>
        {COPY.hold}
      </Toggle>
      <Button
        className="btn"
        aria-disabled={held || undefined}
        onClick={held ? undefined : onScatter}
      >
        {COPY.scatter}
      </Button>
      <Button
        className={cn(
          // Hidden until focused, like a skip link: it only speaks, through the status region.
          'btn describe-btn pointer-events-none absolute end-0 bottom-[calc(100%+8px)] bg-ground opacity-0 [clip-path:inset(50%)]',
          'focus:pointer-events-auto focus:opacity-100 focus:[clip-path:none]',
        )}
        onClick={onDescribe}
      >
        {COPY.describe}
      </Button>
    </div>
  )
}
