import { Link } from '@tanstack/react-router'
import { ExternalLink } from '~/components/ui/external-link'
import { textLinkVariants } from '~/components/ui/text-link'
import { COPY } from '~/lib/copy'
import { shortAuthor, shortLicense, sourceLabel } from '~/lib/credits'
import type { Bird, Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'

const TEXT_LINK = cn('text-link', textLinkVariants({ layout: 'flex' }))

export function CreditLine({
  credits,
  slug,
  variant,
  onDetails,
}: {
  credits: Bird['credits']
  slug: string
  variant: 'full' | 'compact'
  /** Full variant: the captioned card clamps its texts, so it keeps a way to the full ones. */
  onDetails?: () => void
}) {
  if (variant === 'compact') {
    // The labels separate the credits; a "·" would dangle at the end of a wrapped line.
    return (
      <p className="credit-line credit-line--compact flex max-w-full min-w-0 flex-wrap items-baseline gap-x-[2ch] font-mono text-2xs leading-[1.6] text-ink-2 stacked-or-split:card-w-gt-520:flex-auto">
        <CompactPart label={COPY.creditsPhoto} credit={credits.photo} />
        <span className="sep hidden px-1.5 text-ink-4" aria-hidden="true">
          ·
        </span>
        <CompactPart label={COPY.creditsSong} credit={credits.audio} />
      </p>
    )
  }
  return (
    <div className="credit-line credit-line--full hidden grid-cols-[1fr_auto] items-end gap-x-4 font-mono text-2xs leading-[1.6] card-captioned:grid">
      <FullRow label={COPY.creditsPhoto} credit={credits.photo} className="col-start-1" />
      {/* The song row may be long (institutional recordists); it takes the full width. */}
      <FullRow label={COPY.creditsSong} credit={credits.audio} className="col-span-full" />
      <p className="credit-line__more col-start-2 row-start-1 flex gap-3.5 self-start whitespace-nowrap">
        {onDetails && (
          <button type="button" className={cn(TEXT_LINK, 'no-js:hidden')} onClick={onDetails}>
            {COPY.detailsButton}
          </button>
        )}
        <Link
          to="/credits"
          search={{ bird: slug }}
          hash={slug}
          className={cn('credit-line__all', TEXT_LINK)}
        >
          {COPY.creditsAll}
        </Link>
      </p>
    </div>
  )
}

/** "PHOTO  Author ↗ · CC BY-SA 4.0": the author links to the work's page, the licence to its deed. */
function FullRow({
  label,
  credit,
  className,
}: {
  label: string
  credit: Credit
  className?: string
}) {
  return (
    <p
      className={cn('credit-row grid grid-cols-[6ch_minmax(0,1fr)] gap-x-2 text-ink-2', className)}
    >
      <span className="credit-row__label font-medium tracking-label text-ink-3 uppercase">
        {label}
      </span>
      {/* Inline flow, so a wrapped author is followed on the same line by the licence. Only the
          author wraps: a long one (e.g. "Chris Birmingham / Department of Conservation (NZ)")
          stays inside its column instead of running under "All credits". */}
      <span className="credit-row__value min-w-0">
        <ExternalLink href={credit.source} arrow className="credit-row__author">
          {shortAuthor(credit.author)}
        </ExternalLink>
        <span className="sep px-1.5 whitespace-nowrap text-ink-4" aria-hidden="true">
          ·
        </span>
        <ExternalLink href={credit.licenseUrl} className="whitespace-nowrap">
          {credit.license}
        </ExternalLink>
        <span className="sr-only">, via {sourceLabel(credit.source)}</span>
      </span>
    </p>
  )
}

/**
 * Compact links keep the caption's halo, but WebKit misplaces (or drops) the underline of text with
 * more than one text-shadow, so these draw theirs as a dotted border instead. The author is a flex
 * item: the negative margin keeps the border from growing its line.
 */
const COMPACT_LINK =
  '-mb-px border-b border-dotted border-current/70 no-underline hover:border-solid'

/** Only the author may truncate; the licence sits in its own box so it is never clipped. */
function CompactPart({ label, credit }: { label: string; credit: Credit }) {
  return (
    <span className="credit-compact__part inline-flex max-w-full min-w-0 items-baseline gap-[0.6ch] whitespace-nowrap">
      <span className="credit-compact__label flex-none text-ink-2">{label}</span>{' '}
      <ExternalLink
        href={credit.source}
        className={cn(
          'credit-compact__author max-w-[24ch] min-w-0 overflow-hidden text-ellipsis stacked-or-split:card-w-gt-520:max-w-[18ch] card-w-ge-600:max-w-[32ch]',
          COMPACT_LINK,
        )}
      >
        {shortAuthor(credit.author)}
      </ExternalLink>{' '}
      <span className="credit-compact__lic flex-none">
        (
        <ExternalLink href={credit.licenseUrl} className={COMPACT_LINK}>
          {shortLicense(credit.license)}
        </ExternalLink>
        )
      </span>
    </span>
  )
}
