import type { ReactNode } from 'react'
import { COPY } from '~/lib/copy'
import { cn } from '~/lib/utils'
import { Icon } from '../shell/Icon'
import { textLinkVariants } from './text-link'

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
      className={cn('ext-link', textLinkVariants(), className)}
    >
      {children}
      {arrow && (
        <Icon
          name="external"
          size={10}
          className="ext-link__arrow ms-[3px] inline-block align-[0] text-ink-3"
        />
      )}
      <span className="sr-only"> {COPY.newTabSr}</span>
    </a>
  )
}
