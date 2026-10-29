import { useEffect, useRef } from 'react'
import type { LiveFeatures } from '~/audio/AudioProvider'
import { useAudioApi, useAudioField } from '~/audio/useAudio'
import type { BandHz } from '~/lib/manifest'

// Log-frequency axis, low enough for the Kākāpō's ~305 Hz booms.
export const F_MIN = 125
export const F_MAX = 12000
// Faint gridlines an octave apart, unlabelled: the figures live in Details.
const GRID_HZ = [250, 500, 1000, 2000, 4000, 8000]
const LOG_SPAN = Math.log(F_MAX / F_MIN)
const LOG_1_6 = Math.log(1.6) / LOG_SPAN
const TWEEN_MS = 900
// The room's colours fade between birds on .app (AppShell); the canvas follows --signal.
const FADE_EVENTS = ['transitionrun', 'transitionend'] as const

/** 0..1 position of `hz` on the log axis. */
export const axisPos = (hz: number) =>
  Math.min(1, Math.max(0, Math.log(Math.max(hz, 1) / F_MIN) / LOG_SPAN))
const posHz = (p: number) => F_MIN * Math.exp(p * LOG_SPAN)

const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2

// The engine's 0..1 spectrum is (dB + 100) / 80. Each bar subtracts its own slowly rising floor,
// so steady hiss and encoder noise drop out and the bird's syllables stand alone.
const FLOOR_RISE_PER_SEC = 0.03
const shape = (v: number, floor: number) =>
  Math.min(1, Math.max(0, (v - Math.max(floor, 0.22) - 0.04) / 0.45)) ** 1.15

interface Geometry {
  w: number
  h: number
  dpr: number
}

interface BandPos {
  lo: number
  hi: number
  peak: number
}

interface SpectrumProps {
  band: BandHz
  peakHz: number
  label: string
}

/**
 * The live spectrum on a log-frequency axis (ui.md §5.3), low to high from left to right along
 * the song strip's bed: faint gridlines, the bars, and the bird's band as a bracket along the
 * bed's foot, notched at its peak.
 */
