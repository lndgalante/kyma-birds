import type { PlateShape } from './types'

export function describeMode(shape: PlateShape, modeKey: string): string {
  const m = /^\((\d+),\s*(\d+)\)$/.exec(modeKey)
  if (!m) return `Mode ${modeKey}`
  const a = Number(m[1])
  const b = Number(m[2])
  const head = `Mode (${a}, ${b})`
  const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
  if (shape === 'circle')
    return a === 0
      ? `${head}: ${pl(b, 'nodal circle')}, no nodal diameters.`
      : `${head}: ${pl(a, 'nodal diameter')} and ${b === 0 ? 'no nodal circles' : pl(b, 'nodal circle')}.`
  if (a === 0) return `${head}: ${b} half-waves across the plate, in both directions at once.`
  if (a === b) return `${head}: ${a} half-waves along each side.`
  return `${head}: ${a} and ${b} half-waves across the plate, in both directions at once.`
}

export const MAPPING_SENTENCE =
  'Each song is spread over twelve resonant modes of the plate: the bird’s most frequent note lands on the plate’s signature pattern, lower notes reach simpler patterns and higher notes more intricate ones.'
