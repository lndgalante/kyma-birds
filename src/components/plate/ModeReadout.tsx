import type { PlateCaption } from './usePlateCaption'

const LABEL = 'mode-readout__label text-ink-3'
/** Instrument Sans 400 inside the 500 label line. */
const VALUE = 'mode-readout__value font-display-normal text-md tabular-nums text-signal'

/**
 * The plate's status in its foot row: the mode the sand shows or holds, in the signal colour the
 * song strip's readout also wears, or the error. Before there is a mode the line stays empty: the
 * Listen gate says the plate is waiting. The figure's own caption is visually hidden and keeps the
 * full status; this line is for the eye.
 */
export function ModeReadout({ caption }: { caption: PlateCaption }) {
  return (
    <p
      className="mode-readout mode-readout--foot flex items-baseline gap-2 text-sm leading-[1.2] font-medium whitespace-nowrap me-auto empty:hidden field-or-compact:me-0"
      aria-hidden="true"
      data-kind={caption.kind}
    >
      {caption.kind === 'live' ? (
        <>
          <span className={LABEL}>Mode</span> <span className={VALUE}>{caption.mode}</span>
        </>
      ) : caption.kind === 'held' && caption.mode ? (
        <>
          <span className={LABEL}>Held</span> <span className={VALUE}>{caption.mode}</span>
        </>
      ) : caption.kind === 'error' ? (
        <span className={LABEL}>{caption.text}</span>
      ) : null}
    </p>
  )
}
