import { heardTime, loopPosition } from './clock'
import { dbToGain, FADE_IN, FADE_OUT, volumeTaper } from './fades'
import { resolveLoopRegion, type LoopRegion } from './loopRegion'
import { ANALYSIS, AUDIO } from './params'
import { SongAnalyzer, type AnalyzerHost } from './SongAnalyzer'
import { EngineLoadError, isAbortError, SongCache } from './SongCache'
import {
  SERVER_SNAPSHOT,
  type AudioEngine,
  type BirdSongAsset,
  type DriveFrame,
  type EngineOptions,
  type EngineSnapshot,
  type PlateDriveSource,
  type SongFeatures,
} from './types'
import { createAudioContext, primeInGesture } from './unlock'

interface Voice {
  id: string
  src: AudioBufferSourceNode
  nodes: AudioNode[]
  fadeOut: GainNode
  t0: number
  region: LoopRegion
  retiring: boolean
}

interface Graph {
  bus: GainNode
  analyser: AnalyserNode
  analyserSink: GainNode
  pauseGain: GainNode
  volumeGain: GainNode
  muteGain: GainNode
}

/** Debug view of the engine (harness, tests, overlays). Allocates; never call per frame. */
export interface EngineInspection {
  contextState: AudioContextState | null
  sampleRate: number
  voices: {
    id: string
    t0: number
    retiring: boolean
    region: LoopRegion
    bufferDuration: number
  }[]
  wantPlaying: boolean
  pending: string | null
}

const noop = () => {}

// `now` is not stored: every per-frame caller passes its own rAF/performance time.
type ResolvedOptions = Required<
  Pick<EngineOptions, 'createContext' | 'fetch' | 'setTimer' | 'clearTimer'>
> &
  Pick<EngineOptions, 'memoryClass'>

export class WebAudioEngine implements AudioEngine {
  readonly driveSource: PlateDriveSource

  private readonly opts: ResolvedOptions
  private ctx: AudioContext | null = null
  private graph: Graph | null = null
  private analyzer: SongAnalyzer | null = null
  private cache: SongCache | null = null
  private voices: Voice[] = []
  private current: Voice | null = null
  private snap: EngineSnapshot = SERVER_SNAPSHOT
  private readonly listeners = new Set<() => void>()
  private readonly stateListeners = new Set<(s: EngineSnapshot) => void>()
  private song: BirdSongAsset | null = null
  private pending: BirdSongAsset | null = null
  private gen = 0
  private loadCtrl: AbortController | null = null
  private wantPlaying = false
  private pausing = false
  private suspendRequested = false
  private suspendTimer: unknown = null
  private slowTimer: unknown = null
  private queue: Promise<void> = Promise.resolve()
  private detach: (() => void) | null = null
  private disposed = false

  constructor(options: EngineOptions = {}) {
    this.opts = {
      createContext: options.createContext ?? createAudioContext,
      fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
      setTimer: options.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimer: options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      memoryClass: options.memoryClass,
    }
    this.driveSource = {
      read: (nowMs, out) => this.readDrive(nowMs, out),
      isAudible: () => this.isAudible(),
      subscribe: (cb) => this.subscribe(cb),
    }
  }

  get analyser(): AnalyserNode | null {
    return this.graph?.analyser ?? null
  }

  // ── Public API ────────────────────────────────────────────────────────────────────────────

  listen(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    let ctx = this.ctx
    if (!ctx) {
      try {
        ctx = this.opts.createContext()
      } catch {
        this.patch({ state: 'error', error: 'unsupported' })
        return Promise.resolve()
      }
      this.ctx = ctx
      this.buildGraph(ctx)
      this.attachListeners(ctx)
    }
    const resumed = primeInGesture(ctx)
    this.wantPlaying = true
    this.pausing = false
    this.clearSuspendTimer()
    this.rampPause(1)
    this.patch({ unlocked: true, interrupted: false })
    return this.resumeThenStart(ctx, resumed)
  }

  load(song: BirdSongAsset): void {
    if (this.disposed) return
    if (this.song?.id === song.id && this.snap.state !== 'error') {
      this.song = song
      return
    }
    this.commit(song)
  }

  play(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    const ctx = this.ctx
    if (!ctx) return this.listen()
    // After an interruption iOS only resumes from inside the gesture, so resume synchronously.
    const resumed = this.snap.interrupted ? primeInGesture(ctx) : null
    this.wantPlaying = true
    this.pausing = false
    this.clearSuspendTimer()
    return this.resumeThenStart(ctx, resumed)
  }

