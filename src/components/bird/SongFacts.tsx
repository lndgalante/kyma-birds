import { COPY } from '~/lib/copy'
import { formatBand, formatDuration, formatHzShort } from '~/lib/format'
import type { BandHz } from '~/lib/manifest'

export function SongFacts({
  character,
  band,
  peakHz,
  durationSec,
}: {
  character: string
  band: BandHz
  peakHz: number
  durationSec: number
}) {
  return (
    <dl className="facts">
      <div className="facts__item facts__item--character">
        <dt className="sr-only">Character</dt>
        <dd>{character}</dd>
      </div>
      <div className="facts__item">
        <dt>{COPY.factsBand}</dt>
        <dd>{formatBand(band)}</dd>
      </div>
      <div className="facts__item">
        <dt>{COPY.factsPeak}</dt>
        <dd>{formatHzShort(peakHz)}</dd>
      </div>
      <div className="facts__item">
        <dt>{COPY.factsLoop}</dt>
        <dd>{formatDuration(durationSec)}</dd>
      </div>
    </dl>
  )
}
