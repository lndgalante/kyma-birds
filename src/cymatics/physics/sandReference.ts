// CPU port of FIELD_FRAG + SCATTER_FRAG + SAND_STEP_FRAG (docs/specs/engine.md §6.1, §7.1–§7.3), for tests
// and debugging only. It mirrors the GLSL line by line, including texel-centre addressing, GL LinearFilter
// (clamp-to-edge) sampling, float32 state storage and the PCG streams, so GPU output can be compared with it.
import { DRIVE, SIM } from '../params'
import type { PlateShape } from '../types'
import type { FieldDrive } from './ModeBank'
import { PCG_SALT, rand3, scatterSalt } from './pcg'
import { sampleRadialLut } from './radialLut'

const TAU = 6.283185307
const HALF_PI = 1.5707963268

/**
 * The field render target: res × res texels of (U1, U2, ∂I/∂x, ∂I/∂y) over [−ext, ext]², stored like the GL
 * texture: offset (j·res + i)·4, row j = 0 at y = −ext (bottom), texel centre p = ((i+0.5, j+0.5)/res·2 − 1)·ext.
 */
export interface FieldGrid {
  readonly res: number
  readonly ext: number
  readonly data: Float32Array
}

export function createFieldGrid(res: number = SIM.fieldRes, ext: number = SIM.fieldExt): FieldGrid {
  return { res, ext, data: new Float32Array(res * res * 4) }
}

export interface FieldOptions {
  shape: PlateShape
  /** Radial LUT from bakeRadialLut() (circle only). */
  lut: Float32Array
  lutWidth?: number
  lutRMax?: number
  /** Bolt flat zone radius: square SIM.boltFlatR, circle 0. Defaults by shape. */
  boltR?: number
  /** Round the output to IEEE half floats, like the RGBA16F render target. */
  halfFloat?: boolean
}

/** Slot arrays the field pass consumes (a FieldDrive satisfies it). */
export type FieldSlots = Pick<FieldDrive, 'count' | 'slots' | 'coefs'>

const radial = new Float64Array(2)
const point = new Float64Array(4)

/** FIELD_FRAG at plate point (x, y): out = (U1, U2, ∂I/∂x, ∂I/∂y). Allocation-free. */
export function evalField(
  x: number,
  y: number,
  drive: FieldSlots,
  opts: FieldOptions,
  out: Float64Array,
): Float64Array {
  const lutWidth = opts.lutWidth ?? SIM.lutWidth
  const lutRMax = opts.lutRMax ?? SIM.lutRMax
  const boltR = opts.boltR ?? (opts.shape === 'square' ? SIM.boltFlatR : 0)
  const count = Math.min(drive.count, DRIVE.maxSlots)
  const { slots, coefs } = drive
  let u1 = 0
  let u2 = 0
  let g1x = 0
  let g1y = 0
  let g2x = 0
  let g2y = 0
  const r = Math.max(Math.hypot(x, y), 1e-4)
  const erx = x / r
  const ery = y / r
  if (opts.shape === 'circle') {
    const etx = -ery
    const ety = erx
    const th = Math.atan2(y, x) - HALF_PI // θ − θ0, θ0 = π/2
    for (let i = 0; i < count; i++) {
      const row = Math.trunc(slots[i * 4] + 0.5)
      const n = slots[i * 4 + 1]
      const c1 = coefs[i * 2]
      const c2 = coefs[i * 2 + 1]
      sampleRadialLut(opts.lut, row, r, radial, lutWidth, lutRMax)
      const cn = Math.cos(n * th)
      const sn = Math.sin(n * th)
      const phi = radial[0] * cn
      const ga = radial[1] * cn
      const gb = (-n * radial[0] * sn) / r
      const gx = ga * erx + gb * etx
      const gy = ga * ery + gb * ety
      u1 += c1 * phi
      u2 += c2 * phi
      g1x += c1 * gx
      g1y += c1 * gy
      g2x += c2 * gx
      g2y += c2 * gy
    }
  } else {
    const ax = (x + 1) * HALF_PI // πX
    const ay = (y + 1) * HALF_PI // πY
    for (let i = 0; i < count; i++) {
      const m = slots[i * 4]
      const n = slots[i * 4 + 1]
      const kk = slots[i * 4 + 2]
      const c1 = coefs[i * 2]
      const c2 = coefs[i * 2 + 1]
      const cmx = Math.cos(m * ax)
      const cnx = Math.cos(n * ax)
      const cmy = Math.cos(m * ay)
      const cny = Math.cos(n * ay)
      const smx = Math.sin(m * ax)
      const snx = Math.sin(n * ax)
      const smy = Math.sin(m * ay)
      const sny = Math.sin(n * ay)
      const phi = kk * (cmx * cny + cnx * cmy)
      const gx = kk * HALF_PI * (-m * smx * cny - n * snx * cmy)
      const gy = kk * HALF_PI * (-n * cmx * sny - m * cnx * smy)
      u1 += c1 * phi
      u2 += c2 * phi
      g1x += c1 * gx
      g1y += c1 * gy
      g2x += c2 * gx
      g2y += c2 * gy
    }
    if (boltR > 0) {
      const e0 = 0.55 * boltR
      const t = Math.min(1, Math.max(0, (r - e0) / (boltR - e0)))
      const h = t * t * (3 - 2 * t)
      const dh = (6 * t * (1 - t)) / (boltR - e0)
      g1x = h * g1x + u1 * dh * erx
      g1y = h * g1y + u1 * dh * ery
      g2x = h * g2x + u2 * dh * erx
      g2y = h * g2y + u2 * dh * ery
      u1 *= h
      u2 *= h
    }
  }
  out[0] = u1
  out[1] = u2
  out[2] = 2 * (u1 * g1x + u2 * g2x)
  out[3] = 2 * (u1 * g1y + u2 * g2y)
  return out
}

