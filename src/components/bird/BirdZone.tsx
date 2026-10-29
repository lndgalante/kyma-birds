import { ScriptOnce, useHydrated } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { COPY } from '~/lib/copy'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { ZoneHead } from '../shell/Zone'
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
    <section
      id="birds"
      className={cn(
        'zone zone--bird relative *:min-w-0',
        // Split: the bird column's first row; the song strip takes the foot row under it.
        'split:col-start-1 split:row-start-1 split:grid split:grid-rows-1',
        'compact:col-start-1 compact:row-start-1',
      )}
      aria-labelledby="zone-bird"
      tabIndex={-1}
    >
      <ZoneHead id="zone-bird" title={COPY.zoneBird} />
      <div
        className="carousel grid split:min-h-0 split:grid-rows-[minmax(0,1fr)_auto] split:gap-y-(--row-gap)"
        role="region"
        aria-roledescription="carousel"
        aria-label={COPY.carouselLabel}
      >
        <div
          id="bird-track"
          className={cn(
            'track isolate grid h-(--track-h) auto-cols-[100%] grid-flow-col snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar motion-safe:scroll-smooth',
            // On the night the track reaches 8px past its column (6px in Split's height), padded
            // back, so a focus ring at the card's edge is not clipped. The gap between slides is
            // twice the padding, so a slide's pitch stays the track's clientWidth (useSnapIndex).
            'stacked-or-split:-mx-2 stacked-or-split:gap-x-4 stacked-or-split:px-2',
            'split:-my-1.5 split:h-auto split:min-h-0 split:py-1.5',
          )}
          ref={trackRef}
        >
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
        {/* Field and Compact: the pager floats at the photo's bottom end, level with the
            label's Details pill. Stacked and Split: a row under the card, above the song
            strip. */}
        <div
          className={cn(
            'picker-nav absolute end-[max(12px,var(--safe-r))] bottom-3 z-3 flex min-w-0 items-center gap-4 @container/nav',
            'field:@container-normal',
            'stacked:static stacked:h-12',
            'compact:absolute compact:end-3 compact:bottom-3 compact:h-auto compact:@container-normal',
          )}
        >
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

function useSaveData(): boolean {
  const [save, setSave] = useState(false)
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    setSave(!!conn?.saveData)
  }, [])
  return save
}
