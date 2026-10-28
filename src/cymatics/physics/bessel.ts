// Bessel functions of integer order by float64 power series (docs/specs/engine.md §6.2).
// Only the CPU evaluates them (LUT bake, tests); the GPU reads the baked radial LUT.

/** J_n(x), power series in float64. |abs err| ≤ 3.1e-8 for n ≤ 12, 0 ≤ x ≤ 24 (measured); ~1e-15 for x ≤ 5. */
export function besselJ(n: number, x: number): number {
  const h = 0.5 * x
  let term = 1
  for (let i = 1; i <= n; i++) term *= h / i
  let sum = term
  const h2 = -h * h
  for (let k = 1; k < 200; k++) {
    term *= h2 / (k * (k + n))
    sum += term
    if (Math.abs(term) < 1e-17 * Math.abs(sum) && k > h) break
  }
  return sum
}

/** I_n(x), power series (all terms positive: relative error ~1e-15). */
export function besselI(n: number, x: number): number {
  const h = 0.5 * x
  let term = 1
  for (let i = 1; i <= n; i++) term *= h / i
  let sum = term
  const h2 = h * h
  for (let k = 1; k < 200; k++) {
    term *= h2 / (k * (k + n))
    sum += term
    if (term < 1e-17 * sum && k > h) break
  }
  return sum
}

/** dJ_n/dx. */
export const besselJp = (n: number, x: number): number =>
  n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x))

/** dI_n/dx. */
export const besselIp = (n: number, x: number): number =>
  n === 0 ? besselI(1, x) : 0.5 * (besselI(n - 1, x) + besselI(n + 1, x))
