import { describe, expect, it } from 'vitest'
import { SITE_TITLE } from '~/lib/site'

describe('smoke', () => {
  it('resolves the ~ alias and reads the site title', () => {
    expect(SITE_TITLE).toBe('Kyma Birds')
  })
})
