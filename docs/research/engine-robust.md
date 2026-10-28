# Kyma Birds — Cymatics Engine Design Spec (angle: robust engineering)

Scope: `src/audio/**` and `src/cymatics/**` in a TanStack Start (React 19) app, rendered client-only, deployed on Cloudflare Workers.
Pinned to: three@0.186.1, @tanstack/react-start 1.169.4, @tanstack/react-router 1.170.46, vite 8.3.5, react 19.3.1.
Flow: **Selected bird → looping song → feature track → mode excitation → vibration field → sand grains → pixels.**

---

## 0. Decisions at a glance

| # | Decision | Why (short) |
|---|---|---|
| 1 | **Classic `WebGLRenderer` + `GPUComputationRenderer`** (ping-pong RGBA32F) + `ShaderMaterial` points. No WebGPU in v1. | One code path for every WebGL2 browser. Synchronous init, so it's StrictMode-safe. `gl_PointSize` works, while WebGPU points are 1 px only. About half the bundle size (135 KB vs 248 KB gz, measured). See §E.1. |
| 2 | **One `AudioContext` per app lifetime**, created inside the first user gesture. Loop with `AudioBufferSourceNode.loop` plus **`loopStart`/`loopEnd` computed from manifest metadata**. | afconvert writes AAC priming as `iTunSMPB` only, with **no edit list** (verified). We can't trust every decoder to trim it. |
| 3 | **Offline analysis, not live analysis.** Decoded PCM is analysed once per bird in a Worker, giving a feature track that is looked up at the *heard* time. | Deterministic. Compensates for output latency (Bluetooth ≈150–250 ms). Zero per-frame FFT. Enables syllable-level features. Measured ≈95 ms per 30 s of audio on desktop. `AnalyserNode` is kept only for a future mic mode. |
| 4 | **Modal superposition with complex driven-oscillator (Lorentzian) response.** Circle: exact Kirchhoff free-edge plate modes `J_n(λr) + C·I_n(λr)` (ν = 0.3), restricted to an **s-fold symmetric family per bird** (s ∈ {3,4,5,6}). Square: centre-driven classic Chladni `cos·cos + cos·cos` modes (n, m even, "+"), with a clamped bolt at the centre. | Physically grounded and legible. Symmetric families give ref-2-like 2s-fold patterns. Coherent mixing of neighbouring modes gives ref-1-like smooth closed curves (prototype-verified). |
| 5 | **No Bessel evaluation on the GPU.** Exact radial profiles are computed in double precision on the CPU (in a Worker) and uploaded as one R32F LUT (1024 × 40 = 160 KB), sampled with `texelFetch` + manual lerp. | Accurate (≤5e-12 absolute error, measured). Doesn't need `OES_texture_float_linear`. No fp32/mediump recurrence instability. |
| 6 | **Legibility-first drive.** The plate is driven by the **syllable-median pitch** plus 25 % of the glide. Each bird's p10..p90 is calibrated onto ~7 modes around a hero mode. Envelopes: 80 ms attack / 700 ms release. Sand has a static-friction threshold, so it **freezes** when the song stops. | Raw instantaneous pitch sweeps through 8+ modes per syllable and turns the sand to mush. Syllable pitch gives crisp, repeatable figures (prototype-verified). |
| 7 | **Overdamped "hop" sand model on the GPU.** Drift down ∇\|u\|², plus random hops scaled by amplitude, gated by a mobility threshold. | Matches real sand: grains hop at antinodes and rest at nodes. Prototype: 90 % of grains on nodal bands after 1 s, 97.6 % after 2 s. |
| 8 | **Imperative `CymaticsController` creates its own `<canvas>` per mount** and fully disposes it on unmount (including `forceContextLoss`). The audio engine is a module singleton. `three` never enters the SSR/Worker bundle. | Survives the StrictMode double mount, HMR, context loss and Workers bundle limits. |

Explicit non-goals for v1 (simplicity): WebGPU, post-processing/bloom, OffscreenCanvas rendering, AudioWorklet, per-frame CPU particle work, 2D-baked mode textures, GPU Bessel.

---

## 1. Evidence: what was verified, and how

### 1.1 three@0.186.1 source

Source from `npm pack three@0.186.1`. Paths are relative to the package root.

| API relied on | Where | Finding |
|---|---|---|
| Package exports | `package.json` L10–19 | `three`, `three/addons/*` → `examples/jsm/*`, `three/webgpu`, `three/tsl`. |
| WebGL2-only renderer | `src/renderers/WebGLRenderer.js` L61, L102, L409–411 | WebGL 1 has been unsupported since r163. The context is always `webgl2`. |
| Constructor options | `WebGLRenderer.js` L73–85 | `alpha=false`, `antialias=false`, `powerPreference='default'`, `failIfMajorPerformanceCaveat=false`, `outputBufferType=UnsignedByteType`. |
| Context-loss handling | `WebGLRenderer.js` L403–405, L1113–1121, L1123–1143, L1646 | Listeners are registered *before* context creation. `onContextLost` calls `preventDefault()`, so the context is restorable. Restore re-runs `initGLContext()`. `render()` no-ops while the context is lost. Render-target *contents* are not restored, so we rebuild ourselves. |
| `forceContextLoss()` | `WebGLRenderer.js` L607–613 | Uses `WEBGL_lose_context`. Used on unmount to release the context immediately. |
| `dispose()`, `setAnimationLoop()` | `WebGLRenderer.js` L1086–1108, L1609–1616 | `setAnimationLoop(null)` stops the internal rAF loop. |
| WebGLRenderer still maintained | `WebGLRenderer.js` L749–755 (`setEffects`), L1075 (`setNodesHandler`) | New features keep landing in r186. Not deprecated. |
| Float extensions | `src/renderers/webgl/WebGLExtensions.js` L25–38 | `init()` enables `EXT_color_buffer_float`, `OES_texture_float_linear` and `EXT_color_buffer_half_float` if present. `has(name)` is public via `renderer.extensions` (WebGLRenderer.js L504). |
| Precision fallback | `src/renderers/webgl/WebGLCapabilities.js` L55–86, L105 | Requests `highp` and silently downgrades to `mediump` if unsupported. `maxVertexTextures` is exposed. |
| GLSL dialect | `src/renderers/webgl/WebGLProgram.js` L808–829 | Always `#version 300 es`. `texture2D`/`gl_FragColor` compatibility defines unless `glslVersion: GLSL3`. So `texelFetch`, `gl_VertexID` and `uint` are available. |
| GPUComputationRenderer | `examples/jsm/misc/GPUComputationRenderer.js` | Default `FloatType` (L119). `setDataType` (L135). `addVariable` defaults to NearestFilter (L150–163). **`init()` only checks `maxVertexTextures` (L189–196)**, so float renderability must be probed by us. `compute()` ping-pong (L260–295). `getCurrentRenderTarget` (L299). **`dispose()` (L321–345) frees variables' RTs, materials and the quad, but not materials made with `createShaderMaterial` (L364)**. The `resolution` define is the GPGPU size (L348–352), so the field pass must not use it. `createRenderTarget` is RGBA + dataType + `depthBuffer:false` (L394–418). `doRenderTarget` saves and restores the render target (L457–480). |
| FullScreenQuad | `examples/jsm/postprocessing/Pass.js` L138 | Used internally by the GPUComputationRenderer. |
| WebGPU init and fallback | `src/renderers/webgpu/WebGPURenderer.js` L41, L55–75; `src/renderers/common/Renderer.js` L784–845, L1498–1500, L2877–2885 | **Async** `init()` falls back to `WebGLBackend` when WebGPU is missing. `render()` before init throws. `compute()` before init warns and routes to `computeAsync`. |
| WebGPU compute on the WebGL2 fallback | `src/renderers/webgl-fallback/WebGLBackend.js` L918–1000; `.../nodes/GLSLNodeBuilder.js` L380–563, L1268–1286 | **It works**, via transform feedback (`RASTERIZER_DISCARD`, `beginTransformFeedback(POINTS)`). Random-access storage reads go through PBO→texture copies. No subgroups. The dispatch count must be a plain number (no indirect dispatch). Each invocation writes only its own element. |
| TSL storage | `src/nodes/accessors/Arrays.js` L47 (`instancedArray`), `StorageBufferNode.js` L405 (`storage`), `src/nodes/core/IndexNode.js` L155 (`instanceIndex`) | Present. |
| WebGPU point size | `src/materials/nodes/PointsNodeMaterial.js` L21–60 | **WebGPU points are always 1 px.** Sized grains need `Sprite` plus instancing. |
| WebGPU device loss | `Renderer.js` L1343–1360 | The default handler only logs and sets a flag. The app must recreate everything. |
| Examples (GitHub tag r186) | `examples/webgpu_compute_particles.html` L74–98, L132–134, L168–172; `examples/webgl_gpgpu_birds.html` L511–539, L666 | Canonical usage of both paths. Note: the r186 gpgpu example no longer has a Safari HalfFloat switch. |

Bundle sizes were measured with `bun build --minify` and gzip -9:
- WebGL path (`WebGLRenderer`, `Points`, `ShaderMaterial`, `GPUComputationRenderer`, …): **541 KB raw / 135 KB gz**.
- WebGPU path (`WebGPURenderer`, `PointsNodeMaterial`, TSL): **908 KB raw / 248 KB gz**.

### 1.2 TanStack

- `@tanstack/react-router@1.170.46`: `dist/esm/index.d.ts` L8 exports `ClientOnly` and `useHydrated` (`ClientOnly.d.ts` L2–29, props `{children, fallback}`).
- `@tanstack/react-start@1.169.4`: `dist/esm/index.d.ts` L3 exports `createClientOnlyFn`.
- `@tanstack/router-core@1.171.39`: `dist/esm/route.d.ts` L252 defines the route-level `ssr` option. We do **not** use it, because the picker should SSR.

### 1.3 Prototypes

