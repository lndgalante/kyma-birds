import { useModeKey } from '~/audio/useAudio'
import { useThrottledFeatures } from '~/audio/useLiveFeatures'
import { COPY } from '~/lib/copy'
import { formatMode, splitHz } from '~/lib/format'
import { Icon } from '../shell/Icon'

/**
 * The strongest frequency now, and the plate mode it drives. Updated at 8 Hz, never a live
 * region: values that change this often are read on demand, not announced.
 */
export function SignalReadout() {
  const { dominantHz, stale } = useThrottledFeatures(8)
  const mode = formatMode(useModeKey())
  const hz = dominantHz != null ? splitHz(dominantHz) : null
  return (
    <div className="readout" data-stale={stale || undefined}>
      <p className="readout__hz">
        <span className="sr-only">{COPY.readoutLabelSr}: </span>
        {hz ? (
          <>
            <span className="readout__value">{hz.value}</span>
            <span className="readout__unit">{hz.unit}</span>
          </>
        ) : (
          <>
            <span className="readout__value readout__value--empty" aria-hidden="true">
              —
            </span>
            <span className="sr-only">{COPY.readoutEmptySr}</span>
          </>
        )}
      </p>
      <p className="readout__mode">
        <Icon name="arrow-right" size={12} className="readout__arrow" />
        <span className="sr-only">Plate mode </span>
        <span className="readout__mode-value">{mode || '—'}</span>
      </p>
    </div>
  )
}
