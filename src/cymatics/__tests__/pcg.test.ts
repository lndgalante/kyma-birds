import { describe, expect, it } from 'vitest'
import { INV_U32, PCG_GLSL, pcg3d, rand3, scatterSalt, u32ToUnit } from '../physics/pcg'
import { seeded } from './helpers'

/** Independent BigInt reference of the GLSL uint math. */
function pcgBig(x: number, y: number, z: number): [number, number, number] {
  const M = (1n << 32n) - 1n
  let a = BigInt(x >>> 0)
  let b = BigInt(y >>> 0)
  let c = BigInt(z >>> 0)
  a = (a * 1664525n + 1013904223n) & M
  b = (b * 1664525n + 1013904223n) & M
  c = (c * 1664525n + 1013904223n) & M
  a = (a + b * c) & M
  b = (b + c * a) & M
  c = (c + a * b) & M
  a ^= a >> 16n
  b ^= b >> 16n
  c ^= c >> 16n
  a = (a + b * c) & M
  b = (b + c * a) & M
  c = (c + a * b) & M
  return [Number(a), Number(b), Number(c)]
}

describe('pcg3d', () => {
  it('matches frozen vectors', () => {
    // Computed once from the formula (and cross-checked against the BigInt reference and a WebGL2 GPU).
    const cases: [number, number, number, number, number, number][] = [
      [0, 0, 0, 2611992518, 2833812075, 1058359340],
      [1, 2, 3, 4204755366, 1223881804, 1500469937],
      [0, 0, 0x2a5f, 465978975, 3106809249, 1200491000],
      [511, 511, 0x2a5f, 1539187150, 584156790, 3274377173],
      [0xffffffff, 0xffffffff, 0xffffffff, 2784268096, 2756918915, 1364953698],
      [123, 456, 0x9e3779b9, 1580912535, 4037492504, 3907451406],
    ]
    const out = new Uint32Array(3)
    for (const [x, y, z, a, b, c] of cases) expect([...pcg3d(x, y, z, out)]).toEqual([a, b, c])
  })

  it('wraps uint32 arithmetic exactly (BigInt reference)', () => {
    const rnd = seeded(99)
    const out = new Uint32Array(3)
    const edges = [0, 1, 0x7fffffff, 0x80000000, 0xfffffffe, 0xffffffff]
    for (const x of edges)
      for (const y of edges)
        for (const z of edges) expect([...pcg3d(x, y, z, out)]).toEqual(pcgBig(x, y, z))
    for (let i = 0; i < 2000; i++) {
      const x = Math.floor(rnd() * 2 ** 32)
      const y = Math.floor(rnd() * 2 ** 32)
      const z = Math.floor(rnd() * 2 ** 32)
      expect([...pcg3d(x, y, z, out)]).toEqual(pcgBig(x, y, z))
    }
  })

  it('takes inputs mod 2^32, like uint(...) of a negative or large index', () => {
    const a = new Uint32Array(3)
    const b = new Uint32Array(3)
    expect([...pcg3d(-1, 2 ** 32 + 5, 7, a)]).toEqual([...pcg3d(0xffffffff, 5, 7, b)])
  })
})

describe('rand3 / u32ToUnit', () => {
  it('mirrors GLSL float(h) * 2^-32, including the round-up to 1.0', () => {
    expect(INV_U32).toBe(2 ** -32)
    expect(u32ToUnit(0)).toBe(0)
    expect(u32ToUnit(0xffffffff)).toBe(1)
    expect(u32ToUnit(0xffffff7f)).toBeLessThan(1)
    expect(u32ToUnit(12345)).toBe(Math.fround(12345) * 2 ** -32)
    const r = rand3(3, 4, 5, new Float64Array(3))
    const h = pcg3d(3, 4, 5, new Uint32Array(3))
    expect([...r]).toEqual([...h].map((v) => Math.fround(v) * 2 ** -32))
  })

  it('scatter salt is uint(seed) * 747796405u + 1u', () => {
    expect(scatterSalt(0)).toBe(1)
    expect(scatterSalt(1)).toBe(747796406)
    expect(scatterSalt(7)).toBe(Number((7n * 747796405n + 1n) & 0xffffffffn))
  })

  it('exports the spec GLSL chunk', () => {
    expect(PCG_GLSL).toContain('v = v * 1664525u + 1013904223u;')
    expect(PCG_GLSL).toContain('vec3 rand3(uvec3 v) { return vec3(pcg3d(v)) * INV_U32; }')
    expect(PCG_GLSL).toContain('vec2 spawnPos(vec3 r, int shape, float rim)')
  })
})
