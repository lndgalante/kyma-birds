import { useModeKey } from '~/audio/useAudio'
import { useThrottledFeatures } from '~/audio/useLiveFeatures'
import { COPY } from '~/lib/copy'
import { formatMode, splitHz } from '~/lib/format'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'

const VALUE =
  'readout__value text-base leading-none font-book font-stretch-[87.5%] tracking-title group-data-stale/readout:text-ink-3 split:text-3xl'

/**
 * The strongest frequency now, and the plate mode it drives. Updated at 8 Hz, never a live
 * region: values that change this often are read on demand, not announced.
 */
export function SignalReadout() {
  const { dominantHz, stale } = useThrottledFeatures(8)
  const mode = formatMode(useModeKey())
  const hz = dominantHz != null ? splitHz(dominantHz) : null
  return (
    <div
      className="readout group/readout min-w-[7ch] flex-none font-mono tabular-nums transition-[color] duration-(--dur-2) ease-out no-js:hidden split:self-stretch split:pb-1.5 split:text-center"
      data-stale={stale || undefined}
    >
      <p className="readout__hz flex items-baseline gap-1 whitespace-nowrap split:justify-center">
        <span className="sr-only">{COPY.readoutLabelSr}: </span>
        {hz ? (
          <>
            <span className={cn(VALUE, 'text-ink')}>{hz.value}</span>
            <span className="readout__unit text-2xs text-ink-3">{hz.unit}</span>
          </>
        ) : (
          <>
            <span className={cn(VALUE, 'readout__value--empty text-ink-3')} aria-hidden="true">
              —
            </span>
            <span className="sr-only">{COPY.readoutEmptySr}</span>
          </>
        )}
      </p>
      <p className="readout__mode mt-[5px] flex items-center gap-[5px] text-xs leading-none whitespace-nowrap text-signal split:mt-2 split:justify-center split:text-sm">
        <Icon name="arrow-right" size={12} className="readout__arrow text-ink-3" />
        <span className="sr-only">Plate mode </span>
        <span className="readout__mode-value">{mode || '—'}</span>
      </p>
    </div>
  )
}
