import { COPY } from '~/lib/copy'
import { formatBand, formatDuration, formatHzShort } from '~/lib/format'
import type { BandHz } from '~/lib/manifest'
import { cn } from '~/lib/utils'

const ITEM = 'facts__item inline-flex items-baseline gap-[7px]'
const LABEL = 'font-medium tracking-label text-ink-3 uppercase'
const VALUE = 'text-xs text-ink-2 tabular-nums'

export function SongFacts({
  character,
  band,
  peakHz,
  durationSec,
  className,
}: {
  character: string
  band: BandHz
  peakHz: number
  durationSec: number
  className?: string
}) {
  return (
    <dl
      className={cn(
        'facts flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono text-2xs leading-[1.5]',
        className,
      )}
    >
      <div className={cn(ITEM, 'facts__item--character card-w-le-360:hidden')}>
        <dt className={cn('sr-only', LABEL)}>Character</dt>
        <dd className={cn('text-2xs tabular-nums', LABEL)}>{character}</dd>
      </div>
      <div className={ITEM}>
        <dt className={LABEL}>{COPY.factsBand}</dt>
        <dd className={VALUE}>{formatBand(band)}</dd>
      </div>
      <div className={ITEM}>
        <dt className={LABEL}>{COPY.factsPeak}</dt>
        <dd className={VALUE}>{formatHzShort(peakHz)}</dd>
      </div>
      <div className={ITEM}>
        <dt className={LABEL}>{COPY.factsLoop}</dt>
        <dd className={VALUE}>{formatDuration(durationSec)}</dd>
      </div>
    </dl>
  )
}