  pause(): void {
    const ctx = this.ctx
    const g = this.graph
    if (this.disposed || !ctx || !g) return
    if (!this.wantPlaying && this.snap.state === 'paused') {
      if (this.snap.interrupted) this.patch({ interrupted: false })
      return
    }
    this.wantPlaying = false
    this.pausing = true
    this.rampPause(0)
    this.patch({ state: this.snap.state === 'error' ? 'error' : 'paused', interrupted: false })
    this.clearSuspendTimer()
    this.suspendTimer = this.opts.setTimer(() => {
      this.suspendTimer = null
      void this.enqueue(async () => {
        if (this.wantPlaying || this.disposed || ctx.state !== 'running') return
        this.suspendRequested = true
        // A voice retired since pause() would freeze mid-fade and finish it audibly on play().
        // pauseGain is ~−43 dB by now, so stopping it is inaudible.
        for (const v of this.voices.slice()) if (v.retiring) this.hardStop(v)
        try {
          await ctx.suspend()
        } catch {
          this.suspendRequested = false
        }
      })
    }, AUDIO.suspendDelayMs)
  }

  toggle(): void {
    if (this.wantPlaying) this.pause()
    else void this.play()
  }

  retry(): void {
    if (this.disposed || !this.song || this.snap.state !== 'error') return
    this.commit(this.song)
  }

  setVolume(v: number): void {
    if (!Number.isFinite(v)) return
    const volume = Math.min(1, Math.max(0, v))
    this.patch({ volume })
    const ctx = this.ctx
    const g = this.graph
    if (!ctx || !g) return
    const t = ctx.currentTime
    g.volumeGain.gain.cancelScheduledValues(t)
    g.volumeGain.gain.setTargetAtTime(volumeTaper(volume), t, AUDIO.volumeTau)
  }

  setMuted(m: boolean): void {
    this.patch({ muted: m })
    const ctx = this.ctx
    const g = this.graph
    if (!ctx || !g) return
    const t = ctx.currentTime
    g.muteGain.gain.cancelScheduledValues(t)
    g.muteGain.gain.setTargetAtTime(m ? 0 : 1, t, AUDIO.muteTau)
  }

  prefetch(song: BirdSongAsset): void {
    if (this.disposed) return
    const cache = this.getCache()
    if (cache.hasDecoded(song.id)) return
    cache.fetchBytes(song.src, { prefetch: true }).catch(noop)
  }

