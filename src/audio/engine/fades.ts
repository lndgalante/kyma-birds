// Equal-power crossfade curves. Each fade gain receives exactly one of these via
// setValueCurveAtTime, so no AudioParam ever holds two overlapping curves.

export const FADE_POINTS = 64

export const FADE_IN = Float32Array.from({ length: FADE_POINTS }, (_, i) =>
  Math.sin(((i / (FADE_POINTS - 1)) * Math.PI) / 2),
)

export const FADE_OUT = Float32Array.from({ length: FADE_POINTS }, (_, i) =>
  Math.cos(((i / (FADE_POINTS - 1)) * Math.PI) / 2),
)

export const dbToGain = (db: number): number => 10 ** (db / 20)

/** Slider value 0..1 → gain. Squared so the slider feels even across its travel. */
export const volumeTaper = (v: number): number => Math.min(1, Math.max(0, v)) ** 2