/** The field pass over the whole grid (one FIELD_FRAG invocation per texel). */
export function renderField(grid: FieldGrid, drive: FieldSlots, opts: FieldOptions): FieldGrid {
  const { res, ext, data } = grid
  const half = opts.halfFloat === true
  for (let j = 0; j < res; j++) {
    const y = (((j + 0.5) / res) * 2 - 1) * ext
    for (let i = 0; i < res; i++) {
      const x = (((i + 0.5) / res) * 2 - 1) * ext
      evalField(x, y, drive, opts, point)
      const o = (j * res + i) * 4
      for (let c = 0; c < 4; c++) data[o + c] = half ? toHalf(point[c]) : point[c]
    }
  }
  return grid
}

/** `texture(uField, p / (2·ext) + 0.5)` with LinearFilter and ClampToEdge. Allocation-free. */
export function sampleField(
  grid: FieldGrid,
  x: number,
  y: number,
  out: Float64Array,
): Float64Array {
  const { res, ext, data } = grid
  const u = (x / (2 * ext) + 0.5) * res - 0.5
  const v = (y / (2 * ext) + 0.5) * res - 0.5
  const fi = Math.floor(u)
  const fj = Math.floor(v)
  const tu = u - fi
  const tv = v - fj
  const i0 = Math.min(res - 1, Math.max(0, fi))
  const i1 = Math.min(res - 1, Math.max(0, fi + 1))
  const j0 = Math.min(res - 1, Math.max(0, fj))
  const j1 = Math.min(res - 1, Math.max(0, fj + 1))
  const o00 = (j0 * res + i0) * 4
  const o10 = (j0 * res + i1) * 4
  const o01 = (j1 * res + i0) * 4
  const o11 = (j1 * res + i1) * 4
  for (let c = 0; c < 4; c++) {
    const a = data[o00 + c] + (data[o10 + c] - data[o00 + c]) * tu
    const b = data[o01 + c] + (data[o11 + c] - data[o01 + c]) * tu
    out[c] = a + (b - a) * tv
  }
  return out
}

/** The tState texture: w × h grains, texel (x, y, mob, visibleFrom) at offset (ty·w + tx)·4. */
export interface SandState {
  readonly w: number
  readonly h: number
  readonly data: Float32Array
}

export function createSandState(w: number, h: number): SandState {
  return { w, h, data: new Float32Array(w * h * 4) }
}

const rnd = new Float64Array(3)
const spawn = new Float64Array(2)

/** GLSL spawnPos(r, shape, rim) → out[0..1]. */
export function spawnPos(
  r0: number,
  r1: number,
  shape: PlateShape,
  rim: number,
  out: Float64Array,
): Float64Array {
  if (shape === 'circle') {
    const rr = rim * Math.sqrt(r0)
    const a = TAU * r1
    out[0] = rr * Math.cos(a)
    out[1] = rr * Math.sin(a)
  } else {
    out[0] = (r0 * 2 - 1) * 0.98
    out[1] = (r1 * 2 - 1) * 0.98
  }
  return out
}

/** SCATTER_FRAG into the state: uniform positions, mob 0, visible from clock + pour·u. */
export function scatterSand(
  state: SandState,
  seed: number,
  clock: number,
  pour: number,
  shape: PlateShape,
  rim: number = SIM.rim,
): void {
  const salt = scatterSalt(seed)
  const { w, h, data } = state
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      rand3(tx, ty, salt, rnd)
      spawnPos(rnd[0], rnd[1], shape, rim, spawn)
      const o = (ty * w + tx) * 4
      data[o] = spawn[0]
      data[o + 1] = spawn[1]
      data[o + 2] = 0
      data[o + 3] = clock + pour * rnd[2]
    }
  }
}

/** SAND_STEP_FRAG uniforms, by name without the `u` prefix. */
export interface SandStepUniforms {
  shape: PlateShape
  frame: number // uFrame: integer step counter (exact in float32 below 2^24)
  clock: number
  dt: number
  gMax: number
  sigma: number
  kappa: number
  w: number
  gSat: number
  driftMax: number
  kick: number // 1 + SIM.onsetKick·onset (1 under reduced motion)
  thetaLo: number
  thetaHi: number
  heavyFrac: number
  heavyMul: number
  rim: number
  trickle: number // respawn probability per substep (square trickle: SIM.trickleRate·SIM.dt)
}

