import { describe, expect, it } from 'vitest'
import { textLinkVariants } from '~/components/ui/text-link'
import { cn } from '~/lib/utils'

const classes = (s: string) => s.split(' ')

describe('cn', () => {
  it('keeps hook classes that look like utilities', () => {
    const out = classes(cn('text-link', textLinkVariants({ layout: 'flex' })))
    expect(out).toContain('text-link')
    expect(out).toContain('text-ink-2')
    expect(classes(cn('caption field-label prose', 'text-ink'))).toEqual([
      'caption',
      'field-label',
      'prose',
      'text-ink',
    ])
  })

  it('merges the Kyma colours and scales', () => {
    expect(cn('text-ink', 'text-ink-3')).toBe('text-ink-3')
    expect(cn('text-xs', 'text-md')).toBe('text-md')
    expect(cn('font-normal', 'font-medium')).toBe('font-medium')
    expect(cn('tracking-title', 'tracking-normal')).toBe('tracking-normal')
    expect(cn('bg-scrim/55', 'bg-(--status)')).toBe('bg-(--status)')
    expect(cn('rounded-part', 'rounded-full')).toBe('rounded-full')
    expect(cn('shadow-sheet', 'shadow-dialog')).toBe('shadow-dialog')
    expect(cn('ease-out', 'ease-sheet')).toBe('ease-sheet')
    expect(cn('ease-out', 'ease-breath')).toBe('ease-breath')
    expect(cn('animate-spin', 'animate-breathe')).toBe('animate-breathe')
  })

  it('reads font-display as the family, not a weight', () => {
    expect(cn('font-display', 'font-medium')).toBe('font-display font-medium')
    expect(cn('font-sans', 'font-display')).toBe('font-display')
  })

  it('keeps a size and a colour side by side', () => {
    expect(cn('text-xs', 'text-ink-2')).toBe('text-xs text-ink-2')
  })

  it('keeps a line-height next to a later text size', () => {
    expect(cn('leading-none', 'text-sm')).toBe('leading-none text-sm')
    expect(cn('leading-[1.2]', 'text-xs')).toBe('leading-[1.2] text-xs')
    expect(cn('leading-none', 'leading-[1.2]')).toBe('leading-[1.2]')
  })
})
