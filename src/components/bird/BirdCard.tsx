import { memo, type CSSProperties } from 'react'
import { Button } from '~/components/ui/button'
import { COPY, slidePosition } from '~/lib/copy'
import { labelSideOf, type Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
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
  const side = labelSideOf(b)
  // The label's corner scrim: its side, and the manifest's opacity where a photo needs more.
  const style = {
    '--scrim-a': b.photo.scrim,
    '--scrim-x': side === 'start' ? '0%' : '100%',
  } as CSSProperties
  return (
    <article
      id={`slide-${b.slug}`}
      className="bird-card relative h-full min-h-0 snap-center snap-always overflow-clip @container-size/card data-initial:[scroll-initial-target:nearest] contrast-more:[--scrim-a:0.9]"
      role="tabpanel"
      aria-roledescription="slide"
      aria-labelledby={`tab-${b.slug}`}
      aria-describedby={`pos-${b.slug}`}
      inert={inert}
      tabIndex={-1}
      data-initial={initial || undefined}
      data-label-side={side}
      style={style}
    >
      <span id={`pos-${b.slug}`} className="sr-only">
        {slidePosition(index + 1, total)}
      </span>
      {/* The article is the size container; container queries can only restyle its children. */}
      <div
        className={cn(
          'card-grid relative grid h-full grid-cols-[100%] grid-rows-[minmax(0,1fr)]',
          'after:pointer-events-none after:relative after:z-0 after:col-start-1 after:row-start-1 after:scrim-label',
          'card-captioned:grid-rows-[minmax(55%,1fr)_auto] card-captioned:bg-ground-raised',
        )}
      >
        <BirdPhoto bird={b} priority={priority} />
        <FieldLabel bird={b} />
        {/* Overlay mode: the caption sits where the bottom scrim is still thin, so it gets the
            label's halo too. Captioned mode drops it. */}
        <div
          className={cn(
            'caption relative z-1 col-start-1 row-start-1 grid gap-2.5 self-end px-6 py-5 halo-scrim',
            'field:px-4 field:pb-[calc(var(--strip-h)+14px)] field-or-compact:gap-2 compact:px-4',
            'card-captioned:row-start-2 card-captioned:gap-3 card-captioned:self-start card-captioned:border-t card-captioned:border-line card-captioned:pt-4 card-captioned:pb-[18px] card-captioned:text-shadow-none',
            // Container variants follow the media ones, so a captioned card on a tall phone needs
            // its own rule to keep the Field gap.
            'field-or-compact:card-captioned:gap-2',
          )}
        >
          <p className="song-desc line-clamp-2 max-w-[52ch] text-base leading-[1.5] text-pretty text-ink-2 card-h-lt-420:hidden card-captioned-tall:[-webkit-line-clamp:3] field:hidden compact:hidden">
            {b.songDescription}
          </p>
          <SongFacts
            character={b.songCharacter}
            band={b.audio.bandHz}
            peakHz={b.audio.peakHz}
            durationSec={b.audio.durationSec}
            className="field:hidden card-h-le-360:hidden"
          />
          <CreditLine
            credits={b.credits}
            slug={b.slug}
            variant="full"
            onDetails={() => onDetails(b.slug)}
          />
          {/* Wide cards with the pager below them (Stacked, Split) put Details at the end of the
              credits' row. In Field and Compact landscape the pager floats over the photo's bottom
              end, where Details would sit, so they keep the stacked form. */}
          <div className="caption__compact flex min-w-0 flex-col items-start gap-2 card-captioned:hidden stacked-or-split:card-w-gt-520:flex-row stacked-or-split:card-w-gt-520:items-end stacked-or-split:card-w-gt-520:gap-3">
            <CreditLine credits={b.credits} slug={b.slug} variant="compact" />
            {/* No JS: nothing would open the sheet. */}
            <Button
              variant="scrim"
              size="pill"
              className="details-btn flex-none no-js:hidden stacked-or-split:card-w-gt-520:min-h-8"
              onClick={() => onDetails(b.slug)}
            >
              {COPY.detailsButton}
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
})