export function sandUniforms(
  shape: PlateShape,
  overrides: Partial<SandStepUniforms> = {},
): SandStepUniforms {
  return {
    shape,
    frame: 0,
    clock: 0,
    dt: SIM.dt,
    gMax: SIM.gMax,
    sigma: SIM.sigma,
    kappa: SIM.kappa,
    w: SIM.w,
    gSat: SIM.gSat,
    driftMax: SIM.driftMax,
    kick: 1,
    thetaLo: SIM.thetaLo,
    thetaHi: SIM.thetaHi,
    heavyFrac: SIM.heavyFrac[shape],
    heavyMul: SIM.heavyMul,
    rim: SIM.rim,
    trickle: 0,
    ...overrides,
  }
}

/** Per-grain lift-off threshold θᵢ (GLSL: mix(θlo, θhi, k.x)·(k.y < heavyFrac ? heavyMul : 1)). */
export function grainTheta(tx: number, ty: number, u: SandStepUniforms): number {
  rand3(tx, ty, PCG_SALT.grainConst, rnd)
  const theta = u.thetaLo + (u.thetaHi - u.thetaLo) * rnd[0]
  return rnd[1] < u.heavyFrac ? theta * u.heavyMul : theta
}

const fs = new Float64Array(4)

/** One SAND_STEP_FRAG pass over every grain, in place. Returns how many grains respawned. */
export function stepSand(state: SandState, field: FieldGrid, u: SandStepUniforms): number {
  const { w, h, data } = state
  const square = u.shape === 'square'
  const frame = u.frame >>> 0
  const trickleSalt = (frame ^ PCG_SALT.trickle) >>> 0
  const sqrtDt = Math.sqrt(u.dt)
  const g2 = u.gMax * u.gMax
  let respawned = 0
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const o = (ty * w + tx) * 4
      let px = data[o]
      let py = data[o + 1]
      let vis = data[o + 3]
      const theta = grainTheta(tx, ty, u)
      sampleField(field, px, py, fs)
      const gam = u.gMax * Math.sqrt(fs[0] * fs[0] + fs[1] * fs[1])
      let mob = Math.min(1, Math.max(0, (gam - theta) / u.w))
      if (mob > 0) {
        rand3(tx, ty, frame, rnd)
        const rad = Math.sqrt(-2 * Math.log(Math.max(rnd[0], 1e-7)))
        const xi0 = rad * Math.cos(TAU * rnd[1])
        const xi1 = rad * Math.sin(TAU * rnd[1])
        let dx = -u.kappa * mob * g2 * fs[2] * u.dt
        let dy = -u.kappa * mob * g2 * fs[3] * u.dt
        const dl = Math.hypot(dx, dy)
        if (dl > u.driftMax) {
          dx *= u.driftMax / dl
          dy *= u.driftMax / dl
        }
        const hop = u.sigma * u.kick * mob * Math.min(gam, u.gSat) * sqrtDt
        px += dx + xi0 * hop
        py += dy + xi1 * hop
        if (!square) {
          const rr = Math.hypot(px, py)
          if (rr > u.rim) {
            const s = Math.max(2 * u.rim - rr, 0.5 * u.rim) / rr
            px *= s
            py *= s
          }
        } else {
          if (Math.abs(px) >= 1) px = Math.sign(px) * 2 - px
          if (Math.abs(py) >= 1) py = Math.sign(py) * 2 - py
          px = Math.min(1, Math.max(-1, px))
          py = Math.min(1, Math.max(-1, py))
        }
      }
      rand3(tx, ty, trickleSalt, rnd)
      const bad = !(Math.abs(px) < 4 && Math.abs(py) < 4)
      if (bad || rnd[2] < u.trickle) {
        spawnPos(rnd[0], rnd[1], u.shape, u.rim, spawn)
        px = spawn[0]
        py = spawn[1]
        vis = u.clock + 0.15 * rnd[0]
        mob = 0
        respawned++
      }
      data[o] = px
      data[o + 1] = py
      data[o + 2] = mob
      data[o + 3] = vis
    }
  }
  return respawned
}

const f32 = new Float32Array(1)
const u32 = new Uint32Array(f32.buffer)

/** Round to the nearest IEEE half (ties to even), returned as a number. Overflow → ±Infinity. */
export function toHalf(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x
  const a = Math.abs(x)
  if (a >= 65520) return Math.sign(x) * Infinity
  f32[0] = a
  const e = ((u32[0] >>> 23) & 0xff) - 127
  // Half normals keep 10 mantissa bits; below 2^-14 the spacing is fixed at 2^-24.
  const ulp = 2 ** (Math.max(e, -14) - 10)
  const q = a / ulp
  let r = Math.round(q)
  if (r - q === 0.5 && r % 2 === 1) r -= 1
  return Math.sign(x) * r * ulp
}
