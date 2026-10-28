// Mode banks: the 12 modes one bird's song is spread over (docs/specs/engine.md §6.3, §6.4, Appendix A).
import { DRIVE } from '../params'
import type { PlateBird, PlateShape } from '../types'
import { CIRCLE_MODES } from './circleTable'
import { qFromSpacing } from './response'

export type Symmetry = 3 | 4 | 5 | 6

export interface PlateBankDef {
  readonly shape: PlateShape
  readonly key: string // 'circle-s4' | 'square'
  readonly symmetry: 0 | Symmetry
  readonly size: number // 12
  readonly hero: number // 3
  readonly lambda: Float64Array
  readonly logLambda: Float64Array
  readonly coupling: Float64Array
  readonly q: Float64Array
  /** size·4 — circle: (lutRow, n, 0, 0); square: (m, n, k, 0). Copied verbatim into the uSlot uniform. */
  readonly slotParams: Float32Array
  readonly keys: readonly string[] // '(4,1)' / '(2,4)'
}

/** Bound on |φ| over the plate for every bank mode ((0,6) peaks at 5.44 at the centre). */
export const PHI_MAX: number = DRIVE.phiMax

// circleBank(s) row indices (derived by the rule in §6.3; tests assert equality). Hero = index 3 = (s,1).
// prettier-ignore
export const CIRCLE_FAMILY_ROWS = {
  3: [0, 1, 3, 4, 6, 8, 9, 11, 14, 15, 16, 18],   // (0,1)(3,0)(0,2)(3,1)(0,3)(3,2)(6,1)(0,4)(3,3)(6,2)(9,1)(0,5)
  4: [0, 2, 3, 5, 6, 10, 11, 13, 17, 18, 21, 23], // (0,1)(4,0)(0,2)(4,1)(0,3)(4,2)(0,4)(8,1)(4,3)(0,5)(8,2)(12,1)
  5: [0, 3, 6, 7, 11, 12, 18, 19, 20, 24, 25, 26],// (0,1)(0,2)(0,3)(5,1)(0,4)(5,2)(0,5)(10,1)(5,3)(0,6)(10,2)(5,4)
  6: [0, 3, 6, 9, 11, 15, 18, 22, 23, 24, 27, 28],// (0,1)(0,2)(0,3)(6,1)(0,4)(6,2)(0,5)(6,3)(12,1)(0,6)(6,4)(12,2)
} as const

// squareBank(): [m, n, Λ, k, P]   (hero index 3 = (2,4))
// prettier-ignore
export const SQUARE_MODES = [
  [0, 2,  4, 1, -2], [2, 2,  8, 1,  2], [0, 4, 16, 1,  2], [2, 4, 20, Math.SQRT2, -2 * Math.SQRT2],
  [4, 4, 32, 1,  2], [0, 6, 36, 1, -2], [2, 6, 40, Math.SQRT2, 2 * Math.SQRT2], [4, 6, 52, Math.SQRT2, -2 * Math.SQRT2],
  [0, 8, 64, 1,  2], [2, 8, 68, Math.SQRT2, -2 * Math.SQRT2], [6, 6, 72, 1, 2], [4, 8, 80, Math.SQRT2, 2 * Math.SQRT2],
] as const

/** Rows of CIRCLE_MODES in the s-fold rim-drive family: n % s = 0, n ≤ 12, deadR ≤ 0.52, by Λ, first 12. */
export function circleFamilyRows(s: Symmetry): number[] {
  const rows: number[] = []
  for (let i = 0; i < CIRCLE_MODES.length && rows.length < DRIVE.bankSize; i++) {
    const [n, , , , , , deadR] = CIRCLE_MODES[i]
    if (n % s === 0 && n <= DRIVE.family.nMax && deadR <= DRIVE.family.deadMax) rows.push(i)
  }
  return rows
}

function makeDef(
  shape: PlateShape,
  key: string,
  symmetry: 0 | Symmetry,
  lambda: number[],
  coupling: number[],
  slotParams: number[],
  keys: string[],
): PlateBankDef {
  const lam = Float64Array.from(lambda)
  return {
    shape,
    key,
    symmetry,
    size: lam.length,
    hero: DRIVE.hero,
    lambda: lam,
    logLambda: lam.map(Math.log),
    coupling: Float64Array.from(coupling),
    q: qFromSpacing(lam),
    slotParams: Float32Array.from(slotParams),
    keys: Object.freeze(keys),
  }
}

// Banks are immutable after construction; memoised so `configure()` compares by identity cheaply.
const circleCache = new Map<Symmetry, PlateBankDef>()
let squareCache: PlateBankDef | null = null

export function circleBank(s: Symmetry): PlateBankDef {
  let def = circleCache.get(s)
  if (!def) {
    const lambda: number[] = []
    const coupling: number[] = []
    const slots: number[] = []
    const keys: string[] = []
    for (const row of circleFamilyRows(s)) {
      const [n, c, lam, , , P] = CIRCLE_MODES[row]
      lambda.push(lam * lam)
      coupling.push(P)
      slots.push(row, n, 0, 0)
      keys.push(`(${n},${c})`)
    }
    def = makeDef('circle', `circle-s${s}`, s, lambda, coupling, slots, keys)
    circleCache.set(s, def)
  }
  return def
}

export function squareBank(): PlateBankDef {
  if (!squareCache) {
    const lambda: number[] = []
    const coupling: number[] = []
    const slots: number[] = []
    const keys: string[] = []
    for (const [m, n, L, k, P] of SQUARE_MODES) {
      lambda.push(L)
      coupling.push(P)
      slots.push(m, n, k, 0)
      keys.push(`(${m},${n})`)
    }
    squareCache = makeDef('square', 'square', 0, lambda, coupling, slots, keys)
  }
  return squareCache
}

/** 32-bit FNV-1a over UTF-16 code units. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** The bird's circle family: its override, else a stable hash pick. No bird → DRIVE.defaultSymmetry. */
export function symmetryFor(bird: Pick<PlateBird, 'id' | 'symmetry'> | null): Symmetry {
  if (!bird) return DRIVE.defaultSymmetry
  return bird.symmetry ?? DRIVE.symmetryChoices[fnv1a32(bird.id) % DRIVE.symmetryChoices.length]
}

export function bankFor(
  shape: PlateShape,
  bird: Pick<PlateBird, 'id' | 'symmetry'> | null,
): PlateBankDef {
  return shape === 'circle' ? circleBank(symmetryFor(bird)) : squareBank()
}
