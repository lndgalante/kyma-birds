import { ANALYSIS } from './params'

type ClockContext = Pick<AudioContext, 'currentTime' | 'baseLatency'> & {
  getOutputTimestamp?: () => AudioTimestamp
  outputLatency?: number
}

/** AudioContext time of the sample reaching the listener at performance time `nowPerfMs`. */
export function heardTime(ctx: ClockContext, nowPerfMs: number): number {
  const ct = ctx.currentTime
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null
  const tsCtx = ts?.contextTime ?? 0
  const tsPerf = ts?.performanceTime ?? 0
  if (tsCtx > 0 && tsPerf > 0 && ct - tsCtx < 0.5) {
    return Math.min(ct, tsCtx + (nowPerfMs - tsPerf) / 1000)
  }
  const lat = ctx.outputLatency || ctx.baseLatency || 0
  return Math.max(0, ct - Math.min(ANALYSIS.maxLatencySec, Math.max(0, lat)))
}

/** 0..1 position of `heard` within a loop that started (at region.start) at context time `t0`. */
export function loopPosition(heard: number, t0: number, region: { start: number; end: number }) {
  const L = region.end - region.start
  if (!(L > 0) || heard < t0) return 0
  return ((heard - t0) % L) / L
}
