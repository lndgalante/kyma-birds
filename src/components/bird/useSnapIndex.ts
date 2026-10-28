import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import type { NavSource } from '~/lib/search'

export interface SnapController {
  goTo(i: number, o?: { source?: NavSource }): void
  /** The slide under the scrollport right now (may be ahead of the committed bird). */
  current(): number
}

interface Options {
  count: number
  initialIndex: number
  onView(i: number): void
  onSettle(i: number, source: NavSource): void
}

const DWELL_MS = 250
const IDLE_MS = 140

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Two indices for one native scroll-snap track (ui.md §3.4): the view index follows the slide
 * under the scrollport mid-gesture; the settled index is reported once scrolling has stopped
 * and 250 ms have passed with no new movement.
 */
export function useSnapIndex(
  trackRef: RefObject<HTMLElement | null>,
  { count, initialIndex, onView, onSettle }: Options,
): SnapController {
  const view = useRef(initialIndex)
  const pending = useRef<{ index: number; source: NavSource } | null>(null)
  const cbs = useRef({ onView, onSettle, count })
  cbs.current = { onView, onSettle, count }
  const settleRef = useRef<() => void>(() => {})
  // Bumped by every goTo (and on unmount): a long jump still fading out checks it before landing,
  // so newer input always wins over an older target.
  const gen = useRef(0)
  const fade = useRef<Animation | null>(null)

  const setView = (i: number) => {
    if (i === view.current) return
    view.current = i
    cbs.current.onView(i)
  }

  // Client-side navigations never run the SSR inline script; place the track before paint.
  useLayoutEffect(() => {
    const t = trackRef.current
    if (!t || !t.clientWidth) return
    const left = initialIndex * t.clientWidth
    if (Math.abs(t.scrollLeft - left) > 2) t.scrollTo({ left, behavior: 'instant' })
    // Mount only: later commits arrive through goTo or the user's own scroll.
  }, [])

  useEffect(() => {
    const t = trackRef.current
    if (!t) return
    let dwell = 0
    let idle = 0
    let raf = 0
    // The commit the dwell timer will make. A second settle on the same slide (an instant jump
    // gets one from scrollend and one from its own rAF) keeps its source, so a rail pick stays
    // silent.
    let armed: { index: number; source: NavSource } | null = null
    let width = t.clientWidth
    const hasScrollEnd = 'onscrollend' in window

    const indexNow = () => {
      const w = t.clientWidth || 1
      return Math.min(cbs.current.count - 1, Math.max(0, Math.round(t.scrollLeft / w)))
    }

    // A new track width (window resize, rotation, a layout switch) moves scrollLeft: WebKit
    // re-snaps to whichever slide is nearest the old pixel offset, Chromium and Firefox clamp.
    // That scroll is not navigation: put back the slide that was showing, then settle there
    // (which keeps a commit already on its way). Engines differ in whether scroll, scrollend or
    // the ResizeObserver sees the new width first, so all three ask. True when it moved the track.
    const relayout = () => {
      const w = t.clientWidth
      if (!w || w === width) return false
      width = w
      const left = (pending.current?.index ?? view.current) * w
      if (Math.abs(t.scrollLeft - left) <= 2) return false
      t.scrollTo({ left, behavior: 'instant' })
      requestAnimationFrame(() => settleRef.current())
      return true
    }

    const settle = () => {
      window.clearTimeout(idle)
      if (relayout()) return
      // A long jump is fading out: the track hasn't moved to its target yet, so this is the end
      // of an earlier scroll. The jump settles itself once it lands.
      if (fade.current && pending.current) return
      const i = indexNow()
      const p = pending.current
      const source: NavSource =
        p && p.index === i ? p.source : armed && armed.index === i ? armed.source : 'scroll'
      pending.current = null
      setView(i)
      window.clearTimeout(dwell)
      const commit = { index: i, source }
      armed = commit
      dwell = window.setTimeout(() => {
        armed = null
        cbs.current.onSettle(commit.index, commit.source)
      }, DWELL_MS)
    }
    settleRef.current = settle

    const onScroll = () => {
      // Before clearing the dwell: a resize must not cancel a commit that is already on its way.
      if (relayout()) return
      window.clearTimeout(dwell)
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          if (relayout()) return
          if (!pending.current) setView(indexNow())
        })
      }
      if (!hasScrollEnd) {
        window.clearTimeout(idle)
        idle = window.setTimeout(settle, IDLE_MS)
      }
    }

    // The browser re-snaps after layout changes; this corrects the rare drift it leaves behind.
    const ro = new ResizeObserver(() => {
      if (relayout() || pending.current) return
      const left = view.current * t.clientWidth
      if (Math.abs(t.scrollLeft - left) > 2) t.scrollTo({ left, behavior: 'instant' })
    })

    t.addEventListener('scroll', onScroll, { passive: true })
    if (hasScrollEnd) t.addEventListener('scrollend', settle)
    ro.observe(t)
    return () => {
      t.removeEventListener('scroll', onScroll)
      t.removeEventListener('scrollend', settle)
      ro.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(dwell)
      window.clearTimeout(idle)
      // A long jump still fading out must not settle (and arm a commit) after unmount.
      gen.current++
      fade.current?.cancel()
      settleRef.current = () => {}
    }
  }, [trackRef])

  return useMemo<SnapController>(
    () => ({
      current: () => view.current,
      goTo(target, o) {
        const t = trackRef.current
        if (!t) return
        const i = Math.min(cbs.current.count - 1, Math.max(0, target))
        const from = Math.round(t.scrollLeft / (t.clientWidth || 1))
        const left = i * t.clientWidth
        // Supersede any long jump still fading out; cancelling also lifts its dip.
        const g = ++gen.current
        fade.current?.cancel()
        fade.current = null
        pending.current = { index: i, source: o?.source ?? 'button' }
        setView(i)
        if (Math.abs(t.scrollLeft - left) < 1) {
          settleRef.current()
          return
        }
        const reduced = prefersReducedMotion()
        if (!reduced && Math.abs(i - from) <= 2) {
          t.scrollTo({ left, behavior: 'smooth' })
          return
        }
        const jump = () => {
          t.scrollTo({ left, behavior: 'instant' })
          // Not every engine fires scrollend for an instant scroll; settle explicitly.
          requestAnimationFrame(() => {
            if (g === gen.current) settleRef.current()
          })
        }
        if (reduced || typeof t.animate !== 'function') {
          jump()
          return
        }
        // A long jump dips the track instead of whizzing past every bird in between.
        const out = t.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 100,
          easing: 'ease-in',
          fill: 'forwards',
        })
        fade.current = out
        const land = () => {
          if (g !== gen.current) return
          fade.current = null
          jump()
        }
        out.finished
          .then(() => {
            if (g !== gen.current) return
            land()
            out.cancel()
            t.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
          })
          // Cancelled by a newer goTo (or unmount): that one owns the track now.
          .catch(land)
      },
    }),
    [trackRef],
  )
}
