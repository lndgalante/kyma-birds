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

/**
 * One slide: the photograph, then the bird's label. Stacked and Split set the label on the night,
 * under the photo or, on a wide landscape card, beside it (`card-side`); as the card gets short
 * the label clamps its description, then drops its facts (app.css). Field and Compact set a
 * shorter label on the photo's scrim, with the compact credits and a Details pill; a short
 * phone's photo is a header, so its credits wait in Details.
 */
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
  // From the manifest: a pale photo takes a deeper scrim.
  const style = { '--scrim-a': b.photo.scrim } as CSSProperties
  return (
    <article
      id={`slide-${b.slug}`}
      // On the night the track's padding holds a focus ring at the card's edge, so only a card
      // on the photo clips.
      className="bird-card relative h-full min-h-0 snap-center snap-always overflow-clip @container-size/card data-initial:[scroll-initial-target:nearest] stacked-or-split:overflow-visible contrast-more:[--scrim-a:0.92]"
      role="tabpanel"
      aria-roledescription="slide"
      aria-labelledby={`tab-${b.slug}`}
      aria-describedby={`pos-${b.slug}`}
      inert={inert}
      // Inert already hides the slide; aria-hidden says so again for tools that read only ARIA.
      aria-hidden={inert || undefined}
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
          'card-grid relative grid h-full grid-cols-[100%] grid-rows-[minmax(0,1fr)_auto]',
          'field-or-compact:grid-rows-[minmax(0,1fr)]',
          'stacked-or-split:card-side:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] stacked-or-split:card-side:grid-rows-[minmax(0,1fr)] stacked-or-split:card-side:gap-x-8',
        )}
      >
        <BirdPhoto bird={b} priority={priority} />
        <div
          className={cn(
            'card-label relative z-1 col-start-1 row-start-2 flex min-w-0 flex-col gap-4 pt-5',
            'field-or-compact:row-start-1 field-or-compact:gap-3 field-or-compact:self-end field-or-compact:px-4 field-or-compact:pt-0 field-or-compact:pb-4',
            'field:card-short:gap-2.5 field:card-short:pb-3',
            'stacked-or-split:card-side:col-start-2 stacked-or-split:card-side:row-start-1 stacked-or-split:card-side:pt-1',
          )}
        >
          <FieldLabel bird={b} />
          <p
            className={cn(
              'song-desc line-clamp-3 max-w-[60ch] text-md leading-[1.6] text-ink-2',
              'card-desc-2:line-clamp-2 card-no-desc:hidden field-or-compact:hidden',
            )}
          >
            {b.songDescription}
          </p>
          <div className="card-foot flex min-w-0 flex-wrap items-start gap-x-10 gap-y-4 field-or-compact:hidden">
            <SongFacts
              band={b.audio.bandHz}
              peakHz={b.audio.peakHz}
              durationSec={b.audio.durationSec}
              className="flex-none card-no-facts:hidden"
            />
            <div className="min-w-0 flex-[1_1_15rem]">
              <CreditLine
                credits={b.credits}
                slug={b.slug}
                variant="full"
                onDetails={() => onDetails(b.slug)}
              />
            </div>
          </div>
          {/* The pager floats at the photo's bottom end, beside the Details pill. */}
          <div className="hidden min-w-0 flex-col items-start gap-3 halo-scrim field-or-compact:flex">
            <div className="contents field:card-short:hidden">
              <CreditLine credits={b.credits} slug={b.slug} variant="compact" />
            </div>
            {/* No JS: nothing would open the sheet. */}
            <Button
              variant="scrim"
              size="pill"
              className="details-btn flex-none text-shadow-none no-js:hidden"
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