Prototypes are numpy/scipy and Node. Scripts are in `scratchpad/proto-robust/`.

- **Kirchhoff free circular plate.** Solved det[M_r, V_r] = 0. With ν = 0.33, λ² = 5.262 (2,0), 9.069 (0,1), 12.24 (3,0), 20.51 (1,1), 21.53 (4,0), 33.06 (5,0), 35.24 (2,1), 38.51 (0,2). This **matches Leissa's published values** (5.253, 9.084, 12.23, 20.52, 21.6, 33.1, 35.2, 38.5). The production table uses ν = 0.3 (§C.2).
- **JS Bessel by trapezoid rule on the integral representation, M = 64.**
  - J_n: abs error ≤ 5e-16 for typical arguments and ≤ 5e-12 at the extreme (n = 16, x = 23.1).
  - I_n: relative error ≈ 1e-13.
  - Cost: 24 modes × 2049 samples took 59 ms in Node.
- **FFT.** A JS radix-2 FFT with N = 2048 over 2,995 hops (30 s at 48 kHz) took **95 ms**. A parabolic-interpolated peak on a 3 kHz tone landed at **3000.001 Hz** (bin width 23.4 Hz).
- **Sand model.**
  - Defaults σ = 0.08, κ = 0.03, θ = 0.15 (RMS units). Fraction of grains on |u| < 0.3 (20.7 % of the area): 0.77 at 0.5 s, 0.90 at 1 s, 0.976 at 2 s.
  - Before RMS normalization, with max-normalized modes, half the plate stayed frozen. **RMS normalization is required.**
  - Zeroing the field outside r = 1 created a fake nodal ring at the rim. **Edge padding is required.**
- **End-to-end synthetic song** (5.5→4 kHz trills plus a 3.3 kHz note, 8 s).
  - Instantaneous pitch + full-bank calibration + odd-n modes gave asymmetric mush.
  - Syllable pitch + s-fold bank + calibration over ~7 modes gave crisp 8-fold (s = 4) and 3-fold (s = 3) figures.
- **Square plate.** Isolated cos-modes give straight crossing lines. Coherent mixtures of neighbours (e.g. φ(4,2) ± 0.5·φ(4,4)) give ref-1-like rounded diamonds, corner loops and edge arcs.
- **AAC loop metadata.** A 2 s, 44.1 kHz mono WAV run through `afconvert -f m4af -d aac` shows `afinfo` output "88200 valid frames + 2112 priming + 824 remainder". The file has an `iTunSMPB` atom and **no `elst`/`edts`** atom.

---

## 2. Module layout and per-frame data flow

```
src/audio/
  types.ts                 BirdSong, AudioSnapshot, VoiceSnapshot, SongFeatureTrack, FrameFeatures
  AudioEngine.ts           singleton: context, unlock, voices, crossfade, pause, visibility, store
  unlock.ts                gesture unlock, navigator.audioSession, iOS silent-<audio> fallback
  ramp.ts                  pure: linear-ramp bookkeeping (valueAt)            [tested]
  loopTrim.ts              pure: decoded length + manifest → loopStart/End     [tested]
  clock.ts                 pure-ish: heardTime(ctx), loopPhase(...)            [tested]
  songCache.ts             LRU (bytes) of compressed bytes + decoded buffers; generation tokens
  analysis/fft.ts          radix-2 FFT                                         [tested]
  analysis/features.ts     analyzeSong(pcm, sr, opts) → SongFeatureTrack (pure) [tested]
  analysis/syllables.ts    voicing hysteresis + syllable segmentation (pure)    [tested]
  analysis/worker.ts       Worker entry: analyzeSong + bakeRadialLut
  analysis/workerClient.ts RPC with Transferables; main-thread chunked fallback
  SongAnalyzer.ts          sampleTrack(track, phase, out) (O(1)); LiveAnalyzer (optional, mic mode)
src/cymatics/
  physics/bessel.ts        besselJ, besselI (+ derivatives for tests)          [tested]
  physics/kirchhoffTable.ts constant (n, c, λ, C) table, ν = 0.3 (40 rows)     [tested]
  physics/modes.ts         circleBank(s), squareBank(), normalization          [tested]
  physics/radialLut.ts     bakeRadialLut(rows) → Float32Array (Worker)          [tested]
  physics/calibration.ts   makeCalibration(bandHz, peakHz, bank) (pure)         [tested]
  physics/excitation.ts    lorentzTargets(), ModeEnvelope (pure)               [tested]
  physics/driveMapper.ts   FrameFeatures[] → slot drives (smoothing) (pure)    [tested]
  sand/params.ts           single source of truth for sim constants → GLSL #defines
  sand/cpuReference.ts     CPU port of the sand step (tests, posters, debug)   [tested]
  gpu/capabilities.ts      WebGL2 / float-RT probe, tier selection
  gpu/shaders/*.ts         field.circle, field.square, sand.init, sand.step, grains.vert/frag, plate.vert/frag
  gpu/PlateSimulation.ts   GPUComputationRenderer + field pass + init/agitate
  gpu/GrainLayer.ts        Points + ShaderMaterial
  gpu/PlateMesh.ts         analytic plate/rim/bolt/shadow quad
  CymaticsController.ts    renderer, loop, observers, quality, context loss, disposal
  CymaticsCanvas.tsx       React wrapper (lazy chunk; imports three)
  CymaticsView.tsx         public component: ClientOnly + lazy + poster
  PlatePoster.tsx          static fallback (pre-rendered WebP per shape/symmetry)
```

**Import rule** (enforced with ESLint `no-restricted-imports`): only `CymaticsCanvas.tsx` and `gpu/**` may import `three`. `physics/**`, `sand/params.ts`, `audio/**` and `analysis/**` are three-free and DOM-free where marked *pure*.

### Per-animation-frame flow

This runs inside `renderer.setAnimationLoop(tick)`. It allocates nothing; all buffers are preallocated.

```
tick(nowMs)
 1. dt = clamp((now - last)/1000, 0, 0.1)
 2. engine.readVoices(voices)            → ≤3 × {birdId, phaseSec(heard), gain, playing}
 3. for v in voices: sampleTrack(track[v.birdId], v.phaseSec + 0.03 lookahead, feat[i])   (O(1))
 4. driveMapper.update(feat, voices, dt) → per bank slot (A/B): fPlate1, w1, fPlate2, w2, D, onsetKick
 5. lorentzTargets(...) per slot → envelope.update(dt) → coef Float32Array(32 × vec4)
 6. if max|Δcoef| > 1e-4: sim.renderField(coef)        (1 full-screen pass, 256²)
 7. acc += dt; while acc ≥ 1/60 && n < 3: sim.step(uniforms); acc -= 1/60; n++
 8. if n > 0 || viewDirty: renderer.render(scene, camera)
 9. frozen = D≈0 && envelopes≈0 && agitation≈0 for > 0.5 s
    → stop the loop (setAnimationLoop(null)). The engine's subscribe(), resize or prop changes restart it.
```

---

## A. Audio engine

### A.1 Graph

```
AudioBufferSourceNode(loop) → voiceGain ─┐
AudioBufferSourceNode(loop) → voiceGain ─┼→ masterGain → ctx.destination
(≤ 3 voices alive)                       ┘
```

- No analyser is in the graph, because analysis is offline (§B).
- Mute and volume act on `masterGain` only. The plate keeps moving while muted (deliberate: a quiet-room use case), because drive comes from the feature track and the voice state, not from the output level.

### A.2 Context creation and unlock

```ts
// unlock.ts — MUST be called synchronously from a 'click' or 'keydown' handler (not pointerdown/touchstart)
export function unlockAudio(engine: AudioEngineImpl): void {
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) {
    try { nav.audioSession.type = 'playback'; } catch {} // Safari 16.4+: ignore the iOS silent switch
  } else if (isIOS()) {
    startSilentMediaElement();                          // fallback: a looping silent <audio> puts the page in the 'playback' category
  }
  if (!engine.ctx) {
    engine.ctx = new AudioContext({ latencyHint: 'playback' }); // no sampleRate option (iOS pitch/crackle bugs)
  }
  const ctx = engine.ctx;
  // Old-WebKit unlock: start a 1-frame silent buffer inside the gesture.
  const b = ctx.createBuffer(1, 1, ctx.sampleRate);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start();
  void ctx.resume();           // do not await before the synchronous work above
  engine.setUserIntent('playing');
}
```

- **Autoplay.** The UI shows a single "Listen" CTA while `status === 'locked'`. Chrome allows `resume()` after sticky activation. Safari needs transient activation. So we always unlock inside the handler.
- **`latencyHint: 'playback'`** lowers CPU and power use. Latency doesn't matter because visuals follow `heardTime()` (§A.6).
- **iOS states.** Listen to `ctx.onstatechange`.
  - `'interrupted'` (WebKit: call, Siri, other app) or an unexpected `'suspended'` while intent is playing → `status = 'interrupted'`, and the UI shows "Tap to resume". The resume itself must happen in a gesture on iOS.
  - We never call `ctx.close()` during the app lifetime. Safari limits concurrent contexts, and StrictMode or HMR must not multiply them.

### A.3 Loading, decoding, loop points

```ts
export interface BirdSong {
  birdId: string;
  src: string;                   // hashed URL, AAC-LC mono .m4a, immutable cache
  fallbackSrc?: string;          // optional Opus (.webm/.ogg) for decoders without AAC (some Linux Firefox/Chromium builds)
  durationSec: number;           // exact loop length = validFrames / fileSampleRate
  validFrames?: number;          // from `afinfo` at build time ("88200 valid frames")
  primingFrames?: number;        // "2112 priming"
  fileSampleRate?: number;       // 44100
  bandHz: { p10: number; p50: number; p90: number };
  peakHz: number;
  symmetry?: 3 | 4 | 5 | 6;      // circle family; default derived from hash(birdId)
}
```

