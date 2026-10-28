import { describe, expect, it } from 'vitest'
import { besselI, besselIp, besselJ, besselJp } from '../physics/bessel'
import { CIRCLE_MODES, circleRadial } from '../physics/circleTable'

const NU = 0.33

function freeEdgeResiduals(n: number, lam: number, C: number): [number, number] {
  const J = besselJ(n, lam)
  const Jp = besselJp(n, lam)
  const I = besselI(n, lam)
  const Ip = besselIp(n, lam)
  const a = lam * lam * J + (1 - NU) * (lam * Jp - n * n * J)
  const b = lam * lam * I - (1 - NU) * (lam * Ip - n * n * I)
  const c = lam ** 3 * Jp + (1 - NU) * n * n * (lam * Jp - J)
  const d = lam ** 3 * Ip - (1 - NU) * n * n * (lam * Ip - I)
  return [
    Math.abs(a - C * b) / (Math.abs(a) + Math.abs(C * b)),
    Math.abs(c - C * d) / (Math.abs(c) + Math.abs(C * d)),
  ]
}

function simpson(f: (r: number) => number, a: number, b: number, m = 4000): number {
  const h = (b - a) / m
  let s = f(a) + f(b)
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h)
  return (s * h) / 3
}

function ranks(v: number[]): number[] {
  const order = v.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0])
  const r = new Array<number>(v.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    for (let t = i; t <= j; t++) r[order[t][1]] = (i + j) / 2
    i = j + 1
  }
  return r
}

function pearson(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length
  const mb = b.reduce((s, x) => s + x, 0) / b.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

describe('CIRCLE_MODES', () => {
  it('has the 29 Appendix A rows', () => {
    expect(CIRCLE_MODES).toHaveLength(29)
  })

  it.each(CIRCLE_MODES.map((row, i) => [i, row] as const))(
    'row %i satisfies the free edge',
    (_, row) => {
      const [n, , lam, C] = row
      const [m, v] = freeEdgeResiduals(n, lam, C)
      expect(m).toBeLessThan(1e-6)
      expect(v).toBeLessThan(1e-6)
    },
  )

  it.each(CIRCLE_MODES.map((row, i) => [i, row] as const))(
    'row %i has c nodal circles',
    (_, row) => {
      const c = row[1]
      let changes = 0
      let prev = 0
      for (let i = 1; i <= 4000; i++) {
        const R = circleRadial(row, i / 4000)
        if (R !== 0 && prev !== 0 && Math.sign(R) !== Math.sign(prev)) changes++
        if (R !== 0) prev = R
      }
      expect(changes).toBe(c)
    },
  )

  it.each(CIRCLE_MODES.map((row, i) => [i, row] as const))('row %i is RMS-normalised', (_, row) => {
    const n = row[0]
    const integral = simpson((r) => circleRadial(row, r) ** 2 * r, 0, 1)
    expect(Math.abs((n === 0 ? 2 : 1) * integral - 1)).toBeLessThan(1e-6)
  })

  it.each(CIRCLE_MODES.map((row, i) => [i, row] as const))('row %i has P = N·R(1)', (_, row) => {
    expect(Math.abs(circleRadial(row, 1) - row[5])).toBeLessThan(1e-6)
  })

  it.each(CIRCLE_MODES.map((row, i) => [i, row] as const))(
    'row %i deadR matches the 10 % rule',
    (_, row) => {
      const [n, , , , , , deadR] = row
      const M = 4000
      let max = 0
      const abs: number[] = []
      for (let i = 0; i <= M; i++) {
        const v = Math.abs(circleRadial(row, i / M))
        abs.push(v)
        max = Math.max(max, v)
      }
      // |φ| = |R|·|cos| peaks at |R| for any n.
      const first = abs.findIndex((v) => v >= 0.1 * max) / M
      expect(Math.abs(first - deadR)).toBeLessThan(2e-3)
      if (n === 0) expect(deadR).toBe(0)
    },
  )

  it('is sorted by strictly increasing Λ', () => {
    for (let i = 1; i < CIRCLE_MODES.length; i++)
      expect(CIRCLE_MODES[i][2]).toBeGreaterThan(CIRCLE_MODES[i - 1][2])
  })

  it('follows Chladni’s law: Spearman ρ(Λ, (n + 2c)²) > 0.9', () => {
    const L = CIRCLE_MODES.map((r) => r[2] ** 2)
    const chladni = CIRCLE_MODES.map((r) => (r[0] + 2 * r[1]) ** 2)
    expect(pearson(ranks(L), ranks(chladni))).toBeGreaterThan(0.9)
  })

  it('matches the Appendix C radial reference values', () => {
    const refs: [number, number, number[]][] = [
      [4, 1, [0, 0.2356904401, 1.7414601432, 1.4779288321, -2.2022750929, -3.0349902204]],
      [3, 2, [0, 1.4300391465, 1.8067318054, -1.6296547679, 2.0850633438, 3.1507071331]],
      [
        0,
        3,
        [3.8462854423, 0.1241597812, -1.0617336375, 1.069386344, -1.4216424981, -2.0946019009],
      ],
      [12, 1, [0, 0.0002200625, 0.2496391835, 2.4279857742, -2.5242845295, -4.4242293703]],
    ]
    const radii = [0, 0.25, 0.5, 0.75, 1, 1.05]
    for (const [n, c, values] of refs) {
      const row = CIRCLE_MODES.find((r) => r[0] === n && r[1] === c)!
      radii.forEach((r, i) => expect(Math.abs(circleRadial(row, r) - values[i])).toBeLessThan(1e-8))
    }
  })
})
