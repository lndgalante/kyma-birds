import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// §13.3 import rule for the audio engine (src/audio/engine/**, minus tests and the browser-only
// harness): three-free and no DOM access at module scope (SSR on workerd).
const ROOT = join(import.meta.dirname, '..')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== '__tests__' && name !== '__harness__') out.push(...sources(p))
    } else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** Lines at nesting depth 0 (module scope), with strings and comments roughly stripped. */
function topLevelLines(src: string): string[] {
  const lines: string[] = []
  let depth = 0
  for (const raw of src.split('\n')) {
    const line = raw
      .replace(/\/\/.*$/, '')
      .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''")
    if (depth === 0) lines.push(line)
    for (const ch of line) {
      if (ch === '{' || ch === '(' || ch === '[') depth++
      else if (ch === '}' || ch === ')' || ch === ']') depth--
    }
  }
  return lines
}

describe('audio engine import rules', () => {
  const files = sources(ROOT)

  it('finds the engine sources', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it.each(files.map((f) => [relative(ROOT, f), f]))('%s is three-free', (_, file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/from\s+['"]three/)
  })

  it.each(files.map((f) => [relative(ROOT, f), f]))(
    '%s touches no window/document at module scope',
    (_, file) => {
      for (const line of topLevelLines(readFileSync(file, 'utf8'))) {
        expect(line).not.toMatch(/\b(window|document|navigator|matchMedia)\s*[.?]/)
      }
    },
  )
})
