import { AUDIO } from './params'
import type { BirdSongAsset, EngineErrorCode } from './types'

export class EngineLoadError extends Error {
  readonly code: EngineErrorCode
  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineLoadError'
    this.code = code
  }
}

export const isAbortError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError'

const abortError = () => new DOMException('The load was superseded', 'AbortError')

interface BytesEntry {
  promise: Promise<ArrayBuffer>
  ctrl: AbortController
  waiters: number // committed loads still waiting; the fetch is aborted when this drops to 0
  pinned: boolean // a prefetch wants it: never aborted
  settled: boolean
}

type Decoder = Pick<BaseAudioContext, 'decodeAudioData'>

export interface SongCacheOptions {
  fetch: typeof fetch
  budgetBytes: number
  byteEntries?: number
}

/**
 * Two LRUs: compressed bytes by src (deduped in-flight fetches, 6 entries) and decoded
 * AudioBuffers by song id (bounded by length × channels × 4 bytes).
 */
export class SongCache {
  private readonly bytes = new Map<string, BytesEntry>()
  private readonly decoded = new Map<string, AudioBuffer>()
  private readonly decoding = new Map<string, Promise<AudioBuffer>>()
  private readonly reload = new Set<string>() // srcs whose last bytes failed to decode
  private decodedBytes = 0
  private readonly opts: Required<SongCacheOptions>

  constructor(opts: SongCacheOptions) {
    this.opts = { byteEntries: AUDIO.byteCacheEntries, ...opts }
  }

