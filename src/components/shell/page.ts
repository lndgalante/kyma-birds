import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/**
 * The column of /credits and the 404 page, as wide as the masthead, so its text starts under the
 * wordmark.
 */
export const PAGE =
  'mx-auto w-full max-w-[1840px] pt-10 pr-[max(var(--gutter),var(--safe-r))] pb-[calc(64px+var(--safe-b))] pl-[max(var(--gutter),var(--safe-l))] stacked:pt-14'

/** A page's h1, Instrument Sans 400. */
export const PAGE_TITLE =
  'page__title font-display text-3xl leading-[1.08] tracking-display text-ink'

/** The link back to the birds, as an outline button. */
export const PAGE_BACK_LINK = cn('text-link', buttonVariants({ variant: 'outline' }))
