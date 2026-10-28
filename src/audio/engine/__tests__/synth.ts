// Synthetic AnalyserNode frames: Blackman-windowed tones over a noise floor, in dBFS per bin,
// as getFloatFrequencyData reports them (|X[k]| / N, Blackman α = 0.16).

export const FFT = 2048

const blackman = (() => {
  const w = new Float64Array(FFT)
  for (let n = 0; n < FFT; n++) {
    w[n] = 0.42 - 0.5 * Math.cos((2 * Math.PI * n) / FFT) + 0.08 * Math.cos((4 * Math.PI * n) / FFT)
  }
  return w
})()

/** Magnitude spectrum (dB) of a windowed sine at `cycles` per frame, evaluated at bin k. */
export function windowedToneDb(cycles: number, k: number, amp = 1): number {
  let re = 0
  let im = 0
  for (let n = 0; n < FFT; n++) {
    const x = amp * Math.sin((2 * Math.PI * cycles * n) / FFT) * blackman[n]
    const ph = (-2 * Math.PI * k * n) / FFT
    re += x * Math.cos(ph)
    im += x * Math.sin(ph)
  }
  return 20 * Math.log10(Math.hypot(re, im) / FFT + 1e-30)
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const lobeCache = new Map<string, Float64Array>()

/** Main-lobe shape (dB re peak amplitude 1) for a tone at fractional bin offset `frac`. */
function lobe(frac: number): Float64Array {
  const key = frac.toFixed(3)
  let l = lobeCache.get(key)
  if (!l) {
    l = new Float64Array(9)
    for (let i = 0; i < 9; i++) l[i] = windowedToneDb(16 + frac, 16 + i - 4)
    lobeCache.set(key, l)
  }
  return l
}

/**
 * Fills `out` with noise at `noiseDb` per bin (exponentially distributed power, like a
 * periodogram) plus optional tones { hz, db } where db is the tone's level re full scale.
 */
export function frameDb(
  out: Float32Array,
  sampleRate: number,
  noiseDb: number,
  tones: { hz: number; db: number }[],
  rand: () => number,
): void {
  const binHz = sampleRate / FFT
  const pn = 10 ** (noiseDb / 10)
  const pow = new Float64Array(out.length)
  for (let b = 0; b < out.length; b++) pow[b] = pn * -Math.log(1 - rand())
  for (const t of tones) {
    const pos = t.hz / binHz
    const center = Math.round(pos)
    const frac = Math.round((pos - center) * 1000) / 1000
    const shape = lobe(frac)
    for (let i = 0; i < 9; i++) {
      const b = center + i - 4
      if (b < 0 || b >= out.length) continue
      pow[b] += 10 ** ((shape[i] + t.db) / 10)
    }
  }
  for (let b = 0; b < out.length; b++) out[b] = 10 * Math.log10(pow[b])
}
