import { COPY } from '~/lib/copy'
import { NBSP, formatBand, formatDuration, formatHzShort } from '~/lib/format'
import type { BandHz } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/** Three figures on hairlines: the first sits flush, each later one after a rule. */
const ITEM =
  'facts__item grid min-w-0 content-start gap-0.5 border-s border-line ps-4 pe-4 first:border-s-0 first:ps-0 last:pe-0'
/** A figure's label; Details sets the song's character with it too. */
export const FACT_LABEL = 'text-xs leading-[1.4] font-medium text-ink-3'
const VALUE =
  'font-display text-lg leading-[1.2] tracking-title whitespace-nowrap tabular-nums text-ink'
const UNIT = 'text-sm text-ink-3'

/** The song's band, peak and loop as labelled figures, the unit a step down. */
export function SongFacts({
  band,
  peakHz,
  durationSec,
  className,
}: {
  band: BandHz
  peakHz: number
  durationSec: number
  className?: string
}) {
  return (
    <dl className={cn('facts flex flex-wrap items-start gap-y-3', className)}>
      <div className={ITEM}>
        <dt className={FACT_LABEL}>{COPY.factsBand}</dt>
        <dd className={VALUE}>
          <Figure text={formatBand(band)} />
        </dd>
      </div>
      <div className={ITEM}>
        <dt className={FACT_LABEL}>{COPY.factsPeak}</dt>
        <dd className={VALUE}>
          <Figure text={formatHzShort(peakHz)} />
        </dd>
      </div>
      <div className={ITEM}>
        <dt className={FACT_LABEL}>{COPY.factsLoop}</dt>
        <dd className={VALUE}>{formatDuration(durationSec)}</dd>
      </div>
    </dl>
  )
}

/**
 * "1.1–2.4 kHz" as the figure and a smaller unit. A mixed band ("944 Hz–2.6 kHz") keeps its
 * inner unit at the figure's size and only the last one steps down.
 */
function Figure({ text }: { text: string }) {
  const cut = text.lastIndexOf(NBSP)
  if (cut < 0) return text
  return (
    <>
      {text.slice(0, cut)}
      <span className={UNIT}>
        {NBSP}
        {text.slice(cut + 1)}
      </span>
    </>
  )
}
