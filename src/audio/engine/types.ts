// Shared contract between the audio engine (src/audio/engine/**) and the app shell.
// Source of truth: docs/specs/engine.md §3.1. Changing a signature here is a cross-team change.

export type EngineState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export type EngineErrorCode = 'network' | 'decode' | 'unsupported'

export interface BirdSongAsset {
  id: string // bird slug
  src: string // '/birds/<slug>/song.m4a' (AAC-LC in .m4a)
  fallbackSrc?: string // optional MP3/Opus for browsers that cannot decode AAC
  durationSec: number // musical loop length L, in seconds
  loop?: { startSec: number; endSec: number } // loop region in FILE time
  bandHz: { p10: number; p50: number; p90: number } // percentiles of the song's spectral peak frequency (Hz)
  peakHz: number // most energetic frequency (Hz)
  gainDb?: number // loudness trim applied at playback (default 0)
  symmetry?: 3 | 4 | 5 | 6 // circle mode family override
}

export interface EngineSnapshot {
  state: EngineState
  songId: string | null // committed song (last load())
  playingId: string | null // song whose voice is currently the crossfade target / audible
  unlocked: boolean // listen() has run (an AudioContext exists)
  interrupted: boolean // system interruption; state is 'paused'; play() from a gesture resumes
  volume: number // 0..1 (slider value; gain = volume²)
  muted: boolean
  error: EngineErrorCode | null
}

/** Per-frame features for the UI (spectrum, readouts, loop ring). Mutated in place by readFeatures(). */
export interface SongFeatures {
  songId: string | null
  loudness: number // 0..1 = drive D (smoothed, voiced-gated)
  voiced: boolean
  dominantHz: number | null // syllable-aware drive pitch (bird Hz); null while the gate is closed
  spectrum: Float32Array | null // length fftSize/2 = 1024, linear frequency bins, 0..1 = (dB + 100) / 80 clamped
  binHz: number // sampleRate / fftSize
  sampleRate: number
  loopPosition: number // 0..1 heard position within the current loop
}

/** Per-frame drive for the plate. Mutated in place by PlateDriveSource.read(). */
export interface DriveFrame {
  time: number // AudioContext time this frame describes (≈ what the listener hears now)
  audible: boolean // state === 'playing' && ctx.state === 'running' && not pausing
  songId: string | null // song being analysed (current voice at analysis time)
  voiced: boolean
  drive: number // D ∈ [0, 1]
  f1Hz: number // primary line (bird Hz); 0 = none yet
  f2Hz: number // secondary line; 0 = inactive
  w2: number // secondary weight ∈ [0, 0.6]
  tonal: boolean
  onset: number // onset pulse ∈ [0, 1], decays with τ = 90 ms
}

export interface PlateDriveSource {
  /** Latency-compensated frame for rAF time `nowMs`. Allocation-free; returns `out`. */
  read(nowMs: number, out: DriveFrame): DriveFrame
  isAudible(): boolean
  /** Called on every snapshot change (wakes the plate loop). */
  subscribe(cb: () => void): () => void
}

export interface AudioEngine {
  /** MUST be called synchronously inside a click/keydown/pointerup handler. The sync part creates/resumes the context. */
  listen(): Promise<void>
  /** Commit a song: crossfade if playing, decode silently if paused, fetch bytes only if idle. Never rejects. */
  load(song: BirdSongAsset): void
  play(): Promise<void> // call from a gesture when interrupted; works without one after unlock elsewhere
  pause(): void
  toggle(): void
  retry(): void // re-load the committed song after an error
  setVolume(v: number): void // 0..1
  setMuted(m: boolean): void
  prefetch(song: BirdSongAsset): void // compressed bytes only, low priority
  getSnapshot(): EngineSnapshot // stable object identity until the next change (useSyncExternalStore)
  subscribe(cb: () => void): () => void
  onState(cb: (s: EngineSnapshot) => void): () => void
  readFeatures(nowMs: number, out: SongFeatures): SongFeatures
  readonly driveSource: PlateDriveSource
  readonly analyser: AnalyserNode | null // pre-volume tap (debug overlays)
  dispose(): Promise<void> // tests/HMR only
}

export interface EngineOptions {
  createContext?: () => AudioContext // tests inject FakeAudioContext
  fetch?: typeof fetch
  now?: () => number // default performance.now
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (h: unknown) => void
  memoryClass?: 'desktop' | 'mobile' // decoded-cache budget; default from deviceMemory/pointer
}

export const SERVER_SNAPSHOT: EngineSnapshot = Object.freeze({
  state: 'idle',
  songId: null,
  playingId: null,
  unlocked: false,
  interrupted: false,
  volume: 0.7,
  muted: false,
  error: null,
})

export function createDriveFrame(): DriveFrame {
  return {
    time: 0,
    audible: false,
    songId: null,
    voiced: false,
    drive: 0,
    f1Hz: 0,
    f2Hz: 0,
    w2: 0,
    tonal: false,
    onset: 0,
  }
}

export function createSongFeatures(): SongFeatures {
  return {
    songId: null,
    loudness: 0,
    voiced: false,
    dominantHz: null,
    spectrum: null,
    binHz: 0,
    sampleRate: 0,
    loopPosition: 0,
  }
}
