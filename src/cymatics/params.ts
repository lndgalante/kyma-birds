// Single source of truth for the plate (docs/specs/engine.md §12.2). GLSL receives these values as
// uniforms/defines; physics and the GPU layer both read them from here. Three-free and SSR-safe.

export const SIM = {
  dt: 1 / 60,
  maxSubsteps: 3,
  // Spec: 6. The stuck band around a nodal line is θ/(gMax·D·|∇φ|) wide, so 8 draws lines a
  // quarter thinner: closer to reference 1's crisp lines at the integrated 500–860 px plate.
  gMax: 8,
  sigma: 0.09,
  kappa: 4e-4,
  w: 0.3,
  gSat: 4,
  driftMax: 0.02,
  thetaLo: 0.6,
  thetaHi: 1.4,
  heavyMul: 3,
  heavyFrac: { circle: 0.2, square: 0.04 },
  rim: 0.985,
  trickleRate: 0.004,
  onsetKick: 0.8,
  fieldRes: 256,
  fieldExt: 1.05,
  lutWidth: 1024,
  lutRMax: 1.05,
  boltFlatR: 0.15,
  pourSec: 0.6,
  scatterPourSec: 0.6,
  shapeSwapPourSec: 0.5,
  grainFadeSec: 0.35,
} as const

export const DRIVE = {
  bankSize: 12,
  hero: 3,
  anchors: [1, 3, 7] as const,
  beta: 0.3,
  qMin: 10,
  qMax: 120,
  topK: 6,
  gamma: 0.5,
  coefAttack: 0.08,
  coefReleaseMorph: 0.6,
  coefReleaseGap: 0.3,
  coefReleaseStop: 0.12,
  maxSlots: 24,
  slotEps: 1e-3,
  fieldDirtyEps: 2e-4,
  dominanceRatio: 1.3,
  dominanceHoldSec: 0.1,
  // Bound on |φ| for every bank mode on the plate. The spec's 4.5 missed the n = 0 centres of (0,5)
  // and (0,6) (4.97, 5.44), which would let canMove report false while centre grains can still lift off.
  phiMax: 5.5,
  telemetryHz: 8,
  circleTheta0: Math.PI / 2,
  family: { nMax: 12, deadMax: 0.52 },
  symmetryChoices: [3, 4, 5, 6] as const,
  // Used only when no bird is configured yet (bird === null): reference 2 is a 4-fold plate.
  defaultSymmetry: 4,
  // ModeBank gates: a line drives only above this level; dominance needs at least this energy.
  minDrive: 1e-3,
  dominanceFloor: 1e-6,
} as const

export const LOOK = {
  extent: { circle: 1.035, square: 1.0 },
  // Mean grey of an untouched layer. Lines are ~8× denser and must saturate to sand white; much higher
  // and resting sand reads as TV static, much lower and lines turn grey.
  coat: { circle: 0.15, square: 0.15 },
  sand: '#F3EFE6',
  rim: '#DEDBD3',
  rimWidth: 0.03,
  boltR: 0.024,
  jitterPx: 0.6,
  flicker: 0.5,
  shapeSec: 0.42,
  shapeEase: [0.77, 0, 0.175, 1] as const,
  grainFadeOutSec: 0.16,
  // Plate surface, display sRGB: centre → edge.
  plate: {
    circleIn: '#141416',
    circleOut: '#0C0C0E',
    squareIn: '#0D0D0D',
    squareOut: '#0A0A0A',
  },
  // Per-grain spread: size and brightness multipliers (each grain draws one value from each range).
  grainSize: [0.8, 1.3] as const,
  // A wide spread reads as distinct grains of salt instead of even grey noise.
  grainAlpha: [0.25, 1.0] as const,
  // uPointPx = grainCss · dpr · clamp(√(plateCssPx / 560), grainSizeMin, grainSizeMax).
  grainSizeMin: 0.8,
  grainSizeMax: 1.4,
  alphaMin: 0.03,
} as const

export const TIERS = {
  // ~1.6 device px per grain at 2x keeps single grains crisp; 2 px soft dots blur.
  high: { w: 512, h: 512, dprCap: 2, grainCss: 0.8 },
  medium: { w: 512, h: 256, dprCap: 2, grainCss: 1.0 },
  low: { w: 256, h: 256, dprCap: 1.5, grainCss: 1.15 },
  floor: { w: 256, h: 128, dprCap: 1.5, grainCss: 1.3 },
  governor: {
    warmupSec: 3,
    ring: 120,
    checkSec: 0.5,
    p75Ms: 22,
    checks: 4,
    capLo: 31,
    capHi: 35.5,
    capShare: 0.8,
    maxDowngrades: 2,
  },
} as const
