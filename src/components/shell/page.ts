import { textLinkVariants } from '~/components/ui/text-link'
import { cn } from '~/lib/utils'

/** The text column of /credits and the 404 page. */
export const PAGE =
  'mx-auto w-full max-w-[880px] pt-12 pr-[max(var(--gutter),var(--safe-r))] pb-[calc(64px+var(--safe-b))] pl-[max(var(--gutter),var(--safe-l))]'

export const PAGE_TITLE = 'page__title text-4xl leading-[1.15] font-semibold tracking-title'

/** The link back to the birds, with a 44px target. */
export const PAGE_BACK_LINK = cn('text-link', textLinkVariants({ layout: 'flex' }), 'min-h-11')
