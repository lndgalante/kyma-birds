// Import rule for the plate (docs/specs/engine.md §1, §13.3): three only in gpu/** and CymaticsPlate.tsx;
// everything the shell or SSR can reach stays three-free and touches no DOM at module scope.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name.startsWith('__') ? [] : sources(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

const files = sources(ROOT).map((p) => ({ rel: relative(ROOT, p), text: readFileSync(p, 'utf8') }))
const importsThree = (text: string) => /from\s+['"]three(\/[^'"]*)?['"]/.test(text)

// Three-free and SSR-safe: the shell may import these during server rendering.
const SSR_SAFE = (rel: string) =>
  rel.startsWith('physics/') ||
  ['types.ts', 'params.ts', 'describeMode.ts', 'index.ts'].includes(rel)
// Pure GPU helpers: unit-tested in node, so they must not need three either.
const PURE_GPU = ['gpu/shaders.ts', 'gpu/tier.ts', 'gpu/governor.ts', 'gpu/layout.ts']

describe('cymatics import rule', () => {
  it('finds the source tree', () => {
    expect(files.some((f) => f.rel === 'gpu/PlateController.ts')).toBe(true)
  })

  it('imports three only from gpu/** and CymaticsPlate.tsx', () => {
    for (const f of files) {
      if (!importsThree(f.text)) continue
      expect(f.rel.startsWith('gpu/') || f.rel === 'CymaticsPlate.tsx', f.rel).toBe(true)
    }
  })

  it('keeps SSR-reachable modules and the pure GPU helpers three-free', () => {
    for (const f of files) {
      if (SSR_SAFE(f.rel) || PURE_GPU.includes(f.rel))
        expect(importsThree(f.text), f.rel).toBe(false)
    }
  })

  it('touches no window/document at module scope in SSR-reachable modules', () => {
    for (const f of files.filter((x) => SSR_SAFE(x.rel) || PURE_GPU.includes(x.rel))) {
      const topLevel = f.text
        .split('\n')
        .filter((line) => /^\S/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
      for (const line of topLevel)
        expect(/\b(window|document)\./.test(line), `${f.rel}: ${line}`).toBe(false)
    }
  })

  it('the index (the shell entry) never pulls in the renderer', () => {
    const index = files.find((f) => f.rel === 'index.ts')!
    expect(index.text).not.toMatch(/CymaticsPlate|gpu\//)
  })
})
