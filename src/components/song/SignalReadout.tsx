import { useModeKey } from '~/audio/useAudio'
import { useThrottledFeatures } from '~/audio/useLiveFeatures'
import { COPY } from '~/lib/copy'
import { NBSP, formatHzShort, formatMode, splitHz } from '~/lib/format'
import { cn } from '~/lib/utils'
import { FlowLine } from './FlowLine'

const VALUE = 'readout__value font-display text-lg leading-none tabular-nums'
const UNIT = 'readout__unit text-xs text-ink-3'

/**
 * The strongest frequency now and the plate mode it drives, joined by a wire toward the plate.
 * Updated at 8 Hz, never a live region: values that change this often are read on demand, not
 * announced. Before any sound it shows the bird's peak, dimmed, as the spectrum's bracket shows
 * its band, and no mode. It hides while the song zone shows its error.
 */
export function SignalReadout({ peakHz }: { peakHz: number }) {
  const { dominantHz, stale } = useThrottledFeatures(8)
  const mode = formatMode(useModeKey())
  const hz = dominantHz != null ? splitHz(dominantHz) : null
  // The peak as the card's facts print it ("2.2 kHz"), not to two places like the live reading.
  const [restValue, restUnit] = formatHzShort(peakHz).split(NBSP)
  return (
    <div
      className="readout group/readout w-[5.5rem] flex-none transition-[color] duration-(--dur-2) ease-out group-data-[state=error]/song:hidden no-js:hidden stacked:w-24"
      data-stale={stale || undefined}
    >
      <p className="readout__hz flex h-5 items-baseline gap-1 whitespace-nowrap">
        <span className="sr-only">{COPY.readoutLabelSr}: </span>
        {hz ? (
          <>
            <span className={cn(VALUE, 'text-ink group-data-stale/readout:text-ink-3')}>
              {hz.value}
            </span>
            <span className={UNIT}>{hz.unit}</span>
          </>
        ) : (
          <>
            <span className="sr-only">{COPY.readoutEmptySr}</span>
            <span className="readout__rest contents" aria-hidden="true">
              <span className={cn(VALUE, 'text-ink-3')}>{restValue}</span>
              <span className={UNIT}>{restUnit}</span>
            </span>
          </>
        )}
      </p>
      <p className="readout__mode mt-1.5 flex h-5 items-center gap-2 whitespace-nowrap">
        <FlowLine />
        {mode && (
          <span className="readout__mode-value font-display text-sm leading-none tabular-nums text-signal">
            <span className="sr-only">Plate mode </span>
            {mode}
          </span>
        )}
      </p>
    </div>
  )
}
