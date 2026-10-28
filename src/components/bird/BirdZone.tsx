import { ScriptOnce, useHydrated } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { COPY } from '~/lib/copy'
import type { Bird } from '~/lib/manifest'
import { FlowLine } from '../song/FlowLine'
import { BirdCard } from './BirdCard'
import type { PhotoPriority } from './BirdPhoto'
import { PickerPager } from './PickerPager'
import { PickerRail } from './PickerRail'
import type { SnapController } from './useSnapIndex'

interface BirdZoneProps {
  birds: readonly Bird[]
  committedIndex: number
  viewIndex: number
  trackRef: RefObject<HTMLDivElement | null>
  snap: SnapController
  onDetails(slug: string): void
}

function useSaveData(): boolean {
  const [save, setSave] = useState(false)
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    setSave(!!conn?.saveData)
  }, [])
  return save
}

export function BirdZone({
  birds,
  committedIndex,
  viewIndex,
  trackRef,
  snap,
  onDetails,
}: BirdZoneProps) {
  const total = birds.length
  const eagerRange = useSaveData() ? 1 : 2
  // Server HTML marks only the committed photo eager, so React's hoisted image preloads never
  // compete with the LCP image; neighbours turn eager once hydrated.
  const hydrated = useHydrated()

  // An outgoing slide turns inert; if focus was inside it, hand focus to the incoming slide.
  useEffect(() => {
    const active = document.activeElement
    const slide = active?.closest?.('.bird-card')
    if (slide && slide.id !== `slide-${birds[viewIndex].slug}`) {
      document.getElementById(`slide-${birds[viewIndex].slug}`)?.focus({ preventScroll: true })
    }
  }, [viewIndex, birds])

  const priorityOf = (i: number): PhotoPriority =>
    i === committedIndex
      ? 'high'
      : hydrated && Math.abs(i - viewIndex) <= eagerRange
        ? 'auto'
        : 'lazy'

  const goTo = useCallback(
    (i: number, source: 'button' | 'rail') => snap.goTo(i, { source }),
    [snap],
  )

  return (
    <section id="birds" className="zone zone--bird" aria-labelledby="zone-bird" tabIndex={-1}>
      <header className="zone-head">
        <h2 id="zone-bird" className="zone-title">
          <span className="zone-num" aria-hidden="true">
            01
          </span>{' '}
          {COPY.zoneBird}
        </h2>
        <FlowLine />
      </header>
      <div
        className="carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label={COPY.carouselLabel}
      >
        <div id="bird-track" className="track" ref={trackRef}>
          {birds.map((b, i) => (
            <BirdCard
              key={b.slug}
              bird={b}
              index={i}
              total={total}
              inert={i !== viewIndex}
              initial={i === committedIndex}
              priority={priorityOf(i)}
              onDetails={onDetails}
            />
          ))}
        </div>
        <ScriptOnce>
          {`(function(t){if(t&&t.clientWidth)t.scrollTo({left:${committedIndex}*t.clientWidth,behavior:'instant'})})(document.getElementById('bird-track'))`}
        </ScriptOnce>
        <div className="picker-nav">
          <span className="zone-tag" aria-hidden="true">
            <span className="zone-num">01</span> {COPY.zoneBird}
          </span>
          <PickerRail birds={birds} selectedIndex={viewIndex} onSelect={(i) => goTo(i, 'rail')} />
          <PickerPager
            index={viewIndex}
            total={total}
            onPrev={() => goTo(viewIndex - 1, 'button')}
            onNext={() => goTo(viewIndex + 1, 'button')}
          />
        </div>
      </div>
    </section>
  )
}
