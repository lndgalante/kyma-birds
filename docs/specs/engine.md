# Kyma Birds — Cymatics Engine: final unified spec (v1)

Owner: chief engineer. Status: **implementation-ready**. Pinned: `three@0.186.1`, `@types/three@0.186.0`, `@tanstack/react-start@1.169.4`, `@tanstack/react-router@1.170.46`, `react@19.3.1`, `vite@8.3.5`, Vitest (node env).
Flow: **Selected bird → looping song → live analysis → mode excitation → vibration field → sand grains → pixels.**
Companion doc: `scratchpad/ui-spec.md` (the app shell). Where this spec and the UI spec touch, §9.3 gives the exact mapping.

---

## 0. Judging summary

### 0.1 Scores (1–10)

| Spec | Correctness (physics + APIs) | Visual outcome likelihood | Robustness / cross-browser | Simplicity / implementability | Sum | Single best idea (grafted below) |
|---|---|---|---|---|---|---|
| **physics** | 9 | 7 | 6 | 4 | 26 | **Lift-off sand model with per-grain thresholds θᵢ ~ U(0.6, 1.4) g.** Sand freezes in silence for a physical reason, and lines fill in as single bands. Also kept: exact Kirchhoff modes, one curve per fade param, padded AAC loops. |
| **visual** | 6 | 8 | 7 | 4 | 25 | **In-phase (signed, real) coherent mode superposition**, so nodal sets stay curves even mid-morph. Also kept: exposure-normalised grain alpha, curation of dead-centre modes. |
| **engineering** | 8 | 7 | 9 | 6 | 30 | **s-fold symmetric mode family per bird plus 3-anchor calibration**, so every bird gets its own mandala. Also kept: single WebGL2 path, own canvas per mount, functional float probe. |

**Deductions**
- **Visual (correctness):** circle modes use the membrane shortcut (`J_n` with `J_n′(k)=0`), which is wrong for a plate. Mode order is swapped and nodal radii are 5–9 % off.
- **Engineering (correctness):** the complex response at Q 14–24 leaves quadrature that fills the nodal lines, so lines break into dots. My prototype shows it: square (2,4)+ at resonance with the complex response gives a quiet area of only 4 %.
- **Physics (robustness, simplicity):** two GPU backends, an async init, a Canvas2D re-implementation, an SVG marching-squares poster, and a dense 8×8 cross-spectral matrix per frame.

### 0.2 Disputed points: decisions and evidence

All three.js evidence is from `npm pack three@0.186.1`, unpacked at `scratchpad/three-src-judge/package`.