  /**
   * Compressed bytes for `src`. A `signal` makes this caller a waiter: aborting it rejects this
   * call with AbortError and cancels the network request once no other caller needs it.
   */
  fetchBytes(src: string, init: { signal?: AbortSignal; prefetch?: boolean } = {}) {
    let e = this.bytes.get(src)
    if (e) {
      this.bytes.delete(src)
      this.bytes.set(src, e)
    } else {
      e = this.startFetch(src, !!init.prefetch)
    }
    const entry = e
    if (init.prefetch) entry.pinned = true
    const signal = init.signal
    if (!signal) return entry.promise
    if (signal.aborted) return Promise.reject(abortError())
    entry.waiters++
    return new Promise<ArrayBuffer>((resolve, reject) => {
      let done = false
      const onAbort = () => {
        if (done) return
        done = true
        entry.waiters--
        if (!entry.settled && entry.waiters <= 0 && !entry.pinned) {
          entry.ctrl.abort()
          if (this.bytes.get(src) === entry) this.bytes.delete(src)
        }
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      entry.promise.then(
        (buf) => {
          if (done) return
          done = true
          entry.waiters--
          signal.removeEventListener('abort', onAbort)
          resolve(buf)
        },
        (err: unknown) => {
          if (done) return
          done = true
          entry.waiters--
          signal.removeEventListener('abort', onAbort)
          reject(err)
        },
      )
    })
  }

  hasDecoded(id: string): boolean {
    return this.decoded.has(id)
  }

  getDecoded(id: string): AudioBuffer | undefined {
    const buf = this.decoded.get(id)
    if (buf) {
      this.decoded.delete(id)
      this.decoded.set(id, buf)
    }
    return buf
  }

  /**
   * Fetch (as a waiter on `signal`) and decode `song`. Decodes are deduped by id and are never
   * cancelled: a decode that outlives its load still lands in the cache.
   */
  async load(ctx: Decoder, song: BirdSongAsset, signal?: AbortSignal): Promise<AudioBuffer> {
    const hit = this.getDecoded(song.id)
    if (hit) return hit
    const inflight = this.decoding.get(song.id)
    if (inflight) return inflight
    const bytes = await this.fetchBytes(song.src, { signal })
    // Another caller may have started (or finished) the decode while we were fetching.
    const again = this.getDecoded(song.id) ?? this.decoding.get(song.id)
    if (again) return again
    const p = this.decodeWithFallback(ctx, song, bytes)
    this.decoding.set(song.id, p)
    try {
      const buf = await p
      this.store(song.id, buf)
      return buf
    } finally {
      if (this.decoding.get(song.id) === p) this.decoding.delete(song.id)
    }
  }

  clear(): void {
    for (const e of this.bytes.values()) if (!e.settled) e.ctrl.abort()
    this.bytes.clear()
    this.decoded.clear()
    this.decoding.clear()
    this.reload.clear()
    this.decodedBytes = 0
  }

  private async decodeWithFallback(ctx: Decoder, song: BirdSongAsset, bytes: ArrayBuffer) {
    try {
      // decodeAudioData detaches its input; the cached bytes must survive for a later re-decode.
      return await ctx.decodeAudioData(bytes.slice(0))
    } catch (primary) {
      if (!song.fallbackSrc) {
        this.dropUndecodable(song.src)
        throw new EngineLoadError('decode', describe(primary))
      }
      try {
        const alt = await this.fetchBytes(song.fallbackSrc)
        return await ctx.decodeAudioData(alt.slice(0))
      } catch (fallback) {
        this.dropUndecodable(song.src)
        this.dropUndecodable(song.fallbackSrc)
        throw new EngineLoadError('decode', describe(fallback))
      }
    }
  }

  /**
   * A 200 that is not audio (a captive portal's HTML page) must not be decoded again on retry():
   * forget the bytes and re-fetch them past the HTTP cache. An in-flight entry is left alone.
   */
  private dropUndecodable(src: string): void {
    const e = this.bytes.get(src)
    if (!e?.settled) return
    this.bytes.delete(src)
    this.reload.add(src)
  }

  private startFetch(src: string, prefetch: boolean): BytesEntry {
    const ctrl = new AbortController()
    // `promise` is assigned below; its handlers need the entry itself.
    const entry = { ctrl, waiters: 0, pinned: prefetch, settled: false } as BytesEntry
    const init: RequestInit = {
      signal: ctrl.signal,
      priority: prefetch ? 'low' : 'auto',
      credentials: 'same-origin',
    }
    if (this.reload.delete(src)) init.cache = 'reload'
    entry.promise = this.opts
      .fetch(src, init)
      .then(
        (res) => {
          if (!res.ok) throw new EngineLoadError('network', `HTTP ${res.status} for ${src}`)
          return res.arrayBuffer()
        },
        (err: unknown) => {
          if (isAbortError(err)) throw err
          throw new EngineLoadError('network', describe(err))
        },
      )
      .then(
        (buf) => {
          entry.settled = true
          return buf
        },
        (err: unknown) => {
          entry.settled = true
          if (this.bytes.get(src) === entry) this.bytes.delete(src)
          throw err
        },
      )
    // Nobody may be listening (a pinned prefetch); keep rejections from surfacing as unhandled.
    entry.promise.catch(() => {})
    this.bytes.set(src, entry)
    this.evictBytes()
    return entry
  }

  private evictBytes(): void {
    for (const [src, e] of this.bytes) {
      if (this.bytes.size <= this.opts.byteEntries) return
      if (e.settled || (e.waiters === 0 && !e.pinned)) this.bytes.delete(src)
    }
  }

  private store(id: string, buf: AudioBuffer): void {
    const size = bufferBytes(buf)
    const old = this.decoded.get(id)
    if (old) {
      this.decodedBytes -= bufferBytes(old)
      this.decoded.delete(id)
    }
    this.decoded.set(id, buf)
    this.decodedBytes += size
    for (const [key, b] of this.decoded) {
      if (this.decodedBytes <= this.opts.budgetBytes || this.decoded.size <= 1) break
      if (key === id) continue
      this.decoded.delete(key)
      this.decodedBytes -= bufferBytes(b)
    }
  }
}

const bufferBytes = (b: AudioBuffer) => b.length * b.numberOfChannels * 4

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
