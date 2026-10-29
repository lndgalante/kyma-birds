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
    expect(cn('text-2xs', 'text-xs')).toBe('text-xs')
    expect(cn('font-ui', 'font-medium')).toBe('font-medium')
    expect(cn('tracking-label', 'tracking-normal')).toBe('tracking-normal')
    expect(cn('bg-scrim/55', 'bg-(--status)')).toBe('bg-(--status)')
    expect(cn('shadow-plate', 'shadow-dialog')).toBe('shadow-dialog')
    expect(cn('ease-out', 'ease-sheet')).toBe('ease-sheet')
    expect(cn('animate-spin', 'animate-gate-pulse-2')).toBe('animate-gate-pulse-2')
  })

  it('keeps a size and a colour side by side', () => {
    expect(cn('text-2xs', 'text-ink-2')).toBe('text-2xs text-ink-2')
  })

  it('keeps a line-height next to a later text size', () => {
    expect(cn('leading-none', 'text-sm')).toBe('leading-none text-sm')
    expect(cn('leading-[1.2]', 'text-2xs')).toBe('leading-[1.2] text-2xs')
    expect(cn('leading-none', 'leading-[1.2]')).toBe('leading-[1.2]')
  })
})
