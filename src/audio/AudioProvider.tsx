import { useEffect, useState, type ReactNode } from 'react'
import {
  SERVER_SNAPSHOT,
  createSongFeatures,
  getAudioEngine,
  type AudioEngine,
  type BirdSongAsset,
  type EngineSnapshot,
  type SongFeatures,
} from '~/audio/engine'
import type { PlateTelemetry } from '~/cymatics'
import type { Bird } from '~/lib/manifest'
import { AudioApiContext } from './context'

export type AudioStatus = EngineSnapshot['state']

/** Engine features plus the plate's current mode, read by rAF loops (never React state). */
export interface LiveFeatures extends SongFeatures {
  modeLabel: string | null
}

/** The shell's adapter over the engine (engine.md §9.3). */
export interface AudioApi {
  getSnapshot(): EngineSnapshot
  subscribe(cb: () => void): () => void
  /** Must be called synchronously inside a user-gesture handler. */
  listen(): Promise<void>
  select(bird: Bird): void
  toggle(): void
  play(): void
  pause(): void
  retry(): void
  setVolume(v: number): void
  setMuted(m: boolean): void
  prefetch(bird: Bird): void
  /** Cheap; mutates and returns one shared object. */
  features(): LiveFeatures
  /** The plate's drive source; null until the engine exists. */
  engine(): AudioEngine | null
  setTelemetry(t: PlateTelemetry | null): void
  getTelemetry(): PlateTelemetry | null
  /** Fires only when the plate's dominant mode changes. */
  subscribeMode(cb: () => void): () => void
  getModeKey(): string | null
}

const STORAGE_KEY = 'kyma:audio'

const UNSUPPORTED: EngineSnapshot = Object.freeze({
  ...SERVER_SNAPSHOT,
  state: 'error',
  error: 'unsupported',
})

export function assetOf(b: Bird): BirdSongAsset {
  return {
    id: b.slug,
    src: b.audio.src,
    durationSec: b.audio.durationSec,
    bandHz: b.audio.bandHz,
    peakHz: b.audio.peakHz,
  }
}

function readPrefs(): { volume?: number; muted?: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const v = JSON.parse(raw) as { volume?: unknown; muted?: unknown }
    return {
      volume: typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1 ? v.volume : undefined,
      muted: typeof v.muted === 'boolean' ? v.muted : undefined,
    }
  } catch {
    return {}
  }
}

function writePrefs(volume: number, muted: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume, muted }))
  } catch {
    // Private mode or blocked storage: the preference simply isn't remembered.
  }
}

/**
 * Bridges React to the one engine. The engine is created lazily on the client (first effect
 * or first gesture), so SSR and the first client render both read SERVER_SNAPSHOT.
 */
class AudioBridge implements AudioApi {
  private eng: AudioEngine | null = null
  private failed = false
  private listeners = new Set<() => void>()
  private modeListeners = new Set<() => void>()
  private unsub: (() => void) | null = null
  private buf: LiveFeatures = { ...createSongFeatures(), modeLabel: null }
  private telemetry: PlateTelemetry | null = null
  private modeKey: string | null = null
  private lastPrefs = ''
  private selected: Bird | null = null

  /** Creates (or fetches) the engine. Safe to call often; never throws. */
  ensure(): AudioEngine | null {
    if (this.eng || this.failed) return this.eng
    try {
      const eng = getAudioEngine()
      this.eng = eng
      const prefs = readPrefs()
      if (prefs.volume !== undefined) eng.setVolume(prefs.volume)
      if (prefs.muted !== undefined) eng.setMuted(prefs.muted)
      this.unsub = eng.subscribe(() => this.onEngineChange())
      if (this.selected) eng.load(assetOf(this.selected))
    } catch (err) {
      this.failed = true
      console.warn('[audio] engine unavailable', err)
    }
    this.emit()
    return this.eng
  }

  /** Dev HMR: drop the disposed engine and attach a fresh one, so the UI never shows stale state. */
  reattach() {
    this.unsub?.()
    this.unsub = null
    this.eng = null
    this.ensure()
  }

