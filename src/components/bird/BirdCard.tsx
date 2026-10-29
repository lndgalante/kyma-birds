import { memo, type CSSProperties } from 'react'
import { Button } from '~/components/ui/button'
import { COPY, slidePosition } from '~/lib/copy'
import { labelSideOf, type Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { BirdPhoto, type PhotoPriority } from './BirdPhoto'
import { CreditLine } from './CreditLine'
import { FieldLabel } from './FieldLabel'

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
 * under the photo or, on a wide landscape card, beside it (`card-side`): the names, the song's
 * description (clamped as the card gets short, app.css), one quiet credit line and the way to
 * Details. Field and Compact set only the names and a Details pill on the photo, over a scrim
 * that rises just past them; the figures, the status and the credits wait in Details.
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
  // From the manifest: a pale photo takes a deeper scrim. Set as its own property, so the class
  // below can still raise it for more contrast (an inline --scrim-a would win over any class).
  const style = { '--scrim-bird': b.photo.scrim } as CSSProperties
  return (
    <article
      id={`slide-${b.slug}`}
      // On the night the track's padding holds a focus ring at the card's edge, so only a card
      // on the photo clips.
      className="bird-card relative h-full min-h-0 snap-center snap-always overflow-clip @container-size/card data-initial:[scroll-initial-target:nearest] stacked-or-split:overflow-visible [--scrim-a:var(--scrim-bird,0.6)] contrast-more:[--scrim-a:0.92]"
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
            // On the photo: the name across the card's whole width (so only a name too long for
            // it wraps), then the scientific name with the Details pill at its end. Under them a
            // scrim in the bird's own dark (app.css scrim-label) that eases out over --ramp above
            // the name, so it stays in the photo's bottom third.
            'field-or-compact:row-start-1 field-or-compact:grid field-or-compact:grid-cols-[minmax(0,1fr)_auto] field-or-compact:items-center field-or-compact:gap-x-3 field-or-compact:gap-y-2 field-or-compact:self-end field-or-compact:px-4 field-or-compact:pt-0 field-or-compact:pb-4 field:card-short:pb-3',
            '[--ramp:2rem] field-or-compact:card-short:[--ramp:1rem]',
            'field-or-compact:before:absolute field-or-compact:before:inset-x-0 field-or-compact:before:-top-(--ramp) field-or-compact:before:bottom-0 field-or-compact:before:-z-1 field-or-compact:before:scrim-label',
            'stacked-or-split:card-side:col-start-2 stacked-or-split:card-side:row-start-1 stacked-or-split:card-side:pt-1',
          )}
        >
          <FieldLabel bird={b} />
          <p
            className={cn(
              'song-desc line-clamp-3 max-w-[60ch] text-md leading-[1.6] text-ink-2',
              'card-desc-4:line-clamp-4 card-desc-2:line-clamp-2 card-no-desc:hidden field-or-compact:hidden',
            )}
          >
            {b.songDescription}
          </p>
          <div className="card-foot min-w-0 field-or-compact:hidden">
            <CreditLine credits={b.credits} onDetails={() => onDetails(b.slug)} />
          </div>
          {/* No JS: nothing would open the sheet. On the photo a negative margin takes back the
              pill's overhang, so its row stays a line of text tall. */}
          <Button
            variant="scrim"
            size="pill"
            className="details-btn hidden flex-none text-shadow-none js:field-or-compact:inline-flex field-or-compact:-my-1.5"
            onClick={() => onDetails(b.slug)}
          >
            {COPY.detailsButton}
          </Button>
        </div>
      </div>
    </article>
  )
})
