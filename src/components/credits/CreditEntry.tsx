import { ExternalLink } from '~/components/ui/external-link'
import { COPY } from '~/lib/copy'
import { sourceLabel } from '~/lib/credits'
import type { Bird, Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'

const LINK = 'inline-flex min-h-6 items-center'
const NOTE = 'work__note font-sans text-md leading-[1.45] text-ink-3 md:col-[2/-1]'

export function CreditEntry({ bird: b, highlighted }: { bird: Bird; highlighted: boolean }) {
  return (
    <li>
      <article
        id={b.slug}
        className={cn(
          'credit-entry relative grid scroll-mt-20 grid-cols-[96px_minmax(0,1fr)] gap-5 border-b border-line py-6 field:grid-cols-[64px_minmax(0,1fr)] field:gap-4',
          // In the page gutter, but never past it: on phones html clips x overflow.
          'data-highlight:before:absolute data-highlight:before:inset-y-5 data-highlight:before:start-[calc(-1*min(18px,var(--gutter)-6px))] data-highlight:before:w-0.5 data-highlight:before:rounded-xs data-highlight:before:bg-signal',
        )}
        data-highlight={highlighted || undefined}
        aria-labelledby={`credit-${b.slug}`}
      >
        <img
          className="credit-entry__thumb size-24 max-w-none rounded-md object-cover inset-ring inset-ring-white/8 field:size-16"
          src={b.photo.srcSm}
          width={Math.round(b.photo.width / 2)}
          height={Math.round(b.photo.height / 2)}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            objectPosition: `${b.photo.focal.x * 100}% ${b.photo.focal.y * 100}%`,
            backgroundColor: b.photo.dominantColor,
          }}
        />
        <div className="credit-entry__body">
          <h2
            id={`credit-${b.slug}`}
            className="credit-entry__name mb-3.5 text-2xl leading-[1.2] font-display font-stretch-92%"
          >
            {b.commonName}{' '}
            <i className="credit-entry__sci ms-1.5 text-base font-normal font-stretch-100% text-ink-3">
              {b.scientificName}
            </i>
          </h2>
          <Work label={COPY.creditsPhoto} credit={b.credits.photo} />
          <Work
            label={COPY.creditsSong}
            credit={b.credits.audio}
            className="border-t border-dashed border-line"
          />
        </div>
      </article>
    </li>
  )
}

function Work({ label, credit, className }: { label: string; credit: Credit; className?: string }) {
  return (
    <div
      className={cn(
        'work grid grid-cols-[minmax(0,1fr)] gap-0.5 py-2 font-mono text-xs leading-[1.6] text-ink-2 md:grid-cols-[7ch_minmax(0,1fr)_auto_auto] md:items-baseline md:gap-x-[18px]',
        className,
      )}
    >
      <p className="work__label text-2xs font-medium tracking-label text-ink-3 uppercase">
        {label}
      </p>
      <p className="work__author text-ink field:font-sans field:text-base">{credit.author}</p>
      <p className="work__license">
        <ExternalLink href={credit.licenseUrl} className={LINK}>
          {credit.license}
        </ExternalLink>
      </p>
      <p className="work__source">
        <ExternalLink href={credit.source} arrow className={LINK}>
          {sourceLabel(credit.source)}
        </ExternalLink>
      </p>
      <p className={NOTE}>
        <span className="work__title wrap-anywhere">“{credit.title}”</span>
        {credit.catalog && <span className="work__catalog"> · {credit.catalog}</span>}
      </p>
      <p className={NOTE}>Changes: {credit.changes}</p>
    </div>
  )
}
