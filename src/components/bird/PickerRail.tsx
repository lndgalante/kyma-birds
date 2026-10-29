import { useRef, useState, type KeyboardEvent } from 'react'
import { COPY } from '~/lib/copy'
import { formatHzShort } from '~/lib/format'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'

const RAIL_CAP =
  'rail-cap flex-none font-mono text-2xs font-medium tracking-label text-ink-3 uppercase nav-le-430:hidden'

interface PickerRailProps {
  birds: readonly Bird[]
  selectedIndex: number
  onSelect(i: number): void
}

/**
 * The index as a frequency scale: one tick per bird, Low → High. APG tabs with automatic
 * activation; the commit dwell upstream keeps audio from thrashing while arrowing.
 */
export function PickerRail({ birds, selectedIndex, onSelect }: PickerRailProps) {
  const [hover, setHover] = useState<number | null>(null)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const shown = birds[hover ?? selectedIndex]

  const move = (i: number) => {
    const next = Math.min(birds.length - 1, Math.max(0, i))
    tabs.current[next]?.focus()
    if (next !== selectedIndex) onSelect(next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = {
      ArrowLeft: selectedIndex - 1,
      ArrowRight: selectedIndex + 1,
      Home: 0,
      End: birds.length - 1,
    }
    if (!(e.key in map) || e.altKey || e.metaKey || e.ctrlKey) return
    e.preventDefault()
    move(map[e.key])
  }

  return (
    <div
      className={cn(
        'picker-rail hidden min-w-0 flex-auto items-center gap-1.5 [--tick-w:24px]',
        'stacked:flex compact:hidden',
        'nav-le-640:[--tick-w:20px] nav-le-430:gap-0.5 nav-le-430:[--tick-w:16px]',
      )}
    >
      <span className={RAIL_CAP} aria-hidden="true">
        {COPY.railLow}
      </span>
      <div
        className="rail flex flex-none items-center"
        role="tablist"
        aria-label={COPY.railLabel}
        aria-describedby="rail-desc"
        onKeyDown={onKeyDown}
        onPointerLeave={() => setHover(null)}
      >
        {birds.map((b, i) => (
          <button
            key={b.slug}
            ref={(el) => {
              tabs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`tab-${b.slug}`}
            className={cn(
              'rail-tab relative h-10 w-(--tick-w) rounded-sm focus-visible:-outline-offset-2 pointer-coarse:h-11',
              'before:absolute before:top-1/2 before:left-1/2 before:h-3 before:w-px before:-translate-1/2 before:rounded-[1px] before:bg-ink-3 before:transition-[height,width,background-color] before:duration-(--dur-2) before:ease-out',
              'hover:before:h-4 hover:before:bg-ink-2',
              'aria-selected:before:h-[22px] aria-selected:before:w-0.5 aria-selected:before:bg-signal',
              'forced-colors:before:bg-[CanvasText] forced-colors:before:forced-color-adjust-none forced-colors:aria-selected:before:bg-[Highlight]',
            )}
            aria-controls={`slide-${b.slug}`}
            aria-selected={i === selectedIndex}
            aria-label={b.commonName}
            tabIndex={i === selectedIndex ? 0 : -1}
            onClick={() => move(i)}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          />
        ))}
      </div>
      <span className={RAIL_CAP} aria-hidden="true">
        {COPY.railHigh}
      </span>
      <span id="rail-desc" className="sr-only">
        {COPY.railDesc}
      </span>
      <p
        className="rail-label group/label ms-2.5 flex min-w-0 flex-auto items-baseline gap-2 overflow-hidden font-mono text-2xs leading-[1.6] whitespace-nowrap text-ink-3 nav-le-540:hidden"
        aria-hidden="true"
        data-hover={hover != null || undefined}
      >
        <span className="rail-label__name min-w-[3ch] truncate text-ink-2 group-data-hover/label:text-ink">
          {shown.commonName}
        </span>
        <span className="rail-label__hz flex-none tabular-nums nav-le-640:hidden">
          {formatHzShort(shown.audio.bandHz.p50)}
        </span>
      </p>
    </div>
  )
}