`loopTrim.ts` is pure and tested. It handles both decoders that honour `iTunSMPB` and decoders that don't.

```ts
export function computeLoopRegion(decodedLen: number, ctxRate: number, s: BirdSong): { start: number; end: number; mode: 'trimmed'|'untrimmed'|'unknown' } {
  const ratio = ctxRate / (s.fileSampleRate ?? ctxRate);
  const valid = Math.round((s.validFrames ?? s.durationSec * (s.fileSampleRate ?? ctxRate)) * ratio);
  const prime = Math.round((s.primingFrames ?? 2112) * ratio);
  const tol = Math.round(0.002 * ctxRate);                                   // 2 ms
  if (Math.abs(decodedLen - valid) <= tol) return { start: 0, end: valid, mode: 'trimmed' };
  if (decodedLen >= valid + prime - tol) return { start: prime, end: prime + valid, mode: 'untrimmed' };
  return { start: 0, end: Math.min(decodedLen, valid), mode: 'unknown' };   // dev: console.warn
}
// source.loop = true; source.loopStart = start/ctxRate; source.loopEnd = end/ctxRate; source.start(t0, start/ctxRate)
```

**Asset-pipeline guidance** (outside this module, but required for a seamless loop):
- Author loops with continuous waveforms at the seam: a 30–80 ms equal-power crossfade baked in, zero-crossing aligned.
- Export **mono**.
- Write `validFrames`, `primingFrames` and `fileSampleRate` into the manifest, parsed from `afinfo`.

### A.4 Selection, crossfade, rapid switching

```ts
async select(song: BirdSong): Promise<void> {
  const gen = ++this.gen;                       // generation token
  this.inflight?.abort(); this.inflight = new AbortController();
  this.setSnapshot({ birdId: song.birdId, status: this.unlocked ? 'loading' : 'locked' });
  let loaded: LoadedSong;
  try { loaded = await this.cache.load(song, this.inflight.signal); }  // fetch → decodeAudioData(bytes.slice(0)) → loop region; tries fallbackSrc on decode error
  catch (e) { if (gen === this.gen) this.setError(song.birdId, toCode(e)); return; }
  this.cache.ensureTrack(song.birdId, loaded);  // kicks off Worker analysis if needed (does not block audio)
  if (gen !== this.gen) return;                 // stale: kept in cache, not played
  if (!this.unlocked || this.intent !== 'playing') { this.pending = loaded; return; }
  this.crossfadeTo(loaded);
}

private crossfadeTo(l: LoadedSong) {
  const t = this.ctx.currentTime + 0.03;         // never schedule in the past
  for (const v of this.voices) v.rampTo(0, t + 0.10, 0.45);   // old voices: start fading 100 ms later
  const v = new Voice(this.ctx, l, this.master);  // gain starts at 0
  v.start(t); v.rampTo(1, t, 0.60);
  this.voices.push(v);
  while (this.voices.length > 3) this.voices.shift()!.hardStop(0.03);   // cap
}
```

- **Ramps.** Each ramp runs `cancelScheduledValues(t)` → `setValueAtTime(rampValueAt(t), t)` → `linearRampToValueAtTime(target, t + dur)`. `Voice` keeps its own `{t0, v0, t1, v1}` bookkeeping (`ramp.ts`), so the current value is known without reading `gain.value`, which is unreliable mid-automation in Firefox and Safari. There is no `cancelAndHoldAtTime` (missing in Firefox).
- We also avoid `setValueCurveAtTime`, which throws `NotSupportedError` when it overlaps other events. That's a real hazard under rapid switching.
- A voice whose ramp ends at 0 is `stop()`ped at the ramp end + 50 ms. On `onended` it is disconnected and dropped, so GC frees it.
- **Rapid switching.** A generation token stops stale decodes from playing. An `AbortController` cancels superseded fetches. At most 3 voices are alive. The picker should also debounce `select` by about 200 ms after scroll-snap settles (`scrollend`, or an IntersectionObserver ratio ≥ 0.6 that stays stable).
- **Cache.** Compressed bytes and decoded buffers live in an LRU bounded by bytes.
  - Budget: 48 MB on desktop, 24 MB when `navigator.deviceMemory ≤ 4` or `(pointer: coarse)`.
  - A 30 s mono buffer at 48 kHz is 5.8 MB.
  - Prefetch neighbours ±1 as compressed bytes only, via `fetch(url, { priority: 'low' })` (`priority` is ignored where unsupported). Decode on demand.
  - Pass `bytes.slice(0)` to `decodeAudioData` because it detaches the buffer.
- **Errors** never reject `select()`. They land in the snapshot as `error: 'network' | 'decode' | 'unsupported'`. The plate stays on the frozen hero pattern.

### A.5 Pause/resume, volume, mute, visibility, cleanup

- **pause()**: ramp `masterGain` to 0 over 120 ms, then `ctx.suspend()`. Suspending freezes `currentTime`, which preserves the loop phase and saves battery.
- **play()**: `ctx.resume()` from a gesture, then a 200 ms fade-in.
- These operations are serialized through a promise queue, so fast toggles can't interleave suspend and resume.
- **Volume**: `gain = v²` (perceptual), applied with `setTargetAtTime(·, now, 0.03)`.
- **Mute**: target 0 with a time constant of 0.04. The pre-mute volume is remembered.
- **Visibility.** On `visibilitychange` → hidden: fade 120 ms, then `suspend()`. On visible: if intent is `'playing'`, `resume()`. If it fails or the context stays suspended (iOS), set `status = 'interrupted'` and show "Tap to resume".
  - `pagehide`/`pageshow` (bfcache) go through the same path.
  - The GPU loop stops independently (§E.8).
- **Snapshot gating.** `readVoices()` reports `playing = false` unless `status === 'playing'`. Pausing therefore drives D → 0 and the sand freezes in place.
- **Cleanup.** The engine is app-lifetime. `dispose()` exists for tests and HMR: stop and disconnect voices, `ctx.close()`, clear the cache. In dev, keep the singleton on `globalThis.__kymaAudio` and use `import.meta.hot?.dispose` so HMR doesn't spawn extra contexts.

### A.6 Heard time and loop phase (`clock.ts`)

```ts
export function heardTime(ctx: AudioContext): number {
  const ts = (ctx as any).getOutputTimestamp?.();
  const ct = ctx.currentTime;
  if (ts && ts.contextTime > 0 && ts.contextTime <= ct && ct - ts.contextTime < 0.5) return ts.contextTime;
  const lat = (ctx as any).outputLatency ?? 0;
  return Math.max(0, ct - (lat || ctx.baseLatency || 0));
}
export const loopPhase = (heard: number, startCtx: number, startOffset: number, loopStart: number, loopLen: number) =>
  loopStart + ((((heard - startCtx) + (startOffset - loopStart)) % loopLen) + loopLen) % loopLen;
```

---

## B. Analysis (offline feature track)

### B.1 Pipeline

`analysis/features.ts` runs in a Worker. It takes the loop region of channel 0, copied with `getChannelData(0).slice(start, end)` and passed as a Transferable.

| Step | Setting |
|---|---|
| Circular padding | Prepend the last N samples of the loop, so frames at the seam see continuous audio. |
| STFT | N = 2048, Hann window, hop = round(sr/100) (10 ms, ~100 frames/s). Bin width is 21.5 Hz at 44.1 kHz and 23.4 Hz at 48 kHz. |
| Band | 300 Hz – min(12 kHz, 0.45·sr). Bird song lives here; below is wind and handling noise. |
| Noise floor | Per-bin **20th percentile** of power across all frames (minimum statistics, using the whole song). Subtract it in dB with a 6 dB margin; anything below → 0. |
| Loudness | In-band denoised energy in dB, normalized per song: `loud = clamp((dB − P10)/(P95 − P10), 0, 1.2)`. Quiet recordings still drive the plate fully. |
| Peaks | Top 3 local maxima, ≥ 1/6 octave apart. **Parabolic interpolation on log-power** gives sub-bin frequency (measured error < 0.01 Hz on a clean tone). `m2rel = P2/P1`. |
| Tonality | Crest = peak power / mean in-band power. Tonal if ≥ 8 (9 dB). Noisy calls (chips, harsh notes) use the **spectral centroid** as their pitch. |
| Centroid | Σ f·S / Σ S over the band, on the denoised linear magnitude. |
| Flux and onsets | Half-wave-rectified log-power flux, z-scored with median/MAD. Onset = z > 2.5, a local max within ±30 ms, and voiced. |
| Voicing | Hysteresis: on when `loud > 0.30` for ≥ 2 frames; off when `< 0.15` for ≥ 4 frames. Gaps < 25 ms are merged. |
| Syllables | A voiced run is one syllable. Runs > 400 ms are split where the pitch jumps > 0.25 octave for ≥ 30 ms. `fSyl` = magnitude-weighted median of f1 in log2 space. |

```ts
export interface SongFeatureTrack {            // struct-of-arrays, all Float32Array(frames) except where noted
  hopSec: number; frames: number; loopSec: number;
  loud: Float32Array; f1: Float32Array; f2: Float32Array; m2rel: Float32Array;
  fSyl: Float32Array; centroid: Float32Array; tonal: Float32Array; fluxZ: Float32Array;
  flags: Uint8Array;                           // bit0 voiced, bit1 onset, bit2 syllableStart
}
```

- Cost: ≈95 ms per 30 s on desktop (measured), ~0.3–0.6 s on a mid-range Android phone. It's off the main thread.
- Memory: ~130 KB per song.
- Audio starts immediately after decode. The plate joins when the track arrives (~100–300 ms). Envelope smoothing hides the gap.
- **Worker failure** (CSP, old browser): run the same `analyzeSong` on the main thread in 8 ms slices (`setTimeout(0)` / `scheduler.yield`).

### B.2 Runtime sampling and smoothing

