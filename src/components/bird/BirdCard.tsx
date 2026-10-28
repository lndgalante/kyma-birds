import { memo, type CSSProperties } from 'react'
import { COPY, slidePosition } from '~/lib/copy'
import { labelSideOf, type Bird } from '~/lib/manifest'
import { BirdPhoto, type PhotoPriority } from './BirdPhoto'
import { CreditLine } from './CreditLine'
import { FieldLabel } from './FieldLabel'
import { SongFacts } from './SongFacts'

interface BirdCardProps {
  bird: Bird
  index: number
  total: number
  inert: boolean
  initial: boolean
  priority: PhotoPriority
  onDetails(slug: string): void
}

export const BirdCard = memo(function BirdCard({
  bird: b,
  index,
  total,
  inert,
  initial,
  priority,
  onDetails,
}: BirdCardProps) {
  const style =
    b.photo.scrim != null ? ({ '--scrim-a': b.photo.scrim } as CSSProperties) : undefined
  return (
    <article
      id={`slide-${b.slug}`}
      className="bird-card"
      role="tabpanel"
      aria-roledescription="slide"
      aria-labelledby={`tab-${b.slug}`}
      aria-describedby={`pos-${b.slug}`}
      inert={inert}
      tabIndex={-1}
      data-initial={initial || undefined}
      data-label-side={labelSideOf(b)}
      style={style}
    >
      <span id={`pos-${b.slug}`} className="sr-only">
        {slidePosition(index + 1, total)}
      </span>
      {/* The article is the size container; container queries can only restyle its children. */}
      <div className="card-grid">
        <BirdPhoto bird={b} priority={priority} />
        <FieldLabel bird={b} />
        <div className="caption">
          <p className="song-desc">{b.songDescription}</p>
          <SongFacts
            character={b.songCharacter}
            band={b.audio.bandHz}
            peakHz={b.audio.peakHz}
            durationSec={b.audio.durationSec}
          />
          <CreditLine
            credits={b.credits}
            slug={b.slug}
            variant="full"
            onDetails={() => onDetails(b.slug)}
          />
          <div className="caption__compact">
            <CreditLine credits={b.credits} slug={b.slug} variant="compact" />
            <button type="button" className="details-btn" onClick={() => onDetails(b.slug)}>
              {COPY.detailsButton}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
})
