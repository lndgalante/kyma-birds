import { COPY } from '~/lib/copy'

interface PlateControlsProps {
  held: boolean
  onHeldChange(b: boolean): void
  onScatter(): void
  onDescribe(): void
}

export function PlateControls({ held, onHeldChange, onScatter, onDescribe }: PlateControlsProps) {
  return (
    <div className="plate-controls">
      <button
        type="button"
        className="btn btn--toggle"
        aria-pressed={held}
        onClick={() => onHeldChange(!held)}
      >
        {COPY.hold}
      </button>
      <button
        type="button"
        className="btn"
        aria-disabled={held || undefined}
        onClick={held ? undefined : onScatter}
      >
        {COPY.scatter}
      </button>
      <button type="button" className="btn describe-btn" onClick={onDescribe}>
        {COPY.describe}
      </button>
    </div>
  )
}
