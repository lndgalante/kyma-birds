// pcg3d (Jarzynski & Olano 2020), bit-identical to the GLSL chunk in docs/specs/engine.md §7.3.
// uint32 arithmetic: Math.imul wraps the product mod 2^32, `>>> 0` wraps sums back to uint32.

/** 2^-32. Exactly representable in float32, so GLSL's `vec3(h) * INV_U32` only rounds in the uint→float cast. */
export const INV_U32 = 2.3283064365386963e-10

/** Third-component salts used by the GLSL shaders (kept here so CPU ports use the same streams). */
export const PCG_SALT = {
  grainConst: 0x2a5f, // SAND_STEP: per-grain threshold / heavy flag
  trickle: 0x9e3779b9, // SAND_STEP: uint(uFrame) ^ trickle → respawn draw
  scatterMul: 747796405, // SCATTER: uint(uSeed) * scatterMul + 1
  grainLook: [0x51, 0x7b], // GRAIN_VERT constants: uvec3(id, 0x51, 0x7B)
  grainJitter: 0x11, // GRAIN_VERT jitter: uvec3(id, uint(uFrame), 0x11)
  plateDither: 7, // PLATE_FRAG static dither
} as const

/** Writes pcg3d(x, y, z) as three uint32 into `out` and returns it. Inputs are taken mod 2^32. */
export function pcg3d(x: number, y: number, z: number, out: Uint32Array): Uint32Array {
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0
  z = (Math.imul(z, 1664525) + 1013904223) >>> 0
  x = (x + Math.imul(y, z)) >>> 0
  y = (y + Math.imul(z, x)) >>> 0
  z = (z + Math.imul(x, y)) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  y = (y ^ (y >>> 16)) >>> 0
  z = (z ^ (z >>> 16)) >>> 0
  x = (x + Math.imul(y, z)) >>> 0
  y = (y + Math.imul(z, x)) >>> 0
  z = (z + Math.imul(x, y)) >>> 0
  out[0] = x
  out[1] = y
  out[2] = z
  return out
}

/** GLSL `float(h) * INV_U32`: the cast rounds to float32 (24-bit mantissa), so values near 2^32 give 1.0. */
export function u32ToUnit(h: number): number {
  return Math.fround(h) * INV_U32
}

const scratch = new Uint32Array(3)

/** GLSL `rand3(uvec3(x, y, z))` → out[0..2] ∈ [0, 1]. Allocation-free. */
export function rand3(x: number, y: number, z: number, out: Float64Array): Float64Array {
  pcg3d(x, y, z, scratch)
  out[0] = u32ToUnit(scratch[0])
  out[1] = u32ToUnit(scratch[1])
  out[2] = u32ToUnit(scratch[2])
  return out
}

/** SCATTER_FRAG's third component for a scatter seed: uint(uSeed) * 747796405u + 1u. */
export function scatterSalt(seed: number): number {
  return (Math.imul(seed >>> 0, PCG_SALT.scatterMul) + 1) >>> 0
}

/**
 * The PCG chunk to prepend to FIELD/SAND_STEP/SCATTER/GRAIN_VERT/PLATE_FRAG (GLSL ES 3.00 via ShaderMaterial).
 * Verified bit-identical to `pcg3d` above on a real WebGL2 GPU.
 */
export const PCG_GLSL = /* glsl */ `
const float INV_U32 = 2.3283064365386963e-10;
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 rand3(uvec3 v) { return vec3(pcg3d(v)) * INV_U32; }
vec2 spawnPos(vec3 r, int shape, float rim) {
  if (shape == 0) { float rr = rim * sqrt(r.x); float a = 6.283185307 * r.y; return rr * vec2(cos(a), sin(a)); }
  return (r.xy * 2.0 - 1.0) * 0.98;
}
`