`sampleTrack(track, phase + 0.03, out)` is O(1):
- `loud` and `centroid` are interpolated linearly.
- `f1` is interpolated in log2 space if both frames are voiced. Otherwise it uses the nearest frame.
- `fSyl` and the flags use the nearest frame.
- The 30 ms **look-ahead** offsets the visual attack time constant. We know the future, so we use it.

`driveMapper.ts` is pure and frame-rate independent. One-pole filter: `y += (x − y)·(1 − e^(−dt/τ))`.

| Signal | Rule |
|---|---|
| Drive amplitude D | Fed from `loud × voiced` (gain-weighted across voices). Attack τ = 30 ms, release τ = 250 ms. |
| Drive pitch | `f_drive = tonal ? fSyl·(f1/fSyl)^0.25 : centroid`. On `syllableStart`, jump. Within a syllable, one-pole in log2 space with τ = 40 ms. When unvoiced, hold the last value; D handles the decay. |
| Second channel | Active if `m2rel ≥ 0.35` and \|log2(f2/f1)\| ≥ 1/3 octave. Weight `w2 = 0.6·m2rel`. |
| Onset kick | `agitation += 0.10` per onset, decaying with τ = 80 ms. Set to 0 under reduced motion. |

### B.3 AnalyserNode (LiveAnalyzer — optional, future mic mode only)

- Settings: `fftSize = 2048`, **`smoothingTimeConstant = 0`**. The built-in smoother runs per *call*, so it depends on frame rate; we smooth ourselves.
- `minDecibels = −100`, `maxDecibels = −20`. Read with `getFloatFrequencyData` into a preallocated `Float32Array(1024)`.
- Noise floor: running per-bin minimum over three 0.5 s sub-windows.
- It feeds the same `FrameFeatures` struct. Syllables come from online hysteresis, so `fSyl` is a running median since the syllable start.
- Visuals lead the audio by `outputLatency`. That's acceptable for a microphone.

---

## C. Plate physics model

### C.1 Field

The plate occupies [-1, 1]²; the circle has radius 1. The mode shapes φ_k are **orthonormal in RMS**: mean of φ_k² over the plate is 1. Both families are orthogonal, so the field RMS equals the coefficient norm.

For a sinusoidal drive at plate frequency ν (normalized eigenvalue units, ν ∝ Hz), the steady-state modal response is:

```
R_k(ν) = 1 / (1 − r² + i·r/Q),   r = ν / f_k            (driven damped oscillator; |R_k(f_k)| = Q)
U_p(x) = Σ_k c_pk φ_k(x)          (complex, per drive channel p ∈ {1,2})
I(x)   = Σ_p |U_p(x)|² = Σ_p (Re U_p)² + (Im U_p)²     (time-averaged |u|²; different drive frequencies add incoherently)
u(x,t) = Re Σ_p U_p(x) e^{iω_p t}                      (only I and |U| are used; ω itself is never simulated)
```

Targets per channel:

```
R̂ = R/‖R‖,  G = min(1, (‖R‖/Q)^γ),  c*_pk = w_p · D · G · R̂_k
γ = 0.35 is the "resonance contrast": off-resonance drive still moves sand, just less.
```

Mode amplitudes evolve by a slowly-varying envelope. This is exact for a damped oscillator's complex envelope; only the time constant is exaggerated for legibility:

```
dc/dt = (c* − c)/τ,   τ = 80 ms if |c*_k| > |c_k| else 700 ms   (per mode, per channel; Re and Im together)
```

### C.2 Circular plate — Kirchhoff free edge (ν = 0.3)

```
φ_{n,c}(r,θ) = N_{n,c} · [J_n(λr) + C·I_n(λr)] · cos(n(θ − θ₀)),    f_{n,c} = λ²
free-edge BCs at r = 1:  M_r = W'' + ν(W' − n²W) = 0,   V_r = (∇²W)' − (1−ν)n²(W' − W) = 0
```

Here n is the number of nodal diameters and c the number of nodal circles. `N` is set so that the mean of φ² over the disk is 1:

```
N = 1/√((n>0 ? 1 : 2)·∫₀¹ R(r)² r dr)        (Simpson integration on the LUT)
```

The rigid modes (0,0) and (1,0) have f = 0 and are excluded by construction.

`kirchhoffTable.ts` holds the union of the first 16 modes of each family s ∈ {3,4,5,6}: 40 rows, λ ≤ 21.99. Format: `[n, c, λ, C]`, with f = λ² as a comment.

```
[0,1,3.000523,-8.5674808e-02] f=9.00    [3,0,3.526895,9.1141735e-02] f=12.44   [4,0,4.672811,4.2800848e-02] f=21.84
[5,0,5.787481,2.1070850e-02] f=33.49    [0,2,6.200258,3.1507898e-03] f=38.44   [6,0,6.883170,1.0681517e-02] f=47.38
[3,1,7.280645,-1.8546542e-03] f=53.01   [4,1,8.575699,-6.7127689e-04] f=73.54  [8,0,9.039045,2.9016828e-03] f=81.70
[0,3,9.367509,-1.2853728e-04] f=87.75   [5,1,9.836432,-2.5781902e-04] f=96.76  [9,0,10.104872,1.5414979e-03] f=102.11
[3,2,10.580408,5.7168815e-05] f=111.94  [6,1,11.071118,-1.0350721e-04] f=122.57 [10,0,11.164844,8.2652052e-04] f=124.65
[4,2,11.934444,1.8557916e-05] f=142.43  [0,4,12.522712,5.3946163e-06] f=156.82 [5,2,13.256521,6.3897649e-06] f=175.74
[12,0,13.271201,2.4277412e-04] f=176.12 [8,1,13.482801,-1.8385186e-05] f=181.79 [3,3,13.809121,-2.0422814e-06] f=190.69
[6,2,14.552968,2.3040476e-06] f=211.79  [9,1,14.666517,-8.0409763e-06] f=215.11 [4,3,15.199686,-6.1586018e-07] f=231.03
[0,5,15.672701,-2.2903735e-07] f=245.63 [10,1,15.838569,-3.5859498e-06] f=250.86 [15,0,16.406106,4.0179225e-05] f=269.16
[5,3,16.560562,-1.9660487e-07] f=274.25 [8,2,17.085918,3.3300566e-07] f=291.93 [16,0,17.446145,2.2231421e-05] f=304.37
[6,3,17.896893,-6.5727955e-08] f=320.30 [12,1,18.153987,-7.4809087e-07] f=329.57 [4,4,18.423158,2.2334549e-08] f=339.41
[0,6,18.819984,9.7809978e-09] f=354.19  [10,2,19.557705,5.3518819e-08] f=382.50 [5,4,19.811746,6.7419482e-09] f=392.51
[6,4,21.177031,2.1286862e-09] f=448.47  [15,1,21.571673,-7.8165022e-08] f=465.34 [0,7,21.965688,-4.1909829e-10] f=482.49
[12,2,21.983222,9.3103105e-09] f=483.26
```

**Symmetric family per bird.** The bank is `circleBank(s)`: the first 16 rows with `n % s === 0`, sorted by f.
- Physically, this corresponds to driving through s in-phase exciters spaced evenly around the rim. Σ_j cos(n·2πj/s) vanishes unless s | n.
- It removes the odd/mixed-n modes that produced asymmetric "skull" figures in the prototype.
- For s = 4 the bank is: (0,1) 9.0, (4,0) 21.8, (0,2) 38.4, **(4,1) 73.5**, (8,0) 81.7, (0,3) 87.8, (4,2) 142.4, (0,4) 156.8, (12,0) 176.1, (8,1) 181.8, (4,3) 231.0, (0,5) 245.6, (8,2) 291.9, (16,0) 304.4, (12,1) 329.6, (4,4) 339.4.
- **Hero mode** = the first mode with n = s and c = 1. For s = 4 that's (4,1), the 8-sector figure with a ring, as in ref 2.
- s comes from `song.symmetry`, otherwise `3 + (fnv1a(birdId) % 4)`.
- θ₀ = π/2 (a vertical mirror axis).

**Chladni's law.** We use the exact λ² instead of f ≈ C(n + 2c)². The law is only a test-time sanity check: the Spearman correlation between f and (n + 2c)² must exceed 0.9.

### C.3 Square plate — centre-driven (ref 1)

On (x, y) = ((X+1)/2, (Y+1)/2) ∈ [0, 1]²:

```
φ_{n,m} = N·[cos(nπx)cos(mπy) + cos(mπx)cos(nπy)],   n ≥ m ≥ 0 both even, (0,0) excluded,   f = n² + m²
N = 1 if m = 0 or n = m, else √2          (analytic RMS; asserted numerically in tests)
bolt: U ← U · (1 − exp(−|X|²/0.07²))       (clamped centre → sand rings the bolt, as in ref 1)
```

- **Only "+" combos with even n, m are kept**, because only they have φ(centre) ≠ 0. A centre drive cannot excite the others. This gives D4-symmetric figures by construction.
- Exact degeneracies are deduplicated: of (8,6) and (10,0), both f = 100, the lower n is kept.
- `squareBank()` (16 modes): (2,0) 4, (2,2) 8, (4,0) 16, **(4,2) 20**, (4,4) 32, (6,0) 36, (6,2) 40, (6,4) 52, (8,0) 64, (8,2) 68, (6,6) 72, (8,4) 80, (8,6) 100, (10,2) 104, (10,4) 116, (8,8) 128.
- Hero = (4,2).
- The cos basis is the classic Rayleigh/Chladni approximation of the free square plate. The real eigenfunctions aren't separable; the low Q (= 14) and coherent mixing reproduce their rounded closed curves.

### C.4 Per-bird calibration (`calibration.ts`)

Bird Hz is mapped to plate f by a monotone, piecewise-linear function in log–log space with three anchors:

```
p10  → f_bank[hero − 2]        p* → f_bank[hero]        p90 → f_bank[hero + 4]
p* = peakHz, unless peakHz is outside [p10, p90] or |log2(peakHz/p50)| > 1, in which case p* = p50
```

