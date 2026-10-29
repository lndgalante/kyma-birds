import { ExternalLink } from '~/components/ui/external-link'
import { COPY } from '~/lib/copy'
import { sourceLabel } from '~/lib/credits'
import type { Bird, Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/**
 * One bird on the credits page: its photo, its name, then its two works. On phones the works run
 * full width under the thumbnail and name; from md they sit under the name, side by side from lg.
 * `priority` loads the thumbnail first.
 */
export function CreditEntry({
  bird: b,
  highlighted,
  priority,
}: {
  bird: Bird
  highlighted: boolean
  priority: boolean
}) {
  return (
    <li>
      <article
        id={b.slug}
        className={cn(
          'credit-entry relative grid scroll-mt-20 grid-cols-[96px_minmax(0,1fr)] gap-x-5 gap-y-6 border-b border-line py-6',
          'md:grid-cols-[152px_minmax(0,1fr)] md:gap-x-8 md:gap-y-4 md:py-7',
          // The signal line sits in the gutter, never past it: on phones html clips x overflow.
          'data-highlight:before:absolute data-highlight:before:inset-y-6 data-highlight:before:start-[calc(-1*min(18px,var(--gutter)-6px))] data-highlight:before:w-0.5 data-highlight:before:rounded-full data-highlight:before:bg-signal md:data-highlight:before:inset-y-7',
        )}
        data-highlight={highlighted || undefined}
        aria-labelledby={`credit-${b.slug}`}
      >
        {/* A wrapper draws the hairline ring: an inset shadow on an <img> paints under the image. */}
        <div className="credit-entry__frame relative size-24 self-start overflow-hidden rounded-part bg-ground-sunken after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:inset-ring after:inset-ring-line-photo md:row-span-2 md:size-38">
          <img
            className="credit-entry__thumb block size-full max-w-none object-cover"
            src={b.photo.srcSm}
            width={Math.round(b.photo.width / 2)}
            height={Math.round(b.photo.height / 2)}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : undefined}
            decoding="async"
            style={{
              objectPosition: `${b.photo.focal.x * 100}% ${b.photo.focal.y * 100}%`,
              backgroundColor: b.photo.dominantColor,
            }}
          />
        </div>
        <div className="credit-entry__body min-w-0 self-center md:self-start">
          <h2
            id={`credit-${b.slug}`}
            className="credit-entry__name font-display text-xl leading-[1.15] tracking-title text-ink"
          >
            {b.commonName}
          </h2>
          <p className="credit-entry__sci mt-1 text-md leading-[1.4] text-ink-3">
            <i>{b.scientificName}</i>
          </p>
        </div>
        <div className="credit-entry__works col-span-full grid min-w-0 gap-x-10 gap-y-5 md:col-span-1 md:col-start-2 lg:grid-cols-2">
          <Work label={COPY.creditsPhoto} credit={b.credits.photo} />
          <Work label={COPY.creditsSong} credit={b.credits.audio} />
        </div>
      </article>
    </li>
  )
}

const LINK = 'inline-flex min-h-6 items-center pointer-coarse:min-h-11'
const NOTE = 'work__note text-sm leading-[1.5] text-ink-3'

/** One licensed work: the photo or the song. */
function Work({ label, credit }: { label: string; credit: Credit }) {
  return (
    <div className="work grid min-w-0 content-start border-t border-line pt-3 text-sm leading-[1.5]">
      <p className="work__label font-medium text-ink-3">{label}</p>
      <p className="work__author mt-1 text-md leading-[1.45] text-ink">{credit.author}</p>
      <p className="work__links flex flex-wrap items-center gap-x-5">
        <span className="work__license">
          <ExternalLink href={credit.licenseUrl} className={LINK}>
            {credit.license}
          </ExternalLink>
        </span>
        <span className="work__source">
          <ExternalLink href={credit.source} className={LINK}>
            {sourceLabel(credit.source)}
          </ExternalLink>
        </span>
      </p>
      <p className={cn(NOTE, 'mt-1.5')}>
        <span className="work__title wrap-anywhere">“{credit.title}”</span>
      </p>
      {credit.catalog && (
        <p className={NOTE}>
          <span className="work__catalog">{credit.catalog}</span>
        </p>
      )}
      <p className={NOTE}>Changes: {credit.changes}</p>
    </div>
  )
}
