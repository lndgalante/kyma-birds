import { useRef, useState, type KeyboardEvent } from 'react'
import { COPY } from '~/lib/copy'
import { formatHzShort } from '~/lib/format'
import type { Bird } from '~/lib/manifest'

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
    <div className="picker-rail">
      <span className="rail-cap" aria-hidden="true">
        {COPY.railLow}
      </span>
      <div
        className="rail"
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
            className="rail-tab"
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
      <span className="rail-cap" aria-hidden="true">
        {COPY.railHigh}
      </span>
      <span id="rail-desc" className="sr-only">
        {COPY.railDesc}
      </span>
      <p className="rail-label" aria-hidden="true" data-hover={hover != null || undefined}>
        <span className="rail-label__name">{shown.commonName}</span>
        <span className="rail-label__hz">{formatHzShort(shown.audio.bandHz.p50)}</span>
      </p>
    </div>
  )
}