| Question | Decision | Evidence |
|---|---|---|
| WebGPU + TSL compute, or WebGL2 GPGPU? | **WebGL2: `WebGLRenderer` + `GPUComputationRenderer` + `ShaderMaterial` points.** No WebGPU in v1. | (1) Measured bundle, same API surface (`bun build --minify` + `gzip -9`, `scratchpad/bundle-judge/`): WebGL path **539,289 B raw / 134,612 B gz**; WebGPU+TSL path **908,484 B / 248,837 B**. (2) WebGPU draws points at 1 px only (`src/materials/nodes/PointsNodeMaterial.js:57-60`), so it would need `Sprite` instancing. (3) `Renderer.init()` is async (`src/renderers/common/Renderer.js:784`); `WebGLRenderer` constructs synchronously and throws on failure (`src/renderers/WebGLRenderer.js:409-425`), which suits StrictMode. (4) On WebGL2, WebGPU compute runs through a separate transform-feedback path (`src/renderers/webgl-fallback/WebGLBackend.js:918-1015`), so we would ship and test two backends. (5) three already handles context loss (`WebGLRenderer.js:403-405`, `:1113-1143`, `preventDefault` at `:1115`). (6) The scaffold's `ThreeProbe.tsx` (WebGPU) is a throw-away probe; it is deleted. |
| Bessel functions: approximation or lookup table? | **CPU float64 power series → RG32F LUT** (1024 × 29 rows: R and dR/dr), read with `texelFetch` + `mix`. **The GPU never evaluates a Bessel function.** | `scratchpad/judge/ts/check.ts` (bun): power series vs 256-point trapezoid has max abs error **3.1e-8** over n ≤ 12, x ≤ 24. Free-edge residuals ≤ **3.5e-9** on table rows. Baking 29 × 1024 rows (J and I) takes **3.9 ms**; with derivatives about 3× that. A 1024-wide LUT keeps the interpolation error ≤ 6e-5. |
| Circle model | **Exact Kirchhoff free-edge modes, ν = 0.33**, in **s-fold rim-drive families**, s ∈ {3, 4, 5, 6}. | Re-solved with SciPy (`scratchpad/judge/modes.py`): 55 roots with λ ≤ 24.5. The moment and shear forms of C agree to **1.2e-14**. Values match physics Appendix A. |
| Mode coefficients: complex or real? | **Complex Lorentzian response, then in-phase projection to real signed coefficients.** | `scratchpad/judge/sheet.png` (complex, Q≈10): square (2,4)+ gives dotted lines (quiet share 0.62 at 2 s, quiet area 0.04). `scratchpad/judge/sheet_real_b0.3.png` (in-phase): continuous lines, a diamond plus circle that matches reference 1 (0.85 / 0.11), and crisp 3/4/5/6-fold mandalas. |
| Analysis: live or offline? | **Live `AnalyserNode`** with frame-rate-independent smoothing, online syllable-aware pitch, and a latency-compensated history. An offline FeatureTrack is v2, behind the same `PlateDriveSource` interface. | The UI spec requires a live spectrum (§5.3) and requires the sand to react the moment Listen is pressed (§1.2 #7). Offline analysis would add a Worker, an FFT, and a 0.3–0.6 s delay on mobile. |
| Particle counts | **262,144 / 131,072 / 65,536**, with **32,768** as the governor floor. | Each grain needs 1 state fetch + 1 bilinear field fetch per substep, because ∇I is precomputed in the field pass. State memory at the high tier is 2 × 4 MB. |
| Sand constants | Physics model and constants: σ 0.09, κ 4e-4, θ ∈ [0.6, 1.4] g, W 0.3, Γ_sat 4, G_max 6. | TS CPU port (`scratchpad/judge/ts/sandcheck.ts`), (4,1) at resonance, 20k grains: **89 %** of grains are in the quiet zone (which is **20.5 %** of the area) after 1 s. Gain 0 leaves positions **bit-identical**. Max r = 0.9849. |
| Calibration | Engineering's 3 anchors (p10 → rank 1, peak → rank 3, p90 → rank 7), plus the visual spec's geometric Λ(ρ) along ranks. | All five banks have hero index 3 (Appendix A). |
| What the plate shows before Listen | **Scattered, still sand.** No pre-warmed pattern. | UI spec §1.2 #7: "That moment is the signature of the page." |
| Background tab | **Audio keeps playing.** Only the plate loop sleeps. | UI spec §5.1. |
| Crossfade | **900 ms out, 1.2 s in, equal power. Each voice has two fade gains, and each gain gets exactly one `setValueCurveAtTime`.** A voice over the cap fades out in 40 ms on its trim gain. | UI spec §5.1, slowed to a breath (2026-10-29: the old song exhales while the new one inhales, with the 1.4 s room fade). `setValueCurveAtTime` throws if curves overlap; Firefox lacks `cancelAndHoldAtTime`. |
| iOS silent switch | Set `navigator.audioSession.type = 'playback'` only. **No hidden `<audio>` hack.** | UI spec §5.1 forbids the hack. Safari has had `audioSession` since 16.4. |

---

## 1. Scope, ownership, file list

The two engine workstreams own **`src/audio/engine/**`** and **`src/cymatics/**`**.
The shell owns `src/audio/AudioProvider.tsx`, `useAudio.ts`, `useLiveFeatures.ts`, `mediaSession.ts` and everything in `src/components/**`.

The shell's `src/components/plate/CymaticsPlate.tsx` is a one-line lazy wrapper around `~/cymatics/CymaticsPlate` (§9.2).

```
src/audio/engine/                         (workstream A — no three.js, SSR-import-safe: no DOM access at module scope)
  index.ts            public exports: types, getAudioEngine, createAudioEngine, createDriveFrame, createSongFeatures
  types.ts            BirdSongAsset, EngineState, EngineSnapshot, SongFeatures, DriveFrame, PlateDriveSource, AudioEngine, EngineOptions
  params.ts           AUDIO, ANALYSIS constants (§12.1)
  AudioEngine.ts      WebAudioEngine (graph, voices, state machine, cache use, analyzer ownership)
  unlock.ts           createAudioContext(), primeInGesture()
  loopRegion.ts       pure: resolveLoopRegion()
  fades.ts            pure: FADE_IN / FADE_OUT curves, dbToGain, volumeTaper
  SongCache.ts        bytes LRU (6 entries) + decoded LRU (byte budget)
  clock.ts            heardTime(), loopPosition()
  SongAnalyzer.ts     AnalyserNode wrapper → AnalysisFrame history; readDrive(), readFeatures()
  dsp/onePole.ts      pure: alpha(dt, tau), onePole()
  dsp/spectral.ts     pure: bandWeights(), parabolicPeak(), median/MAD (allocation-free), dbToPow
  dsp/NoiseFloor.ts   pure class: per-bin floor tracker
  dsp/Gate.ts         pure class: two-threshold hysteresis with hold times
  dsp/PitchTracker.ts pure class: syllable-aware drive pitch
  dsp/OnsetDetector.ts pure class: spectral-flux onsets
  dsp/FrameHistory.ts pure class: timestamped ring of AnalysisFrame
  __tests__/*.test.ts, __tests__/FakeAudioContext.ts

src/cymatics/                              (workstream B)
  index.ts            three-free public exports: types, describeMode, MAPPING_SENTENCE
  types.ts            PlateShape, PlateBird, CymaticsPlateProps, PlateTelemetry, PlateError, PlateReadyInfo, Tier, QualityPreference
  describeMode.ts     describeMode(), MAPPING_SENTENCE
  params.ts           SIM, DRIVE, LOOK, TIERS (§12.2) — single source of truth; GLSL receives values as uniforms/defines
  physics/bessel.ts        besselJ, besselI, besselJp, besselIp (float64 power series)
  physics/circleTable.ts   CIRCLE_MODES (29 rows), CircleModeRow
  physics/banks.ts         circleBank(s), squareBank(), symmetryFor(), PlateBankDef, PHI_MAX
  physics/calibration.ts   makeCalibration(), lambdaAtRank(), Calibration
  physics/response.ts      qFromSpacing(), lineResponse()
  physics/ModeBank.ts      envelopes, A/B bank slots, slot compaction, dominant hysteresis → FieldDrive
  physics/radialLut.ts     bakeRadialLut()
  physics/pcg.ts           pcg3d() (bit-identical to the GLSL chunk), INV_U32
  physics/sandReference.ts CPU port of field + sand step (tests/debug only)
  gpu/shaders.ts           GLSL strings: PCG, FIELD_VERT/FRAG, SAND_STEP_FRAG, SCATTER_FRAG, GRAIN_VERT/FRAG, PLATE_VERT/FRAG
  gpu/capabilities.ts      createProbedRenderer(), pickTier()
  gpu/FieldPass.ts         256² RGBA16F field RT + LUT texture + FullScreenQuad
  gpu/SandSim.ts           GPUComputationRenderer wrapper (tState), scatter, step, rebuild
  gpu/GrainLayer.ts        Points + ShaderMaterial
  gpu/PlateLayer.ts        full-screen plate shading quad
  gpu/PlateController.ts   renderer, loop, observers, transitions, governor, telemetry, disposal
  CymaticsPlate.tsx        default export React component (the lazy chunk; the only React file importing three)
  __tests__/*.test.ts
```

**Import rule** (checked by test §13.3):
- `three` may be imported only by `src/cymatics/gpu/**` and `src/cymatics/CymaticsPlate.tsx`.
- `src/audio/engine/**`, `src/cymatics/physics/**`, `params.ts`, `types.ts`, `describeMode.ts` and `index.ts` stay three-free.

**Scaffold cleanup** (integration step):
- Delete `src/components/ThreeProbe.tsx` and its use in `src/routes/index.tsx`.
- In `vite.config.ts`, the `chunkSizeWarningLimit` comment now refers to the WebGL chunk (about 540 KB raw); a limit of 700 is enough.

---

## 2. Asset contract (manifest `audio` block)

The asset pipeline writes each bird's `audio` block into `src/data/birds.json` (UI spec §9.5). The engine consumes it as `BirdSongAsset`. The adapter sets `id` from `bird.slug`.

```ts
// src/audio/engine/types.ts (part)
export interface BirdSongAsset {
  id: string                                   // bird slug
  src: string                                  // '/birds/<slug>/song.m4a' — AAC-LC in .m4a, 44.1 or 48 kHz, mono preferred, 96–128 kbps
  fallbackSrc?: string                         // optional MP3 or Opus for browsers that cannot decode AAC
  durationSec: number                          // musical loop length L, in seconds
  loop?: { startSec: number; endSec: number }  // loop region in FILE time; endSec − startSec = durationSec (±0.002)
  bandHz: { p10: number; p50: number; p90: number } // percentiles of the song's spectral peak frequency (Hz)
  peakHz: number                               // most energetic frequency (Hz)
  gainDb?: number                              // loudness trim applied at playback (default 0)
  symmetry?: 3 | 4 | 5 | 6                     // circle mode family override (reference-2 bird → 4)
}
```

**Pipeline requirements** (needed for a seamless loop on every decoder):
1. Choose a loop of length L. Bake a 30–80 ms equal-power crossfade at the seam, aligned to zero crossings.
2. Write the file as **`[last 0.25 s of loop] + [loop L] + [first 0.25 s of loop]`**, and set `loop = { startSec: 0.25, endSec: 0.25 + L }`.
   - Some decoders keep the AAC priming (2112 frames ≈ 48 ms). That shifts time by a constant δ < 0.25 s, but `[0.25, 0.25+L]` still covers exactly one loop period, because the padding repeats the loop's own audio.
3. Encode with `afconvert -f m4af -d aac -b 128000 in.wav out.m4a` (macOS built-in; there is no ffmpeg).
4. Normalise loudness so `gainDb` stays within ±6 dB.

---

## 3. Shared type contracts

### 3.1 Audio engine types (`src/audio/engine/types.ts`, full)

```ts
export type EngineState = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export type EngineErrorCode = 'network' | 'decode' | 'unsupported'

export interface EngineSnapshot {
  state: EngineState
  songId: string | null         // committed song (last load())
  playingId: string | null      // song whose voice is currently the crossfade target / audible
  unlocked: boolean             // listen() has run (an AudioContext exists)
  interrupted: boolean          // system interruption (iOS call/Siri/background). state is 'paused'; play() from a gesture resumes
  volume: number                // 0..1 (slider value; gain = volume²)
  muted: boolean
  error: EngineErrorCode | null
}

/** Per-frame features for the UI (spectrum, readouts, loop ring). Mutated in place by readFeatures(). */
export interface SongFeatures {
  songId: string | null
  loudness: number              // 0..1 = drive D (smoothed, voiced-gated)
  voiced: boolean
  dominantHz: number | null     // syllable-aware drive pitch (bird Hz); null while the gate is closed
  spectrum: Float32Array | null // length fftSize/2 = 1024, linear frequency bins, 0..1 = (dB + 100) / 80 clamped
  binHz: number                 // sampleRate / fftSize
  sampleRate: number
  loopPosition: number          // 0..1 heard position within the current loop
}

/** Per-frame drive for the plate. Mutated in place by PlateDriveSource.read(). */
export interface DriveFrame {
  time: number                  // AudioContext time this frame describes (≈ what the listener hears now)
  audible: boolean              // state === 'playing' && ctx.state === 'running' && not pausing
  songId: string | null         // song being analysed (current voice at analysis time)
  voiced: boolean
  drive: number                 // D ∈ [0, 1]
  f1Hz: number                  // primary line (bird Hz); 0 = none yet
  f2Hz: number                  // secondary line; 0 = inactive
  w2: number                    // secondary weight ∈ [0, 0.6]
  tonal: boolean
  onset: number                 // onset pulse ∈ [0, 1], decays with τ = 90 ms
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
  play(): Promise<void>          // call from a gesture when interrupted; works without one after unlock elsewhere
  pause(): void
  toggle(): void
  retry(): void                  // re-load the committed song after an error
  setVolume(v: number): void     // 0..1
  setMuted(m: boolean): void
  prefetch(song: BirdSongAsset): void  // compressed bytes only, low priority
  getSnapshot(): EngineSnapshot        // stable object identity until the next change (useSyncExternalStore)
  subscribe(cb: () => void): () => void
  onState(cb: (s: EngineSnapshot) => void): () => void
  readFeatures(nowMs: number, out: SongFeatures): SongFeatures
  readonly driveSource: PlateDriveSource
  readonly analyser: AnalyserNode | null    // pre-volume tap (debug overlays)
  dispose(): Promise<void>                  // tests/HMR only
}

export interface EngineOptions {
  createContext?: () => AudioContext  // tests inject FakeAudioContext
  fetch?: typeof fetch
  now?: () => number                  // default performance.now
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (h: unknown) => void
  memoryClass?: 'desktop' | 'mobile'  // decoded-cache budget; default from deviceMemory/pointer
}

export const SERVER_SNAPSHOT: EngineSnapshot // { state:'idle', songId:null, playingId:null, unlocked:false, interrupted:false, volume:0.7, muted:false, error:null }
export function createDriveFrame(): DriveFrame
export function createSongFeatures(): SongFeatures
```

```ts
// src/audio/engine/index.ts
import { createClientOnlyFn } from '@tanstack/react-start'
export const getAudioEngine: () => AudioEngine = createClientOnlyFn(() => {
  const g = globalThis as { __kymaAudioEngine?: AudioEngine }
  return (g.__kymaAudioEngine ??= createAudioEngine())   // survives HMR; never a 2nd AudioContext
})
```

### 3.2 Cymatics types (`src/cymatics/types.ts`, full)

```ts
export type PlateShape = 'circle' | 'square'
export type Tier = 'high' | 'medium' | 'low' | 'floor'
export type QualityPreference = 'auto' | 'high' | 'medium' | 'low'

export interface PlateBird {
  id: string
  bandHz: { p10: number; p50: number; p90: number }
  peakHz: number
  symmetry?: 3 | 4 | 5 | 6
}

export interface PlateTelemetry {
  modeKey: string | null        // '(4,1)' circle (diameters,circles); '(2,4)' square (m,n), m ≤ n
  dominantHz: number | null     // drive pitch while voiced
  gammaRms: number              // plate RMS acceleration, g units
  tier: Tier
  grains: number
  fps: number
}

export type PlateErrorCode = 'webgl-unavailable' | 'float-unsupported' | 'context-lost' | 'init-failed'
export interface PlateError { code: PlateErrorCode; recoverable: boolean; message: string }
export interface PlateReadyInfo { tier: Tier; grains: number; renderer: 'webgl2' }

export interface CymaticsPlateProps {
  source: PlateDriveSource             // engine.driveSource (import type from ~/audio/engine)
  bird: PlateBird | null               // committed bird (calibration input)
  plateShape: PlateShape
  paused: boolean                      // true unless audio state is 'playing' → drive forced to 0, sand rests
  held?: boolean                       // visual freeze (WCAG 2.2.2); audio and telemetry continue
  scatterToken?: number                // each increment re-scatters the sand
  reducedMotion?: boolean              // undefined → follow matchMedia('(prefers-reduced-motion: reduce)')
  accentColor?: string                 // CSS colour; used ONLY by the debug field view (UI D6: sand never takes the accent)
  quality?: QualityPreference          // default 'auto'
  debug?: boolean                      // field heat overlay + window.__kymaPlate stats
  className?: string
  onReady?(info: PlateReadyInfo): void
  onError?(error: PlateError): void
  onTelemetry?(t: PlateTelemetry): void  // ≤ 8 Hz
  ref?: Ref<PlateHandle>               // the shell's Take photo
}

export interface PlateHandle {
  capture(): HTMLCanvasElement | null  // the plate as drawn now (draws a frame and copies it in the same task); null when nothing can be drawn
}
```

---

## 4. Audio engine (workstream A)

### 4.1 Graph

```
voice: AudioBufferSourceNode(loop) → trim(Gain dB) → fadeIn(Gain) → fadeOut(Gain) ─┐   (≤ 3 voices)
                                                                                     ├→ bus(Gain 1) ─┬→ analyser ─→ analyserSink(Gain 0) → destination
                                                                                     ┘               └→ pauseGain → volumeGain(v²) → muteGain → destination
```

- **The analyser taps `bus`, before pause, volume and mute.** Muting is "watch silently" (UI §5.1).
- `analyserSink` (gain 0) keeps the analyser pulled on every engine.
- The context is created with `new AudioContext({ latencyHint: 'interactive' })` and **no `sampleRate`**.
- There is one context for the app's lifetime. It is never closed, except by `dispose()` in tests or HMR.

### 4.2 Unlock (`unlock.ts`, full)

```ts
type NavWithSession = Navigator & { audioSession?: { type: string } }

export function createAudioContext(): AudioContext {
  const nav = navigator as NavWithSession
  if (nav.audioSession) { try { nav.audioSession.type = 'playback' } catch { /* non-fatal */ } }  // iOS silent switch
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('unsupported')
  return new Ctor({ latencyHint: 'interactive' })
}

/** Must run synchronously inside the gesture handler. */
export function primeInGesture(ctx: AudioContext): Promise<void> {
  const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume()
  const s = new AudioBufferSourceNode(ctx, { buffer: ctx.createBuffer(1, 1, ctx.sampleRate) })
  s.connect(ctx.destination); s.start()                        // legacy WebKit unlock, costs nothing
  return resumed
}
```

**`listen()`**
- Synchronous prefix:
  1. `ctx ??= createAudioContext()` and build the graph.
  2. `primeInGesture(ctx)`.
  3. Set `unlocked = true` and `wantPlaying = true`.
- Async part: if `songId` is set, decode it (state `loading`) and start it (state `playing`). Otherwise state is `paused`.
- If `createAudioContext` throws: state `error`, error `unsupported`. It is final: later `load()`, `retry()`, `play()` and `listen()` calls keep it (only `songId` follows the bird), and nothing is fetched.

### 4.3 Loading and loop region

**`SongCache`**
- `bytes`: an LRU of 6 entries, each a `Promise<ArrayBuffer>`. In-flight fetches are deduped by `src`.
- `decoded`: an LRU of `AudioBuffer`, keyed by `id`, bounded by a byte budget (`length × channels × 4`).
  - Budget: 48 MB on desktop, 24 MB when `deviceMemory ≤ 4` or `(pointer: coarse)`.
- Fetch with `fetch(src, { signal, priority: prefetch ? 'low' : 'auto', credentials: 'same-origin' })`. Never send custom headers.
- Decode with `ctx.decodeAudioData(bytes.slice(0))`. The copy is needed because decoding detaches its input.
- On a decode error, retry once with `fallbackSrc`. If that also fails, the error is `decode`.
- Network failure or `!res.ok` → error `network`.

```ts
// loopRegion.ts (pure, full)
export interface LoopRegion { start: number; end: number; mode: 'manifest' | 'trimmed' | 'whole' }
export function resolveLoopRegion(song: Pick<BirdSongAsset, 'durationSec' | 'loop'>, bufferDuration: number): LoopRegion {
  const L = song.durationSec
  if (song.loop) {
    const { startSec: s, endSec: e } = song.loop
    if (s >= 0 && e > s && Math.abs(e - s - L) < 0.01 && s < bufferDuration)
      return { start: s, end: Math.min(e, bufferDuration), mode: 'manifest' }
  }
  const excess = bufferDuration - L
  if (L > 0 && excess > 0 && excess <= 0.1) {            // unpadded AAC: drop priming at the start, padding at the end
    const lead = Math.min(excess, 2112 / 44100)
    return { start: lead, end: lead + L, mode: 'trimmed' }
  }
  return { start: 0, end: bufferDuration, mode: 'whole' }
}
```

### 4.4 Voices and crossfade

```ts
// fades.ts (pure)
export const FADE_POINTS = 64
export const FADE_IN = Float32Array.from({ length: FADE_POINTS }, (_, i) => Math.sin((i / (FADE_POINTS - 1)) * Math.PI / 2))
export const FADE_OUT = Float32Array.from({ length: FADE_POINTS }, (_, i) => Math.cos((i / (FADE_POINTS - 1)) * Math.PI / 2))
export const dbToGain = (db: number) => 10 ** (db / 20)
export const volumeTaper = (v: number) => Math.min(1, Math.max(0, v)) ** 2

// AudioEngine.ts (core)
interface Voice { id: string; src: AudioBufferSourceNode; nodes: AudioNode[]; fadeOut: GainNode
  t0: number; region: LoopRegion; retiring: boolean }

private startVoice(song: BirdSongAsset, buffer: AudioBuffer, fadeInSec = AUDIO.xfInSec) {
  const ctx = this.ctx!, t0 = ctx.currentTime + AUDIO.startDelaySec               // 0.02
  for (const v of this.voices) this.retire(v, t0, AUDIO.xfOutSec)                 // 0.9
  const region = resolveLoopRegion(song, buffer.duration)
  const src = new AudioBufferSourceNode(ctx, { buffer, loop: true, loopStart: region.start, loopEnd: region.end })
  const trim = new GainNode(ctx, { gain: dbToGain(song.gainDb ?? 0) })
  const fadeIn = new GainNode(ctx, { gain: 0 })
  const fadeOut = new GainNode(ctx, { gain: 1 })
  src.connect(trim).connect(fadeIn).connect(fadeOut).connect(this.bus!)
  fadeIn.gain.setValueCurveAtTime(FADE_IN, t0, fadeInSec)        // 1.2; the ONLY automation fadeIn ever gets
  src.start(t0, region.start)
  const v: Voice = { id: song.id, src, nodes: [src, trim, fadeIn, fadeOut], fadeOut, t0, region, retiring: false }
  src.onended = () => { v.nodes.forEach((n) => n.disconnect()); this.voices = this.voices.filter((x) => x !== v) }
  this.voices.push(v); this.current = v
  while (this.voices.length > AUDIO.maxVoices) this.softStop(this.voices[0], ctx.currentTime) // cap 3
  this.analyzer!.onVoiceStart(song, t0)                                           // band glide + floor re-init (§5.2)
  this.patch({ playingId: song.id })
}
private retire(v: Voice, t0: number, dur: number) {
  if (v.retiring) return
  v.retiring = true
  v.fadeOut.gain.setValueCurveAtTime(FADE_OUT, t0, dur)          // the ONLY automation fadeOut ever gets
  v.src.stop(t0 + dur + AUDIO.stopPadSec)                        // 0.05
}
private hardStop(v: Voice) { v.retiring = true; try { v.src.stop() } catch { /* already stopped */ } v.nodes.forEach((n) => n.disconnect())
  this.voices = this.voices.filter((x) => x !== v) }
private softStop(v: Voice, t: number) {                          // over the cap: fade, don't cut
  this.voices = this.voices.filter((x) => x !== v)               // off the books now; onended disconnects
  const k = v.trim.gain.value
  v.trim.gain.setValueCurveAtTime(FADE_OUT.map((g) => g * k), t, AUDIO.capFadeSec) // 0.04; trim's only automation
  try { v.src.stop(t + AUDIO.capFadeSec) } catch { /* already stopped */ }
}
```

- A voice retired mid-fade-in plays at `sin(·)·cos(·)`, which is smooth. No param ever holds two curves.
- Arrowing fast stacks up 0.9 s tails, so the voice over the cap is often still audible. A hard stop there clicks; `softStop` fades it out in 40 ms on `trim`, the one gain no fade curve touches. `capFadeSec ≤ stopPadSec`, so the new stop time only ever ends the voice sooner, or after its fade-out is already silent.
- `hardStop` stays for silent cases only: in a suspended context, behind a ~−50 dB `pauseGain`, and on `dispose`.
- `load(song)` uses a generation token `gen = ++this.gen` and aborts the previous `AbortController`.
  - A decode that finishes after a newer `load` is cached but not played.
  - The UI already debounces commits by 250 ms (UI §3.4), so the engine adds no settle delay of its own.

### 4.5 State machine

| From | Event | Action | To |
|---|---|---|---|
| `idle` | `load(s)` | `songId = s.id`; fetch bytes only (no context) | `idle` |
| `idle` | `listen()` | sync unlock; if `songId`: decode, then `startVoice` | `loading` → `playing` (or `paused` if no song) |
| `loading` / `playing` | `load(s)` with a different id | Old voice keeps playing. Decode. If the decode takes **> 700 ms**, retire old voices (0.9 s). On decode: `startVoice`. | `loading` → `playing` |
| `playing` | `load(s)` with the same id | no-op | — |
| `playing` | `pause()` | `wantPlaying = false`; `pauseGain` → 0 with τ 0.12 (a soft release, ~0.6 s); after 700 ms (5.8 τ, ~−50 dB), `ctx.suspend()` unless resumed | `paused` |
| `paused` | `load(s)` | Decode silently. Hard-stop the old voices (the context is suspended, so this is inaudible). `pending = s`. | `paused` |
| `paused` | `play()` | `await ctx.resume()`; `pauseGain` → 1 with τ 0.1; if `pending`, `startVoice(pending)` | `playing` |
| any | fetch/decode failure for the current gen | `error = code` | `error` |
| `error` | `load(other)` / `retry()` | clear the error, then follow the normal flow | `loading` / `idle` |
| `playing` | `ctx.onstatechange` → `'interrupted'`, or `'suspended'` not requested by us | `interrupted = true`, `wantPlaying = false` | `paused` |
| `paused` and interrupted | `ctx.state` back to `'running'` by itself | `interrupted = false` | `playing` |
| `paused` and interrupted | `play()` from a gesture | `primeInGesture`, then the normal `play` | `playing` |

- **Volume:** `volumeGain.gain.cancelScheduledValues(t); volumeGain.gain.setTargetAtTime(volumeTaper(v), t, 0.02)`. The default volume is 0.7.
- **Mute:** a separate `muteGain`, with τ 0.015. It stays near-instant on purpose: mute is for silence now, while pause gets the soft release.
- **Pause and resume** use only `setTargetAtTime` on `pauseGain`, preceded by `cancelScheduledValues`.
- `pause`, `play` and `toggle` are **serialised through a promise queue**, so suspend and resume never interleave.
- **`isAudible()`** = `state === 'playing' && ctx.state === 'running' && !pausing`. `pausing` turns on synchronously in `pause()`.
- **Visibility:** audio continues in a background tab (UI §5.1).
  - On `visibilitychange → visible` while `interrupted`: try `ctx.resume()` silently. If it fails, stay interrupted.
  - On `pageshow` with `persisted`: if `ctx.state !== 'running'` and audio should be playing → `interrupted`.
- **`dispose()`**, in order:
  1. Remove the listeners.
  2. Hard-stop all voices.
  3. Disconnect all graph nodes.
  4. `await ctx.close()`.
  5. Clear the caches.
  6. Delete `globalThis.__kymaAudioEngine`.

### 4.6 Heard time and loop position (`clock.ts`, full)

```ts
export function heardTime(ctx: AudioContext, nowPerfMs: number): number {
  const ct = ctx.currentTime
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null
  if (ts && ts.contextTime! > 0 && ts.performanceTime! > 0 && ct - ts.contextTime! < 0.5)
    return Math.min(ct, ts.contextTime! + (nowPerfMs - ts.performanceTime!) / 1000)
  const lat = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0
  return Math.max(0, ct - Math.min(0.3, Math.max(0, lat)))
}
export function loopPosition(heard: number, t0: number, region: { start: number; end: number }): number {
  const L = region.end - region.start
  if (!(L > 0) || heard < t0) return 0
  return ((heard - t0) % L) / L
}
```

---

## 5. Live analysis (workstream A, `SongAnalyzer.ts` + `dsp/*`)

### 5.1 AnalyserNode settings

| Setting | Value | Why |
|---|---|---|
| `fftSize` | 2048 | 42.7 ms window and 23.4 Hz bins at 48 kHz. Parabolic interpolation gives ±3 Hz. |
| `smoothingTimeConstant` | **0** | The built-in smoothing runs once per call, so it depends on frame rate. We smooth ourselves, scaled by dt. |
| `minDecibels` / `maxDecibels` | −100 / −20 | Affect the UI spectrum normalisation only. |
| Read | `getFloatFrequencyData(db)` into a preallocated `Float32Array(1024)` | Map NaN and −∞ to −160. |

### 5.2 Per-frame algorithm (`update(nowMs)`, allocation-free, at most once per frame)

Run only if `nowMs − lastNowMs ≥ 4` (this dedupes the UI and plate rAF loops). Then `dt = clamp((nowMs − lastNowMs)/1000, 0, 0.1)` and `α(τ) = 1 − exp(−dt/τ)`.

**Band**
- From the current song's band: `lo = max(150, p10/1.6)`, `hi = min(12000, 0.45·sr, 1.6·p90)`.
- Weight `w_b` is 0 at `lo`. It rises with a raised cosine to 1 at `0.85·p10`, stays 1 up to `1.25·p90`, then falls with a raised cosine to 0 at `hi`.
- On `onVoiceStart(song, t0)`, the band becomes the union of the old and new bands until `t0 + 1.0`, then the new band. The glide outlasts the old voice's fade-out (`xfOutSec + stopPadSec` = 0.95 s), so the old song is gone before the band narrows and before the floor and loudness peak re-learn; a loud old bird can't seed a quiet new bird's peak.

**If not audible:**
- `voiced = false`; `D += (0 − D)·α(0.2)`; `onset *= exp(−dt/0.09)`.
- Keep the last `f1`, `f2` and spectrum.
- Push a history entry and return.

**If audible, in order:**

1. **Power:** `P_b = 10^(db_b/10)` for b in the band.
2. **Noise floor** (`NoiseFloor`):
   - If `P_b < N_b`: `N_b += (P_b − N_b)·α(0.25)`. Otherwise `N_b *= 10^(0.6·dt)` (a +6 dB/s creep).
   - Re-initialise with `N_b = P_b` on the first audible frame after `t0 + 1.0` of each new voice (the loudness peak restarts there too).
3. **Clean power:** `X_b = max(0, P_b − 2·N_b)·w_b`.
4. **Levels:**
   - `snrDb = 10·log10(Σ P_b w_b / Σ N_b w_b)`.
   - `levelDb = 10·log10(Σ X_b + 1e-12)`.
   - `peakDb = max(levelDb, peakDb − 1.0·dt)`, initialised to the first `levelDb`.
   - `loud = clamp(1 + (levelDb − peakDb)/24, 0, 1)`.
5. **Gate** (`Gate`): opens when `snrDb > 9 && loud > 0.30` holds for 20 ms; closes when `snrDb < 6 || loud < 0.15` holds for 60 ms.
6. **Peaks:**
   - `b1` = argmax of X over band bins that are local maxima.
   - `f1raw = (b1 + δ)·binHz`, with `δ = ½(α−γ)/(α−2β+γ)` from the dB values at `b1−1, b1, b1+1` (clamped to ±0.5).
   - `crest = X_b1 / mean(X)`; the line is tonal if `crest ≥ 8`.
   - If not tonal: `f1raw = centroid = Σ f_b X_b / Σ X_b`, and line 2 is off.
   - **Line 2:** the largest X with `|log2(f/f1raw)| ≥ 1/3`, not within ±3 % of `2f1`, `3f1` or `f1/2`. `m2rel = X_b2/X_b1`. Active if `m2rel ≥ 0.35`, then `w2 = min(0.6, 0.6·m2rel)`. Otherwise `f2 = 0`, `w2 = 0`.
7. **Pitch** (`PitchTracker`, log2 domain), while voiced:
   - `ℓ = log2(f1raw)`.
   - A **syllable start** is either the gate opening, or `|ℓ − ℓs| > 0.5` sustained for 30 ms. On a syllable start: clear the median buffer and set `ℓs = ℓ`.
   - `ℓs += (ℓ − ℓs)·α(0.03)`.
   - Push `ℓ` into the median buffer (keep entries younger than 0.4 s, at most 64).
   - `m = median(buffer)`; `ℓdrive = m + 0.35·(ℓs − m)`; `f1 = 2^ℓdrive`.
   - Line 2 is smoothed in log2 with `α(0.04)`.
   - When unvoiced: hold `f1`.
8. **Drive:** target `T = voiced ? loud : 0`; `D += (T − D)·α(T > D ? 0.025 : 0.2)`.
9. **Onset** (`OnsetDetector`):
   - `flux` = mean over band bins with `X_b > 0` of `max(0, L_b − Lprev_b)`, where `L = 10·log10(X + 1e-12)`.
   - Ring of the last 32 flux values; `thr = median + 3·MAD + 1.0`.
   - Onset if `voiced && flux > thr && t − lastOnset ≥ 0.06` → `onset = 1`. Otherwise `onset *= exp(−dt/0.09)`.
10. **Spectrum for the UI:** `(db + 100)/80`, clamped to 0..1, written into the history slot's own `Float32Array(1024)`.
11. **History:** push `{ time: ctx.currentTime, songId: current?.id ?? null, voiced, drive: D, f1Hz, f2Hz, w2, tonal, onset, loud: D, spectrum }` into `FrameHistory` (48 slots; all arrays preallocated).

**`driveSource.read(nowMs, out)`**
- Call `update(nowMs)`, then `h = heardTime(ctx, nowMs)`.
- Copy the newest history entry with `time ≤ h`, or the oldest if none.
- Set `out.audible = isAudible()`. If not audible, set `out.drive = 0` and `out.voiced = false`.

**`readFeatures(nowMs, out)`**
- Same history entry.
- `dominantHz = voiced ? f1Hz : null`; `loudness = drive`.
- `loopPosition = loopPosition(h, current.t0, current.region)`.
- `spectrum` = that entry's array.

---

## 6. Plate physics (workstream B, pure TS)

### 6.1 Field model

- Plate coordinates: circle radius 1; square half-side 1. Each mode φₖ is **RMS-normalised over the plate**.
- The drive is up to two incoherent spectral lines p ∈ {1, 2}, each with frequency ν_p (plate Λ units) and weight w₁ = 1, w₂ ≤ 0.6.
- Each line gets real, in-phase coefficients `c_{p,k}` (§6.5), with `Σₖ c_{p,k}² = (w_p·D·G_p)²`.

```
U_p(x)  = Σₖ c_{p,k} φₖ(x)             (real)
I(x)    = U₁(x)² + U₂(x)²               (time-averaged |acceleration|², normalised)
Γ(x)    = G_MAX · √I(x)                 (g units; G_MAX = 6 ⇒ Γ_rms = 6 g at full drive on resonance)
∇I      = 2(U₁∇U₁ + U₂∇U₂)              (precomputed in the field pass)
```

**Why steady state is correct:** a mode decays in `Q/(πf)`, about 1–10 ms, which is shorter than a frame.

**Why "in-phase projection":** it drops the quadrature part, which would otherwise fill the nodal lines (§0.2). That keeps nodal sets as curves at any Q, so a low Q can be used for legible, continuous morphing.

### 6.2 Bessel functions (`physics/bessel.ts`, full)

```ts
/** J_n(x), power series in float64. |abs err| ≤ 3.1e-8 for n ≤ 12, 0 ≤ x ≤ 24 (measured); ~1e-15 for x ≤ 5. */
export function besselJ(n: number, x: number): number {
  const h = 0.5 * x
  let term = 1
  for (let i = 1; i <= n; i++) term *= h / i
  let sum = term
  const h2 = -h * h
  for (let k = 1; k < 200; k++) {
    term *= h2 / (k * (k + n)); sum += term
    if (Math.abs(term) < 1e-17 * Math.abs(sum) && k > h) break
  }
  return sum
}
/** I_n(x), power series (all terms positive: relative error ~1e-15). */
export function besselI(n: number, x: number): number {
  const h = 0.5 * x
  let term = 1
  for (let i = 1; i <= n; i++) term *= h / i
  let sum = term
  const h2 = h * h
  for (let k = 1; k < 200; k++) {
    term *= h2 / (k * (k + n)); sum += term
    if (term < 1e-17 * sum && k > h) break
  }
  return sum
}
export const besselJp = (n: number, x: number) => (n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x)))
export const besselIp = (n: number, x: number) => (n === 0 ? besselI(1, x) : 0.5 * (besselI(n - 1, x) + besselI(n + 1, x)))
```

### 6.3 Circular plate: Kirchhoff free edge, ν = 0.33

**Mode shape:** `φ_{n,c}(r,θ) = N·[J_n(λr) + C·I_n(λr)]·cos(n(θ − θ₀))`, with **θ₀ = π/2** so the mirror axis is vertical. Λ = λ².

**Free-edge conditions** at r = 1 (`a, b, c, d` are evaluated at λ):

```
a = λ²J + (1−ν)(λJ′ − n²J)      b = λ²I − (1−ν)(λI′ − n²I)
c = λ³J′ + (1−ν)n²(λJ′ − J)     d = λ³I′ − (1−ν)n²(λI′ − I)
C = a/b = c/d                   (frequency equation: a·d − b·c = 0)
```

**Normalisation** (RMS over the disk = 1): `N = 1/√((n=0 ? 2 : 1)·∫₀¹R²r dr)`.

**Drive** (s exciters in phase on the rim): coupling is `Pₖ = N·R(1)` for n mod s = 0. The constant factor s drops out.

**Table:** `CIRCLE_MODES` holds all 29 rows used by any family, in Λ order. It is `physics/circleTable.ts`, and Appendix A has it in full.

**Families: `circleBank(s)`**
- Take rows with `n % s === 0 && n ≤ 12 && deadR ≤ 0.52`, sorted by Λ, **first 12**.
- `deadR` is the smallest r where |φ| reaches 10 % of its maximum. The rule drops dead-centre modes such as (5,0), (6,0) and (8,0), which only make a central blob of sand.
- **Hero = index 3**, which is (s,1) in every family.

**Symmetry:** `symmetryFor(bird) = bird.symmetry ?? [3, 4, 5, 6][fnv1a32(bird.id) % 4]` (32-bit FNV-1a over UTF-16 code units).

### 6.4 Square plate: guided edges, centre drive, bolt

**Mode shape**, with X = (x+1)/2 and Y = (y+1)/2:

```
φ_{m,n} = k·[cos(mπX)cos(nπY) + cos(nπX)cos(mπY)],  m ≤ n, both even, (0,0) excluded
Λ = m² + n²,   k = 1 if m = 0 or m = n, else √2   (RMS 1),   P = 2k·(−1)^((m+n)/2)
```

- These are the exact modes for edges that can slide but not tilt.
- Only even–even "+" combinations have φ(0,0) ≠ 0, so they are the only ones a centre drive excites. Every pattern is therefore D4-symmetric.
- **`squareBank()`** is the first 12 by Λ. It contains no degenerate pairs; the first one, Λ = 100, is outside the bank.
  - Modes: (0,2) 4, (2,2) 8, (0,4) 16, **(2,4) 20 (hero, index 3)**, (4,4) 32, (0,6) 36, (2,6) 40, (4,6) 52, (0,8) 64, (2,8) 68, (6,6) 72, (4,8) 80.
- **Bolt flat zone:** U ← h(r)·U with `h = smoothstep(0.55·r_c, r_c, r)` and `r_c = 0.15`. Grains collect in a disk of radius about 0.08–0.1 around the bolt, as in reference 1. The bolt is drawn with r = 0.024.

### 6.5 Response, Q and in-phase projection (`physics/response.ts`, full)

```ts
export interface BankModes { readonly lambda: Float64Array; readonly coupling: Float64Array; readonly q: Float64Array }

/** Q from local mode spacing: half-power bandwidth = β · local gap. */
export function qFromSpacing(lambda: ArrayLike<number>, beta = DRIVE.beta, qMin = DRIVE.qMin, qMax = DRIVE.qMax): Float64Array {
  const n = lambda.length, q = new Float64Array(n)
  for (let k = 0; k < n; k++) {
    const gap = k === 0 ? lambda[1] - lambda[0] : k === n - 1 ? lambda[n - 1] - lambda[n - 2] : (lambda[k + 1] - lambda[k - 1]) / 2
    q[k] = Math.min(qMax, Math.max(qMin, lambda[k] / (beta * gap)))
  }
  return q
}

const BANK_MAX = 12
const sRe = new Float64Array(BANK_MAX), sIm = new Float64Array(BANK_MAX), sMag = new Float64Array(BANK_MAX), order = new Int32Array(BANK_MAX)
/**
 * H_k = P_k / (1 − r² + i·r/Q_k), r = ν/Λ_k. Keep the top-K by |H|, rotate by the principal phase
 * φ = ½·arg(Σ H_k²) (the rotation whose real part keeps the most energy; equals arg(H_dom) at a pure resonance),
 * take the real part, normalise to unit norm into `out` (zeros elsewhere).
 * Returns the resonance gain G = min(1, ‖H/(|P|Q)‖_topK)^γ ∈ (0, 1]. The global sign is arbitrary (ModeBank aligns it).
 */
export function lineResponse(nu: number, bank: BankModes, out: Float64Array, topK = DRIVE.topK, gamma = DRIVE.gamma): number {
  const n = bank.lambda.length
  for (let k = 0; k < n; k++) {
    const r = nu / bank.lambda[k], a = 1 - r * r, b = r / bank.q[k], d = a * a + b * b, P = bank.coupling[k]
    sRe[k] = (P * a) / d; sIm[k] = (-P * b) / d; sMag[k] = Math.abs(P) / Math.sqrt(d); order[k] = k
  }
  const K = Math.min(topK, n)
  for (let i = 0; i < K; i++) { let best = i
    for (let j = i + 1; j < n; j++) if (sMag[order[j]] > sMag[order[best]]) best = j
    const t = order[i]; order[i] = order[best]; order[best] = t }
  let s2r = 0, s2i = 0
  for (let i = 0; i < K; i++) { const k = order[i]; s2r += sRe[k] * sRe[k] - sIm[k] * sIm[k]; s2i += 2 * sRe[k] * sIm[k] }
  const ph = 0.5 * Math.atan2(s2i, s2r), cr = Math.cos(ph), si = Math.sin(ph)
  out.fill(0, 0, n)
  let norm2 = 0, gn2 = 0
  for (let i = 0; i < K; i++) {
    const k = order[i], v = sRe[k] * cr + sIm[k] * si
    out[k] = v; norm2 += v * v
    const hn = sMag[k] / (Math.abs(bank.coupling[k]) * bank.q[k]); gn2 += hn * hn
  }
  const inv = norm2 > 0 ? 1 / Math.sqrt(norm2) : 0
  for (let i = 0; i < K; i++) out[order[i]] *= inv
  return Math.pow(Math.min(1, Math.sqrt(gn2)), gamma)
}
```

- With β = 0.3, Q is clamped to [10, 120]; Appendix B lists the values.
- Top-K = 6 removes the static "bulge" that off-resonant stiffness-line terms would add near the exciters.
- γ = 0.5 sets the contrast: resonance gives G = 1, the midpoint between modes about 0.55.
- Prototype results (`judge/sheet_real_b0.3.png`): continuous crisp lines at resonance and between modes.
- **Sign alignment matters.** The target vector's sign is arbitrary, so `ModeBank` flips it to match the current envelope (§6.7). In a 3 s glide across 7 modes with the 80/600 ms envelopes, the field energy stays at **E/G² ≥ 0.78** with alignment and drops to **0.17** without it (`judge/ts/glide.ts`).
- Target jumps do occur near nearly-degenerate pairs (s5: (0,5) and (10,1), Λ 245.7 vs 250.1). The 80 ms attack envelope turns each jump into a quick morph.

### 6.6 Calibration (`physics/calibration.ts`, full)

```ts
export interface Band { p10: number; p50: number; p90: number }
export interface Calibration { readonly hz: readonly [number, number, number]; readonly ranks: readonly [number, number, number]; toRank(hz: number): number }

export function makeCalibration(band: Band, peakHz: number, bankSize = DRIVE.bankSize,
                                ranks: readonly [number, number, number] = DRIVE.anchors): Calibration {
  let { p10, p50, p90 } = band
  if (!(p50 > 0) || !Number.isFinite(p50)) p50 = p10 > 0 && p90 > p10 ? Math.sqrt(p10 * p90) : 3000
  if (!(p10 > 0 && p90 > p10 && Number.isFinite(p10) && Number.isFinite(p90))) { p10 = p50 * 2 ** -0.35; p90 = p50 * 2 ** 0.35 }
  if (Math.log2(p90 / p10) < 0.4) { const mid = Math.log2(p10 * p90) / 2; p10 = 2 ** (mid - 0.2); p90 = 2 ** (mid + 0.2) }
  let peak = peakHz >= p10 && peakHz <= p90 && Math.abs(Math.log2(peakHz / p50)) <= 1 ? peakHz : p50
  peak = Math.min(p90 * 2 ** -0.05, Math.max(p10 * 2 ** 0.05, peak))
  const x0 = Math.log2(p10), x1 = Math.log2(peak), x2 = Math.log2(p90)
  const [r0, r1, r2] = ranks, sLo = (r1 - r0) / (x1 - x0), sHi = (r2 - r1) / (x2 - x1)
  const lo = -0.45, hi = bankSize - 0.55
  return { hz: [p10, peak, p90], ranks, toRank(hz) {
    if (!(hz > 0)) return r1
    const x = Math.log2(hz), rho = x <= x1 ? r1 + (x - x1) * sLo : r1 + (x - x1) * sHi
    return Math.min(hi, Math.max(lo, rho))
  } }
}
/** Geometric interpolation of Λ along ranks; extrapolates the edge segment. */
export function lambdaAtRank(logLambda: Float64Array, rho: number): number {
  const n = logLambda.length, i = Math.min(n - 2, Math.max(0, Math.floor(rho))), f = rho - i
  return Math.exp(logLambda[i] + f * (logLambda[i + 1] - logLambda[i]))
}
```

Worked example: p10/p50/p90 = 2800/3600/4600 Hz, peak 3700 Hz, square bank.

| Bird Hz | 2800 | 3200 | 3700 | 4200 | 4600 | ≥ 6000 |
|---|---|---|---|---|---|---|
| Rank | 1.000 | 1.958 | 3.000 | 5.329 | 7.000 | 11.45 |
| Λ | 8 | 15.54 | 20 | 37.27 | 52 | 83.88 |

### 6.7 ModeBank (`physics/ModeBank.ts`)

```ts
export interface PlateBankDef {
  shape: PlateShape; key: string                  // 'circle-s4' | 'square'
  symmetry: 0 | 3 | 4 | 5 | 6
  size: number; hero: number                      // 12, 3
  lambda: Float64Array; logLambda: Float64Array; coupling: Float64Array; q: Float64Array
  slotParams: Float32Array                        // size*4 — circle: (lutRow, n, 0, 0); square: (m, n, k, 0)
  keys: readonly string[]                         // '(4,1)' / '(2,4)'
}
export interface FieldDrive {
  count: number                    // active slots ≤ DRIVE.maxSlots (24)
  slots: Float32Array              // 24*4, copied from slotParams of the slot's mode
  coefs: Float32Array              // 24*2, (c1, c2)
  energy: number                   // Σ (c1² + c2²)
  gammaRms: number                 // G_MAX·√energy
  canMove: boolean                 // G_MAX·PHI_MAX·Σ(|c1|+|c2|) ≥ SIM.thetaLo
  maxDelta: number                 // max |Δc| since the last returned FieldDrive
  dominantKey: string | null
}
export class ModeBank {
  configure(shape: PlateShape, bird: PlateBird | null): void
  update(frame: DriveFrame, dt: number, paused: boolean): FieldDrive   // allocation-free
  silence(): void                  // zero envelopes + dominant, keep banks/cal/shape/active slot
  reset(): void                    // silence() + drop the banks
}
```

**Two bank slots, A and B**, each holding `{ def, cal, c1: Float64Array(12), c2: Float64Array(12) }`; `active` ∈ {0, 1}.

**`configure(shape, bird)`**
- `def = shape === 'circle' ? circleBank(symmetryFor(bird)) : squareBank()`; `cal = makeCalibration(bird.bandHz, bird.peakHz)`.
- If the shape changed: `reset()`, put `def` in slot 0, set `active = 0`.
- Else if `def.key` differs from the active slot's key: put `def` in the other slot with zero envelopes and make it active. The old slot releases, which gives a morph.
- Else: only replace `cal`.

**`update(frame, dt, paused)`**

```
audible = frame.audible && !paused;   D = audible ? frame.drive : 0
for bank b ∈ {0,1}: for line p ∈ {1,2}:
  f = p==1 ? frame.f1Hz : frame.f2Hz;  w = p==1 ? 1 : frame.w2
  if b==active && audible && D>1e-3 && f>0 && w>0:
      ν = lambdaAtRank(def.logLambda, cal.toRank(f));  G = lineResponse(ν, def, unit)
      target_k = w·D·G·unit_k
      if Σ target_k·c_{p,k} < 0: target = −target          // global sign is irrelevant to I; keeps envelopes from crossing 0
  else target = 0
  τrel = !audible ? 0.12 : (target ≡ 0 ? 0.30 : 0.60)
  for k: τ = |target_k| > |c_k| ? 0.08 : τrel;   c_k += (target_k − c_k)·(1 − exp(−dt/τ))
compact: modes with |c1|+|c2| > 1e-3 (active bank first), up to 24 → slots/coefs; count
dominant (active bank): e_k = c1_k² + c2_k²; switch to argmax when e_new ≥ 1.3·e_cur for ≥ 0.1 s (immediately if e_cur < 1e-6)
```

- Calibration follows the voice actually playing: see §8.8 step 3.
- **`silence()`** zeroes every envelope and the reference arrays, carries the old values into the pending delta so the next `update()` re-renders a zero field, and clears the dominant key and the drive scalars. It keeps the banks, the calibration, the shape and the active slot. `PlateController.scatter()` calls it when the plate is paused or the source is not audible, so the readouts and Describe stop naming a mode once the sand is flat. `reset()` is `silence()` plus dropping the banks.
- `PHI_MAX = 4.5` bounds |φ| for every bank mode: n = 0 centre values reach 3.85, and rim values reach 3.6.

### 6.8 Radial LUT (`physics/radialLut.ts`, full)

```ts
export function bakeRadialLut(rows: readonly CircleModeRow[], width = SIM.lutWidth, rMax = SIM.lutRMax): Float32Array {
  const out = new Float32Array(rows.length * width * 2)
  for (let k = 0; k < rows.length; k++) {
    const [n, , lam, C, N] = rows[k]
    for (let i = 0; i < width; i++) {
      const x = lam * (i / (width - 1)) * rMax, o = (k * width + i) * 2
      out[o] = N * (besselJ(n, x) + C * besselI(n, x))                    // R(r)
      out[o + 1] = N * lam * (besselJp(n, x) + C * besselIp(n, x))        // dR/dr
    }
  }
  return out
}
// gpu side: new DataTexture(lut, width, rows.length, RGFormat, FloatType)  → RG32F, NearestFilter default, needsUpdate = true
```

- The LUT extends to r = 1.05, past the rim, so the field has no artificial nodal ring at r = 1.
- Bake it **synchronously once per controller**. It takes about 12 ms on desktop and about 40 ms on a low-end phone, all 29 rows.

---

## 7. Sand simulation (workstream B)

### 7.1 State

- One `GPUComputationRenderer` variable **`tState`**: RGBA32F, NearestFilter, size per tier (§8.2).
- Texel = `(x, y, mob, w)`:
  - `x, y`: position in plate units.
  - `mob`: mobility from the last step, 0..1. Drives the hop jitter in rendering.
  - `w`: "visible from" time on the plate clock. Used for the pour and fade-in.
- Per-grain constants come from `pcg3d(texel, 0x2A5F)`. There is no extra texture:
  - lift-off threshold `θᵢ = mix(0.6, 1.4, k.x)`, multiplied by `heavyMul = 3` when `k.y < heavyFrac`.
  - `heavyFrac` is 0.20 on the circle (keeps the grainy coat of reference 2) and 0.04 on the square.

### 7.2 Dynamics (fixed dt = 1/60 s; at most 3 substeps per frame; accumulator)

```
Γ   = G_MAX·√(U₁² + U₂²)                       bilinear sample of the field RT
m   = clamp((Γ − θᵢ)/W, 0, 1)                  0 ⇒ the grain is frozen and its state is bit-identical
x  += clampLen(−κ·m·G_MAX²·∇I·dt, 0.02) + σ·kick·m·min(Γ, Γsat)·√dt·ξ,   ξ ~ N(0, I₂) (Box–Muller from pcg3d)
circle: r > 0.985 ⇒ x *= max(2·0.985 − r, 0.5·0.985)/r        square: reflect at |x|,|y| = 1
NaN guard and square trickle: respawn uniformly; w = clock + 0.15·u   (trickle prob/substep = 0.004·dt while square ∧ audible ∧ D > 0.05)
kick = 1 + 0.8·onset   (1 under reduced motion)
```

Formation is about 70–90 % within 1 s (§0.2). In silence, D → 0 and the coefficients release, so every grain freezes within about 0.5 s. When paused or inaudible the release is τ 0.12 s, so the freeze takes about 0.3 s.

### 7.3 GLSL

Every shader is a `ShaderMaterial`, so three prefixes it with `#version 300 es`, the precision qualifiers, `#define texture2D texture` and `#define gl_FragColor pc_fragColor` (`WebGLProgram.js:804-829`). Use `texture()`, `texelFetch()` and `gl_FragColor`. `uint` math, `gl_VertexID` and `texelFetch` are available.

```glsl
// ===== PCG (prepend to FIELD/SAND_STEP/SCATTER/GRAIN_VERT/PLATE_FRAG) =====
const float INV_U32 = 2.3283064365386963e-10;
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 rand3(uvec3 v) { return vec3(pcg3d(v)) * INV_U32; }
vec2 spawnPos(vec3 r, int shape, float rim) {
  if (shape == 0) { float rr = rim * sqrt(r.x); float a = 6.283185307 * r.y; return rr * vec2(cos(a), sin(a)); }
  return (r.xy * 2.0 - 1.0) * 0.98;
}
```

```glsl
// ===== SAND_STEP_FRAG — GPUComputationRenderer variable 'tState' =====
// init() prepends "uniform sampler2D tState;" and the material has #define resolution vec2(W, H)
uniform sampler2D uField;      // RGBA16F, LinearFilter: (U1, U2, dI/dx, dI/dy) over [-uFieldExt, uFieldExt]^2
uniform float uFieldExt, uDt, uGmax, uSigma, uKappa, uW, uGsat, uDriftMax, uKick;
uniform float uFrame, uClock, uThetaLo, uThetaHi, uHeavyFrac, uHeavyMul, uRim, uTrickle;
uniform int uShape;            // 0 circle, 1 square
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tState, tc, 0);
  vec2 p = s.xy; float w = s.w;
  vec3 k = rand3(uvec3(uvec2(tc), 0x2A5Fu));
  float theta = mix(uThetaLo, uThetaHi, k.x) * (k.y < uHeavyFrac ? uHeavyMul : 1.0);
  vec4 F = texture(uField, p / (2.0 * uFieldExt) + 0.5);
  float gam = uGmax * sqrt(F.x * F.x + F.y * F.y);
  float mob = clamp((gam - theta) / uW, 0.0, 1.0);
  if (mob > 0.0) {
    vec3 r = rand3(uvec3(uvec2(tc), uint(uFrame)));
    vec2 xi = sqrt(-2.0 * log(max(r.x, 1e-7))) * vec2(cos(6.283185307 * r.y), sin(6.283185307 * r.y));
    vec2 drift = -uKappa * mob * uGmax * uGmax * F.zw * uDt;
    float dl = length(drift);
    if (dl > uDriftMax) drift *= uDriftMax / dl;
    p += drift + xi * (uSigma * uKick * mob * min(gam, uGsat) * sqrt(uDt));
    if (uShape == 0) {
      float rr = length(p);
      if (rr > uRim) p *= max(2.0 * uRim - rr, 0.5 * uRim) / rr;
    } else {
      p = mix(p, sign(p) * 2.0 - p, step(1.0, abs(p)));
      p = clamp(p, -1.0, 1.0);
    }
  }
  vec3 t = rand3(uvec3(uvec2(tc), uint(uFrame) ^ 0x9E3779B9u));
  bool bad = !(abs(p.x) < 4.0 && abs(p.y) < 4.0);
  if (bad || t.z < uTrickle) { p = spawnPos(t, uShape, uRim); w = uClock + 0.15 * t.x; mob = 0.0; }
  gl_FragColor = vec4(p, mob, w);
}
```

```glsl
// ===== SCATTER_FRAG — gpu.createShaderMaterial(); rendered with gpu.doRenderTarget() into BOTH tState RTs =====
uniform float uSeed;   // integer-valued, < 2^24
uniform float uClock, uPour, uRim;
uniform int uShape;
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec3 r = rand3(uvec3(uvec2(tc), uint(uSeed) * 747796405u + 1u));
  gl_FragColor = vec4(spawnPos(r, uShape, uRim), 0.0, uClock + uPour * r.z);
}
```

```glsl
// ===== FIELD_VERT / FIELD_FRAG — own FullScreenQuad into fieldRT (256², RGBA16F, Linear, no depth) =====
// FIELD_VERT: void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
#define MAX_SLOTS 24
#define LUT_W 1024
uniform sampler2D uLut;          // RG32F, LUT_W × 29, Nearest: (R, dR/dr) at r = i/(LUT_W−1)·uLutRMax
uniform float uLutRMax, uExt, uRes, uBoltR;    // 1.05, 1.05, 256, (square 0.15 | circle 0)
uniform vec4 uSlot[MAX_SLOTS];   // circle: (lutRow, n, 0, 0); square: (m, n, k, 0)
uniform vec2 uCoef[MAX_SLOTS];   // (c1, c2)
uniform int uCount, uShape;
vec2 radial(float row, float r) {
  float x = clamp(r / uLutRMax, 0.0, 1.0) * float(LUT_W - 1);
  int i0 = min(int(x), LUT_W - 2); float t = x - float(i0); int iy = int(row + 0.5);
  return mix(texelFetch(uLut, ivec2(i0, iy), 0).rg, texelFetch(uLut, ivec2(i0 + 1, iy), 0).rg, t);
}
void main() {
  vec2 p = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * uExt;
  float u1 = 0.0, u2 = 0.0; vec2 g1 = vec2(0.0), g2 = vec2(0.0);
  float r = max(length(p), 1e-4); vec2 er = p / r;
  if (uShape == 0) {
    vec2 et = vec2(-er.y, er.x);
    float th = atan(p.y, p.x) - 1.5707963268;                 // θ − θ0, θ0 = π/2
    for (int i = 0; i < MAX_SLOTS; i++) {
      if (i >= uCount) break;
      vec4 s = uSlot[i]; vec2 c = uCoef[i];
      vec2 R = radial(s.x, r);
      float cn = cos(s.y * th), sn = sin(s.y * th);
      float phi = R.x * cn;
      vec2 gphi = R.y * cn * er - (s.y * R.x / r) * sn * et;
      u1 += c.x * phi; u2 += c.y * phi; g1 += c.x * gphi; g2 += c.y * gphi;
    }
  } else {
    const float HP = 1.5707963268;
    vec2 a = (p + 1.0) * HP;                                  // (πX, πY)
    for (int i = 0; i < MAX_SLOTS; i++) {
      if (i >= uCount) break;
      vec4 s = uSlot[i]; vec2 c = uCoef[i]; float m = s.x, n = s.y, kk = s.z;
      float cmx = cos(m * a.x), cnx = cos(n * a.x), cmy = cos(m * a.y), cny = cos(n * a.y);
      float smx = sin(m * a.x), snx = sin(n * a.x), smy = sin(m * a.y), sny = sin(n * a.y);
      float phi = kk * (cmx * cny + cnx * cmy);
      vec2 gphi = kk * HP * vec2(-m * smx * cny - n * snx * cmy, -n * cmx * sny - m * cnx * smy);
      u1 += c.x * phi; u2 += c.y * phi; g1 += c.x * gphi; g2 += c.y * gphi;
    }
    if (uBoltR > 0.0) {
      float e0 = 0.55 * uBoltR, t = clamp((r - e0) / (uBoltR - e0), 0.0, 1.0);
      float h = t * t * (3.0 - 2.0 * t), dh = 6.0 * t * (1.0 - t) / (uBoltR - e0);
      g1 = h * g1 + u1 * dh * er; g2 = h * g2 + u2 * dh * er; u1 *= h; u2 *= h;
    }
  }
  gl_FragColor = vec4(u1, u2, 2.0 * (u1 * g1 + u2 * g2));
}
```

---

## 8. Rendering (workstream B; three@0.186.1)

### 8.1 Renderer creation and probe (`gpu/capabilities.ts`)

1. Create a fresh `<canvas>`. Construct `new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'default', failIfMajorPerformanceCaveat: true })`.
   - If it throws, retry on a **new** canvas with `failIfMajorPerformanceCaveat: false` and force tier `low`.
   - If that also throws → `PlateError { code: 'webgl-unavailable', recoverable: false }`.
2. Require all of these, otherwise `'float-unsupported'`:
   - `renderer.extensions.has('EXT_color_buffer_float')`
   - `renderer.capabilities.maxVertexTextures ≥ 1`
   - `renderer.capabilities.precision === 'highp'`
3. **Functional probe:**
   - Render `vec4(0.123, -4.5, 1e5, 1.0)` with a `FullScreenQuad` into a 1×1 `WebGLRenderTarget({ type: FloatType, format: RGBAFormat, depthBuffer: false })`.
   - Read it back with `readRenderTargetPixels(rt, 0, 0, 1, 1, Float32Array(4))`. RGBA/FLOAT readback is allowed (`WebGLCapabilities.js:40-53`).
   - A relative error > 1e-6 → `'float-unsupported'`.
   - Dispose the probe RT and quad.
4. **Tier** (`pickTier`):
   - An explicit `quality` prop wins.
   - `auto`:
     - `low` if `(pointer: coarse)` and (`deviceMemory ≤ 4` or `hardwareConcurrency ≤ 4`), or if the caveat retry was used.
     - `high` if `(pointer: fine)` and `hardwareConcurrency ≥ 8`.
     - `medium` otherwise.
5. Settings: `renderer.setClearColor(0x000000, 0)`, `renderer.autoClear = true`.
   - Shaders write display sRGB directly; `ShaderMaterial` without `colorspace_fragment` gets no conversion.

### 8.2 Tiers

| Tier | Sim texture | Grains | DPR cap | Grain size (CSS px) |
|---|---|---|---|---|
| high | 512 × 512 | 262,144 | 2 | 1.0 |
| medium | 512 × 256 | 131,072 | 2 | 1.2 |
| low | 256 × 256 | 65,536 | 1.5 | 1.4 |
| floor (governor only) | 256 × 128 | 32,768 | 1.5 | 1.6 |

**Governor**
- Starts 3 s after each (re)build, and samples only frames where the sim stepped.
- Keeps a ring of 120 rAF intervals and checks p75 every 0.5 s.
- **Downgrade one tier** when p75 > 22 ms for 4 checks in a row (2 s), **unless** ≥ 80 % of intervals fall in [31, 35.5] ms. That pattern is a 30 Hz cap such as iOS Low Power Mode, not overload.
- At most 2 downgrades per session; never upgrade.
- A downgrade rebuilds `SandSim` and the grain geometry at the new size and scatters with no pour. The pattern re-forms in about 1 s.

### 8.3 GPU objects

- **`FieldPass`:**
  - `WebGLRenderTarget(256, 256, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })`.
  - The LUT `DataTexture(RGFormat, FloatType)`.
  - Its own `FullScreenQuad(new ShaderMaterial({ vertexShader: FIELD_VERT, fragmentShader: PCG + FIELD_FRAG, uniforms }))`.
  - Uniform arrays `uSlot` and `uCoef` are **flat `Float32Array`s** of 96 and 48 floats, mutated in place. `WebGLUniforms.flatten` passes number arrays through (`WebGLUniforms.js:74-78`).
  - `render(drive)`: `renderer.setRenderTarget(fieldRT); quad.render(renderer); renderer.setRenderTarget(null)`.
  - Do not use `GPUComputationRenderer.createShaderMaterial` here: its `resolution` define is the sim size.
- **`SandSim`:**
  - `gpu = new GPUComputationRenderer(W, H, renderer)` with the default `FloatType`.
  - `stateVar = gpu.addVariable('tState', PCG + SAND_STEP_FRAG, dummy1x1DataTexture)`; `gpu.setVariableDependencies(stateVar, [stateVar])`.
  - `Object.assign(stateVar.material.uniforms, stepUniforms)`; then `const err = gpu.init(); if (err) throw`.
  - `scatterMat = gpu.createShaderMaterial(PCG + SCATTER_FRAG, scatterUniforms)`.
  - `scatter(seed, clock, pour)`: `gpu.doRenderTarget(scatterMat, gpu.getCurrentRenderTarget(stateVar))`, and the same for `getAlternateRenderTarget`.
  - `step(frame, clock, kick, trickle)`: set the uniforms, then `gpu.compute()`.
  - `texture`: `gpu.getCurrentRenderTarget(stateVar).texture`.
  - `dispose()`: `gpu.dispose()` (frees the RTs, the variable material and the dummy texture), then `scatterMat.dispose()`. `gpu.dispose` does not free `createShaderMaterial` materials (`GPUComputationRenderer.js:321-345`).
- **`GrainLayer`:**
  - `BufferGeometry` with `position = new BufferAttribute(new Float32Array(N), 1)`, which also sets the draw count (`WebGLRenderer.js:1223-1246`). `position` holds the grain indices 0..N-1 as `Float32Array(N)` with itemSize 1. Grains are addressed with `int(position.x + 0.5)`, which equals `gl_VertexID` under drawArrays. Reading the attribute keeps attribute 0 a live array, which avoids Firefox's attrib-0 emulation and link warnings.
  - `Points(geometry, ShaderMaterial({ blending: AdditiveBlending, premultipliedAlpha: true, transparent: true, depthTest: false, depthWrite: false }))`. Additive + premultiplied maps to `blendFunc(ONE, ONE)` (`WebGLState.js:652-653`).
  - `frustumCulled = false`; `renderOrder = 1`.
- **`PlateLayer`:** `Mesh(PlaneGeometry(2, 2), ShaderMaterial({ blending: NoBlending, depthTest: false, depthWrite: false }))`, with `frustumCulled = false` and `renderOrder = 0`.
- **Scene and camera:** `Scene` holds the plate and the grains. The camera is `OrthographicCamera(-1, 1, 1, -1, 0, 1)`; both vertex shaders write NDC directly.

```glsl
// ===== GRAIN_VERT =====
uniform sampler2D uState; uniform int uStateW;
uniform vec2 uScale;            // NDC per plate unit
uniform float uPointPx, uAlpha, uFade, uClock, uFrame, uJitter, uFlicker, uBoltR, uShapeMix;
varying float vAlpha; varying float vSoft;
void main() {
  int id = int(position.x + 0.5);
  vec4 s = texelFetch(uState, ivec2(id % uStateW, id / uStateW), 0);
  vec3 c = rand3(uvec3(uint(id), 0x51u, 0x7Bu));
  vec3 j = rand3(uvec3(uint(id), uint(uFrame), 0x11u));
  float hop = s.z;
  vec2 p = s.xy + (j.xy - 0.5) * (uJitter * hop);                    // uJitter = 0.6 px in plate units; 0 under reduced motion
  gl_Position = vec4(p * uScale, 0.0, 1.0);
  float size = uPointPx * mix(0.8, 1.3, c.x);
  gl_PointSize = clamp(size, 1.0, 6.0);
  vSoft = smoothstep(1.5, 2.5, size);
  float vis = clamp((uClock - s.w) / 0.35, 0.0, 1.0);
  float bolt = uShapeMix > 0.5 && length(s.xy) < uBoltR ? 0.0 : 1.0;  // bolt is drawn by the plate, under no sand
  vAlpha = uAlpha * uFade * vis * bolt * mix(0.55, 1.0, c.y) * (1.0 + uFlicker * hop * (j.z - 0.5));
}
// ===== GRAIN_FRAG =====
uniform vec3 uSand;             // #F3EFE6 → (0.953, 0.937, 0.902)
varying float vAlpha; varying float vSoft;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = vAlpha * mix(1.0, 1.0 - smoothstep(0.16, 0.25, dot(d, d)), vSoft);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uSand * a, a);
}
```

The circle's surface and rim are the page's, not the shader's: app.css `plate-disc` paints a translucent near-black shade (tokens.css `--plate-surface` → `--plate-surface-edge`) that the bird's room shows through, a stone hairline rim (`--plate-rim`, 1.1 % of the radius, at least 1.5 px) and a soft contact shadow (`--plate-shadow`), under the poster and the canvas alike. `PLATE_FRAG` leaves the circle transparent and paints only the square (lab) surface, with no rim or circle uniforms (`uRim`, `uRimW`, `uCircleIn`, `uCircleOut`), and debug heat is additive. `PlateHandle.capture()` returns only the sand, and the shell's `platePhoto` paints the room, the disc and the shadow under it. The listing below is the v1 shader, kept for the square path and the bolt; its circle rim (`uRimW`) is not in the code.

```glsl
// ===== PLATE_VERT: void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
// ===== PLATE_FRAG (premultiplied output) =====
uniform vec2 uViewportPx, uScale; uniform float uPxPerUnit, uShapeMix, uBoltR, uRimW, uGmax, uFieldExt, uDebug;
uniform sampler2D uField; uniform vec3 uAccent;
float sdBox(vec2 p) { vec2 d = abs(p) - 1.0; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 p = (gl_FragCoord.xy / uViewportPx * 2.0 - 1.0) / uScale;
  float aa = 1.0 / uPxPerUnit, rl = length(p);
  float sd = mix(rl - 1.0, sdBox(p), uShapeMix);
  float body = 1.0 - smoothstep(-aa, aa, sd);
  vec3 cIn = mix(vec3(0.078, 0.078, 0.086), vec3(0.051), uShapeMix);   // #141416 | #0d0d0d
  vec3 cOut = mix(vec3(0.047, 0.047, 0.055), vec3(0.039), uShapeMix);  // #0c0c0e | #0a0a0a
  vec3 col = mix(cIn, cOut, clamp(dot(p, p), 0.0, 1.0));
  col *= 1.0 + 0.024 * (rand3(uvec3(uvec2(gl_FragCoord.xy), 7u)).x - 0.5);   // static dither, never animated
  float bevel = max(1.0 - smoothstep(0.0, 2.0 * aa, 1.0 - p.y), 1.0 - smoothstep(0.0, 2.0 * aa, 1.0 + p.x));
  col += 0.06 * bevel * uShapeMix;                                      // square: 1 px top/left highlight
  float inBolt = (1.0 - smoothstep(uBoltR - aa, uBoltR + aa, rl)) * uShapeMix;
  vec2 q = p / uBoltR; float nz = sqrt(max(0.0, 1.0 - dot(q, q)));
  float spec = pow(max(dot(normalize(vec3(q, nz)), normalize(vec3(-0.55, 0.62, 0.9))), 0.0), 24.0);
  vec3 boltCol = vec3(0.28) + vec3(0.14) * nz + vec3(0.6) * spec;
  float outline = smoothstep(uBoltR - 2.0 * aa, uBoltR, rl) * (1.0 - smoothstep(uBoltR, uBoltR + aa, rl));
  col = mix(col, boltCol * (1.0 - 0.7 * outline), inBolt);
  if (uDebug > 0.5) { vec4 F = texture(uField, p / (2.0 * uFieldExt) + 0.5); col += uAccent * 0.35 * smoothstep(0.0, 8.0, uGmax * length(F.xy)); }
  float d = rl - 1.0;                                                   // circle rim r ∈ [1+aa, 1+uRimW], 1 px dark gap
  float rimA = smoothstep(aa, 2.0 * aa, d) * (1.0 - smoothstep(uRimW - aa, uRimW, d)) * (1.0 - uShapeMix);
  vec3 rim = vec3(0.871, 0.859, 0.827) * (0.85 + 0.15 * dot(p / max(rl, 1e-4), normalize(vec2(-0.55, 0.62))));
  gl_FragColor = vec4(rim * rimA + col * body * (1.0 - rimA), rimA + body * (1.0 - rimA));
}
```

### 8.4 Look, sizing and exposure

**Render extent**, in plate units per half canvas: circle **1.035** (the rim, r ≤ 1.03, sits inside the shell's 50 % CSS clip); square **1.0** (the plate fills the frame, whose corners the CSS clips at 6 px).

**On resize** (`ResizeObserver` on the host, coalesced into the next frame):
- `renderer.setPixelRatio(min(devicePixelRatio, tier.dprCap))`; `renderer.setSize(cssW, cssH, false)`. The canvas CSS is `position:absolute; inset:0; width:100%; height:100%; display:block`.
- Let `Wpx, Hpx` be the drawing-buffer size and `ext` the render extent. Then:
  - `uScale = (1/ext)·(min(1, Hpx/Wpx), min(1, Wpx/Hpx))`
  - `uPxPerUnit = min(Wpx, Hpx)/(2·ext)`
  - `uViewportPx = (Wpx, Hpx)`
  - `uJitter = 0.6/uPxPerUnit`
  - `uPointPx = grainCss·pr·clamp(√(plateCssPx/560), 0.8, 1.4)`
- **Exposure:**
  - `areaPx = circle ? π·uPxPerUnit² : 4·uPxPerUnit²`; `ρ0 = N/areaPx`.
  - `A = uPointPx < 1.5 ? uPointPx² : 0.6·π·(uPointPx/2)²`.
  - **`uAlpha = clamp(coat/(ρ0·A), 0.03, 1)`**, with `coat` = 0.16 on the circle and 0.07 on the square. A uniform layer then reads as about 16 % or 7 % grey, and nodal lines, which are 10× denser or more, saturate to white.
- Also listen to `matchMedia('(resolution: …dppx)')` changes, and force one render after every resize.

**Look constants**, in `params.ts` `LOOK`:
- sand `#F3EFE6`
- the circle's rim is the page's (§8.3); bolt r 0.024
- `uFlicker` 0.15, jitter 0.3 px (both 0 under reduced motion)
- **resting sand is settled dust:** until a song first moves it, and again after a Scatter, each grain shows at `restAlpha` 0.45, thinning by `restFalloff`·r² (0.35) toward the rim; the song lifts it to full with a time constant of `restLiftSec` 0.5 s (`uRestLift`, `uRestAlpha`, `uRestFalloff` on the grain pass; an instant jump under reduced motion)
- **no bloom, no glow** (UI anti-pattern list)

### 8.5 Transitions

- **Shape change**, total **0.42 s**, the same as the shell's `border-radius` animation (`cubic-bezier(0.77, 0, 0.175, 1)`):
  - `uShapeMix` and `ext` follow `ease(t/0.42)`.
  - Grain `uFade` goes 1 → 0 over the first 0.16 s.
  - At t = 0.42: `modeBank.configure(newShape, …)` (which resets), set `fieldPass`'s `uShape` and `uBoltR`, `sim.scatter(seed++, clock, 0.5)`, and set `uFade = 1`. The grains then pour in over 0.5 s.
  - Reduced motion: an instant swap with no pour.
- **Bird change:** nothing is reset. A new family takes the other A/B slot and the old one releases (τ 1.8 s), so the sand migrates (UI §5.1).
- **Scatter** (`scatterToken` increments): `sim.scatter(seed++, clock, reducedMotion ? 0 : 1.2)`, and the sand drops back to rest until the song wakes it; the loop stays awake for the pour.
- **First mount:** scatter with pour 0.6 s (0 under reduced motion). The sand then lies **still** until audio drives it.

### 8.6 Reduced motion and accessibility

**Under reduced motion:**
- `uJitter = 0`, `uFlicker = 0`, `kick = 1`, no pour, instant shape swap.
- Pattern formation stays on, because it is the content.
- **Hold** (the `held` prop) is the WCAG 2.2.2 control: it stops the simulation and drawing, while the cheap CPU loop keeps telemetry flowing.

The canvas host is decorative. The shell owns `role="img"` and the labels (UI §8.5).

### 8.7 Context loss, offscreen, sleep

- **`webglcontextlost`**: stop the loop and call `onError({ code: 'context-lost', recoverable: true })`.
- **`webglcontextrestored`**: the React wrapper remounts the controller with a **new canvas** (key bump). That is the same code path as the first mount. Allow at most 3 per session; after that, `onError({ code: 'context-lost', recoverable: false })`. `onReady` fires again after a successful rebuild.
- **Offscreen or hidden:** `IntersectionObserver(host, { threshold: 0 })` and `visibilitychange` call `renderer.setAnimationLoop(null)`.
- **Sleep:** stop the loop when all of these hold for 30 consecutive frames: `!source.isAudible()`, `!drive.canMove`, no transition, pour, scatter fade or pending resize.
- **Wake** (`setAnimationLoop(tick)`, and reset `last`) on: `source.subscribe` callbacks, any prop setter, resize, scatter, becoming visible.
- While audible but silent (gaps between phrases), the loop keeps running but skips the field pass and the sim steps.

### 8.8 Per-frame data flow (`PlateController.tick(time)`)

```
1  dt = clamp((time − last)/1000, 0, 0.1); last = time; clock += dt
2  source.read(time, frame)                                   // latency-compensated DriveFrame (allocation-free)
3  calibration follows the voice: if frame.songId && frame.songId !== configuredId && birdCache.has(frame.songId)
       → modeBank.configure(shape, birdCache.get(frame.songId)); configuredId = frame.songId
   (birdCache: last 4 PlateBird props by id; when nothing is audible, configure from the `bird` prop directly)
4  drive = modeBank.update(frame, dt, paused)                 // CPU, < 0.05 ms
5  every 125 ms → onTelemetry({ modeKey: drive.dominantKey, dominantHz: frame.voiced ? frame.f1Hz : null,
                                gammaRms: drive.gammaRms, tier, grains, fps })
6  transitions.update(dt); governor.sample(time)
7  if (!held):
     if drive.count > 0 && (drive.maxDelta > 2e-4 || fieldStale): fieldPass.render(drive); fieldStale = false
     trickle = shape === 'square' && frame.audible && frame.drive > 0.05 ? 0.004 * SIM.dt : 0
     if drive.canMove || trickle > 0:
        acc += dt; n = 0
        while acc >= SIM.dt && n < SIM.maxSubsteps: sim.step(stepFrame++, clock, kick(frame.onset), trickle); acc −= SIM.dt; n++
        if n === SIM.maxSubsteps: acc = 0
     else acc = 0
8  if stepped || transitions.active || pour/scatter fade || resized || debug:
        grains.uState = sim.texture; grains.uFrame++; renderer.setRenderTarget(null); renderer.render(scene, camera)
9  sleep check (§8.7)
```

React never re-renders per frame. Telemetry is at most 8 Hz.

### 8.9 Disposal (`PlateController.dispose()`, in order)

1. Set `disposed = true` and call `renderer.setAnimationLoop(null)`.
2. Disconnect the ResizeObserver and IntersectionObserver. Remove the `visibilitychange`, `matchMedia`, `webglcontextlost` and `webglcontextrestored` listeners. Unsubscribe from `source`.
3. `sim.dispose()`, then `fieldPass.dispose()` (RT, quad, material, LUT texture), then `grains` (geometry, material), then `plate` (geometry, material).
4. `renderer.dispose()`, then `renderer.forceContextLoss()`. This releases the GL context at once; browsers cap live contexts at about 16, and a reused canvas would hand the lost context to StrictMode's second mount.
5. `canvas.remove()`.

---

## 9. React integration

### 9.1 `src/cymatics/CymaticsPlate.tsx` (lazy chunk)

```tsx
import '@tanstack/react-start/client-only'
import { useEffect, useRef, useState } from 'react'
import type { CymaticsPlateProps } from './types'
import { PlateController } from './gpu/PlateController'

export default function CymaticsPlate(props: CymaticsPlateProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const ctrlRef = useRef<PlateController | null>(null)
  const latest = useRef(props); latest.current = props
  const [gen, setGen] = useState(0)                        // bump = remount with a fresh canvas (context restored)
  const losses = useRef(0)
  useEffect(() => {
    const p = latest.current
    const result = PlateController.create(hostRef.current!, {
      quality: p.quality ?? 'auto', source: p.source, bird: p.bird, shape: p.plateShape, paused: p.paused,
      held: !!p.held, reducedMotion: p.reducedMotion, accentColor: p.accentColor, debug: !!p.debug,
      onReady: (i) => latest.current.onReady?.(i),
      onError: (e) => latest.current.onError?.(e),
      onTelemetry: (t) => latest.current.onTelemetry?.(t),
      onRestored: () => {
        if (++losses.current <= 3) setGen((g) => g + 1)
        else latest.current.onError?.({ code: 'context-lost', recoverable: false, message: 'WebGL context lost repeatedly' })
      },
    })
    if ('code' in result) { p.onError?.(result); return }
    ctrlRef.current = result
    return () => { result.dispose(); ctrlRef.current = null }
  }, [props.quality, gen])
  useEffect(() => { ctrlRef.current?.setShape(props.plateShape) }, [props.plateShape, gen])
  useEffect(() => { ctrlRef.current?.setBird(props.bird) }, [props.bird?.id, gen])
  useEffect(() => { ctrlRef.current?.setPaused(props.paused) }, [props.paused, gen])
  useEffect(() => { ctrlRef.current?.setHeld(!!props.held) }, [props.held, gen])
  useEffect(() => { if (props.scatterToken) ctrlRef.current?.scatter() }, [props.scatterToken])
  useEffect(() => { ctrlRef.current?.setReducedMotion(props.reducedMotion) }, [props.reducedMotion, gen])
  useEffect(() => { ctrlRef.current?.setDebug(!!props.debug, props.accentColor) }, [props.debug, props.accentColor, gen])
  return <div ref={hostRef} className={props.className} style={{ position: 'absolute', inset: 0 }} />
}
```

- `PlateController.create` is **synchronous**: it probes, creates the renderer, bakes the LUT and builds the GPU objects. It returns the controller or a `PlateError`. It appends its own canvas to `host`.
- StrictMode's mount → dispose → mount therefore yields two independent canvases.
- **Prop setters are idempotent.**

### 9.2 Mounting (shell-owned files)

```tsx
// src/components/plate/CymaticsPlate.tsx
import { lazy } from 'react'
import { createClientOnlyFn } from '@tanstack/react-start'
export const LazyCymaticsPlate = lazy(createClientOnlyFn(() => import('~/cymatics/CymaticsPlate')))
// usage: <ClientOnly fallback={<PlatePoster shape={shape} />}><Suspense fallback={<PlatePoster shape={shape} />}><LazyCymaticsPlate … /></Suspense></ClientOnly>
```

This is the same pattern as the existing `ThreeProbe.tsx`: the server gets a throwing stub that is never called inside `ClientOnly`. `ClientOnly` and `useHydrated` are exported by `@tanstack/react-router@1.170.46` (`dist/esm/index.d.ts:8`). `createClientOnlyFn` comes from `@tanstack/react-start@1.169.4` (`dist/esm/index.d.ts:3`).

### 9.3 Mapping to the UI spec's contracts (§9.3 there)

| UI `AudioApi` / `CymaticsPlateProps` | Engine |
|---|---|
| `listen()` | `engine.listen()` |
| `select(bird)` | `engine.load({ id: bird.slug, ...bird.audio })` |
| `toggle` / `play` / `pause` / `setVolume` / `setMuted` | same names |
| `prefetch(src)` | `engine.prefetch(assetOf(neighbour))` |
| `getSnapshot` / `subscribe` | `engine.getSnapshot()` / `engine.subscribe()`. The UI's `AudioSnapshot.status` = `state`, `slug` = `songId`. |
| `features()` | `engine.readFeatures(performance.now(), buf)`, then `buf.modeLabel = plateTelemetryRef.current?.modeKey ?? null` |
| `shape` | `plateShape` |
| `features` getter | `source = engine.driveSource` |
| `active` | `paused = !active` |
| `held` / `scatterToken` / `reducedMotion` / `onReady` / `onError` | same names |
| (new) | `bird` (`{ id: slug, bandHz, peakHz, symmetry }`), `onTelemetry` (feeds the mode readout) |

### 9.4 `describeMode.ts` (three-free; resolves UI open decisions 2 and 5)

```ts
export function describeMode(shape: PlateShape, modeKey: string): string {
  const m = /^\((\d+),\s*(\d+)\)$/.exec(modeKey)
  if (!m) return `Mode ${modeKey}`
  const a = Number(m[1]), b = Number(m[2]), head = `Mode (${a}, ${b})`
  const pl = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`
  if (shape === 'circle')
    return a === 0 ? `${head}: ${pl(b, 'nodal circle')}, no nodal diameters.` : `${head}: ${pl(a, 'nodal diameter')} and ${b === 0 ? 'no nodal circles' : pl(b, 'nodal circle')}.`
  if (a === 0) return `${head}: ${b} half-waves across the plate, in both directions at once.`
  if (a === b) return `${head}: ${a} half-waves along each side.`
  return `${head}: ${a} and ${b} half-waves across the plate, in both directions at once.`
}
export const MAPPING_SENTENCE =
  "Each song is spread over twelve resonant modes of the plate: the bird's most frequent note lands on the plate's signature pattern, lower notes reach simpler patterns and higher notes more intricate ones."
```

---

## 10. Fallbacks

| Condition | Behaviour |
|---|---|
| No WebGL2, or the renderer constructor throws twice | `onError('webgl-unavailable')`. The shell keeps the `PlatePoster` and its message. Audio, spectrum and readouts keep working. |
| No `EXT_color_buffer_float`, failed float probe, or not `highp` | `onError('float-unsupported')`; same shell behaviour. Half-float state is **rejected**: its 11-bit mantissa swallows the small steps near nodes. |
| A shader compile error on first render (caught via `renderer.debug.onShaderError`) | `onError('init-failed', recoverable: false)` |
| Context lost or restored | §8.7 |
| Slow device | Tiers plus the governor (§8.2) |
| AAC not decodable | `fallbackSrc`; otherwise engine error `decode`. The plate simply stays still. |
| No `AudioContext` | Engine error `unsupported`. The UI's `<noscript>` `<audio>` path is for no-JS only. |
| Worker or WASM | Not used anywhere in v1 |

---

## 11. Lifecycle rules (both workstreams)

1. **The audio engine is one per app.** Get it with `getAudioEngine()`, which is client-only, and never construct it in render.
   - The shell's `AudioProvider` calls it lazily in an effect and uses `SERVER_SNAPSHOT` for `useSyncExternalStore`'s server snapshot.
   - It is never disposed in production. In dev, `import.meta.hot?.dispose(() => getAudioEngine().dispose())` lives in the provider module.
2. **The plate is one controller per mounted component, with its own canvas.** Effects create it and dispose it. Every async continuation, such as the `onRestored` remount, checks `disposed`.
3. **No per-frame React state.** Telemetry is at most 8 Hz, and the UI reads features through refs.
4. **No module-scope DOM access** in `src/audio/engine/**` or in `src/cymatics/{physics,types,params,describeMode,index}`. They are imported during SSR on workerd.
5. **All per-frame paths are allocation-free:** analysis, `ModeBank`, `lineResponse` and the controller tick. Scratch arrays live at module or instance scope.

---

## 12. Parameters (single source of truth)

### 12.1 `src/audio/engine/params.ts`

```ts
export const AUDIO = {
  latencyHint: 'interactive', xfInSec: 1.2, xfOutSec: 0.9, startDelaySec: 0.02, stopPadSec: 0.05, slowLoadFadeMs: 700,
  pauseTau: 0.12, suspendDelayMs: 700, resumeTau: 0.1, volumeTau: 0.02, muteTau: 0.015, defaultVolume: 0.7,
  maxVoices: 3, capFadeSec: 0.04, byteCacheEntries: 6, decodedBudgetDesktop: 48 * 2 ** 20, decodedBudgetMobile: 24 * 2 ** 20,
  aacPrimingFrames: 2112, aacPrimingRate: 44100,
} as const
export const ANALYSIS = {
  fftSize: 2048, minDb: -100, maxDb: -20, floorDb: -160,
  bandLoMinHz: 150, bandHiMaxHz: 12000, bandLoFactor: 1 / 1.6, bandHiFactor: 1.6, taperLo: 0.85, taperHi: 1.25, bandGlideSec: 1.0,
  floorFallTau: 0.25, floorRiseDbPerSec: 6, floorK: 2,
  snrOpenDb: 9, snrCloseDb: 6, loudOpen: 0.3, loudClose: 0.15, openHoldSec: 0.02, closeHoldSec: 0.06,
  peakDecayDbPerSec: 1.0, loudRangeDb: 24, tonalCrest: 8, crestMinBins: 32,
  secondMinOct: 1 / 3, secondMinRel: 0.35, secondMaxW: 0.6, harmonicTol: 0.03,
  pitchRawTau: 0.03, pitchJumpOct: 0.5, pitchJumpHoldSec: 0.03, medianWindowSec: 0.4, medianMax: 64, glideBeta: 0.35, line2Tau: 0.04,
  driveAttack: 0.025, driveRelease: 0.2,
  onsetRing: 32, onsetMadK: 3, onsetBiasDb: 1.0, onsetRefractorySec: 0.06, onsetDecay: 0.09, onsetPendingSec: 0.1,
  historySize: 48, dedupeMs: 4, maxLatencySec: 0.3,
} as const
```

Relations `__tests__/params.test.ts` holds (2026-10-29, the slower fades):
- `suspendDelayMs ≥ 5·pauseTau + 50 ms`: the suspend never cuts the pause release (5 τ ≈ −43 dB; 700 ms is 5.8 τ, ~−50 dB).
- `bandGlideSec ≥ xfOutSec + stopPadSec`: the union band outlasts the old voice (§5.2).
- `0.03 ≤ capFadeSec ≤ min(0.05, stopPadSec)`: an over-cap voice fades out fast, and its new stop time can't make it sound longer (§4.4).
- `muteTau < pauseTau / 4`: mute stays instant.

### 12.2 `src/cymatics/params.ts`

```ts
export const SIM = {
  dt: 1 / 60, maxSubsteps: 3, gMax: 6, sigma: 0.09, kappa: 4e-4, w: 0.3, gSat: 4, driftMax: 0.02,
  thetaLo: 0.6, thetaHi: 1.4, heavyMul: 3, heavyFrac: { circle: 0.2, square: 0.04 },
  rim: 0.985, trickleRate: 0.004, onsetKick: 0.2,
  fieldRes: 256, fieldExt: 1.05, lutWidth: 1024, lutRMax: 1.05, boltFlatR: 0.15,
  pourSec: 0.6, scatterPourSec: 1.2, shapeSwapPourSec: 0.5, grainFadeSec: 0.35,
} as const
export const DRIVE = {
  bankSize: 12, hero: 3, anchors: [1, 3, 7] as const, beta: 0.3, qMin: 10, qMax: 120, topK: 6, gamma: 0.5,
  // Breath-paced: the figure swells in over ~0.6 s and lets go over ~1.8 s, so trills read as waves.
  coefAttack: 0.6, coefReleaseMorph: 1.8, coefReleaseGap: 1.8, coefReleaseStop: 0.3,
  maxSlots: 24, slotEps: 1e-3, fieldDirtyEps: 2e-4, dominanceRatio: 1.3, dominanceHoldSec: 1.5,
  phiMax: 4.5, telemetryHz: 8, circleTheta0: Math.PI / 2,
  family: { nMax: 12, deadMax: 0.52 }, symmetryChoices: [3, 4, 5, 6] as const,
} as const
export const LOOK = {
  extent: { circle: 1.035, square: 1.0 }, coat: { circle: 0.16, square: 0.07 },
  restAlpha: 0.45, restFalloff: 0.35, restLiftSec: 0.5,
  sand: '#F3EFE6', boltR: 0.024, jitterPx: 0.3, flicker: 0.15,
  shapeSec: 0.42, shapeEase: [0.77, 0, 0.175, 1] as const, grainFadeOutSec: 0.16,
} as const
export const TIERS = {
  high:   { w: 512, h: 512, dprCap: 2,   grainCss: 1.0 },
  medium: { w: 512, h: 256, dprCap: 2,   grainCss: 1.2 },
  low:    { w: 256, h: 256, dprCap: 1.5, grainCss: 1.4 },
  floor:  { w: 256, h: 128, dprCap: 1.5, grainCss: 1.6 },
  governor: { warmupSec: 3, ring: 120, checkSec: 0.5, p75Ms: 22, checks: 4, capLo: 31, capHi: 35.5, capShare: 0.8, maxDowngrades: 2 },
} as const
```

---

## 13. Tests (Vitest, `environment: 'node'`, files in `__tests__/` next to the code)

### 13.1 Workstream A (`src/audio/engine`)

**`loopRegion.test.ts`**
- Manifest region used as given.
- Unpadded file with 2112-frame priming at 44.1 kHz → `trimmed`, start 0.0479.
- Invalid manifest (end < start, wrong length) → falls back.
- Buffer shorter than L → `whole`.

**`fades.test.ts`**
- `FADE_IN[0] = 0`, `FADE_IN[63] = 1`.
- `FADE_IN² + FADE_OUT² = 1` for every index (1e-6).
- Both are monotonic.

**`clock.test.ts`**
- `heardTime` with a valid timestamp extrapolates and is clamped to `currentTime`.
- A timestamp of 0, a stale one (> 0.5 s) or a missing method falls back to `outputLatency`, then `baseLatency`, then 0.
- Latency is clamped to 0.3.
- `loopPosition` wraps, and is 0 before `t0`.

**`onePole.test.ts`**
- One 16 ms step equals two 8 ms steps (1e-12).
- 30, 60 and 144 Hz reach the same value at 1 s (1e-9).

**`spectral.test.ts`**
- Parabolic peak on a synthetic Blackman-windowed tone recovers the frequency within 0.05 bin.
- `bandWeights` is 0 outside `[lo, hi]` and 1 inside `[0.85·p10, 1.25·p90]`.
- Median and MAD are correct on odd and even lengths, without allocation (spy on `Float32Array` / `Array` constructors).

**`NoiseFloor.test.ts`**
- Settles on stationary noise within 10 s.
- A tone 20 dB above the floor for 2 s keeps more than 14 dB of clean power.

**`Gate.test.ts`**
- Opens only after the 20 ms hold; closes only after the 60 ms hold.
- Flutter shorter than the hold times does not toggle it.

**`PitchTracker.test.ts`**
- A constant 3 kHz input gives exactly 3 kHz.
- A sweep within one syllable lags toward the median (β = 0.35).
- A 0.6-octave jump held for 40 ms resets the syllable.
- Unvoiced frames hold the last value.

**`OnsetDetector.test.ts`**
- Tone bursts every 200 ms give one onset per burst (within ±1 frame).
- Steady noise gives no onsets.
- The 60 ms refractory period is respected.

**`FrameHistory.test.ts`**
- Picks the newest entry with time ≤ heard, or the oldest if none.
- Wraps after 48 entries; spectrum arrays are reused, not reallocated.

**`SongAnalyzer.test.ts`** (fake analyser that returns scripted dB frames)
- A 3 kHz tone gives `voiced`, `f1` ≈ 3 kHz (±3 Hz) and `drive` → `loud`.
- White noise only stays unvoiced.
- `audible = false` gives `drive` → 0 with τ 0.2 and `voiced = false`.
- Two calls within 4 ms do not double-update.

**`AudioEngine.test.ts`** (`__tests__/FakeAudioContext.ts`: manual clock; a recording `AudioParam` that **throws `NotSupportedError` when a second `setValueCurveAtTime` overlaps**; controllable `decodeAudioData`; `state` / `resume` / `suspend` / `statechange`)
- `load` while idle fetches without creating a context.
- `listen()` creates the context synchronously and moves through loading → playing.
- `load` A → B → C with decodes resolving in the order C, A, B → only C plays; A and B are cached.
- **No param ever gets two curves**, including a retire during a fade-in.
- A 700 ms slow decode retires the old voice.
- `load` while paused stays paused and plays `pending` on `play()`.
- `pause` makes `isAudible()` false synchronously, releases with τ 0.12, and suspend happens after 700 ms.
- An `interrupted` state change gives `paused` + `interrupted`; `running` again → `playing`.
- Volume uses the `v²` taper; mute keeps the volume.
- More than 3 voices are capped; the voice over the cap fades out on its trim in 40 ms (from its own trim level to 0), then stops and disconnects.
- `dispose` closes the context.
- Fetch 404 → `network`; decode rejection → tries `fallbackSrc`, then `decode`.

### 13.2 Workstream B (`src/cymatics`)

**`bessel.test.ts`**
- Against SciPy (Appendix C): |ΔJ| < 1e-12 for x ≤ 10, < 5e-8 for x ≤ 24; |ΔI|/I < 1e-13.
- The identity `J_{n−1} + J_{n+1} = (2n/x)·J_n` holds on 1000 seeded random points with n ≤ 12, x ∈ [0.5, 20] (1e-7).
- `J_n(0) = δ_{n0}`.

**`circleTable.test.ts`**, for every row:
- Free-edge residuals `|a − C·b|/(|a|+|C·b|) < 1e-6` and `|c − C·d|/(|c|+|C·d|) < 1e-6` (ν = 0.33).
- The number of sign changes of R on (0, 1] equals c.
- Normalisation: Simpson `(n=0 ? 2 : 1)·∫N²R²r dr = 1` (1e-6).
- P = N·R(1) (1e-6).
- Λ is strictly increasing.
- The Chladni-law check: Spearman ρ(Λ, (n + 2c)²) > 0.9.

**`banks.test.ts`**
- `circleBank(s)` for s ∈ {3, 4, 5, 6} matches the Appendix A index lists exactly.
- Hero is index 3 and equals (s, 1).
- Every n is a multiple of s, ≤ 12, with `deadR ≤ 0.52`.
- `squareBank()` matches Appendix A, with P and k as given.
- On a 512² grid, square modes are orthonormal (|⟨φᵢφⱼ⟩ − δ| < 0.01) and circle modes have RMS 1 (±1 %).
- `symmetryFor` is deterministic and honours the override.

**`response.test.ts`**
- `qFromSpacing` matches Appendix B to 0.1.
- ν = Λ_hero gives |`out[hero]`| > 0.98, G = 1, and |other| < 0.15. Measured max |other|: s3 0.004, s4 0.058, s5 0.131, s6 0.022, square 0.027.
- ν at the geometric midpoint of hero and hero+1 gives G in [0.5, 0.9]. Measured: s3 0.56, s4 0.84, s5 0.55, s6 0.69, square 0.55.
- ‖out‖ = 1, and at most 6 entries are non-zero.
- Allocation-free.

**`calibration.test.ts`**
- The anchors map exactly (p10 → 1, peak → 3, p90 → 7). The map is monotone and clamped to [−0.45, 11.45].
- Degenerate inputs (NaN, 0, p10 = p90, a peak outside the band or more than 1 octave from p50) give finite, monotone maps.
- The worked-example table in §6.6 is reproduced (1e-3).

**`ModeBank.test.ts`**
- A tone at the hero frequency makes the hero dominant (> 0.9 of energy) within 0.3 s.
- `paused = true` or `audible = false` drives energy below 1e-4 within 1.5 s, and `canMove` turns false.
- A bird with a different symmetry uses the other A/B slot, and the old slot decays with τ 0.6.
- A shape change resets.
- Dominance switches only after 1.3× held for 100 ms.
- Envelopes are frame-rate independent: 30, 60 and 144 Hz agree within 1e-6 at 1 s.
- **Sign alignment:** glide ν log-linearly from rank 1 to rank 8 over 3 s at 60 Hz with D = 1. After the first 0.5 s, energy stays **E ≥ 0.7·G²** at every frame for s4, s5 and square. Disabling alignment must break this; the prototype gives 0.17.
- `count ≤ 24`; no allocations.

**`radialLut.test.ts`**
- 29 × 1024 × 2 floats.
- The interpolated R and dR/dr match direct evaluation at 4001 radii: error < 1e-4·max|R|, and < 1e-3·max|dR| for dR.
- Finite at r = 1.05.

**`pcg.test.ts`**
- TS `pcg3d` matches hard-coded vectors: compute them once from the formula and freeze them in the test.
- uint32 wrap-around behaves correctly.

**`sandReference.test.ts`** (a CPU port of `FIELD_FRAG` + `SAND_STEP_FRAG` sharing `params.ts`; scratch reference `scratchpad/judge/ts/sandcheck.ts`)
- Circle s = 4, hero (4,1) at G = 1, 20k grains (W = 160), heavy 0, 60 steps: **≥ 80 %** of grains have Γ < 1. The quiet area is **≤ 25 %**; the prototype measured 0.89 and 0.205.
- Gain 0: positions are **bit-identical** after 10 steps.
- No grain ever has r > 0.985 (circle) or |x| > 1 (square).
- With `uTrickle = 0.01`, about 1 % of grains respawn per step (χ² test).
- The accumulator gives the same number of substeps over 1 s at 30, 60, 120 and 144 Hz (±1).

**`describeMode.test.ts`**: the strings for (0,2), (4,1), (1,0), square (0,2), (2,4) and (4,4); malformed keys fall back.

### 13.3 Cross-cutting

**`imports.test.ts`**: read the source files with `fs` and assert:
- No `from 'three` in `src/audio/**` or `src/cymatics/{physics,types.ts,params.ts,describeMode.ts,index.ts}`.
- No `window.` or `document.` at module scope in those files (regex on top-level lines).

**Manual and Playwright checks (outside Vitest):**
- Headless Chromium (SwiftShader) on `/?debug=1`: no GL errors, `onReady` fired, a canvas histogram that is not uniform after 2 s of a synthetic tone.
- Device matrix:
  - iPhone: silent switch on and off, a call interruption, Low Power Mode at 30 Hz.
  - Android mid-range: Adreno 6xx / Mali-G5x.
  - Safari, Firefox and Chrome on desktop.
  - `forceContextLoss` / `forceContextRestore` via the debug panel.

---

## 14. Verified API index

All entries are three@0.186.1 (`scratchpad/three-src-judge/package`) unless marked.

**Package**
- `package.json:10-19` exports: `three`, `three/addons/*` → `examples/jsm/*`.

**`WebGLRenderer`** (`src/renderers/WebGLRenderer.js`)

| API | Line(s) |
|---|---|
| constructor options (`alpha`, `premultipliedAlpha`, `powerPreference`, `failIfMajorPerformanceCaveat`, `outputBufferType`) | 70-85 |
| context listeners registered before creation | 403-405 |
| throws when context creation fails | 409-425 |
| `forceContextLoss` / `forceContextRestore` | 607-625 |
| `setPixelRatio` | 640 |
| `setSize(w, h, updateStyle)` | 671 |
| `setClearColor` | 929 |
| `dispose` | 1086 |
| `onContextLost` (`preventDefault`) / `onContextRestore` (`initGLContext`) | 1113 / 1123 |
| `setAnimationLoop` | 1609 |
| `render` | 1637 |
| draw count from `position.count` + draw range | 1223-1246 |
| `getRenderTarget` / `setRenderTarget` | 2891 / 2934 |
| `readRenderTargetPixels` | 3132 |
| `debug.checkShaderErrors` / `debug.onShaderError` | 164-169 (invoked at `WebGLProgram.js:866-885`) |

**Supporting WebGL modules** (`src/renderers/webgl/`)

| File | Finding |
|---|---|
| `WebGLExtensions.js:31-38` | requests `EXT_color_buffer_float`, `OES_texture_float_linear` and `EXT_color_buffer_half_float`; `has()` |
| `WebGLCapabilities.js:40-53` | FloatType readback allowed |
| `WebGLCapabilities.js:55-90` | precision fallback |
| `WebGLCapabilities.js:119-133` | `isWebGL2`, `precision`, `maxVertexTextures` |
| `WebGLProgram.js:804-829` | `ShaderMaterial` → `#version 300 es`, `#define texture2D texture`, `gl_FragColor` → `pc_fragColor` |
| `WebGLProgram.js:308-343` | precision qualifiers, including `int`/`usampler2D` |
| `WebGLTextures.js:155-178`, `:232-233` | RED/FLOAT → R32F, RG/FLOAT → RG32F, RGBA FLOAT/HALF_FLOAT → RGBA32F/RGBA16F |
| `WebGLState.js:652-653` | Additive + premultiplied → `blendFunc(ONE, ONE)`; `:678-679` non-premultiplied |
| `WebGLUniforms.js:74-78` | `flatten` passes number arrays through |
| `WebGLUniforms.js:716-722` | vec4 arrays uploaded on every call |

**Textures, materials, objects**
- `src/textures/DataTexture.js`: default Nearest filters (`:13`), `generateMipmaps = false`, `flipY = false`, `unpackAlignment = 1` (`:60-81`).
- `src/core/RenderTarget.js:59-72`: defaults (`depthBuffer` true, `minFilter` Linear, `count` 1).
- `src/materials/Material.js:417`: `premultipliedAlpha`.
- `src/math/Color.js:286`: `setStyle`; `:619`: `getRGB(target, colorSpace)`.
- `src/objects/Points.js:38`; `src/core/Object3D.js:315`: `frustumCulled`.
- `src/core/BufferGeometry.js:363`: `setDrawRange`.
- `src/constants.js`: `AdditiveBlending` 133, `NoBlending` 117, `NearestFilter` 581, `LinearFilter` 613, `FloatType` 691, `HalfFloatType` 699, `RGBAFormat` 763, `RedFormat` 788, `RGFormat` 804, `REVISION` '186' at 1.

**`GPUComputationRenderer`** (`examples/jsm/misc/GPUComputationRenderer.js`)

| API | Line(s) |
|---|---|
| constructor | 113 |
| default `FloatType` | 119 |
| `setDataType` | 135 |
| `addVariable` (Nearest default) | 150, 162 |
| `setVariableDependencies` | 178 |
| `init` (only checks `maxVertexTextures`; returns `string \| null`; prepends dependency samplers) | 189-196, 243 |
| `compute` | 260 |
| `getCurrentRenderTarget` / `getAlternateRenderTarget` | 299 / 311 |
| `dispose` (does not free `createShaderMaterial` materials) | 321-345 |
| `addResolutionDefine` | 348 |
| `createShaderMaterial` | 364 |
| `createRenderTarget` | 394 |
| `createTexture` | 424 |
| `renderTexture` | 439 |
| `doRenderTarget` (saves and restores the RT) | 457 |

Types are in `@types/three/examples/jsm/misc/GPUComputationRenderer.d.ts`.

**`FullScreenQuad`**
- `examples/jsm/postprocessing/Pass.js:138`: shared fullscreen triangle (`:106-123`), exported at `:191`.
- Types: `@types/three/examples/jsm/postprocessing/Pass.d.ts:24`.

**WebGPU, examined and rejected for v1**

| File | Finding |
|---|---|
| `WebGPURenderer.js:41,57-75` | `forceWebGL` / `getFallback` |
| `Renderer.js:784` | async `init` |
| `Renderer.js:2877` / `:2992` | `compute` / `computeAsync` |
| `Renderer.js:595`, `:1348-1360` | `onDeviceLost`, `_isDeviceLost` |
| `WebGLBackend.js:918-1015`, `:1777` | transform-feedback compute (`SEPARATE_ATTRIBS`) |
| `PointsNodeMaterial.js:57-60` | WebGPU points are 1 px |

**TanStack**
- `@tanstack/react-router@1.170.46` `dist/esm/index.d.ts:8`: `ClientOnly`, `useHydrated`.
- `@tanstack/react-start@1.169.4`: `dist/esm/index.d.ts:3` `createClientOnlyFn`; `./client-only` marker export (`dist/esm/client-only.d.ts`).

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Patterns look like mush | s-fold symmetric families, syllable-median pitch, top-6 sparsification, in-phase projection, 80/600 ms envelopes, dominance hysteresis, and lift-off thresholds that freeze off-resonance motion. All prototype-verified (`judge/sheet_real_b0.3.png`). |
| Lines break into dots | In-phase projection, plus per-grain threshold spread. |
| AAC loop click or gap | Padded loop region from the manifest; heuristic trim fallback; the pipeline bakes a seam crossfade. |
| Rapid switching overlaps or throws | Generation token + `AbortController`; two-stage fades with one curve per param; at most 3 voices; the UI debounces by 250 ms. |
| iOS mute, interruptions | `audioSession.type = 'playback'`; the `interrupted` flag; `play()` from a gesture resumes. |
| Audio/visual desync (Bluetooth) | A 48-entry history read at `heardTime()`, which uses `getOutputTimestamp`, then `outputLatency`, then `baseLatency`. |
| Float or precision traps | RGBA32F state only (probe-verified); LUT in float32 from float64 series; RGBA16F field (signed values are precise near zero); uint PCG. |
| StrictMode, HMR, context caps | One canvas per mount + `forceContextLoss`; `getAudioEngine` singleton on `globalThis`. |
| three leaking into SSR | Import-rule test; `createClientOnlyFn` + `ClientOnly` + the `client-only` marker. |
| Mobile heat | Tiers + governor; skip sim/field in silence; sleep when frozen; pause offscreen; DPR caps. |
| GLSL compile issues on some GPUs | GLSL ES 3.00 only, no extensions beyond `EXT_color_buffer_float`; Playwright SwiftShader smoke test; `onError('init-failed')` → poster. |

---

## Appendix A — Tables (paste into `circleTable.ts` / `banks.ts`)

```ts
// [n, c, lambda, C, N, P, deadR]   free edge, ν = 0.33, unit radius; Λ = λ²; N: RMS normalisation; P = N·R(1)
export type CircleModeRow = readonly [n: number, c: number, lambda: number, C: number, N: number, P: number, deadR: number]
export const CIRCLE_MODES: readonly CircleModeRow[] = [
  [ 0, 1,  3.011461217048, -8.380984999418e-02, 2.1979477491, -1.487547, 0.000],  //  0 Λ=9.0689   nodal r=[0.679]
  [ 3, 0,  3.499127642421,  9.635689894513e-02, 4.5349479203,  2.550701, 0.399],  //  1 Λ=12.2439
  [ 4, 0,  4.639743227307,  4.582458437743e-02, 5.3282122384,  2.734132, 0.475],  //  2 Λ=21.5272
  [ 0, 2,  6.205398340493,  3.119140729870e-03, 3.1389230215,  1.431408, 0.000],  //  3 Λ=38.5070   [0.391, 0.841]
  [ 3, 1,  7.274683338640, -1.863718749332e-03, 4.9564740653, -2.151324, 0.182],  //  4 Λ=52.9210   [0.847]
  [ 4, 1,  8.566114413138, -6.789045397436e-04, 5.4428005481, -2.202275, 0.245],  //  5 Λ=73.3783   [0.863]
  [ 0, 3,  9.370844486637, -1.276954865952e-04, 3.8467766583, -1.421642, 0.000],  //  6 Λ=87.8127   [0.257, 0.591, 0.893]
  [ 5, 1,  9.823823118530, -2.622548842619e-04, 5.8981243889, -2.251221, 0.297],  //  7 Λ=96.5075   [0.875]
  [ 3, 2, 10.578455317809,  5.715651247086e-05, 5.8681495729,  2.085063, 0.125],  //  8 Λ=111.9037  [0.604, 0.899]
  [ 6, 1, 11.055922721604, -1.058392020397e-04, 6.3290851030, -2.297360, 0.340],  //  9 Λ=122.2334  [0.884]
  [ 4, 2, 11.930160985043,  1.861713995458e-05, 6.2753263135,  2.118552, 0.175],  // 10 Λ=142.3287  [0.637, 0.908]
  [ 0, 4, 12.525181124156,  5.368362588898e-06, 4.4424719272,  1.418338, 0.000],  // 11 Λ=156.8802  [0.192, 0.441, 0.692, 0.919]
  [ 5, 2, 13.250092007033,  6.431578800463e-06, 6.6610095496,  2.151914, 0.219],  // 12 Λ=175.5649  [0.662, 0.915]
  [ 8, 1, 13.463350936054, -1.897240503162e-05, 7.1344669438, -2.381480, 0.408],  // 13 Λ=181.2618  [0.898]
  [ 3, 3, 13.808494235414, -2.039566326569e-06, 6.6584094369, -2.054163, 0.096],  // 14 Λ=190.6745  [0.462, 0.708, 0.924]
  [ 6, 2, 14.544567807893,  2.326659698747e-06, 7.0291288910,  2.184275, 0.257],  // 15 Λ=211.5445  [0.683, 0.92]
  [ 9, 1, 14.645271797838, -8.331592073330e-06, 7.5144612783, -2.419977, 0.435],  // 16 Λ=214.4840  [0.903]
  [ 4, 3, 15.197488495112, -6.163234456208e-07, 7.0184764420, -2.078177, 0.138],  // 17 Λ=230.9637  [0.499, 0.729, 0.93]
  [ 0, 5, 15.674661491611, -2.281499629760e-07, 4.9670626538, -1.416833, 0.000],  // 18 Λ=245.6950  [0.153, 0.352, 0.552, 0.753, 0.935]
  [10, 1, 15.815696624347, -3.729631412181e-06, 7.8819670973, -2.456458, 0.460],  // 19 Λ=250.1363  [0.908]
  [ 5, 3, 16.556827144532, -1.971734856532e-07, 7.3625089554, -2.102937, 0.175],  // 20 Λ=274.1285  [0.53, 0.746, 0.934]
  [ 8, 2, 17.074039703120,  3.383500941061e-07, 7.7232235794,  2.244951, 0.320],  // 21 Λ=291.5228  [0.716, 0.929]
  [ 6, 3, 17.891678209054, -6.606048202694e-08, 7.6929918271, -2.127651, 0.209],  // 22 Λ=320.1121  [0.555, 0.76, 0.938]
  [12, 1, 18.128247326610, -7.834191938061e-07, 8.5851094132, -2.524285, 0.501],  // 23 Λ=328.6334  [0.915]
  [ 0, 6, 18.821610797950,  9.749511540537e-09, 5.4412527211,  1.416024, 0.000],  // 24 Λ=354.2530  [0.128, 0.293, 0.46, 0.626, 0.794, 0.946]
  [10, 2, 19.542858122090,  5.468803302506e-08, 8.3728982772,  2.300203, 0.371],  // 25 Λ=381.9233  [0.741, 0.935]
  [ 5, 4, 19.809403129049,  6.750669840673e-09, 8.0049642368,  2.074539, 0.147],  // 26 Λ=392.4125  [0.443, 0.623, 0.793, 0.946]
  [ 6, 4, 21.173549854084,  2.134715685681e-09, 8.3084578958,  2.094054, 0.177],  // 27 Λ=448.3192  [0.469, 0.642, 0.804, 0.949]
  [12, 2, 21.965802605065,  9.563723121009e-09, 8.9876386069,  2.350696, 0.412],  // 28 Λ=482.4965  [0.76, 0.94]
] as const

// circleBank(s) row indices (derived by the rule in §6.3; tests assert equality). Hero = index 3 = (s,1).
export const CIRCLE_FAMILY_ROWS = {
  3: [0, 1, 3, 4, 6, 8, 9, 11, 14, 15, 16, 18],   // (0,1)(3,0)(0,2)(3,1)(0,3)(3,2)(6,1)(0,4)(3,3)(6,2)(9,1)(0,5)
  4: [0, 2, 3, 5, 6, 10, 11, 13, 17, 18, 21, 23], // (0,1)(4,0)(0,2)(4,1)(0,3)(4,2)(0,4)(8,1)(4,3)(0,5)(8,2)(12,1)
  5: [0, 3, 6, 7, 11, 12, 18, 19, 20, 24, 25, 26],// (0,1)(0,2)(0,3)(5,1)(0,4)(5,2)(0,5)(10,1)(5,3)(0,6)(10,2)(5,4)
  6: [0, 3, 6, 9, 11, 15, 18, 22, 23, 24, 27, 28],// (0,1)(0,2)(0,3)(6,1)(0,4)(6,2)(0,5)(6,3)(12,1)(0,6)(6,4)(12,2)
} as const

// squareBank(): [m, n, Λ, k, P]   (hero index 3 = (2,4))
export const SQUARE_MODES = [
  [0, 2,  4, 1, -2], [2, 2,  8, 1,  2], [0, 4, 16, 1,  2], [2, 4, 20, Math.SQRT2, -2 * Math.SQRT2],
  [4, 4, 32, 1,  2], [0, 6, 36, 1, -2], [2, 6, 40, Math.SQRT2, 2 * Math.SQRT2], [4, 6, 52, Math.SQRT2, -2 * Math.SQRT2],
  [0, 8, 64, 1,  2], [2, 8, 68, Math.SQRT2, -2 * Math.SQRT2], [6, 6, 72, 1, 2], [4, 8, 80, Math.SQRT2, 2 * Math.SQRT2],
] as const
```

## Appendix B — Q per bank (β = 0.3, clamp [10, 120]; `qFromSpacing` output)

```
s3     10.0, 10.0, 10.0, 10.0, 10.0, 21.7, 18.1, 15.3, 23.3, 59.2, 41.9, 26.2
s4     10.0, 10.0, 10.0, 10.0, 10.0, 13.7, 26.9, 16.3, 23.9, 27.0, 23.4, 29.5
s5     10.0, 10.0, 10.1, 10.0, 13.2, 13.2, 22.0, 58.6, 17.6, 21.9, 66.7, 120.0
s6     10.0, 10.0, 10.0, 11.8, 11.7, 15.9, 15.1, 25.7, 64.2, 19.7, 23.3, 47.1
square 10.0, 10.0, 10.0, 10.0, 13.3, 30.0, 16.7, 14.4, 26.7, 56.7, 40.0, 33.3
```

## Appendix C — Reference values (SciPy) for tests

```
J0(1)=0.7651976865579666   J1(1)=0.44005058574493355   J5(10)=-0.2340615281867936   J12(20)=-0.1189906243103992
J3(23.1)=0.08180241243587395   J0(23.1)=-0.15766576894913117   J12(23.1)=0.16764673645324876   J4(0.1)=2.6028648545684057e-07
I0(1)=1.2660658777520084   I3(5)=10.331150169151138   I12(20)=1211289.700069159   I0(23.1)=898897180.1199746   I6(23.1)=407134814.7676605
N·R(r) at r = 0, .25, .5, .75, 1, 1.05:
 (4,1)  0, 0.2356904401, 1.7414601432, 1.4779288321, -2.2022750929, -3.0349902204
 (3,2)  0, 1.4300391465, 1.8067318054, -1.6296547679, 2.0850633438, 3.1507071331
 (0,3)  3.8462854423, 0.1241597812, -1.0617336375, 1.0693863440, -1.4216424981, -2.0946019009
 (12,1) 0, 0.0002200625, 0.2496391835, 2.4279857742, -2.5242845295, -4.4242293703
```

## Appendix D — Prototype evidence (scratchpad)

All paths are under `/private/tmp/claude-501/-Users-leo-Developer-kyma-birds/2ce8f907-233f-45c4-890b-e14123a8a9be/scratchpad/judge/`.

| File | What it is |
|---|---|
| `modes.py`, `circle_nu033.json` | Kirchhoff roots, ν = 0.33 |
| `tables.py` | Families, union rows, reference values |
| `proto.py` → `sheet.png` | Complex response. Rows: circle s = 4/3/5/6 and square, at resonance / midpoint / quarter. |
| `proto2.py` → `sheet_real_b0.3.png` | In-phase projection, β = 0.3: circle s = 4, s = 3, square, at res / q1 / mid / lo. |
| `ts/bessel.ts`, `ts/check.ts` | Series accuracy, residuals, LUT bake time |
| `ts/response.ts`, `ts/calibration.ts`, `ts/check2.ts` | §6.5 and §6.6 code, verified against the Python prototype |
| `ts/pcg.ts`, `ts/sandcheck.ts` | CPU reference of the sand step: 0.890 quiet share at 60 steps, 0.205 quiet area, freeze bit-identical |
| `ts/cont.ts`, `ts/glide.ts` | Projection variants, purity at the hero mode, G at midpoints, Spearman 0.986; energy during a glide with and without sign alignment |
| `../bundle-judge/` | Bundle-size entries and outputs |
