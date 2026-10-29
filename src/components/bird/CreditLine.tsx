import { Link } from '@tanstack/react-router'
import { ExternalLink } from '~/components/ui/external-link'
import { textLinkVariants } from '~/components/ui/text-link'
import { COPY } from '~/lib/copy'
import { shortAuthor, shortLicense, sourceLabel } from '~/lib/credits'
import type { Bird, Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/** The card's actions: 32px tall, their hit area extended to 44px. */
const ACTION = cn(
  'text-link',
  textLinkVariants({ layout: 'flex' }),
  'relative min-h-8 after:absolute after:-inset-x-1 after:-inset-y-1.5',
)

export function CreditLine({
  credits,
  slug,
  variant,
  onDetails,
}: {
  credits: Bird['credits']
  slug: string
  variant: 'full' | 'compact'
  /** Full variant: the card keeps its texts short, so it keeps a way to the full ones. */
  onDetails?: () => void
}) {
  if (variant === 'compact') {
    // On the photo (Field, Compact). The labels part the two credits: a separator would dangle
    // at the end of a wrapped line.
    return (
      <p className="credit-line credit-line--compact flex max-w-full min-w-0 flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm leading-[1.5] text-ink">
        <CompactPart label={COPY.creditsPhoto} credit={credits.photo} />
        <CompactPart label={COPY.creditsSong} credit={credits.audio} />
      </p>
    )
  }
  // On the night (Stacked, Split): a line per work, then the actions.
  return (
    <div className="credit-line credit-line--full grid text-sm leading-[1.55] field-or-compact:hidden">
      <FullRow label={COPY.creditsPhoto} credit={credits.photo} />
      <FullRow label={COPY.creditsSong} credit={credits.audio} />
      <p className="credit-line__more mt-2 flex flex-wrap items-center gap-x-6 whitespace-nowrap">
        {onDetails && (
          <button type="button" className={cn(ACTION, 'no-js:hidden')} onClick={onDetails}>
            {COPY.detailsButton}
          </button>
        )}
        <Link
          to="/credits"
          search={{ bird: slug }}
          hash={slug}
          className={cn('credit-line__all', ACTION)}
        >
          {COPY.creditsAll}
        </Link>
      </p>
    </div>
  )
}

/**
 * "Photo  Author (CC BY-SA 4.0)": the author links to the work's page, the licence to its deed.
 * Only the author wraps (a long one, such as "Chris Birmingham / Department of Conservation
 * (NZ)", stays in its column); the licence and its parentheses stay together.
 */
function FullRow({ label, credit }: { label: string; credit: Credit }) {
  return (
    <p className="credit-row grid grid-cols-[3rem_minmax(0,1fr)] gap-x-2">
      <span className="credit-row__label font-medium text-ink-3">{label}</span>
      <span className="credit-row__value min-w-0 text-ink-3">
        <ExternalLink href={credit.source} className="credit-row__author">
          {shortAuthor(credit.author)}
        </ExternalLink>{' '}
        <span className="whitespace-nowrap">
          (<ExternalLink href={credit.licenseUrl}>{credit.license}</ExternalLink>)
        </span>
        <span className="sr-only">, via {sourceLabel(credit.source)}</span>
      </span>
    </p>
  )
}

/**
 * Links on the photo keep the label's halo, but WebKit misplaces (or drops) the underline of
 * text with more than one text-shadow, so these draw theirs as a dotted border instead. The
 * author is a flex item: the negative margin keeps the border from growing its line.
 */
const COMPACT_LINK =
  '-mb-px border-b border-dotted border-current/70 text-ink no-underline hover:border-solid hover:text-ink'

/** Only the author may truncate; the licence sits in its own box so it is never clipped. */
function CompactPart({ label, credit }: { label: string; credit: Credit }) {
  return (
    <span className="credit-compact__part inline-flex max-w-full min-w-0 items-baseline gap-[0.5ch] whitespace-nowrap">
      <span className="credit-compact__label flex-none font-medium text-ink-2">{label}</span>{' '}
      <ExternalLink
        href={credit.source}
        className={cn(
          'credit-compact__author max-w-[22ch] min-w-0 overflow-hidden text-ellipsis',
          COMPACT_LINK,
        )}
      >
        {shortAuthor(credit.author)}
      </ExternalLink>{' '}
      <span className="credit-compact__lic flex-none text-ink-2">
        (
        <ExternalLink href={credit.licenseUrl} className={COMPACT_LINK}>
          {shortLicense(credit.license)}
        </ExternalLink>
        )
      </span>
    </span>
  )
}
