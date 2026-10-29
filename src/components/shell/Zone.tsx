import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

const MONO_LABEL =
  'font-mono text-2xs leading-[1.2] font-medium tracking-label whitespace-nowrap text-ink-2 uppercase'

/**
 * A zone's head row (ui.md §1.2), shown only in Split. There each zone repeats the page grid's rows
 * so the three heads line up (not as a subgrid: WebKit then hit-tests the rows where they were
 * before a relayout, and clicks miss the play button). Elsewhere it stays in the accessibility
 * tree, and in Stacked a ZoneTag shows the label inline.
 */
export function ZoneHead({
  id,
  num,
  title,
  className,
  children,
}: {
  id: string
  num: string
  title: string
  className?: string
  children?: ReactNode
}) {
  return (
    <header
      className={cn(
        'zone-head min-w-0 strip:sr-only split:flex split:items-center split:gap-3',
        className,
      )}
    >
      <h2
        id={id}
        className={cn(
          'zone-title min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis',
          MONO_LABEL,
        )}
      >
        <span className="zone-num font-normal text-ink-3" aria-hidden="true">
          {num}
        </span>{' '}
        {title}
      </h2>
      {children}
    </header>
  )
}

/** The inline zone label of the Stacked rows (bird nav, song strip, plate foot). */
export function ZoneTag({
  num,
  title,
  className,
}: {
  num: string
  title: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'zone-tag hidden flex-none items-baseline gap-2 stacked:inline-flex split:hidden compact:hidden',
        MONO_LABEL,
        className,
      )}
      aria-hidden="true"
    >
      <span className="zone-num font-normal text-ink-3">{num}</span> {title}
    </span>
  )
}