  getSnapshot(): EngineSnapshot {
    return this.snap
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  onState(cb: (s: EngineSnapshot) => void): () => void {
    this.stateListeners.add(cb)
    return () => {
      this.stateListeners.delete(cb)
    }
  }

  readFeatures(nowMs: number, out: SongFeatures): SongFeatures {
    const ctx = this.ctx
    const an = this.analyzer
    if (!ctx || !an) {
      out.songId = null
      out.loudness = 0
      out.voiced = false
      out.dominantHz = null
      out.spectrum = null
      out.binHz = 0
      out.sampleRate = 0
      out.loopPosition = 0
      return out
    }
    an.update(nowMs)
    const h = heardTime(ctx, nowMs)
    an.readFeatures(h, out)
    const v = this.current
    out.loopPosition = v ? loopPosition(h, v.t0, v.region) : 0
    return out
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    // Synchronously, so a getAudioEngine() right after (an HMR remount) builds a fresh engine.
    const scope = globalThis as { __kymaAudioEngine?: AudioEngine }
    if (scope.__kymaAudioEngine === this) delete scope.__kymaAudioEngine
    this.detach?.()
    this.detach = null
    this.clearSuspendTimer()
    this.clearSlowTimer()
    this.loadCtrl?.abort()
    for (const v of this.voices.slice()) this.hardStop(v)
    const g = this.graph
    if (g) {
      for (const node of Object.values(g)) {
        try {
          node.disconnect()
        } catch {
          // already disconnected
        }
      }
    }
    this.graph = null
    this.analyzer = null
    const ctx = this.ctx
    this.ctx = null
    if (ctx && ctx.state !== 'closed') {
      try {
        await ctx.close()
      } catch {
        // closing twice or a dead context
      }
    }
    this.cache?.clear()
    this.listeners.clear()
    this.stateListeners.clear()
  }

  /** Debug-only snapshot of internals (allocates). */
  inspect(): EngineInspection {
    return {
      contextState: this.ctx?.state ?? null,
      sampleRate: this.ctx?.sampleRate ?? 0,
      voices: this.voices.map((v) => ({
        id: v.id,
        t0: v.t0,
        retiring: v.retiring,
        region: v.region,
        bufferDuration: v.src.buffer?.duration ?? 0,
      })),
      wantPlaying: this.wantPlaying,
      pending: this.pending?.id ?? null,
    }
  }

  /** Debug-only: the live analyzer's raw per-frame values (null before listen()). */
  get analysisDebug() {
    return this.analyzer?.debug ?? null
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────────

  private isAudible(): boolean {
    return this.snap.state === 'playing' && this.ctx?.state === 'running' && !this.pausing
  }

  private readDrive(nowMs: number, out: DriveFrame): DriveFrame {
    const ctx = this.ctx
    const an = this.analyzer
    if (!ctx || !an) {
      out.time = 0
      out.audible = false
      out.songId = null
      out.voiced = false
      out.drive = 0
      out.f1Hz = 0
      out.f2Hz = 0
      out.w2 = 0
      out.tonal = false
      out.onset = 0
      return out
    }
    an.update(nowMs)
    an.readDrive(heardTime(ctx, nowMs), out)
    out.audible = this.isAudible()
    if (!out.audible) {
      out.drive = 0
      out.voiced = false
    }
    return out
  }

  private commit(song: BirdSongAsset): void {
    this.song = song
    const gen = ++this.gen
    this.loadCtrl?.abort()
    const ctrl = new AbortController()
    this.loadCtrl = ctrl
    this.clearSlowTimer()
    this.pending = null
    this.patch({ songId: song.id, error: null })
    const cache = this.getCache()
    const ctx = this.ctx
    if (!ctx) {
      // Not unlocked: bytes only, so the first Listen is fast. Failures surface on listen().
      cache.fetchBytes(song.src, { signal: ctrl.signal }).catch(noop)
      this.patch({ state: 'idle' })
      return
    }
    if (this.wantPlaying) {
      void this.playSong(song, gen)
      return
    }
    // Paused: silence the old song now, decode the new one quietly, start it on play(). Fade only
    // while no suspend is pending: a suspend would freeze the fade halfway.
    const fade = ctx.state === 'running' && !this.suspendRequested
    for (const v of this.voices.slice()) {
      if (fade) this.retire(v, ctx.currentTime, AUDIO.xfOutSec)
      else this.hardStop(v)
    }
    this.current = null
    this.pending = song
    this.patch({ state: 'paused', playingId: null })
    cache.load(ctx, song, ctrl.signal).catch((e: unknown) => {
      if (gen !== this.gen || isAbortError(e) || this.disposed) return
      this.pending = null
      this.patch({ state: 'error', error: errorCode(e) })
    })
  }

  /** Waits for the context to run (serialised with suspend), then starts the committed song. */
  private resumeThenStart(ctx: AudioContext, resumed: Promise<void> | null): Promise<void> {
    let started: Promise<void> = Promise.resolve()
    const task = this.enqueue(async () => {
      if (!this.wantPlaying || this.disposed) return
      try {
        await (resumed ?? (ctx.state === 'running' ? undefined : ctx.resume()))
      } catch {
        // checked below through ctx.state
      }
      if (!this.wantPlaying || this.disposed) return
      this.suspendRequested = false
      if (ctx.state !== 'running') {
        // Still interrupted (iOS wants a fresh gesture): stay paused and say so.
        this.wantPlaying = false
        this.patch({ state: 'paused', interrupted: true })
        return
      }
      this.rampPause(1)
      this.patch({ interrupted: false })
      started = this.startCommitted()
    })
    return task.then(() => started)
  }

  private startCommitted(): Promise<void> {
    if (!this.wantPlaying || this.disposed) return Promise.resolve()
    const song = this.song
    if (!song) {
      this.patch({ state: 'paused' })
      return Promise.resolve()
    }
    this.pending = null
    return this.playSong(song, this.gen)
  }

  private async playSong(song: BirdSongAsset, gen: number): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return
    if (this.keepLive(song)) return
    const cache = this.getCache()
    const ready = cache.getDecoded(song.id)
    if (ready) {
      this.clearSlowTimer()
      this.startVoice(song, ready)
      this.patch({ state: 'playing', error: null })
      return
    }
    this.patch({ state: 'loading', error: null })
    this.clearSlowTimer()
    if (this.voices.some((v) => !v.retiring)) {
      this.slowTimer = this.opts.setTimer(() => {
        this.slowTimer = null
        if (gen === this.gen && this.snap.state === 'loading') this.retireAll()
      }, AUDIO.slowLoadFadeMs)
    }
    let buffer: AudioBuffer
    try {
      buffer = await cache.load(ctx, song, this.loadCtrl?.signal)
    } catch (e) {
      if (gen !== this.gen || isAbortError(e) || this.disposed) return
      this.clearSlowTimer()
      this.retireAll()
      this.patch({ state: 'error', error: errorCode(e) })
      return
    }
    // A decode that lands after a newer load() stays cached but never plays.
    if (gen !== this.gen || this.disposed || this.ctx !== ctx) return
    this.clearSlowTimer()
    if (!this.wantPlaying) {
      this.pending = song
      return
    }
    // Another call for this generation (play → pause → play while loading) awaited the same
    // decode and started it first.
    if (this.keepLive(song)) return
    this.startVoice(song, buffer)
    this.patch({ state: 'playing' })
  }

  /** True (and reports playing) when `song` already has a live, non-retiring voice. */
  private keepLive(song: BirdSongAsset): boolean {
    const live = this.current
    if (!live || live.retiring || live.id !== song.id) return false
    this.clearSlowTimer()
    this.patch({ state: 'playing', playingId: song.id, error: null })
    return true
  }

  private startVoice(song: BirdSongAsset, buffer: AudioBuffer): void {
    const ctx = this.ctx
    const g = this.graph
    const an = this.analyzer
    if (!ctx || !g || !an) return
    const t0 = ctx.currentTime + AUDIO.startDelaySec
    for (const v of this.voices) this.retire(v, t0, AUDIO.xfOutSec)
    const region = resolveLoopRegion(song, buffer.duration)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    src.loopStart = region.start
    src.loopEnd = region.end
    const trim = ctx.createGain()
    trim.gain.value = dbToGain(song.gainDb ?? 0)
    const fadeIn = ctx.createGain()
    fadeIn.gain.value = 0
    const fadeOut = ctx.createGain()
    fadeOut.gain.value = 1
    src.connect(trim)
    trim.connect(fadeIn)
    fadeIn.connect(fadeOut)
    fadeOut.connect(g.bus)
    fadeIn.gain.setValueCurveAtTime(FADE_IN, t0, AUDIO.xfInSec) // the only automation fadeIn gets
    src.start(t0, region.start)
    const v: Voice = {
      id: song.id,
      src,
      nodes: [src, trim, fadeIn, fadeOut],
      fadeOut,
      t0,
      region,
      retiring: false,
    }
    src.onended = () => this.removeVoice(v)
    this.voices.push(v)
    this.current = v
    while (this.voices.length > AUDIO.maxVoices) this.hardStop(this.voices[0])
    an.onVoiceStart(song, t0)
    this.patch({ playingId: song.id })
  }

  private retire(v: Voice, t0: number, dur: number): void {
    if (v.retiring) return
    v.retiring = true
    v.fadeOut.gain.setValueCurveAtTime(FADE_OUT, t0, dur) // the only automation fadeOut gets
    v.src.stop(t0 + dur + AUDIO.stopPadSec)
  }

  private retireAll(): void {
    const ctx = this.ctx
    if (!ctx) return
    for (const v of this.voices) this.retire(v, ctx.currentTime, AUDIO.xfOutSec)
    this.current = null
    this.patch({ playingId: null })
  }

  private hardStop(v: Voice): void {
    try {
      v.src.stop()
    } catch {
      // already stopped
    }
    this.removeVoice(v)
  }

  private removeVoice(v: Voice): void {
    const i = this.voices.indexOf(v)
    if (i < 0) return
    this.voices.splice(i, 1)
    for (const n of v.nodes) {
      try {
        n.disconnect()
      } catch {
        // already disconnected
      }
    }
    if (this.current === v) this.current = null
  }

  private rampPause(target: 0 | 1): void {
    const ctx = this.ctx
    const g = this.graph
    if (!ctx || !g) return
    const t = ctx.currentTime
    g.pauseGain.gain.cancelScheduledValues(t)
    g.pauseGain.gain.setTargetAtTime(target, t, target ? AUDIO.resumeTau : AUDIO.pauseTau)
  }

  private buildGraph(ctx: AudioContext): void {
    const bus = ctx.createGain()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = ANALYSIS.fftSize
    analyser.smoothingTimeConstant = 0
    analyser.minDecibels = ANALYSIS.minDb
    analyser.maxDecibels = ANALYSIS.maxDb
    const analyserSink = ctx.createGain()
    analyserSink.gain.value = 0
    const pauseGain = ctx.createGain()
    const volumeGain = ctx.createGain()
    volumeGain.gain.value = volumeTaper(this.snap.volume)
    const muteGain = ctx.createGain()
    muteGain.gain.value = this.snap.muted ? 0 : 1
    // The analyser taps the bus before pause/volume/mute: muting is "watch silently".
    bus.connect(analyser)
    analyser.connect(analyserSink)
    analyserSink.connect(ctx.destination)
    bus.connect(pauseGain)
    pauseGain.connect(volumeGain)
    volumeGain.connect(muteGain)
    muteGain.connect(ctx.destination)
    this.graph = { bus, analyser, analyserSink, pauseGain, volumeGain, muteGain }
    const host: AnalyzerHost = {
      get currentTime() {
        return ctx.currentTime
      },
      sampleRate: ctx.sampleRate,
      isAudible: () => this.isAudible(),
      currentSongId: () => this.current?.id ?? null,
    }
    this.analyzer = new SongAnalyzer(analyser, host)
  }

  private attachListeners(ctx: AudioContext): void {
    const onState = () => this.onContextState()
    ctx.addEventListener('statechange', onState)
    const doc = typeof document === 'undefined' ? null : document
    const win = typeof window === 'undefined' ? null : window
    const onVisible = () => {
      // Background tabs keep playing; only an interrupted context gets a silent resume attempt.
      if (doc?.visibilityState === 'visible' && this.snap.interrupted && this.ctx) {
        this.ctx.resume().catch(noop)
      }
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted && this.ctx && this.ctx.state !== 'running' && this.wantPlaying) {
        this.wantPlaying = false
        this.patch({ state: 'paused', interrupted: true })
      }
    }
    doc?.addEventListener('visibilitychange', onVisible)
    win?.addEventListener('pageshow', onPageShow)
    this.detach = () => {
      ctx.removeEventListener('statechange', onState)
      doc?.removeEventListener('visibilitychange', onVisible)
      win?.removeEventListener('pageshow', onPageShow)
    }
  }

