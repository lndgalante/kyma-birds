import { useEffect, useRef, type RefObject } from 'react'

// Same conditions as the `split` and `compact` variants in app.css: only there does a
// vertical wheel over the track mean "next bird" rather than "scroll the page".
const WHEEL_LAYOUTS =
  '(pointer: fine) and (((width >= 64rem) and (min-aspect-ratio: 5/4) and (height > 34rem)) or ((height <= 34rem) and (orientation: landscape) and (width >= 40rem)))'

const THRESHOLD = 60
const QUIET_MS = 400

/**
 * Turns vertical wheel and trackpad swipes over the track into single steps. After a step it
 * ignores input until the wheel has been quiet for 400 ms, which swallows trackpad inertia.
 */
export function useWheelStep(
  trackRef: RefObject<HTMLElement | null>,
  onStep: (dir: -1 | 1) => void,
): void {
  const stepRef = useRef(onStep)
  stepRef.current = onStep
  useEffect(() => {
    const t = trackRef.current
    if (!t) return
    const mq = window.matchMedia(WHEEL_LAYOUTS)
    let acc = 0
    let locked = false
    let quiet = 0
    const onWheel = (e: WheelEvent) => {
      if (!mq.matches || e.ctrlKey) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      window.clearTimeout(quiet)
      quiet = window.setTimeout(() => {
        locked = false
        acc = 0
      }, QUIET_MS)
      if (locked) return
      acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      if (Math.abs(acc) >= THRESHOLD) {
        stepRef.current(acc > 0 ? 1 : -1)
        locked = true
        acc = 0
      }
    }
    t.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      t.removeEventListener('wheel', onWheel)
      window.clearTimeout(quiet)
    }
  }, [trackRef])
}
