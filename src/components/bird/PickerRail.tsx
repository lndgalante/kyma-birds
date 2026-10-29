import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { COPY } from '~/lib/copy'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'

const RAIL_CAP = 'rail-cap flex-none text-xs leading-none font-medium text-ink-3 nav-le-430:hidden'

interface PickerRailProps {
  birds: readonly Bird[]
  selectedIndex: number
  onSelect(i: number): void
  /** The pager's arrows, at the rail's two ends and outside its tablist. */
  prev?: ReactNode
  next?: ReactNode
}

/**
 * The index as a frequency scale: one tick per bird, from low voices to high, between the
 * previous and next arrows. APG tabs with automatic activation; the commit dwell upstream keeps
 * audio from thrashing while arrowing. Each tick is one 22px line scaled down in a 24px-wide
 * target: the selected one stands full height in the signal, a hovered one grows part way. The
 * bird's name shows beside the rail only while a tick is hovered or focused (the card already
 * names the selected bird).
 */
export function PickerRail({ birds, selectedIndex, onSelect, prev, next }: PickerRailProps) {
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
    <div className="picker-rail hidden min-w-0 flex-auto items-center gap-1.5 stacked:flex compact:hidden nav-le-430:gap-0.5">
      {prev}
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
              'rail-tab relative h-10 w-6 rounded-part focus-visible:-outline-offset-2 pointer-coarse:h-11',
              'before:absolute before:top-1/2 before:left-1/2 before:h-[22px] before:w-px before:-translate-1/2 before:scale-y-[0.5] before:rounded-full before:bg-ink-4 before:transition-[scale,background-color] before:duration-(--dur-1) before:ease-out',
              'hover:before:scale-y-[0.7] hover:before:bg-ink-2',
              'aria-selected:before:w-0.5 aria-selected:before:scale-y-100 aria-selected:before:bg-signal',
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
      {next}
      <span id="rail-desc" className="sr-only">
        {COPY.railDesc}
      </span>
      <p
        className="rail-label ms-3 min-w-0 flex-auto truncate text-sm leading-[1.5] font-medium text-ink opacity-0 transition-opacity duration-(--dur-2) ease-out data-hover:opacity-100 nav-le-540:hidden"
        aria-hidden="true"
        data-hover={hover != null || undefined}
      >
        {shown.commonName}
      </p>
    </div>
  )
}
