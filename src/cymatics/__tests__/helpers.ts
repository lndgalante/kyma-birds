// Shared test helpers (not a test file).

type AnyCtor = abstract new (...args: never[]) => unknown

const TRACKED = [
  'Array',
  'Float64Array',
  'Float32Array',
  'Int32Array',
  'Uint32Array',
  'Uint8Array',
  'Map',
  'Set',
] as const

/**
 * Counts array/collection constructions while `fn` runs, by swapping the globals for counting proxies.
 * Literals (`[]`, `{}`) are invisible to this; it catches the typed-array and `new Array` cases that matter.
 */
export function countAllocations(fn: () => void): number {
  const g = globalThis as unknown as Record<string, AnyCtor>
  const saved = TRACKED.map((name) => g[name])
  let count = 0
  TRACKED.forEach((name, i) => {
    g[name] = new Proxy(saved[i], {
      construct(target, args, newTarget) {
        count++
        return Reflect.construct(
          target as unknown as new (...a: unknown[]) => object,
          args,
          newTarget,
        )
      },
      apply(target, thisArg, args) {
        count++
        return Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args)
      },
    })
  })
  try {
    fn()
  } finally {
    TRACKED.forEach((name, i) => {
      g[name] = saved[i]
    })
  }
  return count
}

/** mulberry32: tiny seeded PRNG for reproducible test points. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
