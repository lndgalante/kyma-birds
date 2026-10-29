import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/** The text column of /credits and the 404 page. */
export const PAGE =
  'mx-auto w-full max-w-[960px] pt-10 pr-[max(var(--gutter),var(--safe-r))] pb-[calc(64px+var(--safe-b))] pl-[max(var(--gutter),var(--safe-l))] stacked:pt-14'

/** A page's h1. Add no weight class to it, as with SHEET_HEADING. */
export const PAGE_TITLE =
  'page__title font-display text-3xl leading-[1.08] tracking-display text-ink'

/** The link back to the birds, as an outline button. */
export const PAGE_BACK_LINK = cn('text-link', buttonVariants({ variant: 'outline' }))
