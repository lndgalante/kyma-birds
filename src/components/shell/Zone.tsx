import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/**
 * A zone's heading: the h2 that labels the zone's section, hidden in every layout (the flow from
 * photo to song to plate reads without labels).
 */
export function ZoneHead({
  id,
  title,
  className,
  children,
}: {
  id: string
  title: string
  className?: string
  children?: ReactNode
}) {
  return (
    <header className={cn('zone-head', className, 'sr-only')}>
      <h2 id={id} className="zone-title">
        {title}
      </h2>
      {children}
    </header>
  )
}