  private onEngineChange() {
    const s = this.eng?.getSnapshot()
    if (s) {
      const prefs = `${s.volume}|${s.muted}`
      if (prefs !== this.lastPrefs) {
        this.lastPrefs = prefs
        writePrefs(s.volume, s.muted)
      }
    }
    this.emit()
  }

  private emit() {
    for (const cb of this.listeners) cb()
  }

  getSnapshot = (): EngineSnapshot => {
    if (this.eng) return this.eng.getSnapshot()
    return this.failed ? UNSUPPORTED : SERVER_SNAPSHOT
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  listen = (): Promise<void> => {
    const eng = this.ensure()
    if (!eng) return Promise.resolve()
    try {
      return eng.listen().catch((err: unknown) => console.warn('[audio] listen failed', err))
    } catch (err) {
      console.warn('[audio] listen failed', err)
      return Promise.resolve()
    }
  }

  select = (bird: Bird) => {
    this.selected = bird
    this.ensure()?.load(assetOf(bird))
  }

  toggle = () => {
    const eng = this.ensure()
    if (!eng) return
    const s = eng.getSnapshot()
    // The first gesture must unlock; after an interruption, play() from the gesture resumes.
    if (!s.unlocked) void this.listen()
    else if (s.state === 'error') eng.retry()
    else if (s.interrupted || s.state === 'paused') void eng.play().catch(() => {})
    else eng.toggle()
  }

  play = () => {
    const eng = this.ensure()
    if (!eng) return
    if (!eng.getSnapshot().unlocked) void this.listen()
    else void eng.play().catch(() => {})
  }

  pause = () => this.eng?.pause()
  retry = () => this.ensure()?.retry()
  setVolume = (v: number) => this.ensure()?.setVolume(Math.min(1, Math.max(0, v)))
  setMuted = (m: boolean) => this.ensure()?.setMuted(m)

  prefetch = (bird: Bird) => {
    const nav = typeof navigator === 'undefined' ? null : navigator
    const conn = (nav as (Navigator & { connection?: { saveData?: boolean } }) | null)?.connection
    if (conn?.saveData) return
    this.eng?.prefetch(assetOf(bird))
  }

  features = (): LiveFeatures => {
    if (this.eng) {
      try {
        this.eng.readFeatures(performance.now(), this.buf)
      } catch {
        // A half-built engine must never take the UI's rAF loops down with it.
      }
    }
    this.buf.modeLabel = this.modeKey
    return this.buf
  }

  engine = () => this.eng

  setTelemetry = (t: PlateTelemetry | null) => {
    this.telemetry = t
    const key = t?.modeKey ?? null
    if (key !== this.modeKey) {
      this.modeKey = key
      for (const cb of this.modeListeners) cb()
    }
  }

  getTelemetry = () => this.telemetry

  subscribeMode = (cb: () => void) => {
    this.modeListeners.add(cb)
    return () => {
      this.modeListeners.delete(cb)
    }
  }

  getModeKey = () => this.modeKey
}

// The mounted bridge, kept on globalThis: Fast Refresh may keep a bridge built by an older copy of
// this module, and that copy's dispose hook is the one that must reach it.
type DevScope = { __kymaAudioEngine?: AudioEngine; __kymaAudioBridge?: AudioBridge }

export function AudioProvider({ children }: { children: ReactNode }) {
  const [bridge] = useState(() => new AudioBridge())
  useEffect(() => {
    if (import.meta.hot) (globalThis as DevScope).__kymaAudioBridge = bridge
    bridge.ensure()
  }, [bridge])
  return <AudioApiContext.Provider value={bridge}>{children}</AudioApiContext.Provider>
}

// Dev only: an edit to this module must not leave a second AudioContext running (engine.md §11).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const g = globalThis as DevScope
    // Dispose first: it clears the global synchronously, so reattach() gets a new engine.
    void g.__kymaAudioEngine?.dispose()
    g.__kymaAudioBridge?.reattach()
  })
}
