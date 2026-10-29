import { ScriptOnce, useHydrated } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { COPY } from '~/lib/copy'
import type { Bird } from '~/lib/manifest'
import { cn } from '~/lib/utils'
import { ZoneHead, ZoneTag } from '../shell/Zone'
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
    <section
      id="birds"
      className={cn(
        'zone zone--bird relative *:min-w-0',
        'split:col-start-1 split:row-span-full split:grid split:grid-rows-[var(--zone-head)_minmax(0,1fr)_var(--zone-foot)] split:gap-y-(--row-gap)',
        'compact:col-start-1 compact:row-start-1',
      )}
      aria-labelledby="zone-bird"
      tabIndex={-1}
    >
      <ZoneHead id="zone-bird" num="01" title={COPY.zoneBird}>
        <FlowLine />
      </ZoneHead>
      <div
        className="carousel grid split:row-[2/4] split:grid-rows-[minmax(0,1fr)_var(--zone-foot)] split:gap-y-(--row-gap) split:min-h-0"
        role="region"
        aria-roledescription="carousel"
        aria-label={COPY.carouselLabel}
      >
        <div
          id="bird-track"
          className={cn(
            'track isolate grid h-[max(var(--photo-min),46svh,min(62svh,100svh-var(--plate)-116px))] auto-cols-[100%] grid-flow-col snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain no-scrollbar motion-safe:scroll-smooth',
            'stacked:h-[clamp(300px,34svh,520px)] stacked:rounded-xl',
            'split:h-auto split:min-h-0',
            'compact:h-[calc(100svh-var(--strip-h)-40px)] compact:min-h-[220px]',
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
        <div
          className={cn(
            'picker-nav absolute end-[max(10px,var(--safe-r))] bottom-[calc(var(--strip-h)+8px)] z-3 flex min-w-0 items-center gap-4 @container/nav',
            'field:@container-normal',
            'stacked:static stacked:h-12',
            'split:h-auto split:gap-3',
            'compact:absolute compact:end-2.5 compact:bottom-3.5 compact:h-auto compact:@container-normal',
          )}
        >
          <ZoneTag num="01" title={COPY.zoneBird} />
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
