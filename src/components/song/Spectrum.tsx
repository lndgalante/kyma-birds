import { useEffect, useRef } from 'react'
import type { LiveFeatures } from '~/audio/AudioProvider'
import { useAudioApi, useAudioField } from '~/audio/useAudio'
import type { BandHz } from '~/lib/manifest'

// Log-frequency axis, low enough for the Kākāpō's ~305 Hz booms.
export const F_MIN = 125
export const F_MAX = 12000
const TICKS: Array<[number, string]> = [
  [250, '250'],
  [500, '500'],
  [1000, '1k'],
  [2000, '2k'],
  [4000, '4k'],
  [8000, '8k'],
]
const NARROW_TICKS = new Set([500, 2000, 8000])
const LOG_SPAN = Math.log(F_MAX / F_MIN)
const LOG_1_6 = Math.log(1.6) / LOG_SPAN
const TWEEN_MS = 480

/** 0..1 position of `hz` on the log axis. */
export const axisPos = (hz: number) =>
  Math.min(1, Math.max(0, Math.log(Math.max(hz, 1) / F_MIN) / LOG_SPAN))
const posHz = (p: number) => F_MIN * Math.exp(p * LOG_SPAN)

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// The engine's 0..1 spectrum is (dB + 100) / 80. Each bar subtracts its own slowly rising floor,
// so steady hiss and encoder noise drop out and the bird's syllables stand alone.
const FLOOR_RISE_PER_SEC = 0.03
const shape = (v: number, floor: number) =>
  Math.min(1, Math.max(0, (v - Math.max(floor, 0.22) - 0.04) / 0.45)) ** 1.15