So the bird's 10th–90th percentile band spans about 7 modes, and its most energetic frequency lands on the most iconic figure.

Guards:
- If `!(p10 > 0 && p90 > p10)`, use p50 ± 0.35 octave. If p50 is also missing, use 2–6 kHz.
- Widen symmetrically so that `log2(p90/p10) ≥ 0.4`.
- Clamp p* to `[p10·2^0.05, p90·2^−0.05]`.
- Extrapolate beyond the anchors with the edge-segment slopes, then clamp to `[0.7·f_0, 1.2·f_15]`.

| Plate | Q | γ | Anchor indices (lo / hero / hi) |
|---|---|---|---|
| circle | 24 | 0.35 | hero−2 / hero / hero+4 |
| square | 14 (more mixing → ref-1 curves) | 0.35 | 1 / 3 / 7 |

### C.5 Bessel functions — accurate, and on the CPU

`bessel.ts` uses double precision, integer n:

```ts
const M = 64; // spectrally accurate for periodic integrands; measured |ΔJ| ≤ 5e-12 at n=16, x=23.1 (≤ 5e-16 typical); use 96 for 1e-15
export function besselJ(n: number, x: number): number { // J_n(x) = (1/2π)∫₀^{2π} cos(nτ − x sin τ) dτ
  let s = 0; for (let j = 0; j < M; j++) { const t = (2 * Math.PI * j) / M; s += Math.cos(n * t - x * Math.sin(t)); } return s / M;
}
export function besselI(n: number, x: number): number { // I_n(x) = (1/2π)∫₀^{2π} e^{x cos τ} cos(nτ) dτ ; rel err ≈ 1e-13
  let s = 0; for (let j = 0; j < M; j++) { const t = (2 * Math.PI * j) / M; s += Math.exp(x * Math.cos(t)) * Math.cos(n * t); } return s / M;
}
// test-only derivatives: J_n' = (J_{n−1} − J_{n+1})/2, I_n' = (I_{n−1} + I_{n+1})/2, second derivatives from Bessel's ODE
```

- The trapezoid error is the aliasing term ≈ |J_{M−n}(x)|. It is negligible while M − n ≫ e·x/2.
- `radialLut.ts` builds `Float32Array(40 rows × 1024)` of `N·[J_n(λr) + C·I_n(λr)]` on r ∈ [0, 1.05].
  - It **extends past the rim** to avoid a fake nodal ring.
  - Cost ≈ 40 × 1024 × 128 transcendental evaluations ≈ 50 ms on desktop, run once in the analysis Worker.
- **GPU-side interpolation.** `texelFetch` the two neighbours and `mix`.
  - Linear-interpolation error ≤ h²/8·λ² ≈ 6e-5 relative (h = 1.03e-3, λ = 22).
  - No float filtering is needed, so there's no dependence on `OES_texture_float_linear` (missing on some mobile GPUs).
- **Rejected alternatives:**
  1. *Polynomial approximations* (Abramowitz & Stegun 9.4.1–9.4.6 for J₀/J₁ ≈ 1e-8 accuracy; 9.8.1–9.8.4 for I) **plus upward recurrence**. Upward recurrence is unstable for n > x, which is exactly near the plate centre for high-n modes, and it degrades further in fp32 or mediump.
  2. *A 2D LUT of J_n(x)*. I_n spans 10⁻¹⁹…10¹⁰ and needs its own log-scaled LUT.

  The per-mode composite profile is bounded (O(1)), exact, and costs two fetches per mode.

---

## D. Sand simulation

### D.1 State and budgets

The particle state is one GPGPU variable `tState`, RGBA32F, NearestFilter: `(x, y, energy = mob·A, life)`. Grains are overdamped, so there's no velocity.

| Tier | Particles (texture) | Field RT | DPR cap | Grain size (CSS px) | Grain intensity |
|---|---|---|---|---|---|
| high | 131,072 (512×256) | 256² RGBA16F | 2.0 | 1.15 | 0.42 |
| medium | 65,536 (256×256) | 256² | 2.0 | 1.3 | 0.55 |
| low | 32,768 (256×128) | 256² | 1.5 | 1.6 | 0.70 |
| static | — (poster) | — | — | — | — |

- Intensity is ≈ 0.42·√(131072/N), so perceived density holds across tiers.
- Memory on high: 2 state RTs × 2 MB, field 0.5 MB, LUT 160 KB, position attribute 1 MB.
- Initial state comes from an init shader, not a DataTexture. Pass a 1×1 dummy to `addVariable`, then run `doRenderTarget(initMat, rt)` on both RTs. This saves a 2 MB CPU array.

### D.2 Dynamics (per fixed step dt = 1/60 s; at most 3 sub-steps per frame)

```
A   = |U(p)| = √I(p)                          (field RMS = D·G by construction)
mob = smoothstep(θ, θ + knee, A)              static friction: grains only hop when the plate shakes hard enough
p  += −κ·mob·∇I·dt  +  (σ·mob·A + agit)·√dt·N(0, I₂)
```

| Param | Default | Notes |
|---|---|---|
| σ (hop diffusion) | 0.08 plate-units/√s | Random hops ∝ amplitude. Spatially varying diffusion alone already concentrates grains at nodes. |
| κ (drift) | 0.03 | Down-gradient of \|u\|². Sharpens lines. |
| θ, knee | 0.15, 0.15 (RMS units) | Sets line width and the freeze threshold. Lines get thinner when the song is louder (realistic). |
| agit | Onset kicks 0.10 (τ 80 ms); bird switch 0.25 (τ 250 ms) | Isotropic. 0 under reduced motion. |
| rim (circle) | 0.985 | Reflect: `p *= max(2·rim − r, 0.5·rim)/r`. |
| edge (square) | \|x\|, \|y\| > 1 → fell off | **Re-seed best-of-4**: 4 random candidates, keep the lowest I. `life = 0`, fade-in over 0.4 s. Keeps the count constant without haze. |
| NaN guard | `!(abs(p.x) < 4.0 && abs(p.y) < 4.0)` | Comparisons with NaN are false. Re-seed. |

- **Freeze.** When the song pauses or ends, D → 0, so A < θ everywhere, mob = 0, and positions are bit-identical step to step.
  - The controller detects this (§2, step 9) and stops all GPU work. The canvas keeps its last frame.
  - This is the "sand holds its last pattern" behaviour, and it costs nothing.
- **Gradient.** Central differences of `I` sampled from the bilinear RGBA16F field at ±1 field texel (5 fetches).
  - The field stores *signed* complex components, not I. Bilinear interpolation of a signed field keeps the zero crossings sub-texel accurate. Interpolating I or |U| would snap lines to the grid.

### D.3 Initial state, pre-warm, transitions

- **Init.** R2 low-discrepancy positions computed in **uint fixed-point**.
  - `x = float(i*3242174889u + 2147483648u)/2^32`, `y = float(i*2447445414u + 2147483648u)/2^32`.
  - Doing `fract(0.5 + 0.7548776662·i)` in fp32 loses about 7 bits at i ≈ 10⁵ and visibly clumps.
  - Square: direct mapping. Circle: Shirley–Chiu concentric map × rim.
  - `life = 1`.
- **Pre-warm** (first mount, audio still locked). Run 90 steps (1.5 s) with the hero mode at D = 1, then drop to D = 0.
  - Desktop runs this in one frame. Mobile does 15 steps per frame behind the poster crossfade.
  - The first visible frame is a crisp frozen figure, not noise.
- **New bird, same shape.** The field pass has **two bank slots (A/B, 16 modes each)**. The incoming bird takes the slot with less energy. The outgoing slot keeps ringing down with its 700 ms release while the new one builds up. The figure morphs like a real plate whose frequency changed.
  - Add a 0.25 agitation tap (skipped under reduced motion).
  - The audio crossfade (§A.4) runs in parallel, so sight and sound move together.
- **Shape change (circle ↔ square).** Grain opacity goes 1 → 0 over 250 ms. The plate SDF morphs (`uShapeMix`) over 400 ms. Then swap the field material, re-init grains (sprinkle) and fade them in over 400 ms.
  - Both field programs are pre-compiled at init by running each once into the field RT.
  - Reduced motion uses a plain cross-dissolve.
- **Plate shape** is a prop (UI toggle or manifest). Default: `'circle'`.

### D.4 Shader sketches (GLSL ES 3.00 via ShaderMaterial; constants injected from `sand/params.ts`)

```glsl
// sand.step.frag — GPGPU variable 'tState' (gpuCompute adds: uniform sampler2D tState; #define resolution vec2(W,H))
uniform sampler2D uField;  uniform float uExt, uTexel, uDt, uSigma, uKappa, uTheta, uKnee, uAgit, uRim, uFadeIn, uFrame;
uvec4 pcg4d(uvec4 v){ v=v*1664525u+1013904223u; v.x+=v.y*v.w; v.y+=v.z*v.x; v.z+=v.x*v.y; v.w+=v.y*v.z;
  v^=v>>16u; v.x+=v.y*v.w; v.y+=v.z*v.x; v.z+=v.x*v.y; v.w+=v.y*v.z; return v; }   // Jarzynski & Olano, JCGT 2020
float Iat(vec2 p){ vec4 u = texture2D(uField, p/(2.0*uExt) + 0.5); return dot(u,u); }
// helpers omitted for brevity: concentric(u) = Shirley–Chiu square→disk map; bestOf4() = 4 pcg4d candidates in [-1,1]², min Iat
void main(){
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 s = texture2D(tState, uv);  vec2 p = s.xy;  float life = s.w;
  vec4 r = vec4(pcg4d(uvec4(uvec2(gl_FragCoord.xy), uint(uFrame), 0x9E37u))) * (1.0/4294967296.0);
  float I = Iat(p), A = sqrt(I), e = uTexel;
  vec2 g = vec2(Iat(p+vec2(e,0.)) - Iat(p-vec2(e,0.)), Iat(p+vec2(0.,e)) - Iat(p-vec2(0.,e))) / (2.0*e);
  float mob = smoothstep(uTheta, uTheta + uKnee, A);
  vec2 n = sqrt(-2.0*log(max(r.x,1e-7))) * vec2(cos(6.2831853*r.y), sin(6.2831853*r.y));    // Box–Muller
  p += -uKappa*mob*g*uDt + (uSigma*mob*A + uAgit)*sqrt(uDt)*n;
  bool bad = !(abs(p.x) < 4.0 && abs(p.y) < 4.0);
#if SHAPE_CIRCLE
  float rr = length(p);
  if (bad) { p = concentric(r.zw) * uRim; life = 0.0; }
  else if (rr > uRim) p *= max(2.0*uRim - rr, 0.5*uRim) / rr;
#else
  if (bad || abs(p.x) > 1.0 || abs(p.y) > 1.0) { p = bestOf4(r, gl_FragCoord.xy); life = 0.0; }   // 4 candidates via pcg4d, min Iat
#endif
  gl_FragColor = vec4(p, mob*A, min(life + uDt/uFadeIn, 1.0));
}
```

