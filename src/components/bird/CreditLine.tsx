import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { COPY } from '~/lib/copy'
import { shortAuthor, shortLicense, sourceLabel } from '~/lib/credits'
import type { Bird, Credit } from '~/lib/manifest'
import { Icon } from '../shell/Icon'

/** A link that opens in a new tab, so the song keeps playing. */
export function ExternalLink({
  href,
  children,
  arrow = false,
  className,
}: {
  href: string
  children: ReactNode
  arrow?: boolean
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`ext-link${className ? ` ${className}` : ''}`}
    >
      {children}
      {arrow && <Icon name="external" size={10} className="ext-link__arrow" />}
      <span className="sr-only"> {COPY.newTabSr}</span>
    </a>
  )
}

/** "PHOTO  Author ↗ · CC BY-SA 4.0": the author links to the work's page, the licence to its deed. */
function FullRow({ label, credit }: { label: string; credit: Credit }) {
  return (
    <p className="credit-row">
      <span className="credit-row__label">{label}</span>
      <span className="credit-row__value">
        <ExternalLink href={credit.source} arrow className="credit-row__author">
          {shortAuthor(credit.author)}
        </ExternalLink>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <ExternalLink href={credit.licenseUrl}>{credit.license}</ExternalLink>
        <span className="sr-only">, via {sourceLabel(credit.source)}</span>
      </span>
    </p>
  )
}

/** Only the author may truncate; the licence sits in its own box so it is never clipped. */
function CompactPart({ label, credit }: { label: string; credit: Credit }) {
  return (
    <span className="credit-compact__part">
      <span className="credit-compact__label">{label}</span>{' '}
      <ExternalLink href={credit.source} className="credit-compact__author">
        {shortAuthor(credit.author)}
      </ExternalLink>{' '}
      <span className="credit-compact__lic">
        (<ExternalLink href={credit.licenseUrl}>{shortLicense(credit.license)}</ExternalLink>)
      </span>
    </span>
  )
}

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
    return (
      <p className="credit-line credit-line--compact">
        <CompactPart label={COPY.creditsPhoto} credit={credits.photo} />
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <CompactPart label={COPY.creditsSong} credit={credits.audio} />
      </p>
    )
  }
  return (
    <div className="credit-line credit-line--full">
      <FullRow label={COPY.creditsPhoto} credit={credits.photo} />
      <FullRow label={COPY.creditsSong} credit={credits.audio} />
      <p className="credit-line__more">
        {onDetails && (
          <button type="button" className="text-link" onClick={onDetails}>
            {COPY.detailsButton}
          </button>
        )}
        <Link
          to="/credits"
          search={{ bird: slug }}
          hash={slug}
          className="credit-line__all text-link"
        >
          {COPY.creditsAll}
        </Link>
      </p>
    </div>
  )
}
