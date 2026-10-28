import { useModeKey } from '~/audio/useAudio'
import { formatMode } from '~/lib/format'
import type { PlateCaption } from './usePlateCaption'

/**
 * Head: "Mode (3, 2)" in the accent, the reading the spine points at, repeated at the plate.
 * Foot (non-Split layouts, where the figure's own caption is hidden): the plate's status line.
 */
export function ModeReadout({
  placement,
  caption,
}: {
  placement: 'head' | 'foot'
  caption?: PlateCaption
}) {
  const mode = formatMode(useModeKey())
  if (placement === 'foot' && caption) {
    return (
      <p className="mode-readout mode-readout--foot" aria-hidden="true" data-kind={caption.kind}>
        {caption.kind === 'live' ? (
          <>
            <span className="mode-readout__label">Mode</span>{' '}
            <span className="mode-readout__value">{caption.mode}</span>
          </>
        ) : caption.kind === 'held' && caption.mode ? (
          <>
            <span className="mode-readout__label">Held · mode</span>{' '}
            <span className="mode-readout__value">{caption.mode}</span>
          </>
        ) : (
          <span className="mode-readout__label">{caption.text}</span>
        )}
      </p>
    )
  }
  return (
    <p className={`mode-readout mode-readout--${placement}`} aria-hidden="true">
      <span className="mode-readout__label">Mode</span>{' '}
      <span className="mode-readout__value">{mode || '—'}</span>
    </p>
  )
}