```glsl
// field.circle.frag — rendered with gpuCompute.doRenderTarget(mat, fieldRT); do NOT use the 'resolution' define here
uniform sampler2D uRadial;            // R32F, LUT_W × rows, NearestFilter
uniform int   uRow[SLOTS];  uniform float uN[SLOTS];  uniform vec4 uCoef[SLOTS];   // SLOTS = 32 (bank A + bank B)
uniform float uFieldRes, uExt, uTheta0;
void main(){
  vec2 p = ((gl_FragCoord.xy / uFieldRes) * 2.0 - 1.0) * uExt;          // texel centres never hit (0,0)
  float r = length(p), th = atan(p.y, p.x) - uTheta0;
  float x = clamp(r/uExt, 0.0, 1.0) * float(LUT_W - 1);
  int i0 = min(int(x), LUT_W - 2);  float w = x - float(i0);
  vec4 acc = vec4(0.0);
  for (int k = 0; k < SLOTS; k++) {
    float a = texelFetch(uRadial, ivec2(i0,   uRow[k]), 0).r;
    float b = texelFetch(uRadial, ivec2(i0+1, uRow[k]), 0).r;
    acc += uCoef[k] * (mix(a, b, w) * cos(uN[k]*th));                    // (Re1, Im1, Re2, Im2)
  }
  gl_FragColor = acc;
}
// field.square.frag: q=(p+1.)*0.5*PI; phi=(cos(n*q.x)*cos(m*q.y)+cos(m*q.x)*cos(n*q.y))*uNorm[k]; acc*=1.-exp(-dot(p,p)/(uBoltR*uBoltR));
```

Field cost: 65,536 texels × 32 slots × (2 fetches + cos) ≈ 6M ops. It only runs when the coefficients change.

---

## E. Rendering (three@0.186.1)

### E.1 WebGPU + TSL vs WebGL2 + GPUComputationRenderer — decision: WebGL2

| Criterion | `three/webgpu` + TSL compute | `WebGLRenderer` + GPUComputationRenderer |
|---|---|---|
| Runs everywhere WebGL2 runs | Yes, but through the fallback backend (transform-feedback compute, own-element writes only, PBO copies for random reads; WebGLBackend.js L918–1000). That's a *second, less-trodden* code path. | Yes, one path. |
| Init | `await renderer.init()` (Renderer.js L784). Async races with StrictMode's double mount and with unmount. | Synchronous constructor. |
| Sized point sprites | WebGPU points are 1 px (PointsNodeMaterial.js L21–60). Needs `Sprite` + instancing (4–6 vertices per grain). | `gl_PointSize`, 1 vertex per grain. |
| Bundle (measured, gz) | 248 KB | 135 KB |
| Device or context loss | `onDeviceLost` only logs (Renderer.js L1343–1360). | DOM events. three calls `preventDefault()` so the context can be restored. |
| Our workload | Each grain reads the field and writes itself: an embarrassingly parallel map. No atomics or shared memory needed. | Same. A fragment-shader ping-pong is ideal. |

**Conclusion.** WebGPU brings nothing this workload needs, and it adds an async lifecycle, a larger bundle, sprite instancing and a second backend path. Keep `PlateSimulation` behind an interface, so a `WebGPUPlateSimulation` can be added later if particle counts above 10⁶ or compute-only features become desirable.

### E.2 Capability probe and tiers (`gpu/capabilities.ts`)

1. Create a fresh `<canvas>`. Try `new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'default', failIfMajorPerformanceCaveat: true })`.
   - Don't use `'high-performance'`: on dual-GPU Macs it forces the discrete GPU, which drains battery and causes a switch hitch.
   - On failure, retry on a *new* canvas with `failIfMajorPerformanceCaveat: false` and force tier `low`. This covers software rendering and blocklisted GPUs.
   - On a second failure, use tier `static` (the poster).
2. Require `renderer.extensions.has('EXT_color_buffer_float')` and `capabilities.maxVertexTextures ≥ 1`.
   - **Functional probe:** render `vec4(0.123, -4.5, 1e5, 1)` into a 1×1 RGBA32F target, then `readRenderTargetPixels` into a `Float32Array`.
   - Repeat into a 1×1 RGBA16F target with linear filtering.
   - Any mismatch → `static`. Half-float *state* is rejected outright: an 11-bit mantissa swallows small per-step displacements, and grains stick.
3. Initial tier:
   - `high` if `(pointer: fine)` and `hardwareConcurrency ≥ 8`.
   - `low` if `deviceMemory ≤ 2` or `hardwareConcurrency ≤ 4` with a coarse pointer.
   - Otherwise `medium`.
   - `?quality=` overrides.
4. **Runtime adaptation.** During the first 3 s of running, compute an EMA of frame intervals. If p75 > 22 ms for 2 s, step down one tier. That means rebuilding the GPGPU at the smaller size and pre-warming again. At most 2 downgrades per session; never upgrade.

### E.3 Scene

Everything uses `OrthographicCamera` top-down. Ref 2 is flat-on, and orthographic gives pixel-exact grain sizes.

1. **PlateMesh**: a quad over [-1.2, 1.2]² with an analytic `ShaderMaterial`:
   - SDF `mix(circle, box, uShapeMix)`, AA via `fwidth` (core in WebGL2).
   - Body: radial gradient `#0E0E10` → `#08080A`, plus a static 1.2 % luminance hash grain (not animated).
   - Circle rim (ref 2): band 0 < d < 0.04, `#D8D5CE`, shaded by a fixed key light from the top-left (`0.85 + 0.15·dot(n, L)`), plus a 10 % inner darkening over d ∈ [−0.06, 0].
   - Square (ref 1): 1 px bevel highlight `rgba(255,255,255,0.06)` on the top and left edges. Centre bolt r = 0.022 with a metallic radial gradient, highlight offset to the top-left, and a dark outline.
   - Soft drop shadow outside the plate (d ∈ [0, 0.12], 35 %) over `uBg`, which is read from the CSS `--bg` token at init and on theme change.
2. **GrainLayer**: `Points`.
   - The `position` attribute (itemSize 2) holds each grain's state-texture uv.
   - `frustumCulled = false` (the bounding sphere is computed from uvs, not world positions).
   - `blending: AdditiveBlending`, `transparent: true`, `depthTest: false`, `depthWrite: false`, `renderOrder: 1`.
3. Colour: shaders write display-space sRGB directly. A `ShaderMaterial` without `colorspace_fragment` isn't converted. Additive blending in sRGB saturates piles to white quickly, which is the desired look.

```glsl
// grains.vert
uniform sampler2D uState; uniform float uSizePx, uIntensity, uOpacity, uJitterPx, uPxToPlate, uFrame;
out float vA; out float vSoft;
void main(){
  vec4 s = texture(uState, position.xy);
  vec4 c = vec4(pcg4d(uvec4(uint(gl_VertexID), 0x51u, 0x7Bu, 0x3Du))) / 4294967296.0;          // per-grain constants
  vec2 j = vec2(pcg4d(uvec4(uint(gl_VertexID), uint(uFrame), 0x11u, 0x22u)).xy) / 4294967296.0 - 0.5;
  float hop = clamp(s.z * 2.0, 0.0, 1.0);
  vec2 p = s.xy + j * uJitterPx * uPxToPlate * hop;                         // uJitterPx = 0.6 (0 if reduced motion)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
  float size = uSizePx * mix(0.8, 1.3, c.x) * (1.0 + 0.3*hop);
  gl_PointSize = clamp(size, 1.0, 4.0);
  vSoft = smoothstep(1.5, 2.5, size);
  vA = uOpacity * s.w * uIntensity * mix(0.55, 1.0, c.y) * (1.0 - 0.35*hop);
}
// grains.frag
in float vA; in float vSoft; uniform vec3 uColor;   // #F3EFE6
void main(){ vec2 d = gl_PointCoord - 0.5; float disc = 1.0 - smoothstep(0.18, 0.25, dot(d,d));
  gl_FragColor = vec4(uColor, vA * mix(1.0, disc, vSoft)); }
```

`uSizePx = grainCss × effectiveDpr × clamp(√(plateCssPx/560), 0.8, 1.4)`, so grains scale gently with plate size. The minimum is 1 device pixel.

**Lighting and tilt.**
- Lighting is analytic in the plate shader (a fixed key light).
- Optional desktop-only pointer parallax: switch to `PerspectiveCamera(fov 18°)`, tilt ≤ 2.5°, spring-smoothed. Grains are screen-space points, so they stay crisp. Disabled under reduced motion and on coarse pointers. Off by default in v1.
- **No bloom in v1.** Additive saturation plus soft discs already give the glow. If wanted later: `outputBufferType: HalfFloatType` + `setEffects()` (WebGLRenderer.js L749), desktop only.