  private onContextState(): void {
    const ctx = this.ctx
    if (!ctx || this.disposed) return
    const s = ctx.state
    if (s === 'running') {
      this.suspendRequested = false
      if (this.snap.interrupted) {
        // The system gave the context back by itself: carry on where we were.
        this.wantPlaying = true
        this.pausing = false
        this.rampPause(1)
        this.patch({ interrupted: false })
        void this.startCommitted()
      }
    } else if (
      (s === 'interrupted' || (s === 'suspended' && !this.suspendRequested)) &&
      this.wantPlaying
    ) {
      this.wantPlaying = false
      this.patch({ state: 'paused', interrupted: true })
    }
    this.emit() // isAudible() follows ctx.state; wake the plate loop either way
  }

  private getCache(): SongCache {
    this.cache ??= new SongCache({
      fetch: this.opts.fetch,
      budgetBytes:
        (this.opts.memoryClass ?? detectMemoryClass()) === 'mobile'
          ? AUDIO.decodedBudgetMobile
          : AUDIO.decodedBudgetDesktop,
    })
    return this.cache
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn).catch(noop)
    this.queue = run
    return run
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer !== null) this.opts.clearTimer(this.suspendTimer)
    this.suspendTimer = null
  }

  private clearSlowTimer(): void {
    if (this.slowTimer !== null) this.opts.clearTimer(this.slowTimer)
    this.slowTimer = null
  }

  private patch(p: Partial<EngineSnapshot>): void {
    const prev = this.snap
    let changed = false
    for (const k of Object.keys(p) as (keyof EngineSnapshot)[]) {
      if (p[k] !== prev[k]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.snap = Object.freeze({ ...prev, ...p })
    this.emit()
  }

  private emit(): void {
    for (const cb of Array.from(this.listeners)) cb()
    const s = this.snap
    for (const cb of Array.from(this.stateListeners)) cb(s)
  }
}

function errorCode(e: unknown) {
  return e instanceof EngineLoadError ? e.code : 'decode'
}

function detectMemoryClass(): 'desktop' | 'mobile' {
  if (typeof navigator === 'undefined') return 'desktop'
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  if (typeof mem === 'number' && mem <= 4) return 'mobile'
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return 'mobile'
  return 'desktop'
}

/** SSR-import-safe: touches no DOM until listen()/load() run on the client. */
export function createAudioEngine(options: EngineOptions = {}): AudioEngine {
  return new WebAudioEngine(options)
}
