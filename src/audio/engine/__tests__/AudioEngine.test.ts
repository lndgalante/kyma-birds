import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioEngine, WebAudioEngine } from '../AudioEngine'
import {
  createDriveFrame,
  createSongFeatures,
  SERVER_SNAPSHOT,
  type BirdSongAsset,
  type EngineState,
} from '../types'
import {
  createFakeFetch,
  FakeAudioBuffer,
  FakeAudioContext,
  FakeTimers,
  flush,
  type FakeBufferSource,
} from './FakeAudioContext'

const PRIMING = 2112 / 44100

function song(id: string, extra: Partial<BirdSongAsset> = {}): BirdSongAsset {
  return {
    id,
    src: `/birds/${id}/song.m4a`,
    durationSec: 10,
    bandHz: { p10: 2000, p50: 3000, p90: 4000 },
    peakHz: 3000,
    ...extra,
  }
}

function bufferFor(tag: string, sampleRate = 48000) {
  return new FakeAudioBuffer(1, Math.round((10 + PRIMING) * sampleRate), sampleRate, tag)
}

function setup(status: Record<string, number> = {}) {
  const ctx = new FakeAudioContext()
  const timers = new FakeTimers()
  const net = createFakeFetch(status)
  const createContext = vi.fn(() => ctx as unknown as AudioContext)
  const engine = createAudioEngine({
    createContext,
    fetch: net.fetch,
    now: timers.now,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    memoryClass: 'desktop',
  }) as WebAudioEngine
  const states: EngineState[] = []
  engine.onState((s) => states.push(s.state))

  /** Advances audio clock and timers together in 5 ms steps. */
  async function tick(ms: number) {
    for (let t = 0; t < ms; t += 5) {
      ctx.advance(0.005)
      timers.advance(5)
      await flush()
    }
  }

  /** Settles the pending decode of `id` (by the URL its bytes came from). */
  async function decode(id: string, outcome: 'ok' | 'fail' = 'ok') {
    const i = ctx.pendingDecodes.findIndex((d) =>
      FakeAudioContext.tagOf(d.bytes).includes(`/birds/${id}/`),
    )
    if (i < 0) throw new Error(`no pending decode for ${id}`)
    const [d] = ctx.pendingDecodes.splice(i, 1)
    if (outcome === 'ok') d.resolve(bufferFor(FakeAudioContext.tagOf(d.bytes)))
    else d.reject(new DOMException('bad data', 'EncodingError'))
    await flush()
  }

  /** Song voices only (primeInGesture also creates a one-sample source). */
  const voices = () => ctx.sources.filter((s) => s.loop)
  const tagOf = (s: FakeBufferSource) => (s.buffer as FakeAudioBuffer).tag
  // Graph gains in creation order: bus, analyserSink, pause, volume, mute.
  const graphGain = (name: 'pause' | 'volume' | 'mute') =>
    ctx.gains[{ pause: 2, volume: 3, mute: 4 }[name]]

  /** Unlocked and playing `id`. */
  async function playing(id = 'a') {
    engine.load(song(id))
    await flush()
    const p = engine.listen()
    await flush()
    await decode(id)
    await p
  }

  return {
    ctx,
    timers,
    net,
    createContext,
    engine,
    states,
    tick,
    decode,
    voices,
    tagOf,
    graphGain,
    playing,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WebAudioEngine', () => {
  it('starts from the server snapshot and keeps snapshot identity until a change', () => {
    const { engine } = setup()
    const s = engine.getSnapshot()
    expect(s).toEqual(SERVER_SNAPSHOT)
    expect(engine.getSnapshot()).toBe(s)
    engine.setVolume(0.7)
    expect(engine.getSnapshot()).toBe(s) // no-op change
    engine.setVolume(0.4)
    expect(engine.getSnapshot()).not.toBe(s)
    expect(engine.getSnapshot().volume).toBe(0.4)
  })

  it('fetches on load while idle without creating a context', async () => {
    const { engine, createContext, net } = setup()
    engine.load(song('a'))
    await flush()
    expect(createContext).not.toHaveBeenCalled()
    expect(net.calls.map((c) => c.url)).toEqual(['/birds/a/song.m4a'])
    expect(net.calls[0].init).toMatchObject({ priority: 'auto', credentials: 'same-origin' })
    expect(net.calls[0].init?.headers).toBeUndefined()
    expect(engine.getSnapshot()).toMatchObject({ state: 'idle', songId: 'a', unlocked: false })
    expect(engine.analyser).toBeNull()
  })

  it('creates the context synchronously in listen() and goes loading → playing', async () => {
    const { engine, ctx, createContext, net, states, decode, voices } = setup()
    engine.load(song('a'))
    await flush()
    const p = engine.listen()
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(ctx.resumeCalls).toBe(1) // resumed inside the gesture
    expect(engine.getSnapshot().unlocked).toBe(true)
    await flush()
    expect(engine.getSnapshot().state).toBe('loading')
    await decode('a')
    await p
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', songId: 'a', playingId: 'a' })
    expect(states.indexOf('loading')).toBeGreaterThan(-1)
    expect(states.indexOf('loading')).toBeLessThan(states.lastIndexOf('playing'))
    expect(net.calls).toHaveLength(1) // the idle fetch is reused
    const [v] = voices()
    expect(v.loopStart).toBeCloseTo(PRIMING, 9) // unpadded AAC → trimmed region
    expect(v.loopEnd - v.loopStart).toBeCloseTo(10, 9)
    expect(v.startOffset).toBe(v.loopStart)
    expect(v.startTime).toBeCloseTo(ctx.currentTime + 0.02, 9)
    expect(engine.analyser).not.toBeNull()
    expect(engine.driveSource.isAudible()).toBe(true)
  })

  it('pauses on listen() without a committed song', async () => {
    const { engine } = setup()
    await engine.listen()
    expect(engine.getSnapshot()).toMatchObject({ state: 'paused', unlocked: true, songId: null })
  })

  it('plays only the latest of A → B → C when decodes land C, A, B, and caches A and B', async () => {
    const { engine, ctx, decode, voices, tagOf } = setup()
    await engine.listen()
    engine.load(song('a'))
    await flush()
    engine.load(song('b'))
    await flush()
    engine.load(song('c'))
    await flush()
    expect(ctx.pendingDecodes).toHaveLength(3)
    await decode('c')
    await decode('a')
    await decode('b')
    expect(voices().map(tagOf)).toEqual(['/birds/c/song.m4a'])
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', playingId: 'c' })
    const decodes = ctx.decodeCalls
    engine.load(song('a'))
    await flush()
    engine.load(song('b'))
    await flush()
    expect(ctx.decodeCalls).toBe(decodes)
    expect(voices().map(tagOf)).toEqual([
      '/birds/c/song.m4a',
      '/birds/a/song.m4a',
      '/birds/b/song.m4a',
    ])
  })

  it('never gives a param two curves, even when a voice retires during its fade-in', async () => {
    const { engine, ctx, tick, voices } = setup()
    ctx.autoDecode = (bytes) => bufferFor(FakeAudioContext.tagOf(bytes))
    await engine.listen()
    engine.load(song('a'))
    await tick(100) // A is 80 ms into its 1.2 s fade-in
    engine.load(song('b'))
    await tick(50)
    engine.load(song('c'))
    await tick(30)
    engine.load(song('a')) // a fourth voice: the first A is over the cap and fades out in 40 ms
    await tick(1000)
    expect(voices()).toHaveLength(4)
    for (const g of ctx.gains) expect(g.gain.curveCount).toBeLessThanOrEqual(1)
    const curved = (sec: number) =>
      ctx.gains.filter((g) =>
        g.gain.log.some((e) => e.type === 'curve' && Math.abs(e.duration - sec) < 1e-9),
      )
    const fadeIns = curved(1.2)
    const fadeOuts = curved(0.9)
    expect(fadeIns).toHaveLength(4)
    expect(fadeOuts).toHaveLength(3)
    expect(curved(0.04)).toHaveLength(1) // the first A's trim
    const [aIn] = fadeIns
    const [aOut] = fadeOuts
    const inCurve = aIn.gain.log[0] as { time: number; duration: number }
    const outCurve = aOut.gain.log[0] as { time: number }
    expect(outCurve.time).toBeLessThan(inCurve.time + inCurve.duration) // retired mid fade-in
  })

  it('retires the old voice when a decode takes longer than 700 ms', async () => {
    const { engine, tick, decode, voices, playing } = setup()
    await playing('a')
    const [a] = voices()
    engine.load(song('b'))
    await tick(690)
    expect(engine.getSnapshot().state).toBe('loading')
    expect(a.stopTime).toBeNull()
    await tick(20)
    expect(a.stopTime).not.toBeNull() // fading out over 900 ms
    expect(engine.getSnapshot().playingId).toBeNull()
    await decode('b')
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', playingId: 'b' })
  })

  it('keeps the old voice through a fast decode and crossfades', async () => {
    const { engine, tick, decode, voices, playing } = setup()
    await playing('a')
    const [a] = voices()
    engine.load(song('b'))
    await tick(200)
    expect(a.stopTime).toBeNull()
    await decode('b')
    expect(a.stopTime).toBeCloseTo(voices()[1].startTime! + 0.9 + 0.05, 9)
    expect(engine.getSnapshot().playingId).toBe('b')
  })

  it('stays paused on load() while paused and plays the pending song on play()', async () => {
    const { engine, ctx, tick, decode, voices, tagOf, playing } = setup()
    await playing('a')
    engine.pause()
    await tick(750)
    expect(ctx.state).toBe('suspended')
    engine.load(song('b'))
    await flush()
    expect(engine.getSnapshot()).toMatchObject({ state: 'paused', songId: 'b', playingId: null })
    expect(engine.inspect().voices).toHaveLength(0) // A hard-stopped while suspended
    await decode('b')
    expect(engine.getSnapshot().state).toBe('paused')
    expect(voices()).toHaveLength(1)
    await engine.play()
    expect(ctx.state).toBe('running')
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', playingId: 'b' })
    expect(voices().map(tagOf)).toEqual(['/birds/a/song.m4a', '/birds/b/song.m4a'])
  })

  it('leaves no half-faded voice behind when load() lands within 700 ms of pause()', async () => {
    const { engine, ctx, tick, decode, playing } = setup()
    await playing('a')
    engine.pause()
    await tick(300)
    engine.load(song('b'))
    await flush()
    expect(engine.inspect().voices).toMatchObject([{ id: 'a', retiring: true }]) // still running
    await tick(420)
    expect(ctx.state).toBe('suspended')
    expect(engine.inspect().voices).toHaveLength(0) // stopped behind pauseGain, not frozen mid-fade
    await decode('b')
    await engine.play()
    expect(engine.inspect().voices).toMatchObject([{ id: 'b', retiring: false }])
  })

  it('hard-stops on load() while the suspend is still pending', async () => {
    const { engine, ctx, tick, decode, playing } = setup()
    await playing('a')
    let land = () => {}
    const suspend = ctx.suspend.bind(ctx)
    ctx.suspend = () => new Promise<void>((r) => (land = () => void suspend().then(r)))
    engine.pause()
    await tick(710)
    expect(ctx.state).toBe('running') // suspend() requested, not landed
    engine.load(song('b'))
    expect(engine.inspect().voices).toHaveLength(0)
    land()
    await flush()
    expect(ctx.state).toBe('suspended')
    await decode('b')
    await engine.play()
    expect(engine.inspect().voices).toMatchObject([{ id: 'b', retiring: false }])
  })

  it('starts one voice when play/pause/play race a slow decode', async () => {
    const { engine, tick, decode, playing } = setup()
    await playing('a')
    engine.pause()
    await tick(750)
    engine.load(song('b'))
    await flush()
    void engine.play()
    await flush()
    expect(engine.getSnapshot().state).toBe('loading')
    engine.toggle()
    void engine.play()
    await flush()
    await decode('b')
    expect(engine.inspect().voices).toMatchObject([{ id: 'b', retiring: false }])
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', playingId: 'b' })
  })

  it('makes isAudible() false synchronously on pause() and suspends after 700 ms', async () => {
    const { engine, ctx, tick, graphGain, playing } = setup()
    await playing('a')
    expect(engine.driveSource.isAudible()).toBe(true)
    engine.pause()
    expect(engine.driveSource.isAudible()).toBe(false)
    expect(engine.getSnapshot().state).toBe('paused')
    expect(graphGain('pause').gain.events.at(-1)).toMatchObject({ target: 0, tau: 0.12 })
    await tick(695)
    expect(ctx.suspendCalls).toBe(0) // the release (5 τ = 600 ms) plays out first
    await tick(10)
    expect(ctx.suspendCalls).toBe(1)
    expect(ctx.state).toBe('suspended')
    expect(engine.getSnapshot().interrupted).toBe(false) // our own suspend is not an interruption
    await engine.play()
    expect(engine.getSnapshot().state).toBe('playing')
    expect(graphGain('pause').gain.events.at(-1)).toMatchObject({ target: 1, tau: 0.1 })
  })

  it('does not suspend when play() follows pause() within 700 ms', async () => {
    const { engine, ctx, tick, playing } = setup()
    await playing('a')
    engine.pause()
    await tick(650)
    engine.toggle()
    await tick(1000)
    expect(ctx.suspendCalls).toBe(0)
    expect(engine.getSnapshot().state).toBe('playing')
    expect(engine.inspect().voices).toHaveLength(1) // same voice continues
  })

  it('reports an interruption as paused + interrupted and recovers when the context runs again', async () => {
    const { engine, ctx, playing } = setup()
    await playing('a')
    ctx.setState('interrupted')
    expect(engine.getSnapshot()).toMatchObject({ state: 'paused', interrupted: true })
    expect(engine.driveSource.isAudible()).toBe(false)
    ctx.setState('running')
    await flush()
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', interrupted: false })
    expect(engine.driveSource.isAudible()).toBe(true)
  })

  it('resumes synchronously in play() after an interruption', async () => {
    const { engine, ctx, playing } = setup()
    await playing('a')
    ctx.setState('suspended') // not requested by us → interruption
    expect(engine.getSnapshot().interrupted).toBe(true)
    const before = ctx.resumeCalls
    const p = engine.play()
    expect(ctx.resumeCalls).toBe(before + 1)
    await p
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', interrupted: false })
  })

  it('uses the v² volume taper and mutes without touching the volume', async () => {
    const { engine, graphGain, playing } = setup()
    engine.setVolume(0.5)
    await playing('a')
    expect(graphGain('volume').gain.value).toBe(0.25)
    engine.setVolume(0.8)
    expect(graphGain('volume').gain.lastTarget()).toBeCloseTo(0.64, 12)
    engine.setMuted(true)
    expect(graphGain('mute').gain.events.at(-1)).toMatchObject({ target: 0, tau: 0.015 }) // instant
    expect(engine.getSnapshot()).toMatchObject({ volume: 0.8, muted: true })
    expect(graphGain('volume').gain.lastTarget()).toBeCloseTo(0.64, 12)
    engine.setMuted(false)
    expect(graphGain('mute').gain.lastTarget()).toBe(1)
    engine.setVolume(3)
    expect(engine.getSnapshot().volume).toBe(1)
    // Muting is "watch silently": the plate still hears the song.
    engine.setMuted(true)
    expect(engine.driveSource.isAudible()).toBe(true)
  })

  it('caps simultaneous voices at 3', async () => {
    const { engine, ctx, tick, voices } = setup()
    ctx.autoDecode = (bytes) => bufferFor(FakeAudioContext.tagOf(bytes))
    await engine.listen()
    let maxVoices = 0
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      engine.load(song(id))
      await tick(10)
      maxVoices = Math.max(maxVoices, engine.inspect().voices.length)
    }
    expect(voices()).toHaveLength(5)
    expect(maxVoices).toBe(3)
    expect(
      voices()
        .slice(0, 2)
        .every((s) => s.stopTime !== null),
    ).toBe(true)
    await tick(1000)
    expect(engine.inspect().voices.map((v) => v.id)).toEqual(['e'])
  })

  it('fades a voice over the cap out in 40 ms instead of cutting it', async () => {
    const { engine, ctx, tick, voices } = setup()
    ctx.autoDecode = (bytes) => bufferFor(FakeAudioContext.tagOf(bytes))
    await engine.listen()
    engine.load(song('a', { gainDb: -6 }))
    await tick(100)
    const [a] = voices()
    const gainsBefore = ctx.gains.length
    for (const id of ['b', 'c']) {
      engine.load(song(id))
      await tick(100)
    }
    expect(a.ended).toBe(false) // still in its 0.9 s tail
    const capAt = ctx.currentTime
    engine.load(song('d'))
    await flush()
    expect(engine.inspect().voices.map((v) => v.id)).toEqual(['b', 'c', 'd'])
    // A's trim (the first gain it created) ramps from its own level to silence, then it stops.
    const trim = ctx.gains[gainsBefore - 3]
    const ramp = trim.gain.log.find((e) => e.type === 'curve')
    expect(ramp).toMatchObject({ time: capAt, duration: 0.04 })
    const curve = (ramp as { curve: Float32Array }).curve
    expect(curve[0]).toBeCloseTo(10 ** (-6 / 20), 6)
    expect(curve.at(-1)).toBeCloseTo(0, 9)
    expect(a.stopTime).toBeCloseTo(capAt + 0.04, 9)
    expect(a.connected).toBe(true) // still fading
    await tick(50)
    expect(a.ended).toBe(true)
    expect(a.connected).toBe(false)
    for (const g of ctx.gains) expect(g.gain.curveCount).toBeLessThanOrEqual(1)
  })

  it('closes the context on dispose()', async () => {
    const { engine, ctx, net, voices, playing } = setup()
    const g = globalThis as { __kymaAudioEngine?: unknown }
    g.__kymaAudioEngine = engine
    await playing('a')
    await engine.dispose()
    expect(ctx.state).toBe('closed')
    expect(ctx.closeCalls).toBe(1)
    expect(voices()[0].stopTime).not.toBeNull()
    expect(g.__kymaAudioEngine).toBeUndefined()
    const calls = net.calls.length
    engine.load(song('b'))
    expect(net.calls.length).toBe(calls)
  })

  it('reports a 404 as a network error and recovers on retry()', async () => {
    const status: Record<string, number> = { '/birds/a/song.m4a': 404 }
    const { engine, decode } = setup(status)
    engine.load(song('a'))
    await engine.listen()
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'network' })
    delete status['/birds/a/song.m4a']
    engine.retry()
    await flush()
    expect(engine.getSnapshot()).toMatchObject({ state: 'loading', error: null })
    await decode('a')
    expect(engine.getSnapshot().state).toBe('playing')
  })

  it('tries fallbackSrc after a decode failure, then reports decode', async () => {
    const { engine, net, decode } = setup()
    const withFallback = song('a', { fallbackSrc: '/birds/a/song.mp3' })
    engine.load(withFallback)
    const p = engine.listen()
    await flush()
    await decode('a', 'fail')
    expect(net.calls.map((c) => c.url)).toContain('/birds/a/song.mp3')
    await decode('a', 'ok')
    await p
    expect(engine.getSnapshot().state).toBe('playing')

    engine.load(song('b', { fallbackSrc: '/birds/b/song.mp3' }))
    await flush()
    await decode('b', 'fail')
    await decode('b', 'fail')
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'decode', playingId: null })

    engine.load(song('c'))
    await flush()
    await decode('c', 'fail')
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'decode' })
  })

  it('re-fetches undecodable bytes on retry() (a 200 that was not audio)', async () => {
    const { engine, net, decode } = setup()
    engine.load(song('a'))
    const p = engine.listen()
    await flush()
    await decode('a', 'fail')
    await p
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'decode' })
    const urls = () => net.calls.filter((c) => c.url === '/birds/a/song.m4a')
    expect(urls()).toHaveLength(1)
    engine.retry()
    await flush()
    expect(urls()).toHaveLength(2)
    expect(urls()[1].init).toMatchObject({ cache: 'reload' }) // past an HTTP-cached bad body
    await decode('a')
    expect(engine.getSnapshot()).toMatchObject({ state: 'playing', playingId: 'a' })
  })

  it('reports unsupported when no AudioContext exists (and is SSR-safe to construct)', async () => {
    const engine = createAudioEngine()
    const frame = engine.driveSource.read(0, createDriveFrame())
    expect(frame.audible).toBe(false)
    expect(engine.readFeatures(0, createSongFeatures()).spectrum).toBeNull()
    await engine.listen()
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'unsupported' })
  })

  it('keeps unsupported final through a bird change, a retry and another play', async () => {
    const net = createFakeFetch()
    const createContext = vi.fn((): AudioContext => {
      throw new Error('unsupported')
    })
    const engine = createAudioEngine({ createContext, fetch: net.fetch })
    engine.load(song('a'))
    await engine.listen()
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'unsupported' })
    engine.load(song('b'))
    expect(engine.getSnapshot()).toMatchObject({
      state: 'error',
      error: 'unsupported',
      songId: 'b',
    })
    engine.retry()
    await engine.play()
    expect(engine.getSnapshot()).toMatchObject({ state: 'error', error: 'unsupported' })
    expect(engine.getSnapshot().unlocked).toBe(false)
    // Nothing to play the bytes with, so none are fetched after the first try.
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(net.calls.filter((c) => c.url === '/birds/b/song.m4a')).toHaveLength(0)
  })

  it('aborts a superseded fetch but keeps prefetched bytes', async () => {
    const { engine, net, playing } = setup()
    await playing('a')
    engine.prefetch(song('n'))
    expect(net.calls.at(-1)).toMatchObject({ url: '/birds/n/song.m4a' })
    expect(net.calls.at(-1)!.init).toMatchObject({ priority: 'low' })
    engine.load(song('b'))
    engine.load(song('c'))
    const bCall = net.calls.find((c) => c.url === '/birds/b/song.m4a')!
    expect(bCall.init?.signal?.aborted).toBe(true)
    engine.load(song('n'))
    await flush()
    expect(net.calls.filter((c) => c.url === '/birds/n/song.m4a')).toHaveLength(1)
  })

  it('reads the drive frame at the heard time (latency compensated)', async () => {
    const { engine, ctx, tick, playing } = setup()
    await playing('a')
    const out = createDriveFrame()
    let now = 0
    for (let i = 0; i < 30; i++) {
      await tick(15)
      now += 16.7
      engine.driveSource.read(now, out)
    }
    expect(out.audible).toBe(true)
    expect(out.songId).toBe('a')
    expect(out.time).toBeLessThanOrEqual(ctx.currentTime - ctx.outputLatency + 1e-9)
    const feat = engine.readFeatures(now, createSongFeatures())
    expect(feat.loopPosition).toBeGreaterThan(0)
    expect(feat.sampleRate).toBe(48000)
    engine.pause()
    expect(engine.driveSource.read(now + 20, out)).toMatchObject({ audible: false, drive: 0 })
  })

  it('wakes drive-source subscribers on every snapshot change', async () => {
    const { engine, playing } = setup()
    const cb = vi.fn()
    const off = engine.driveSource.subscribe(cb)
    await playing('a')
    const n = cb.mock.calls.length
    expect(n).toBeGreaterThan(0)
    engine.pause()
    expect(cb.mock.calls.length).toBeGreaterThan(n)
    off()
    engine.toggle()
    const m = cb.mock.calls.length
    await flush()
    expect(cb.mock.calls.length).toBe(m)
  })
})