### E.4 Crispness, resizing, DPR

- `ResizeObserver` uses `devicePixelContentBoxSize` where supported (Chrome, Firefox); otherwise `round(contentRect × dpr)`.
  - `renderer.setPixelRatio(effectiveDpr)` + `setSize(cssW, cssH, false)`. CSS controls the layout size.
  - Never CSS-scale or transform the canvas; animate opacity only.
  - Resizing clears the canvas, so force one render even when frozen.
- `effectiveDpr = min(devicePixelRatio, tier.dprCap)`. Re-evaluate on `matchMedia('(resolution: Xdppx)')` changes (window moved between monitors).
- `antialias: false`. Grains and plate edges are anti-aliased analytically, which saves MSAA bandwidth.

### E.5 Reduced motion

`matchMedia('(prefers-reduced-motion: reduce)')`, live-updated. When set:
- No grain jitter, onset kicks, switch agitation or parallax.
- Shape and bird transitions become cross-dissolves.
- Grain drift still runs (the pattern *is* the content).
- The global Play/Pause control (WCAG 2.2.2) also freezes the plate.

### E.6 WebGL unavailable

`PlatePoster` shows a static WebP per (shape, symmetry): 2 + 4 files of about 30 KB each.
- They're rendered once from a dev-only `/debug/posters` page using the *real* renderer and `canvas.toBlob`, then committed to `/public/posters/`. No second rendering implementation.
- Audio still works.
- Caption: "This browser can't show the live plate."

### E.7 Context loss

- `webglcontextlost` → stop the loop and crossfade to the poster (`onStatus('lost')`).
- `webglcontextrestored` → **dispose and rebuild the GPU layer on a new canvas**: renderer, GPGPU, LUT, pre-warm.
  - three restores its own GL state (L1123–1143), but our RT contents are gone. Rebuilding is one well-tested path, the same as mount.
- At most 3 rebuilds per session, then the poster stays.
- Dev aid: `?debug` exposes `forceContextLoss()` / `forceContextRestore()` buttons.

### E.8 Pausing offscreen or hidden

`IntersectionObserver` on the container (threshold 0), `document.visibilityState`, and the frozen detector all call `setAnimationLoop(null)`.
- Any change of audio status, props or size calls `setAnimationLoop(tick)` again.
- On mobile the plate column may scroll offscreen in a stacked layout, so this matters.

### E.9 Disposal on unmount (order matters)

```ts
dispose() {
  this.disposed = true;
  this.renderer.setAnimationLoop(null);
  this.ro.disconnect(); this.io.disconnect(); this.mqlReduced.removeEventListener('change', this.onRM);
  document.removeEventListener('visibilitychange', this.onVis);
  this.canvas.removeEventListener('webglcontextlost', this.onLost); this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
  this.unsubscribeEngine();
  this.sim.dispose();          // gpuCompute.dispose() + fieldRT + fieldMat(s) + initMat (createShaderMaterial ones are NOT freed by gpuCompute)
  this.grains.dispose();       // geometry + material
  this.plate.dispose();        // geometry + material
  this.lutTexture.dispose();
  this.renderer.dispose();
  this.renderer.forceContextLoss();  // release the GL context now (browsers cap live contexts at ~16)
  this.canvas.remove();
}
```

---

## F. Interfaces, React lifecycle, testing

### F.1 Public TypeScript interfaces

```ts
// audio/types.ts
export type AudioStatus = 'locked' | 'ready' | 'loading' | 'playing' | 'paused' | 'interrupted' | 'error';
export interface AudioSnapshot { status: AudioStatus; birdId: string | null; volume: number; muted: boolean;
  error: 'network' | 'decode' | 'unsupported' | null; analysisReady: boolean; }
export interface VoiceSnapshot { birdId: string; phaseSec: number; gain: number; playing: boolean; }
export interface AudioEngine {
  unlock(): void;                                  // sync, inside click/keydown
  select(song: BirdSong): Promise<void>;           // never rejects; resolves when audible or superseded
  prefetch(song: BirdSong): void;
  play(): void; pause(): void;
  setVolume(v: number): void; setMuted(m: boolean): void;
  readVoices(out: VoiceSnapshot[]): number;        // per frame, allocation-free, returns count (≤3)
  getTrack(birdId: string): SongFeatureTrack | null;
  subscribe(cb: () => void): () => void; getSnapshot(): AudioSnapshot;   // useSyncExternalStore
  dispose(): void;
}
export const getAudioEngine: () => AudioEngine = createClientOnlyFn(() => singleton());  // from @tanstack/react-start

// audio/SongAnalyzer.ts
export interface FrameFeatures { loud: number; f1: number; f2: number; m2rel: number; fSyl: number; centroid: number;
  tonal: number; voiced: boolean; onset: boolean; syllableStart: boolean; }
export function analyzeSong(pcm: Float32Array, sampleRate: number, o?: Partial<AnalysisOptions>): SongFeatureTrack;
export function sampleTrack(t: SongFeatureTrack, phaseSec: number, out: FrameFeatures): FrameFeatures;

// cymatics/physics
export type PlateShape = 'circle' | 'square';
export interface PlateMode { key: string; n: number; c?: number; m?: number; f: number; norm: number; lutRow?: number; }
export interface ModeBank { shape: PlateShape; symmetry: number; modes: readonly PlateMode[]; hero: number; Q: number; gamma: number; }
export function circleBank(s: 3 | 4 | 5 | 6): ModeBank;
export function squareBank(): ModeBank;
export interface Calibration { toPlate(hz: number): number; anchors: { hz: [number, number, number]; f: [number, number, number] }; }
export function makeCalibration(band: BirdSong['bandHz'], peakHz: number, bank: ModeBank): Calibration;
export function lorentzTargets(fPlate: number, w: number, bank: ModeBank, outRe: Float32Array, outIm: Float32Array): number; // returns G
export class ModeEnvelope { constructor(n: number); update(tRe: Float32Array, tIm: Float32Array, dt: number, atk?: number, rel?: number): void;
  readonly re: Float32Array; readonly im: Float32Array; energy(): number; }
export function bakeRadialLut(rows: readonly KirchhoffRow[], width?: number /*1024*/, ext?: number /*1.05*/): { data: Float32Array; norms: Float32Array };

// cymatics/gpu
export interface PlateSimulation {
  readonly stateTexture: THREE.Texture;
  setShape(shape: PlateShape): void;
  setSlotBank(slot: 0 | 1, bank: ModeBank): void;
  renderField(coef: Float32Array /* 32×4 */): void;
  step(u: SandStepUniforms): void;
  sprinkle(): void;
  dispose(): void;
}

// cymatics/CymaticsView.tsx
export interface CymaticsBird { id: string; name: string; song: BirdSong; }
export interface CymaticsViewProps {
  shape: PlateShape;
  bird: CymaticsBird | null;
  quality?: 'auto' | 'high' | 'medium' | 'low' | 'static';
  className?: string;
  label?: string;                                    // aria-label; default "Sand pattern formed by the {name} song"
  onStatus?: (s: 'prewarming' | 'running' | 'frozen' | 'fallback' | 'lost') => void;
}
```

### F.2 SSR, client-only and lifecycle (TanStack Start + React 19 StrictMode)

```tsx
// CymaticsView.tsx  (SSR-safe; imports no three)
const CymaticsCanvas = lazy(() =>
  import.meta.env.SSR ? Promise.resolve({ default: () => null }) : import('./CymaticsCanvas'));  // dead branch tree-shaken out of the Worker bundle
export function CymaticsView(props: CymaticsViewProps) {
  const poster = <PlatePoster shape={props.shape} symmetry={symmetryOf(props.bird)} />;
  return (
    <div className={props.className} role="img" aria-label={labelOf(props)}>
      <ClientOnly fallback={poster}><Suspense fallback={poster}><CymaticsCanvas {...props} /></Suspense></ClientOnly>
    </div>);
}

// CymaticsCanvas.tsx  (lazy chunk; imports three)
export default function CymaticsCanvas({ shape, bird, quality = 'auto', onStatus }: CymaticsViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<CymaticsController | null>(null);
  const onStatusRef = useRef(onStatus); onStatusRef.current = onStatus;
  useEffect(() => {                                         // create/dispose ONLY here
    const c = CymaticsController.create(hostRef.current!, { quality, onStatus: s => onStatusRef.current?.(s), engine: getAudioEngine() });
    ctrlRef.current = c;
    return () => { c.dispose(); ctrlRef.current = null; };  // StrictMode: mount→dispose→mount gives two fresh canvases, no shared GL state
  }, [quality]);
  useEffect(() => { ctrlRef.current?.setShape(shape); }, [shape]);
  useEffect(() => { ctrlRef.current?.setBird(bird); }, [bird?.id]);
  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
```

- **Why an imperative canvas.** After `forceContextLoss()`, a reused JSX `<canvas>` returns the *lost* context to the second StrictMode mount. Each controller therefore creates and removes its own canvas.
- **Async work** inside the controller (the LUT from the Worker, the feature track) checks `this.disposed` before touching GPU objects.
- **The audio engine is not tied to components.** UI uses `useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => LOCKED)`. The server snapshot is a constant.
- **Worker.** `new Worker(new URL('./analysis/worker.ts', import.meta.url), { type: 'module' })`. It is created lazily on the first decode and shared between audio analysis and the LUT bake.
- **Bundle guard (CI).** Run `vite build`, then check that no server or Worker chunk contains the string `THREE.WebGLRenderer: Error creating WebGL context` (an error message that survives minification). Also assert the Worker bundle size via `wrangler deploy --dry-run --outdir`.
- **Cloudflare static assets.**
  - `.m4a` and posters: `Cache-Control: public, max-age=31536000, immutable` (hashed names), `Content-Type: audio/mp4`.
  - The manifest is short-cached.