export function Spectrum({ band, peakHz, label }: SpectrumProps) {
  const api = useAudioApi()
  const state = useAudioField('state')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const geo = useRef<Geometry>({ w: 0, h: 0, dpr: 1 })
  const bars = useRef<Float32Array>(new Float32Array(0))
  const floors = useRef<Float32Array>(new Float32Array(0))
  const lastLive = useRef(0)
  const tween = useRef<{ from: BandPos; to: BandPos; t0: number }>({
    from: toPos(band, peakHz),
    to: toPos(band, peakHz),
    t0: 0,
  })
  const drawRef = useRef<(f: LiveFeatures | null, now: number) => boolean>(() => false)
  const stateRef = useRef(state)
  stateRef.current = state
  // When the room's colour fade ends.
  const fadeUntil = useRef(0)
  // Starts the idle loop; null while the live loop draws.
  const startIdle = useRef<(() => void) | null>(null)

  // Drawing lives in a ref so the rAF loop never needs React to re-render.
  drawRef.current = (f, now) => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    const g = geo.current
    if (!c || !ctx || g.w === 0 || g.h === 0) return false
    const cs = getComputedStyle(c)
    const col = {
      signal: cs.getPropertyValue('--signal').trim() || '#9fd6a5',
      ink: cs.getPropertyValue('--ink').trim() || '#f2f0ea',
      line: cs.getPropertyValue('--line').trim() || 'rgba(242,240,234,.12)',
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const live = stateRef.current === 'playing'

    // Band bracket tween, in log space.
    const tw = tween.current
    const k = tw.t0 === 0 || reduced ? 1 : Math.min(1, (now - tw.t0) / TWEEN_MS)
    const e = easeInOutSine(k)
    const bp: BandPos = {
      lo: tw.from.lo + (tw.to.lo - tw.from.lo) * e,
      hi: tw.from.hi + (tw.to.hi - tw.from.hi) * e,
      peak: tw.from.peak + (tw.to.peak - tw.from.peak) * e,
    }

    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
    ctx.clearRect(0, 0, g.w, g.h)

    // Layout: the bar field fills the bed; the bracket runs along its foot.
    const fieldH = g.h - 6
    const base = fieldH + 4
    // Position along the frequency axis in CSS px.
    const at = (p: number) => p * g.w

    ctx.strokeStyle = col.line
    ctx.lineWidth = 1
    for (const hz of GRID_HZ) {
      const q = Math.round(at(axisPos(hz))) + 0.5
      ctx.beginPath()
      ctx.moveTo(q, 0)
      ctx.lineTo(q, fieldH)
      ctx.stroke()
    }

    // The bird's band as a faint glow rising from its bracket, sounding or not: at rest the bed
    // shows where this song sits; while it plays, the bars rise through it.
    const glow = ctx.createLinearGradient(0, fieldH, 0, 0)
    glow.addColorStop(0, col.signal)
    glow.addColorStop(1, 'transparent')
    ctx.fillStyle = glow
    ctx.globalAlpha = 0.3
    ctx.fillRect(at(bp.lo), 0, at(bp.hi) - at(bp.lo), fieldH)
    ctx.globalAlpha = 1

    // Bars.
    const n = bars.current.length
    const spectrum = f?.spectrum ?? null
    const binHz = f?.binHz ?? 0
    if (live && spectrum && binHz > 0) {
      const fl = floors.current
      const dt = lastLive.current ? Math.min(0.1, (now - lastLive.current) / 1000) : 0
      lastLive.current = now
      for (let i = 0; i < n; i++) {
        const raw = sampleBand(spectrum, binHz, posHz(i / n), posHz((i + 1) / n))
        fl[i] = fl[i] === 0 || raw < fl[i] ? raw : fl[i] + FLOOR_RISE_PER_SEC * dt
        const v = shape(raw, fl[i])
        const old = bars.current[i]
        bars.current[i] = reduced || v > old ? v : old + (v - old) * 0.22
      }
    } else if (!live) {
      for (let i = 0; i < n; i++) bars.current[i] *= stateRef.current === 'paused' ? 1 : 0
    }
    // Energy outside the analysis band (engine.md §5.2: p10 / 1.6 to 1.6 · p90) does not drive the
    // plate, so it is drawn faint: the eye goes to what moves the sand.
    const drivenLo = Math.max(axisPos(250), bp.lo - LOG_1_6)
    const drivenHi = bp.hi + LOG_1_6
    ctx.fillStyle = col.signal
    const pitch = g.w / Math.max(1, n)
    const thick = Math.max(1, pitch - (pitch > 3 ? 1.5 : 0.75))
    for (let i = 0; i < n; i++) {
      const v = bars.current[i]
      if (v < 0.03) continue
      const p = (i + 0.5) / n
      const inBand = p >= drivenLo && p <= drivenHi
      ctx.globalAlpha = (live ? 0.85 : 0.4) * (inBand ? 1 : 0.32)
      const len = Math.max(1, v * fieldH)
      ctx.fillRect(at(p) - thick / 2, fieldH - len, thick, len)
    }
    ctx.globalAlpha = 1

    // Band bracket with a notch at the peak: the card's static fact, drawn on the live axis.
    ctx.strokeStyle = col.signal
    ctx.lineWidth = 2
    const a = at(bp.lo)
    const b = at(bp.hi)
    const pk = at(bp.peak)
    ctx.beginPath()
    ctx.moveTo(a, base - 6)
    ctx.lineTo(a, base)
    ctx.lineTo(b, base)
    ctx.lineTo(b, base - 6)
    ctx.moveTo(pk, base)
    ctx.lineTo(pk, base - 4)
    ctx.stroke()

    // Dominant-frequency hairline, its arrowhead resting on the bracket.
    const hz = live ? (f?.dominantHz ?? null) : null
    if (hz != null) {
      const q = Math.round(at(axisPos(hz))) + 0.5
      ctx.strokeStyle = col.ink
      ctx.fillStyle = col.ink
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(q, 0)
      ctx.lineTo(q, base - 6)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(q, base - 1)
      ctx.lineTo(q - 3.5, base - 6)
      ctx.lineTo(q + 3.5, base - 6)
      ctx.closePath()
      ctx.fill()
    }
    return k < 1
  }

  // Band changes tween from wherever the bracket is now.
  useEffect(() => {
    const tw = tween.current
    const next = toPos(band, peakHz)
    if (tw.to.lo === next.lo && tw.to.hi === next.hi && tw.to.peak === next.peak) return
    const now = performance.now()
    const k = tw.t0 === 0 ? 1 : easeInOutSine(Math.min(1, (now - tw.t0) / TWEEN_MS))
    tween.current = {
      from: {
        lo: tw.from.lo + (tw.to.lo - tw.from.lo) * k,
        hi: tw.from.hi + (tw.to.hi - tw.from.hi) * k,
        peak: tw.from.peak + (tw.to.peak - tw.from.peak) * k,
      },
      to: next,
      t0: now,
    }
    startIdle.current?.()
  }, [band, peakHz])

  // Size and DPR, with one static frame after every change.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const measure = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      geo.current = { w: r.width, h: r.height, dpr }
      c.width = Math.max(1, Math.round(r.width * dpr))
      c.height = Math.max(1, Math.round(r.height * dpr))
      const n = Math.max(16, Math.min(160, Math.floor(r.width / 4)))
      if (bars.current.length !== n) {
        bars.current = new Float32Array(n)
        floors.current = new Float32Array(n)
      }
      drawRef.current(null, performance.now())
    }
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    measure()
    // While --signal fades between two birds the idle canvas keeps drawing, so a resting bracket
    // lands on the new bird's colour (under reduced motion too, where the fade is shorter); its
    // end draws once more.
    const app = c.closest<HTMLElement>('.app')
    const onFade = (e: TransitionEvent) => {
      if (!app || e.target !== app || e.propertyName !== '--signal') return
      if (e.type === 'transitionrun') fadeUntil.current = performance.now() + longestTransition(app)
      startIdle.current?.()
    }
    for (const type of FADE_EVENTS) app?.addEventListener(type, onFade)
    return () => {
      ro.disconnect()
      for (const type of FADE_EVENTS) app?.removeEventListener(type, onFade)
    }
  }, [])

  // The live loop runs only while playing. Otherwise one static frame, then frames only while the
  // bracket tweens or the room's colours fade.
  useEffect(() => {
    let raf = 0
    if (state !== 'playing') {
      const step = (now: number) => {
        raf = 0
        if (drawRef.current(null, now) || now < fadeUntil.current) raf = requestAnimationFrame(step)
      }
      startIdle.current = () => {
        if (!raf) raf = requestAnimationFrame(step)
      }
      step(performance.now())
      return () => {
        cancelAnimationFrame(raf)
        startIdle.current = null
      }
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const minDt = reduced ? 1000 / 15 - 2 : 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < minDt) return
      last = now
      drawRef.current(api.features(), now)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [state, api])

  return (
    // Fills SongZone's bed.
    <div className="spectrum relative min-h-0 min-w-0 flex-auto no-js:hidden forced-colors:hidden">
      <canvas
        ref={canvasRef}
        className="spectrum__canvas absolute inset-0 size-full"
        role="img"
        aria-label={label}
      />
    </div>
  )
}

function toPos(band: BandHz, peakHz: number): BandPos {
  return { lo: axisPos(band.p10), hi: axisPos(band.p90), peak: axisPos(peakHz) }
}

/** An element's longest transition in ms (.app's colours share one duration). */
function longestTransition(el: Element): number {
  return Math.max(
    0,
    ...getComputedStyle(el)
      .transitionDuration.split(',')
      .map((d) => parseFloat(d) * (d.includes('ms') ? 1 : 1000) || 0),
  )
}

/** Peak magnitude over [f0, f1); narrow low bands interpolate between neighbouring bins. */
function sampleBand(s: Float32Array, binHz: number, f0: number, f1: number): number {
  const b0 = f0 / binHz
  const b1 = f1 / binHz
  const last = s.length - 1
  if (b1 - b0 < 1) {
    const x = Math.min(last, (b0 + b1) / 2)
    const i = Math.floor(x)
    const t = x - i
    return s[i] * (1 - t) + s[Math.min(last, i + 1)] * t
  }
  let m = 0
  for (let i = Math.max(0, Math.floor(b0)); i < Math.min(s.length, Math.ceil(b1)); i++) {
    if (s[i] > m) m = s[i]
  }
  return m
}
