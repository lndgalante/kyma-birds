import { ExternalLink } from '~/components/ui/external-link'
import { textLinkVariants } from '~/components/ui/text-link'
import { COPY } from '~/lib/copy'
import { shortAuthor, shortLicense, sourceLabel } from '~/lib/credits'
import { NBSP } from '~/lib/format'
import type { Bird, Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/** Links in the caption stay as dim as its words; the underline marks them. */
const CAPTION_LINK = 'text-ink-3'

/**
 * The card's credits on the night (Stacked, Split): one quiet caption, "Photo Author (CC0) · Song
 * Author (CC BY-SA)", each author and licence linked and wrapping as text does, then the way to
 * Details, which holds the full credits. Phones keep their credits in Details.
 */
export function CreditLine({
  credits,
  onDetails,
}: {
  credits: Bird['credits']
  onDetails(): void
}) {
  return (
    <div className="credit-line grid min-w-0 justify-items-start gap-2">
      <p className="credit-line__caption max-w-[60ch] text-sm leading-[1.55] text-ink-3">
        <CaptionPart label={COPY.creditsPhoto} credit={credits.photo} />
        {/* The no-break space keeps the dot off the start of a wrapped line. */}
        {`${NBSP}· `}
        <CaptionPart label={COPY.creditsSong} credit={credits.audio} />
      </p>
      {/* 32px tall, its hit area extended to 44px. No JS: nothing would open the sheet. */}
      <button
        type="button"
        className={cn(
          'details-link text-link',
          textLinkVariants({ layout: 'flex' }),
          'relative min-h-8 after:absolute after:-inset-x-1 after:-inset-y-1.5 no-js:hidden',
        )}
        onClick={onDetails}
      >
        {COPY.detailsButton}
      </button>
    </div>
  )
}

/**
 * "Photo Author (CC BY-SA)": the author links to the work's page, the licence to its deed (the
 * link carries the version). The label stays with the author's first word, and the licence with
 * its parentheses.
 */
function CaptionPart({ label, credit }: { label: string; credit: Credit }) {
  return (
    <>
      {label}
      {NBSP}
      <ExternalLink href={credit.source} className={cn('credit-line__author', CAPTION_LINK)}>
        {shortAuthor(credit.author)}
      </ExternalLink>{' '}
      <span className="whitespace-nowrap">
        (
        <ExternalLink href={credit.licenseUrl} className={CAPTION_LINK}>
          {shortLicense(credit.license)}
        </ExternalLink>
        )
      </span>
      <span className="sr-only">, via {sourceLabel(credit.source)}</span>
    </>
  )
}
