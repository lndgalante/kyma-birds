import { ExternalLink } from '~/components/ui/external-link'
import { textLinkVariants } from '~/components/ui/text-link'
import { COPY } from '~/lib/copy'
import { shortAuthor, sourceLabel } from '~/lib/credits'
import { NBSP } from '~/lib/format'
import type { Bird, Credit } from '~/lib/manifest'
import { cn } from '~/lib/utils'

/** Links in the caption stay as dim as its words; the underline marks them. */
const CAPTION_LINK = 'text-ink-3'

/**
 * Phones keep their credits in Details; Stacked and Split show this caption beside the photo.
 */
export function CreditLine({
  credits,
  onDetails,
}: {
  credits: Bird['credits']
  onDetails(): void
}) {
  return (
    <p className="credit-line credit-line__caption min-w-0 max-w-[60ch] text-sm leading-[1.55] text-ink-3">
      <CaptionPart label={COPY.creditsPhoto} credit={credits.photo} />
      {/* The no-break space keeps the dot off the start of a wrapped line. */}
      {`${NBSP}· `}
      <CaptionPart label={COPY.creditsSong} credit={credits.audio} />
      <span className="no-js:hidden" aria-hidden="true">{`${NBSP}· `}</span>
      {/* 32px tall, its hit area extended to 44px. No JS: nothing would open the sheet. */}
      <button
        type="button"
        className={cn(
          'details-link text-link',
          textLinkVariants(),
          CAPTION_LINK,
          'relative inline-block min-h-8 align-baseline after:absolute after:-inset-x-1 after:-inset-y-1.5 no-js:hidden',
        )}
        onClick={onDetails}
      >
        {COPY.detailsButton}
      </button>
    </p>
  )
}

function CaptionPart({ label, credit }: { label: string; credit: Credit }) {
  return (
    <>
      {label}
      {NBSP}
      <ExternalLink href={credit.source} className={cn('credit-line__author', CAPTION_LINK)}>
        {shortAuthor(credit.author)}
      </ExternalLink>
      <span className="sr-only">, via {sourceLabel(credit.source)}</span>
    </>
  )
}