### F.3 Testing strategy (Vitest, `environment: 'node'`, pure modules only)

| File | Asserts |
|---|---|
| `bessel.test.ts` | J/I against hard-coded scipy values: \|ΔJ\| < 1e-10 and \|ΔI\| < 1e-13·eˣ for n ≤ 16, x ≤ 23.1. Identity J₀² + 2ΣJ_k² = 1 (1e-12). Recurrence J_{n−1} + J_{n+1} = (2n/x)J_n. |
| `kirchhoffTable.test.ts` | For every row, the free-edge residuals \|M_r(1)\|, \|V_r(1)\| < 1e-8 relative (TS Bessel + derivative identities). λ sorted. Nodal-circle count c matches sign changes on r ∈ (0,1]. Recomputing with ν = 0.33 gives Leissa's (2,0), (0,1), (3,0), (1,1), (4,0) within 0.5 %. |
| `modes.test.ts` | `circleBank(s)`: all n % s == 0, 16 modes, hero = (s,1). `squareBank()`: φ(centre) ≠ 0 for all modes, no duplicate f. RMS = 1 and pairwise orthogonality \|⟨φ_i,φ_j⟩\| < 0.02 on a 512² grid. Chladni-law Spearman ρ > 0.9. |
| `radialLut.test.ts` | LUT vs direct evaluation < 1e-6. Norms match the 2D grid integral within 1 %. Values beyond r = 1 are finite and not zeroed. |
| `calibration.test.ts` | Anchors map exactly. The mapping is monotone. Clamping works. Degenerate manifests (p10 == p90, NaN, peak outside band, peak > 1 octave from p50) give finite, monotone maps. |
| `excitation.test.ts` | Drive at f_k → argmax\|c\| = k. ‖ĉ‖ = 1. G ≤ 1. Zero drive → zero targets. Q = 24 vs 14 changes neighbour leakage as expected. |
| `envelope.test.ts` | Attack and release τ. **Frame-rate independence**: 30, 60, 144 Hz reach the same value at t = 1 s (< 1e-6). |
| `fft.test.ts`, `features.test.ts` | FFT matches a naive DFT (1e-9). Synthetic 3 kHz + noise → f1 within ±2 Hz. Two tones → both peaks. Silence → loud 0, unvoiced. Stationary noise floor is removed. Tone bursts → onsets at ±10 ms. Trill → syllables counted correctly. Seam continuity of the circular padding. |
| `loopTrim.test.ts`, `clock.test.ts`, `ramp.test.ts` | Trimmed/untrimmed/unknown decoders, 44.1 → 48 kHz scaling. Phase wraps, and `getOutputTimestamp` fallbacks (0, stale, future). Ramp `valueAt` under re-targeting. |
| `engine.test.ts` | Hand-written `FakeAudioContext` (controllable `currentTime`, recorded automation). Select A→B→C rapidly → only C audible, ≤ 3 voices, stale decodes cached but not played. Pause → `readVoices().playing = false`. Visibility suspend/resume. Interrupted state. |
| `sandCpuReference.test.ts` | CPU port of `sand.step` (same constants from `params.ts`), 20k grains, hero mode, D = 1. After 1.5 s, ≥ 85 % of grains have \|U\| < 0.3 (prototype: 0.90 at 1 s). D = 0 → positions bit-identical over 100 steps (freeze). Square edges → best-of-4 re-seed keeps the count. NaN injection gets re-seeded. |
| `params.test.ts` | `params.ts` → GLSL `#define` generation is stable (snapshot). |

Outside Vitest:
- An optional Playwright smoke test (Chromium headless WebGL2/SwiftShader) on `/?debug=1`: wait for `window.__kyma.ready`, check for no console errors, and read a canvas pixel histogram after pre-warm (non-uniform).
- Manual device matrix: Chrome/Edge Windows, Safari macOS, iPhone (silent switch on/off, Low Power Mode at 30 Hz rAF, call interruption), Firefox (Linux AAC), mid-range Android (Adreno 6xx / Mali-G5x).

---

## G. Risks and mitigations

| Risk | Likelihood / impact | Mitigation in this design |
|---|---|---|
| AAC loop gap or click (encoder priming; decoders differ; afconvert writes `iTunSMPB` but no `elst`) | High / High | Manifest `validFrames`/`primingFrames`; `computeLoopRegion` for both decoder behaviours; `loopStart`/`loopEnd`; seam crossfade baked at authoring; dev warning on 'unknown'. |
| iOS silent switch mutes Web Audio | High on iPhone / High | `navigator.audioSession.type = 'playback'` (16.4+), silent `<audio>` fallback, and a "No sound? Check silent mode" hint on iOS. |
| Autoplay blocked | Certain / Medium | `locked` state with a single CTA. Context created in the gesture. Plate pre-warmed so the page is beautiful before sound. |
| iOS `interrupted` or suspended after backgrounding | Medium / Medium | `statechange` handling, "Tap to resume", serialized suspend/resume queue. |
| Visual/audio desync (Bluetooth 150–250 ms) | Medium / Medium | Offline track looked up at `heardTime()` (getOutputTimestamp → outputLatency → baseLatency) plus a 30 ms look-ahead. |
| Rapid picker scrolling: overlapping decodes and voices | High / Medium | UI debounce, generation tokens, AbortController, ≤ 3 voices, own ramp bookkeeping (no `setValueCurveAtTime` overlap exceptions). |
| Memory growth from decoded audio | Medium / Medium | Mono assets, byte-bounded LRU (48/24 MB), neighbours prefetched compressed only. |
| AAC undecodable (some Linux Firefox/Chromium builds) | Low / High for those users | Optional `fallbackSrc` (Opus). Graceful `error: 'unsupported'`. Plate stays on the frozen hero figure. |
| Patterns illegible or jittery | High without design / High | Syllable-median pitch, ~7-mode calibration, s-fold symmetric banks, Q tuned per plate, 80/700 ms envelopes, mobility threshold, RMS-normalized modes, signed-field interpolation. Verified in prototype. `?debug` lil-gui (`three/addons/libs/lil-gui.module.min.js`, lazy) for live tuning. |
| Float render targets missing or broken | Low (2026) / High | Extension check plus a functional readback probe; no half-float state; poster tier. |
| Half-float or fp32 precision traps | Medium / Medium | RGBA32F state. Uint fixed-point R2 init. Bessel on CPU in double. LUT lerp in highp. Field stores signed values (half is fine near zero). |
| `mediump`-only GPUs (three silently downgrades, WebGLCapabilities L55–70) | Low / High | Probe `capabilities.precision === 'highp'`; otherwise use the `static` tier. |
| StrictMode double mount, HMR, context limits | Certain in dev / High | Imperative canvas per mount, full disposal plus `forceContextLoss`, synchronous renderer init, singleton audio on `globalThis` in dev. |
| WebGL context loss (GPU reset, mobile backgrounding) | Medium / Medium | Poster crossfade, full rebuild on restore, 3 attempts max. |
| Thermal and battery drain on mobile | Medium / Medium | Tiering, DPR cap, 60 Hz sim with render only on sim steps (120 Hz displays don't double the work), zero GPU work when frozen, offscreen/hidden pause, runtime downgrade. |
| three leaking into the SSR/Worker bundle (size limits, cold start) | Medium / High | `import.meta.env.SSR` dead branch plus `lazy`, `ClientOnly`, ESLint import boundary, CI chunk check. |
| Software rendering (VMs, blocklisted GPUs) | Low / Medium | `failIfMajorPerformanceCaveat` first, then forced `low` tier. |
| Worker unavailable (CSP / old browser) | Low / Low | Same pure functions run main-thread in 8 ms slices. |
| WebGPU becomes compelling later | — | `PlateSimulation` interface. Physics and analysis are renderer-agnostic and already unit-tested. |

---

### Appendix: default constants (`sand/params.ts` and `physics/*`)

```ts
export const SIM = { dt: 1 / 60, maxSubsteps: 3, sigma: 0.08, kappa: 0.03, theta: 0.15, knee: 0.15,
  rimCircle: 0.985, fadeIn: 0.4, onsetKick: 0.10, onsetTau: 0.08, switchKick: 0.25, switchTau: 0.25,
  fieldRes: 256, fieldExt: 1.05, lutWidth: 1024, slots: 32, boltR: 0.07, jitterPx: 0.6 } as const;
export const DRIVE = { attackD: 0.03, releaseD: 0.25, pitchTau: 0.04, glideBeta: 0.25, coefAttack: 0.08, coefRelease: 0.7,
  lookahead: 0.03, secondMinRel: 0.35, secondMinOct: 1 / 3, secondGain: 0.6 } as const;
export const PLATE = { nu: 0.3, circle: { Q: 24, gamma: 0.35, bankSize: 16 }, square: { Q: 14, gamma: 0.35, anchors: [1, 3, 7] } } as const;
export const AUDIO = { fadeIn: 0.6, fadeOut: 0.45, fadeOutDelay: 0.1, pauseFade: 0.12, resumeFade: 0.2, maxVoices: 3,
  cacheBytesDesktop: 48e6, cacheBytesMobile: 24e6 } as const;
export const ANALYSIS = { fftSize: 2048, hopSec: 0.01, bandLo: 300, bandHi: 12000, floorPct: 0.2, floorMarginDb: 6,
  voiceOn: 0.30, voiceOff: 0.15, minGapSec: 0.025, maxSyllableSec: 0.4, splitOct: 0.25, tonalCrest: 8, onsetZ: 2.5 } as const;
```

Prototype scripts and the full Kirchhoff table (70 modes, λ ≤ 22, JSON) are in `scratchpad/proto-robust/`: `kirchhoff.py`, `ktable.py`, `kirchhoff_table.json`, `sand2.py`, `e2e2.py`, `bessel_bench.mjs`, `fft_bench.mjs`.