interface Geometry {
  w: number
  h: number
  dpr: number
  axis: 'x' | 'y'
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
 * The live spectrum on a log-frequency axis (ui.md §5.3). Orientation comes from CSS
 * (`--spectrum-axis`: y in the Split spine, x in the strips), so SSR never guesses the layout.
 */
export function Spectrum({ band, peakHz, label }: SpectrumProps) {
  const api = useAudioApi()
  const state = useAudioField('state')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const geo = useRef<Geometry>({ w: 0, h: 0, dpr: 1, axis: 'y' })
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

  // Drawing lives in a ref so the rAF loop never needs React to re-render.
  drawRef.current = (f, now) => {
    const c = canvasRef.current
    const ctx = c?.getContext('2d')
    const g = geo.current
    if (!c || !ctx || g.w === 0 || g.h === 0) return false
    const cs = getComputedStyle(c)
    const col = {
      accent: cs.getPropertyValue('--accent').trim() || '#9fd6a5',
      ink: cs.getPropertyValue('--ink').trim() || '#f2f0ea',
      ink3: cs.getPropertyValue('--ink-3').trim() || '#a19e96',
      line: cs.getPropertyValue('--line').trim() || 'rgba(242,240,234,.12)',
      font: `400 11px ${cs.getPropertyValue('--font-mono').trim() || 'monospace'}`,
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const live = stateRef.current === 'playing'

    // Band bracket tween (log space, 480 ms ease-in-out).
    const tw = tween.current
    const k = tw.t0 === 0 || reduced ? 1 : Math.min(1, (now - tw.t0) / TWEEN_MS)
    const e = easeInOut(k)
    const bp: BandPos = {
      lo: tw.from.lo + (tw.to.lo - tw.from.lo) * e,
      hi: tw.from.hi + (tw.to.hi - tw.from.hi) * e,
      peak: tw.from.peak + (tw.to.peak - tw.from.peak) * e,
    }

    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0)
    ctx.clearRect(0, 0, g.w, g.h)
    ctx.font = col.font
    ctx.textBaseline = 'middle'

    const vertical = g.axis === 'y'
    // Layout: a gutter for tick labels, the bracket, then the bar field.
    const labelGutter = vertical ? 30 : 14
    const lenStart = vertical ? 6 : 0
    const lenEnd = vertical ? g.h - 6 : g.w
    const span = lenEnd - lenStart
    // Position along the frequency axis in CSS px (vertical: low at the bottom).
    const at = (p: number) => (vertical ? lenEnd - p * span : lenStart + p * span)
    const fieldStart = vertical ? labelGutter + 10 : 0
    const fieldEnd = vertical ? g.w - 7 : g.h - labelGutter - 6
    const depth = Math.abs(fieldEnd - fieldStart)

    // Ticks and grid.
    ctx.fillStyle = col.ink3
    ctx.strokeStyle = col.line
    ctx.lineWidth = 1
    ctx.textAlign = vertical ? 'left' : 'center'
    // A narrow strip keeps three labels; a sliver keeps none rather than overprint them.
    const narrow = !vertical && g.w < 260
    const labelled = vertical || g.w >= 120
    for (const [hz, text] of TICKS) {
      const q = Math.round(at(axisPos(hz))) + 0.5
      ctx.beginPath()
      if (vertical) {
        ctx.moveTo(fieldStart, q)
        ctx.lineTo(fieldEnd, q)
      } else {
        ctx.moveTo(q, 0)
        ctx.lineTo(q, fieldEnd)
      }
      ctx.stroke()
      if (!labelled || (narrow && !NARROW_TICKS.has(hz))) continue
      if (vertical) ctx.fillText(text, 0, q)
      else ctx.fillText(text, Math.min(g.w - 10, Math.max(10, q)), g.h - labelGutter / 2)
    }

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
    ctx.fillStyle = col.accent
    const pitch = span / Math.max(1, n)
    const thick = Math.max(1, pitch - (pitch > 3 ? 1.5 : 0.75))
    for (let i = 0; i < n; i++) {
      const v = bars.current[i]
      if (v < 0.03) continue
      const p = (i + 0.5) / n
      const inBand = p >= drivenLo && p <= drivenHi
      ctx.globalAlpha = (live ? 0.85 : 0.4) * (inBand ? 1 : 0.32)
      const len = Math.max(1, v * depth)
      const q = at(p)
      if (vertical) ctx.fillRect(fieldStart, q - thick / 2, len, thick)
      else ctx.fillRect(q - thick / 2, fieldEnd - len, thick, len)
    }
    ctx.globalAlpha = 1

    // Band bracket with a notch at the peak: the card's static fact, drawn on the live axis.
    ctx.strokeStyle = col.accent
    ctx.lineWidth = 2
    const a = at(bp.lo)
    const b = at(bp.hi)
    const pk = at(bp.peak)
    const base = vertical ? labelGutter + 3 : fieldEnd + 4
    ctx.beginPath()
    if (vertical) {
      ctx.moveTo(base + 6, a)
      ctx.lineTo(base, a)
      ctx.lineTo(base, b)
      ctx.lineTo(base + 6, b)
      ctx.moveTo(base, pk)
      ctx.lineTo(base + 4, pk)
    } else {
      ctx.moveTo(a, base - 6)
      ctx.lineTo(a, base)
      ctx.lineTo(b, base)
      ctx.lineTo(b, base - 6)
      ctx.moveTo(pk, base)
      ctx.lineTo(pk, base - 4)
    }
    ctx.stroke()

    // Dominant-frequency hairline, ending in an arrowhead on the plate side.
    const hz = live ? (f?.dominantHz ?? null) : null
    if (hz != null) {
      const q = Math.round(at(axisPos(hz))) + 0.5
      ctx.strokeStyle = col.ink
      ctx.fillStyle = col.ink
      ctx.lineWidth = 1
      ctx.beginPath()
      if (vertical) {
        ctx.moveTo(fieldStart - 4, q)
        ctx.lineTo(g.w - 1, q)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(g.w, q)
        ctx.lineTo(g.w - 5, q - 3.5)
        ctx.lineTo(g.w - 5, q + 3.5)
      } else {
        ctx.moveTo(q, 0)
        ctx.lineTo(q, fieldEnd + 6)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(q, fieldEnd + 10)
        ctx.lineTo(q - 3.5, fieldEnd + 5)
        ctx.lineTo(q + 3.5, fieldEnd + 5)
      }
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
    const k = tw.t0 === 0 ? 1 : easeInOut(Math.min(1, (now - tw.t0) / TWEEN_MS))
    tween.current = {
      from: {
        lo: tw.from.lo + (tw.to.lo - tw.from.lo) * k,
        hi: tw.from.hi + (tw.to.hi - tw.from.hi) * k,
        peak: tw.from.peak + (tw.to.peak - tw.from.peak) * k,
      },
      to: next,
      t0: now,
    }
    if (stateRef.current === 'playing') return
    let raf = 0
    const step = (t: number) => {
      if (drawRef.current(null, t)) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [band, peakHz])

  // Size, DPR and orientation; one static frame after every change.
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const measure = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const axis =
        getComputedStyle(c).getPropertyValue('--spectrum-axis').trim() === 'x' ? 'x' : 'y'
      geo.current = { w: r.width, h: r.height, dpr, axis }
      c.width = Math.max(1, Math.round(r.width * dpr))
      c.height = Math.max(1, Math.round(r.height * dpr))
      const len = axis === 'y' ? r.height - 12 : r.width
      const n = Math.max(16, Math.min(160, Math.floor(len / (axis === 'y' ? 5 : 4))))
      if (bars.current.length !== n) {
        bars.current = new Float32Array(n)
        floors.current = new Float32Array(n)
      }
      drawRef.current(null, performance.now())
    }
    const ro = new ResizeObserver(measure)
    ro.observe(c)
    measure()
    // Tick labels drawn before the mono face arrived would stay in the fallback font.
    void document.fonts?.ready.then(() => drawRef.current(null, performance.now()))
    return () => ro.disconnect()
  }, [])

  // The live loop runs only while playing; otherwise one static frame.
  useEffect(() => {
    if (state !== 'playing') {
      drawRef.current(null, performance.now())
      return
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const minDt = reduced ? 1000 / 15 - 2 : 0
    let raf = 0
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
    <div className="spectrum">
      <canvas ref={canvasRef} className="spectrum__canvas" role="img" aria-label={label} />
    </div>
  )
}

function toPos(band: BandHz, peakHz: number): BandPos {
  return { lo: axisPos(band.p10), hi: axisPos(band.p90), peak: axisPos(peakHz) }
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
