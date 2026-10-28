import { describe, expect, it } from 'vitest'
import { EngineLoadError, SongCache } from '../SongCache'
import type { BirdSongAsset } from '../types'
import { createFakeFetch, FakeAudioBuffer, FakeAudioContext } from './FakeAudioContext'

function song(extra: Partial<BirdSongAsset> = {}): BirdSongAsset {
  return {
    id: 'a',
    src: '/birds/a/song.m4a',
    durationSec: 10,
    bandHz: { p10: 2000, p50: 3000, p90: 4000 },
    peakHz: 3000,
    ...extra,
  }
}

/** Decodes fail while `junk` holds; the bytes are the URL, so a re-fetch is visible in `net`. */
function setup() {
  const net = createFakeFetch()
  const cache = new SongCache({ fetch: net.fetch, budgetBytes: 2 ** 30 })
  const ctx = new FakeAudioContext()
  const state = { junk: true }
  ctx.autoDecode = (bytes) =>
    state.junk ? new Error('bad data') : new FakeAudioBuffer(1, 48000, 48000, 'ok')
  const decoder = ctx as unknown as BaseAudioContext
  return { net, cache, decoder, state }
}

describe('SongCache', () => {
  it('drops bytes that failed to decode, so the next load re-fetches them', async () => {
    const { net, cache, decoder, state } = setup()
    const err = await cache.load(decoder, song()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EngineLoadError)
    expect((err as EngineLoadError).code).toBe('decode')
    expect(net.calls).toHaveLength(1)
    state.junk = false
    const buf = await cache.load(decoder, song())
    expect(buf.duration).toBe(1)
    expect(net.calls).toHaveLength(2)
    expect(net.calls[1].init).toMatchObject({ cache: 'reload' })
    // Good bytes stay cached for a later re-decode, fetched normally.
    cache.fetchBytes('/birds/a/song.m4a')
    expect(net.calls).toHaveLength(2)
  })

  it('drops the fallback bytes too when both decodes fail', async () => {
    const { net, cache, decoder, state } = setup()
    const s = song({ fallbackSrc: '/birds/a/song.mp3' })
    await expect(cache.load(decoder, s)).rejects.toMatchObject({ code: 'decode' })
    expect(net.calls.map((c) => c.url)).toEqual(['/birds/a/song.m4a', '/birds/a/song.mp3'])
    state.junk = false
    await cache.load(decoder, s)
    expect(net.calls.map((c) => c.url)).toEqual([
      '/birds/a/song.m4a',
      '/birds/a/song.mp3',
      '/birds/a/song.m4a',
    ])
  })
})
