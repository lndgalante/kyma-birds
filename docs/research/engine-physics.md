# Kyma Birds — Cymatics Engine Design Spec

Angle: **physical fidelity**. The spec targets three@0.186.1, TanStack Start (React 19), and is mounted client-only. All numbers below were computed or simulated for this spec. Section C.10 and D.3 list the prototype runs (Python/NumPy, SciPy), and every three.js API is checked against the r186 source, with the file path cited.

Scripts used to produce the tables and prototypes are in
`/private/tmp/claude-501/-Users-leo-Developer-kyma-birds/2ce8f907-233f-45c4-890b-e14123a8a9be/scratchpad/physics-scripts/`
(`circle_modes.py`, `checks.py`, `sandsim*.py`, `sheet.png`, `sand_sheet*.png`).

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Plate theory | Kirchhoff thin plate, `D∇⁴w + ρh ẅ = f`. Modal superposition. Driven, damped **steady-state** response per analysis frame (valid because the modal ring-down of about 10 ms is shorter than the frame hop). |
| Circular plate (ref. 2) | **Exact free-edge modes** `W = [J_n(λr) + C·I_n(λr)]·cos nθ`, ν = 0.33, 37 modes (λ² ≤ 246). Excited at the **rim**, at Chladni's bow point. A centre drive can only excite n = 0 (rings), because `J_n(0) = 0`. |
| Square plate (ref. 1) | **Guided-edge** plate (zero slope, zero Kirchhoff shear), exact modes `cos(mπX)cos(nπY)`, `Λ = m²+n²`. Driven at the centre, so only even–even **symmetric** combinations `(m,n)+(n,m)` respond. 31 modes (Λ ≤ 260). |
| Sound → plate | Analyser power spectrum = force PSD → modal **accelerance** `H_k(f) = r²/(1−r²+ir/Q_k)` → 8×8 modal **cross-spectral matrix M** → `Γ²(x) = qᵀ M̃ q`, the mean-square plate acceleration in units of g². |
| Per-bird calibration | **One physical scale factor**, equivalent to choosing plate thickness. `peakHz` sits exactly on a "signature" resonance, chosen so that about 6 modes fall inside `[p10, p90]`. `Q_k = clamp(8·f_k/Δf_k, 30, 120)`. |
| Sand | Overdamped Itô Langevin dynamics. A grain moves only where Γ exceeds its own lift-off threshold `θ_i ~ U(0.6, 1.4)` (polydisperse). Hop noise ∝ `min(Γ, 4)`, drift ∝ `−∇Γ²`. Grains are **frozen** below threshold, so the figure holds when the sound stops. |
| Renderer | `THREE.WebGPURenderer` (`three/webgpu`) + TSL compute (`instancedArray`). The built-in WebGL2 fallback runs compute through **transform feedback**, verified in r186. A Canvas2D CPU fallback and an SSR SVG poster cover the remaining cases. |
| Bessel on GPU | **The GPU never evaluates a Bessel function.** Radial functions are built on the CPU in f64 with exponentially convergent trapezoid integrals (error 1e-13), then stored in an RGBA32F LUT of 512 × 37 texels (R, R′, nR/r). The shader reads them with `textureLoad` + manual lerp (LUT error 3e-4 of the RMS value). |
| Grain count | 262,144 (WebGPU desktop) · 131,072 (WebGL2 / mid tier) · 65,536 (mobile) · 12,288 (Canvas2D) |
| Audio | One `AudioContext`, created and resumed inside a gesture. `navigator.audioSession.type = 'playback'` handles the iOS silent switch. AAC loops ship with **periodic handles**. Each voice has a **two-gain-stage** equal-power crossfade, so automation never collides. The analyser taps the bus **before** volume. |
| Analysis | `AnalyserNode` with `fftSize` 2048 and `smoothingTimeConstant` 0. We smooth ourselves, with dt-aware attack 15 ms / release 150 ms. Per-bin noise floor and a manifest-driven band window. |

---

## A. Audio

### A.1 Graph

```
voice_i:  AudioBufferSourceNode(loop) → trim(Gain, manifest gainDb) → fadeIn(Gain) → fadeOut(Gain) ─┐
                                                                                                    ├→ songBus(Gain=1) ─┬→ AnalyserNode   (tap, pre-volume)
voice_j:  ...                                                                                     ─┘                    └→ pauseGain → volumeGain → muteGain → destination
```

* The **analyser taps `songBus`**, upstream of pause, volume and mute. The plate reacts to the song itself, not to the listener's volume, so a muted visitor (library, office) still sees the plate dance. In our view this is also an accessibility win.
* Each voice has **two fade gains**. `fadeIn` receives exactly one `setValueCurveAtTime` (fade-in) and `fadeOut` receives exactly one (fade-out) over its whole life. No `AudioParam` ever holds two overlapping curves. That matters because `setValueCurveAtTime` throws `NotSupportedError` on overlap, and `cancelAndHoldAtTime` is still missing in Firefox. When a voice is interrupted mid-fade-in, its effective gain is `sin(πt₁/2)·cos(πt₂/2)`, which stays smooth and click-free.
* An `AnalyserNode` with no output connection is still processed, because it is an automatic pull node in Blink and WebKit. If QA finds a browser that does not pull it, connect `analyser → GainNode(0) → destination`.

### A.2 Unlock (autoplay policy, iOS)

Rules:

1. Create **and** resume the context **synchronously** inside a `pointerup` / `click` / `keydown` / `touchend` handler. Scroll and swipe (`touchmove`, scroll-snap) do **not** count as user activation. If someone swipes the picker before unlocking, only visuals update (the poster pattern, D.6) until they tap "Listen".
2. **iOS silent switch:** Web Audio uses the `ambient` session category, which the ring/silent switch mutes. Safari 16.4+ exposes `navigator.audioSession`, and we set `type = 'playback'` **before** creating the context. On older iOS (feature-detect, iOS only), start a looping 0.5 s silent `HTMLAudioElement` in the same gesture. That promotes the session to playback (best effort), and the element is paused whenever the engine pauses.
3. Play a 1-sample silent buffer in the gesture. This is the legacy iOS unlock and costs nothing.
4. Never pass `sampleRate`. Let the device choose (iOS uses 48 kHz). `decodeAudioData` resamples to the context rate.
5. Handle `ctx.state === 'interrupted'` (Safari-specific: phone call, Siri, app switch) and any `suspended` state we did not request. Move to state `interrupted` and show a **"Tap to resume"** affordance. That tap calls `unlock()` + `resume()`.

```ts
// src/audio/unlock.ts
type SessionType = 'auto' | 'playback' | 'ambient' | 'transient' | 'transient-solo' | 'play-and-record';
type NavWithSession = Navigator & { audioSession?: { type: SessionType } };

export function createAudioContext(): AudioContext {
  const nav = navigator as NavWithSession;
  if (nav.audioSession) { try { nav.audioSession.type = 'playback'; } catch { /* non-fatal */ } }
  const Ctor: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor({ latencyHint: 'interactive' });
}

/** MUST run synchronously inside a user-gesture handler. */
export function primeInGesture(ctx: AudioContext): Promise<void> {
  const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
  const b = ctx.createBuffer(1, 1, ctx.sampleRate);
  const s = new AudioBufferSourceNode(ctx, { buffer: b });
  s.connect(ctx.destination); s.start();
  return resumed;
}

export const needsIosSessionShim = () =>
  !(navigator as NavWithSession).audioSession &&
  /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
```

### A.3 Loading, decoding, seamless AAC loops

**Manifest contract.** The asset pipeline produces this structure, and the engine consumes it:

```ts
export interface BirdSongAsset {
  id: string;
  src: string;                         // '/audio/myrmotherula-snowi.m4a' (AAC-LC, .m4a)
  durationSec: number;
  loop?: { startSec: number; endSec: number };  // loop region inside periodic handles (see below)
  bandHz: { p10: number; p50: number; p90: number };
  peakHz: number;
  gainDb?: number;                     // loudness normalisation trim (e.g. to −20 LUFS)
  startOffsetSec?: number;             // optional: first syllable, to avoid opening on silence
}
```

**Why periodic handles.** AAC encoders add priming samples (Apple's encoder uses 2112 at the front) and pad the end to 1024-frame packets. Browsers differ in whether `decodeAudioData` trims that delay using the MP4 edit list. The pipeline must therefore write **≥ 250 ms of periodic extension on each side**:

`file = [last 250 ms of loop] + [loop L] + [first 250 ms of loop]`

and set `loop = { startSec: 0.25, endSec: 0.25 + L }`. If a decoder leaves the priming in, everything shifts by a constant δ ≤ 50 ms. Because the signal is periodic inside the handles, `[0.25, 0.25+L]` in decoded time is still exactly one period. The loop stays **sample-seamless** whether or not the decoder trims priming. The runtime sets `src.loopStart` and `src.loopEnd` from the manifest, and `AudioBufferSourceNode` looping is sample-accurate.

If an asset has no `loop`, the engine loops the whole buffer. If `buffer.duration − durationSec` falls in (0, 0.1] s, it builds a trimmed copy that drops `min(excess, 2112/44100 s)` from the head and the remainder from the tail (`copyFromChannel` / `copyToChannel`). This is a fallback only.

**Loader.** Encoded bytes are prefetched (neighbours ±1, at idle) and decoded buffers are kept in an LRU.

```ts
// src/audio/LoopLoader.ts
export class LoopLoader {
  private bytes = new Map<string, Promise<ArrayBuffer>>();   // encoded, dedupes in-flight fetches
  private decoded = new Map<string, AudioBuffer>();          // LRU by insertion order
  private decodedBytes = 0;
  constructor(private readonly maxDecodedBytes = 48 * 2 ** 20) {}

  prefetch(a: BirdSongAsset) { if (!this.bytes.has(a.src)) this.bytes.set(a.src, fetchBytes(a.src)); }

  /** `isStale()` is checked between fetch and decode so superseded selections never pay for a decode. */
  async get(a: BirdSongAsset, ctx: BaseAudioContext, isStale: () => boolean): Promise<AudioBuffer | null> {
    const hit = this.decoded.get(a.id);
    if (hit) { this.decoded.delete(a.id); this.decoded.set(a.id, hit); return hit; }
    this.prefetch(a);
    const enc = await this.bytes.get(a.src)!;
    if (isStale()) return null;
    const buf = await ctx.decodeAudioData(enc.slice(0));     // decodeAudioData detaches its input
    this.put(a.id, buf);
    return buf;
  }
  private put(id: string, b: AudioBuffer) {
    this.decoded.set(id, b);
    this.decodedBytes += b.length * b.numberOfChannels * 4;
    for (const [k, v] of this.decoded) {
      if (this.decodedBytes <= this.maxDecodedBytes || k === id) break;
      this.decoded.delete(k); this.decodedBytes -= v.length * v.numberOfChannels * 4;
    }
  }
  clear() { this.bytes.clear(); this.decoded.clear(); this.decodedBytes = 0; }
}
async function fetchBytes(src: string): Promise<ArrayBuffer> {
  const r = await fetch(src, { credentials: 'same-origin' });
  if (!r.ok) throw new Error(`audio ${r.status} ${src}`);
  return r.arrayBuffer();
}
```

Budget: a 15 s stereo loop at 48 kHz is 5.8 MB decoded, so the 48 MB cap holds about 8 birds.

### A.4 Selection, crossfade, rapid switching

* `select(asset)` increments a **token**. A stale result (token changed) is cached but never started.
* **Settle debounce.** After decoding, the engine waits until **120 ms have passed since the last `select()` call**, then re-checks the token. Flicking through the carousel therefore never starts every bird on the way.
* Crossfade is **700 ms equal-power**, built from 64-point sin/cos curves. Each new voice retires every other voice. A retire puts one fade-out curve on `fadeOut` and calls `src.stop(t0 + 0.75)`. A voice that is already fading out is left alone.
* Voice cap: more than 4 live voices means the oldest is hard-stopped. With the debounce this should never happen; it is a guard only.
* The plate calibration glides over the same 700 ms (C.7).

```ts
// src/audio/AudioEngine.ts (core of the crossfade)
const XF = 0.7, N = 64;
const IN  = Float32Array.from({ length: N }, (_, i) => Math.sin((i / (N - 1)) * Math.PI / 2));
const OUT = Float32Array.from({ length: N }, (_, i) => Math.cos((i / (N - 1)) * Math.PI / 2));

interface Voice { id: string; src: AudioBufferSourceNode; nodes: AudioNode[]; fadeOut: GainNode; retiring: boolean }

private startVoice(a: BirdSongAsset, buffer: AudioBuffer) {
  const ctx = this.ctx!;
  const t0 = ctx.currentTime + 0.02;
  for (const v of this.voices) this.retire(v, t0);
  const { start, end } = loopRegion(a, buffer);
  const src = new AudioBufferSourceNode(ctx, { buffer, loop: true, loopStart: start, loopEnd: end });
  const trim = new GainNode(ctx, { gain: 10 ** ((a.gainDb ?? 0) / 20) });
  const fadeIn = new GainNode(ctx, { gain: 0 });
  const fadeOut = new GainNode(ctx, { gain: 1 });
  src.connect(trim).connect(fadeIn).connect(fadeOut).connect(this.songBus);
  fadeIn.gain.setValueCurveAtTime(IN, t0, XF);
  src.start(t0, start + (a.startOffsetSec ?? 0));
  const v: Voice = { id: a.id, src, nodes: [src, trim, fadeIn, fadeOut], fadeOut, retiring: false };
  src.onended = () => { v.nodes.forEach((n) => n.disconnect()); this.voices = this.voices.filter((x) => x !== v); };
  this.voices.push(v);
}
private retire(v: Voice, t0: number) {
  if (v.retiring) return;
  v.retiring = true;
  v.fadeOut.gain.setValueCurveAtTime(OUT, t0, XF);   // the ONLY automation this param ever gets
  v.src.stop(t0 + XF + 0.05);
}
```

### A.5 Pause, resume, volume, mute

* **Pause:** `wantPlaying = false`. Then `pauseGain.setTargetAtTime(0, t, 0.03)`, and after 160 ms `ctx.suspend()` (only if the user has not resumed in the meantime). `isAudible` flips to `false` **immediately**, so the analyzer returns silence at once. This matters because a suspended `AnalyserNode` keeps returning its last spectrum, which would leave the plate "stuck vibrating".
* **Resume:** `await ctx.resume()`, then `pauseGain.setTargetAtTime(1, t, 0.03)`. Loop position is preserved because context time froze.
* **Volume:** slider `v ∈ [0,1]` maps to `volumeGain.setTargetAtTime(v², t, 0.02)` (roughly perceptual). Default `v = 0.7`.
* **Mute:** `muteGain.setTargetAtTime(m ? 0 : 1, t, 0.015)`. It is a separate node, so the volume setting is remembered.
* Before each `setTargetAtTime`, call `cancelScheduledValues(t)`. `setTargetAtTime` is continuous from the current value, so there is no click.

### A.6 Page visibility, bfcache, interruptions

* `visibilitychange → hidden`: if playing, set `pausedByVisibility = true` and `pause()`.
* `visibilitychange → visible`: if `pausedByVisibility`, call `resume()`. Run a 600 ms watchdog: if `ctx.state !== 'running'`, enter state `interrupted` (iOS often needs a tap).
* `pagehide` is treated like hidden. `pageshow` with `event.persisted` is treated like visible.
* `ctx.onstatechange` maps an unexpected `suspended` or `'interrupted'` to the `interrupted` state.

### A.7 State machine

| State | Entered by | Plate behaviour |
|---|---|---|
| `locked` | initial (no gesture yet) | poster pattern (D.6), static |
| `loading` | `select()` while a decode is pending | the previous drive continues, or frozen |
| `playing` | voice started and `ctx.state === 'running'` | live drive |
| `paused` | user pause / hidden | drive = 0, sand **freezes** and holds the figure |
| `interrupted` | iOS interruption / resume failed | frozen, plus a "Tap to resume" button |
| `error` | fetch/decode failure | frozen, toast, next bird still selectable |

### A.8 Cleanup

`dispose()`: remove listeners → `stop()` and disconnect every voice → disconnect the buses and the analyser → `await ctx.close()` → `loader.clear()` → pause and release the iOS shim element. The engine is an **app-level singleton** provided by `AudioEngineProvider` (client-only), so React StrictMode double-mounting the plate view never creates a second context. The provider disposes on full unmount only.

### A.9 Public interface

```ts
// src/audio/types.ts
export type EngineState = 'locked' | 'loading' | 'playing' | 'paused' | 'interrupted' | 'error';
export interface EngineSnapshot { state: EngineState; currentId: string | null; loadingId: string | null; volume: number; muted: boolean; error?: string }

export interface AudioEngine {
  readonly context: AudioContext | null;
  readonly songBus: AudioNode | null;           // analyser input (pre-volume)
  readonly isAudible: boolean;                   // playing && running && !pausing
  readonly currentAsset: BirdSongAsset | null;
  unlock(): Promise<void>;                       // call from a gesture handler (sync prefix)
  select(asset: BirdSongAsset): Promise<void>;   // token + settle-debounce + crossfade
  prefetch(asset: BirdSongAsset): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  getSnapshot(): EngineSnapshot;                 // for useSyncExternalStore
  subscribe(fn: () => void): () => void;
  dispose(): Promise<void>;
}
```

---

## B. Analysis

### B.1 AnalyserNode settings

| Param | Value | Why |
|---|---|---|
| `fftSize` | **2048** | At 48 kHz: 42.7 ms window, 23.4 Hz bins. At 44.1 kHz: 46.4 ms, 21.5 Hz. Bird syllables run 50–300 ms, and modal spacing in the calibrated band is ≥ 100 Hz (≥ 4 bins). 4096 would smear trills. |
| `smoothingTimeConstant` | **0** | The built-in smoothing is applied **per `getFloatFrequencyData` call**, which makes it frame-rate dependent: a 120 Hz display smooths differently from 60 Hz. We smooth ourselves with dt-aware one-pole filters. |
| `minDecibels` / `maxDecibels` | −110 / −10 | Only affect the byte API, which we do not use. |
| Reads per frame | `getFloatFrequencyData(db)`, `getFloatTimeDomainData(td)` | Buffers are allocated once, with no per-frame allocation. Values are clamped `db = max(db, −160)`, because Safari can return `−Infinity`. |

### B.2 Per-frame pipeline (dt-aware)

Let `α(τ) = 1 − exp(−dt/τ)`. Bins outside `[0.6·p10, 1.6·p90]` are ignored. Inside, a raised-cosine taper `w_b` ramps 0 → 1 over `0.6–0.85·p10` and 1 → 0 over `1.25–1.6·p90`.

1. Power: `P_b = 10^(db_b/10)`.
2. **Noise floor** per bin (a minimum-statistics variant):
   * if `P_b < N_b`, then `N_b += (P_b − N_b)·α(0.2 s)` (falls fast);
   * otherwise `N_b *= 10^(0.3·dt)` (rises slowly, +3 dB/s).

   Initial `N_b` = −90 dB. Steady insect drones and stream noise are absorbed in about 10 s, while 1–3 s whistles are not.
3. Clean force PSD: `X_b = max(0, P_b − 2·N_b)·w_b`. The factor 2 is a +3 dB over-subtraction.
4. **Gate** with hysteresis on band SNR `= 10·log10(ΣP_b·w_b / ΣN_b·w_b)`. It opens above +9 dB, closes below +6 dB, with a 60 ms hold. When closed, `X_b := 0`.
5. **Envelope:** `S_b += (X_b − S_b)·α(X_b > S_b ? 0.015 : 0.150)`, i.e. 15 ms attack and 150 ms release. This is the only smoothing on the drive.
6. Features, for UI, debug and the latency queue:
   * `rmsDb = 10·log10(mean(td²))`
   * `centroidHz = Σ f_b S_b / Σ S_b`
   * `peakHz`: argmax of `S_b`, refined by **parabolic interpolation** on dB values. With α, β, γ the dB values at bins b−1, b, b+1: `δ = ½(α−γ)/(α−2β+γ)` and `peakHz = (b+δ)·binHz`. Confidence = peak dB − median band dB.
   * **Spectral flux** `= Σ_b max(0, L_b − L_b^prev)/nBins` with `L_b = log10(S_b + ε)` and `ε = 1e-3·mean(N_b)`.
   * **Onset**: flux > median(last 32) + 1.5·MAD + 0.02, with an 80 ms refractory period. Onsets drive the UI only. They never directly touch the physics, because transients already carry their own broadband spectrum.
7. **Latency compensation** (optional, on by default where supported). Keep the last 24 `S` snapshots with their context time and use the one nearest `currentTime − clamp(outputLatency ?? baseLatency ?? 0, 0, 0.3)`. Bluetooth output can add about 200 ms, and without compensation the sand would move before the sound is heard.

When `!engine.isAudible`, `update()` skips the analyser and decays `S` with the release filter toward 0, so the sand freezes physically (D.1).

```ts
// src/audio/SongAnalyzer.ts (shape)
export interface SongFeatures {
  time: number; active: boolean;
  S: Float32Array;            // smoothed clean force PSD over [binLo, binLo + nBins)
  binLo: number; nBins: number; binHz: number;
  rmsDb: number; snrDb: number; centroidHz: number;
  peakHz: number | null; peakConfidenceDb: number;
  flux: number; onset: boolean;
}
export interface SongAnalyzer {
  readonly node: AnalyserNode;
  setBand(band: { p10: number; p90: number }, glideSec?: number): void;   // union of old/new during glide
  update(dt: number, audible: boolean): SongFeatures;                      // allocation-free
  dispose(): void;
}
```

---

## C. Plate physics

### C.1 Governing model

Kirchhoff plate: `D∇⁴w + ρh·∂²w/∂t² + (damping) = f(x,t)`, where `D = Eh³/(12(1−ν²))`.
Eigenproblem: `∇⁴ψ = k⁴ψ`, `ω = k²·√(D/ρh)`.

For each plate we use a dimensionless eigenvalue Λ, so that `f_k = C_plate · Λ_k`:

| Plate | Λ | C_plate (physical) | Aluminium (E = 68.9 GPa, ρ = 2700, ν = 0.33 → `c_p = √(E/12ρ(1−ν²)) = 1545 m/s`) |
|---|---|---|---|
| Circle, radius a | `λ²` | `h·c_p/(2πa²)` | a = 150 mm, h = 1 mm → **10.93 Hz × λ²** |
| Square, side L | `m²+n²` | `π·h·c_p/(2L²)` | L = 300 mm, h = 1 mm → **26.97 Hz × (m²+n²)** |

Modes are **RMS-normalised over the plate**: `⟨ψ_j ψ_k⟩_plate = δ_jk`. That makes `⟨Γ²⟩ = trace(M̃)` (C.5).

### C.2 Circular plate — exact free-edge modes

Shape: `ψ_ns(r,θ) = R_ns(r)·cos nθ`, with `R = [J_n(λr) + C·I_n(λr)] / √(N_ns)`. The plate is unit radius, n is the number of nodal diameters and s the number of nodal circles.

Boundary conditions at r = 1 (Kirchhoff free edge):

* `M_r = 0`: `∂²w/∂r² + ν(∂w/∂r + ∂²w/∂θ²) = 0`
* `V_r = 0`: `∂(∇²w)/∂r + (1−ν)·∂/∂θ(∂²w/∂r∂θ − ∂w/∂θ) = 0`

Substituting the Bessel ODEs (`λ²J″ = −λJ′ − (λ²−n²)J`, `λ²I″ = −λI′ + (λ²+n²)I`) gives two expressions for C:

```
C_M = [λ²J + (1−ν)(λJ′ − n²J)] / [λ²I − (1−ν)(λI′ − n²I)]        (moment)
C_V = [λ³J′ + (1−ν)n²(λJ′ − J)] / [λ³I′ − (1−ν)n²(λI′ − I)]      (shear)
Frequency equation:  F_n(λ) = a·d − b·c = 0   (cross-multiplied numerators/denominators above, divided by I² for scale)
```

All Bessel functions are evaluated at λ. Roots were found with Brent's method (xtol 1e-13). At every root, `|C_M − C_V|/|C| < 1e-14` (the table is self-consistent). The rigid-body modes (0,0) translation and (1,0) tilt have zero frequency and are excluded. Values agree with the classical free-plate tables (Leissa, NASA SP-160, ch. 2: λ² ≈ 5.25, 9.07, 12.2, 20.5, 21.5, …) to the precision printed there. The test suite re-verifies the BCs, so the table does not depend on literature.

**The full 37-mode table is Appendix A**, both as markdown and as a TS literal. First rows:

| k | (n,s) | λ | λ² | nodal circles r | rim participation `P = ψ(1, θ_d)` |
|---|---|---|---|---|---|
| 0 | (2,0) | 2.293913 | 5.2620 | – | +2.32 |
| 1 | (0,1) | 3.011461 | 9.0689 | 0.679 | −1.49 |
| 2 | (3,0) | 3.499128 | 12.2439 | – | +2.55 |
| 3 | (1,1) | 4.529138 | 20.5131 | 0.781 | −2.07 |
| 4 | (4,0) | 4.639743 | 21.5272 | – | +2.73 |
| 12 | (4,1) | 8.566114 | 73.3783 | 0.863 | −2.20 |
| 14 | (2,2) | 9.185643 | 84.3760 | 0.560, 0.888 | +2.05 |

**Chladni's law check.** A fit over all 39 computed modes (m = nodal diameters, n = nodal circles) gives **λ² = 1.872·(m+2n)^2.003**: Chladni's exponent 2, recovered. Individual families scatter by up to ×1.56 (s = 0 modes lie below the curve), so the law is used for **explanation and UI copy only. Ordering always comes from the exact table.**

**Why not the "J_n(kr) with J_n′(k)=0" shortcut** (the Neumann-membrane model common in cymatics demos)? It is wrong for a plate in ways a viewer can see:

| mode | exact plate λ² | membrane j′² | exact nodal circle(s) | membrane nodal circle(s) |
|---|---|---|---|---|
| (2,0) | 5.262 | 9.328 | – | – |
| (0,1) | 9.069 | 14.682 | 0.679 | 0.628 |
| (1,1) | 20.513 | 28.424 | 0.781 | 0.719 |
| (4,0) | 21.527 | 28.276 | – | – |
| (2,1) | 35.243 | 44.972 | 0.823 | 0.766 |
| (0,2) | 38.507 | 49.218 | 0.391, 0.841 | 0.343, 0.787 |
| (4,1) | 73.378 | 86.163 | 0.863 | 0.817 |
| (2,2) | 84.376 | 99.390 | 0.560, 0.888 | 0.515, 0.844 |

Nodal circles move by 5–9 % of the radius. The order of (1,1) and (4,0) flips. The membrane model also contains a spurious (1,0) "mode" at j′² = 3.39, which for a free plate is a rigid tilt. The `C·I_n` term is not negligible: for (2,0), `C·I₂(λ) ≈ 0.36` against `J₂(λ) ≈ 0.39` at the rim.

### C.3 Drive point and selection rules (circle)

A point force at `x_d` excites mode k in proportion to `P_k = ψ_k(x_d)`.

* **Centre drive:** `J_n(0) = 0` for n ≥ 1, so a perfectly centre-driven (or uniformly pressure-driven) circular plate shows **only rings (n = 0)**. Physically true, and visually poor.
* **Rim drive** (Chladni's violin bow on the edge): `P_k = R_k(1)·cos(n·0) ≠ 0` for every mode. The free edge is an antinode, so |P| ≈ 1.4–3.6. The drive point also **fixes the orientation** of each `cos nθ` / `sin nθ` degenerate pair. Only the `cos n(θ−θ_d)` member is excited, so figures are mirror-symmetric about the drive axis.
* **Decision:** circle drive at the rim, `θ_d = −π/2` (bottom of screen, so figures are symmetric about the vertical). Rendered as a small felt "bow pad" on the rim. A `drive: 'centre'` option exists, rings only, for completeness.

### C.4 Square plate — guided edges, centre drive

On the unit square `X, Y ∈ [0,1]`, with plate coordinates `x = 2X − 1`:

`ψ_mn = cos(mπX)·cos(nπY)`, `∇⁴ψ = π⁴(m²+n²)²ψ`, so **Λ = m² + n²**.

These are the **exact** Kirchhoff eigenfunctions for **guided** (sliding-clamped) edges:

* slope: `∂w/∂x ∝ sin(mπX) = 0` at X = 0, 1;
* effective shear: `V_x = −D[∂³w/∂x³ + (2−ν)∂³w/∂x∂y²] ∝ sin(mπX) = 0`.

A truly free square edge needs a Ritz expansion (Ritz 1909). Its nodal lines differ mainly near the edges, and it splits the `(m,n)/(n,m)` degeneracy. The guided model is closed-form, needs no LUT, and is the basis that Tuan et al. (JASA 2015) found reproduces experimental **centre-driven** Chladni figures well. Keep it, and treat a Ritz-basis LUT as a future upgrade.

**Centre-drive selection rule.** `P_mn ∝ cos(mπ/2)·cos(nπ/2)` vanishes unless **m and n are both even**. Because `(m,n)` and `(n,m)` are exactly degenerate and equally excited, the response is automatically the **symmetric combination**:

`ψ⁺_mn = [cos(mπX)cos(nπY) + cos(nπX)cos(mπY)]·normInv`, with
* normInv = 1 for (0,n),
* normInv = √2 for 0 < m < n,
* normInv = 2 for m = n (single term).

The antisymmetric "−" combinations have P = 0 and are excluded. `P = 2·sign` for (0,n) and m = n, `2√2·sign` otherwise, where sign = `(−1)^((m+n)/2)`.

**Accidental degeneracies** (`0²+10² = 6²+8² = 100`; `2²+14² = 10²+10² = 200`) are handled automatically. Identical H_k means fully coherent entries in M, so the plate shows the summed figure. The top-K selection must keep both members (C.6). Full 31-mode table: Appendix B.

Reference 1 (central diamond, corner loops, edge arcs, disturbed area around the bolt) matches the coherent response of this model between the (0,4)+ and (2,4)+ resonances. The swept-frequency renders in `combos.png` show it at f ≈ 17 Λ-units.

### C.5 Sound → modes: driven, damped, coherent

Modal equation with RMS-normalised modes (modal mass `M = ρhA`):

`q̈_k + (ω_k/Q_k)·q̇_k + ω_k²·q_k = P_k·F(t)/M`

Steady state at drive frequency f, with `r = f/f_k`. The **accelerance** (plate acceleration per unit force) is

```
H_k(f) = r² / (1 − r² + i·r/Q_k)          |H_k(f_k)| = Q_k,   H → −1 (mass line, r≫1),   H → r² (stiffness line, r≪1)
```

Accelerance is used rather than receptance because **sand responds to acceleration**. A grain lifts off when the plate's downward acceleration exceeds g. At resonance the acceleration is `Q·P·F/M`, **independent of ω_k**, so high and low modes compete fairly. Displacement-based mappings bury the upper modes under a 1/ω_k² factor.

Every mode oscillates at the **drive** frequency, not its own, so contributions add **coherently** within a frequency bin. Different bins are incoherent (stationary-random drive). The mean-square acceleration at x is therefore

```
Γ²(x) = Σ_b S_b·|Σ_k A_kb ψ_k(x)|²  = qᵀ M q,
q = [ψ_k(x)],   A_kb = P_k·H_k(f_b),   M_jk = Σ_b S_b·Re(A_jb·conj(A_kb))      (real, symmetric, PSD)
```

S_b is the clean force PSD from B.2. The overall constant F/M, the analyser window gain and similar factors are absorbed by the AGC (C.7).

**Modal truncation.** Keep the **8 modes with the largest diagonal `M_kk`**. This matters, and was tested. Summing all 37 modes under a rim drive adds the quasi-static mass-line residual (Σ P_k ψ_k·(−1)), a near-field around the drive point that distorted every figure (prototype `sand_sheet4.png`). Truncation is standard modal practice. Physically, the residual is local deformation at the exciter, not a standing pattern.

* Slot assignment uses **hysteresis**, so membership doesn't flicker. A mode in a slot stays while `M_kk ≥ 0.5 ×` the 8th-largest diagonal. A newcomer takes the slot with the smallest diagonal. Degenerate partners (same Λ) are admitted together.
* Only modes with `f_k ∈ [f_lo/1.2, 1.2·f_hi]` of the analysis band are considered at all, typically 12–16 of the 37.

**Why Q matters (tested, `sand_sheet3/5/6.png`).** Off resonance, neighbours enter in **quadrature** (−i at resonance against a nearly real background). `|Σ|²` then has no exact zeros, only valleys, so nodal lines break into points and crescents. Q = 12 gave broken, hollow lines. Q = 40 on the square and Q = 100 on the circle gave crisp, filled classical figures. Broadband frames (FM sweeps, trills) average many bins, so cross terms shrink and the plate shows the **common nodal set** of the excited modes: crosses plus blobs, much like reference 2. That is physically what a real plate does with such a signal.

### C.6 Per-bird calibration (uses `bandHz`, `peakHz`)

Principle: **one scale factor** `C = Hz per Λ unit`, which is exactly what changing plate thickness does (`f ∝ h`). Nothing else is warped, so the song–plate relation stays physical, and the UI can state the equivalent plate ("Ø300 mm aluminium, 3.0 mm").

```ts
// src/cymatics/physics/calibration.ts
export interface CalibrationOptions { nTarget: number; kappaQ: number; qMin: number; qMax: number; lambdaMin: number; lambdaMax: number }
export const CAL_DEFAULTS: CalibrationOptions = { nTarget: 6, kappaQ: 8, qMin: 30, qMax: 120, lambdaMin: 12, lambdaMax: 200 };

export function calibrate(table: ModeTable, bird: { bandHz: Band; peakHz?: number }, o = CAL_DEFAULTS): PlateCalibration {
  const { p10, p50, p90 } = bird.bandHz;
  const peak = clamp(bird.peakHz ?? p50, p10, p90);
  const drivable = table.modes.filter((m) => Math.abs(m.P) >= 1);
  const LmaxFit = 0.97 * drivable[drivable.length - 1].Lambda;
  let best: { cost: number; j: Mode } | null = null;
  for (const j of drivable) {
    if (j.Lambda < o.lambdaMin || j.Lambda > o.lambdaMax) continue;
    const lo = (j.Lambda * p10) / peak, hi = (j.Lambda * p90) / peak;
    if (hi > LmaxFit || lo < 4) continue;
    const count = drivable.filter((k) => k.Lambda >= lo && k.Lambda <= hi).length;
    const cost = (count - o.nTarget) ** 2 + legibilityPenalty(j, table.shape);
    if (!best || cost < best.cost) best = { cost, j };
  }
  const sig = best?.j ?? nearestByLambda(drivable, 80);            // fallback: wide bands
  const C = peak / sig.Lambda;                                      // ← the only free parameter
  const Q = drivable.map((k) => clamp(o.kappaQ * k.Lambda / distinctNeighbourGap(drivable, k), o.qMin, o.qMax));
  return { shape: table.shape, C, signature: sig.index, Q, plate: equivalentPlate(table.shape, C) };
}
// circle: n=1 (lopsided dipoles) +2, n=0 (rings only) +1, s≥3 +1 ; square: 0
```

* `Q_k = clamp(κ_Q·f_k/Δf_k, 30, 120)` with κ_Q = 8 makes the half-power bandwidth 1/8 of the local mode spacing. Neighbours are suppressed to about −18 dB at mid-gap. Relative spacing depends only on the Λ table, so **Q_k is per-shape, not per-bird**. Only C changes between birds.
* `equivalentPlate`: circle `h = 2πa²C/c_p` (a = 0.15 m); square `h = 2L²C/(π·c_p)` (L = 0.30 m).
* Worked example (hypothetical band p10/p50/p90 = 2800/3600/4600 Hz, peak 3700 Hz; the table lists modes inside the ±15 % margin around the band):

| | Circle (rim drive) | Square (centre drive) |
|---|---|---|
| signature mode | (3,2), λ² = 111.90 | (4,10)+, Λ = 116 |
| C | 33.06 Hz/Λ | 31.90 Hz/Λ |
| equivalent plate | Ø300 mm × **3.0 mm** Al | 300 mm × **1.18 mm** Al (a realistic Chladni plate!) |
| modes in [p10, p90] | 7 | 7 |
| modes and f (Hz) | (8,0) 2673 · (2,2) 2790 · (0,3) 2903 · (5,1) 3191 · (9,0) 3342 · **(3,2) 3700** · (1,3) 3935 · (6,1) 4042 · (10,0) 4082 · (4,2) 4706 | (4,8)+ 2552 · (0,10)+&(6,8)+ 3190 · (2,10)+ 3317 · **(4,10)+ 3700** · (8,8)+ 4083 · (6,10)+ 4338 · (0,12)+ 4593 · (2,12)+ 4721 |
| Q | 120 (dense region, clamped) | 77–120 |

`nTarget` trades intricacy for legibility. Use 5 on phones (bolder figures) and 6 on desktop. Expose it in the debug panel.

### C.7 Time evolution of mode amplitudes

* **Physics:** a mode's amplitude ring-down time is `τ_k = Q_k/(π f_k)`. With Q = 120 and f = 3.7 kHz that is **10 ms**, shorter than the analysis hop (8–17 ms) and the window (43 ms). The **quasi-static steady-state** response per frame (C.5) is therefore the physically consistent choice. Integrating modal ODEs at frame rate would be wrong, since they are stiff at audio frequencies.
* **Perception:** the only temporal smoothing is the S_b envelope (attack 15 ms / release 150 ms, B.2). M is linear in S, so this is equivalent to smoothing M. The sand itself integrates over about 1 s (D.3), and that integration is what makes figures legible, not heavy smoothing of the field.
* **Calibration glide on bird switch:** `log C` interpolates linearly over the 700 ms crossfade, so modes glide in frequency, as if the plate were changing thickness. `A_kb` is recomputed each frame during the glide (≈ 15 modes × 250 bins complex ≈ 0.1 ms). The analyser band is the union of both birds' windows during the glide.
* **AGC:** `E_ref = max(trace M, E_ref·2^(−dt/6 s), 1e-12)`, a 6 s half-life peak-hold. Then `M̃ = M·G_max²/E_ref` with **G_max = 6**, so the loudest recent moment gives `Γ_rms = 6`, typical of real Chladni demonstrations. Quiet passages scale down: −15 dB gives `Γ_rms ≈ 1.07`, which barely moves sand. The physical lift-off threshold therefore provides about 15 dB of motion range on its own, with no extra gating.

The **displacement field**, for reference (never evaluated at audio rate):

`u(x,t) = Re Σ_b X̂_b·e^(2πi f_b t)·Σ_k P_k ψ_k(x) / [M(ω_k² − ω_b² + iω_bω_k/Q_k)]`

What is rendered is its mean-square **acceleration** `Γ²(x) = qᵀ M̃ q` and the gradient `∇Γ² = 2·Σ_k (∇ψ_k)(M̃ q)_k`.

### C.8 ModeBank (CPU, per frame)

```ts
// src/cymatics/physics/transfer.ts
export function accelerance(f: number, fk: number, Q: number, out: { re: number; im: number }) {
  const r = f / fk, r2 = r * r, a = 1 - r2, b = r / Q, d = a * a + b * b;
  out.re = (r2 * a) / d; out.im = (-r2 * b) / d;          // r²/(a+ib)
}

// src/cymatics/physics/ModeBank.ts
export interface DriveState {
  shape: PlateShape;
  slots: Int16Array;          // length 8, table index or −1
  M: Float32Array;            // 64, row-major, already AGC-scaled (Γ² units)
  gammaRms: number;           // √trace(M̃)
  dominant: { index: number; label: string; fHz: number } | null;
  calibration: PlateCalibration;
}
export class ModeBank {
  private Are!: Float32Array; private Aim!: Float32Array; private W!: Float32Array;   // [mode][bin]
  update(f: SongFeatures, dt: number): DriveState {
    this.glide(dt, f);                                         // rebuild A/W if C or band changed
    const nB = f.nBins, S = f.S;
    for (let k = 0; k < this.K; k++) { let d = 0; const o = k * nB; for (let b = 0; b < nB; b++) d += S[b] * this.W[o + b]; this.diag[k] = d; }
    this.assignSlots();                                        // top-8 + hysteresis + degenerate partners
    for (let i = 0; i < 8; i++) for (let j = 0; j <= i; j++) {
      const a = this.slots[i], c = this.slots[j];
      let m = 0;
      if (a >= 0 && c >= 0) { const oa = a * nB, oc = c * nB;
        for (let b = 0; b < nB; b++) m += S[b] * (this.Are[oa + b] * this.Are[oc + b] + this.Aim[oa + b] * this.Aim[oc + b]); }
      this.Mraw[i * 8 + j] = this.Mraw[j * 8 + i] = m;
    }
    const tr = trace8(this.Mraw);
    this.eRef = Math.max(tr, this.eRef * 2 ** (-dt / 6), 1e-12);
    const s = (G_MAX * G_MAX) / this.eRef;
    for (let i = 0; i < 64; i++) this.M[i] = this.Mraw[i] * s;
    return this.state(Math.sqrt(tr * s));
  }
}
```

Cost: about 25k multiply-adds per frame, under 0.1 ms. Zero allocation.

### C.9 Bessel functions and radial LUT

**Decision: no Bessel evaluation on the GPU.**

* The usual GPU route (Abramowitz & Stegun 9.4 polynomials for J₀ and J₁, then upward recurrence to J_n) is **unstable for n > x**, and that is exactly our region near the centre (x = λr → 0, n up to 12). The error grows roughly like (2n/x)ⁿ. `I_n` has the same problem.
* Power series in f32 lose all digits by x ≈ 10.
* Miller's backward recurrence is stable but needs a loop of about n + 20 terms per evaluation, per mode, per grain.
* And we need `J_n + C·I_n` combinations anyway.

**CPU build (f64), exponentially convergent trapezoid rule** on the periodic integral representations, with N = 64 nodes `τ_j = 2πj/N`:

```
J_n(x)  = (1/N) Σ cos(nτ_j − x sin τ_j)              J_n′(x) = (1/N) Σ sin(nτ_j − x sin τ_j)·sin τ_j
I_n(x)  = (1/N) Σ e^{x cos τ_j}·cos(nτ_j)            I_n′(x) = (1/N) Σ e^{x cos τ_j}·cos τ_j·cos(nτ_j)
```

Measured over n ≤ 13 and x ≤ 18: max |error| of J is **1.3e-15**. Max error of the normalised composite `R̂(r)` is **1.2e-13**, and of `R̂′/λ` **1.0e-13**. N = 32 is **not** enough (J error 0.11 at x = 18). The rule is N ≥ 2(x + n) + 16.

**LUT layout:** `DataTexture(Float32Array, 512, 37, RGBAFormat, FloatType)`. Row k = mode k. Texel i ↔ `r = i/511`. Channels:

* R = `R̂(r)` (RMS-normalised: divided by `√(N_ns·(n==0 ? 2 : 1))`);
* G = `R̂′(r)`;
* B = `n·R̂(r)/r`, with limit `R̂′(0)` for n = 1 and 0 for n ≥ 2 or n = 0;
* A = 0.

NearestFilter, no mipmaps. Shader access is two `textureLoad` (texelFetch) calls plus a lerp. This sidesteps `float32-filterable` on WebGPU and `OES_texture_float_linear` on WebGL2 (unfilterable RGBA32F is core in both). Linear-interpolation error at 512 samples: **2.9e-4** (R̂) and **2.4e-4** (R̂′/λ) relative to RMS 1. That moves nodal lines by about 2e-5 of the radius. Size: 303 KB of GPU memory.

**Build cost:** 37 × 512 × 64 × (cos + sin + exp) ≈ 3.6M transcendentals. That is about 30–60 ms on desktop and 100–200 ms on a low-end phone, so it runs in a **module Worker** (`lut.worker.ts`, transferable result) started at mount, in parallel with `await renderer.init()`. The same pure function runs in Vitest.

```ts
// src/cymatics/physics/circularPlate.ts
export function buildRadialLut(rows: readonly CircleModeRow[], width = 512, N = 64): Float32Array {
  const out = new Float32Array(rows.length * width * 4);
  const sinT = new Float64Array(N), cosT = new Float64Array(N);
  for (let j = 0; j < N; j++) { const t = (2 * Math.PI * j) / N; sinT[j] = Math.sin(t); cosT[j] = Math.cos(t); }
  rows.forEach(([n, s, lam, C, norm2], k) => {
    const inv = 1 / Math.sqrt(norm2 * (n === 0 ? 2 : 1));
    const cosN = Float64Array.from({ length: N }, (_, j) => Math.cos((n * 2 * Math.PI * j) / N));
    for (let i = 0; i < width; i++) {
      const r = i / (width - 1), x = lam * r;
      let J = 0, Jp = 0, I = 0, Ip = 0;
      for (let j = 0; j < N; j++) {
        const ph = (n * 2 * Math.PI * j) / N - x * sinT[j];
        J += Math.cos(ph); Jp += Math.sin(ph) * sinT[j];
        const e = Math.exp(x * cosT[j]); I += e * cosN[j]; Ip += e * cosT[j] * cosN[j];
      }
      const R = ((J + C * I) / N) * inv, dR = (lam * (Jp + C * Ip) / N) * inv;
      const nRr = n === 0 ? 0 : r > 0 ? (n * R) / r : n === 1 ? dR : 0;
      out.set([R, dR, nRr, 0], (k * width + i) * 4);
    }
  });
  return out;
}
```

### C.10 Validation renders (prototype, CPU)

* `sheet.png`: nodal sets of 12 square (+) modes and 12 exact circle modes. The circle modes show the correct ring radii, plus star figures with sub-threshold cores for high-n, s = 0 modes, since `R ~ rⁿ` near the centre. The square modes show diamonds, grids, and diamond-plus-circle.
* `combos.png`: swept single-tone coherent response of the centre-driven square. Figures morph continuously between resonances. f ≈ 17 resembles reference 1.
* `sand_sheet6.png` (Q = 100, rim drive, top-8): crisp (4,1), (2,1), (2,2) and (4,2) figures. Band-averaged drive gives cross-plus-blob figures like reference 2.

---

## D. Sand simulation

### D.1 Physics and the model

* **Lift-off:** a grain leaves the plate only when the local downward plate acceleration exceeds g, i.e. `Γ(x) > 1`. Below that, static friction holds it: **it does not move at all**. This single fact gives the requested behaviour: when the drive stops (pause, silent gap, between phrases) Γ → 0 everywhere and **every grain freezes in place, holding its last figure**, exactly like real sand. Γ is an RMS value. Lift-off physically uses the peak (√2 × RMS for a tone), and the threshold distribution absorbs that factor.
* **Hops:** an airborne grain lands at a random phase on a surface tilted by ∇u, so it receives a random horizontal kick that scales with the local amplitude. The result is a random walk with step ∝ Γ, i.e. Itô diffusion `D(x) ∝ Γ²` with stationary density ∝ 1/D. Grains pile up where Γ is small: the **nodal lines**. The hop step is capped at `Γ_sat = 4`, because flight length saturates and very energetic grains should not teleport.
* **Drift:** averaged over impact phases, a bouncing grain feels a net push down the gradient of vibrational energy. This is analogous to the Kapitza/ponderomotive force, giving `v = −κ·∇Γ²`. It speeds migration out of antinodes.
* **Polydispersity:** real sand has a spread of size, shape and friction. Each grain draws `θ_i ~ U(0.6, 1.4)` once. *Tested:* a single sharp threshold makes grains stop at the edge of the sub-threshold band, producing **hollow double lines**. The spread fills lines into single crisp bands.
* Not modelled: fine powders (lycopodium) collect at **antinodes** because of acoustic streaming (Faraday 1831). We simulate coarse sand.

Per grain, per substep:

```
Γ   = √max(qᵀ M̃ q, 0)          ∇Γ² = 2 Σ_k ∇ψ_k (M̃ q)_k
m_i = clamp((Γ − θ_i)/W, 0, 1)                                  mobility (0 = frozen)
Γs  = min(Γ, Γ_sat)             g = (Γ < Γ_sat) ? ∇Γ² : 0
x  ← x − κ·m_i·g·dt + σ·m_i·Γs·√dt·ξ,      ξ ~ N(0, I₂) (Box–Muller from PCG hash)
```

### D.2 Constants (plate units: circle radius = 1, square half-side = 1)

| Symbol | Value | Meaning |
|---|---|---|
| σ | 0.09 | hop diffusion scale (units/√s per unit Γ) |
| κ | 4e-4 | drift gain (units³/s) |
| Γ_sat | 4 | hop saturation |
| θ_i | U(0.6, 1.4) | per-grain lift-off threshold |
| W | 0.3 | mobility ramp width |
| G_max | 6 | Γ_rms at the loudest recent moment (AGC) |
| lip radius | 0.985 | circle: reflect (the white rim of reference 2 is a lip) |
| bolt radius | 0.035 | square: centre bolt is a reflecting obstacle, so sand rings it as in reference 1 |
| p_fall | 0.25 | square: chance per edge crossing that a grain falls off (otherwise reflect) |
| spawn fall | 0.35 s | re-seeded grains drop in, immobile and fading in |
| dt_sub | ≤ 1/60 s | substeps per frame = ceil(dt/(1/60)), dt clamped to 1/30 s |

**Frame-rate invariance:** drift scales with dt and noise with √dt (Euler–Maruyama), so 60 Hz and 120 Hz give the same statistics (tested, F.4).

### D.3 Prototype results (120k grains, these constants, G = 6)

| Case | Fraction of grains in Γ < 1 zones at 1 s / 2 s / 4 s | Area of those zones | Look |
|---|---|---|---|
| Circle (4,1) at resonance, Q = 100 | 0.61 / 0.71 / 0.75 | ~10–16 % | crisp spokes + ring |
| Circle (2,2) at resonance | 0.62 / 0.73 / 0.77 | ~4–7 % | crisp |
| Square (2,4)+ at resonance, Q = 40 | 0.83 / 0.85 / 0.85 | ~10 % | crisp diamond + circle |
| Square, Q = 12 | — | — | broken, hollow lines (rejected) |

A figure is **about 70 % formed in 1 s and essentially complete in 2 s**, which suits phrase lengths of 1–3 s. Louder drive gives **thinner** lines, since the sub-threshold band half-width is `≈ θ/(G·|∇ψ|)`. Real plates do the same.

### D.4 Counts

| Tier | Detect | N | Sprite px (CSS) | DPR cap |
|---|---|---|---|---|
| high | WebGPU backend, `pointer: fine`, ≥ 8 cores | 262,144 | 1.5 | 2 |
| mid | WebGL2 fallback, or integrated GPU, or ≤ 4 cores | 131,072 | 1.5 | 2 |
| low | `pointer: coarse` or `deviceMemory ≤ 4` | 65,536 | 1.3 | 2 |
| cpu | Canvas2D fallback | 12,288 | 1 | 1 |

**Dynamic downgrade:** if the frame-time EMA exceeds 22 ms for 2 s, halve the *active* count by setting `stepNode.count = n` and `grains.count = n` (the bounds guard follows `computeNode.count`, E.1). Grain i is i.i.d. uniform at init, so any prefix is still a uniform sample. Never upgrade during a session.

### D.5 Boundaries

* **Circle:** reflect at the lip, `r > 0.985 → x *= (2·0.985 − r)/r`. No loss.
* **Square:** on crossing |x| or |y| > 1, reflect, but with probability 0.25 the grain "falls off" and is **re-seeded**: new uniform position from the hash, `spawnT = 0.35 s`, immobile while `spawnT > 0`, rendered dropping from z = 0.06 and fading in. Re-seeding is rate-limited to 0.5 % of N per second; over budget, the grain reflects instead. A free edge is an antinode, so some loss is realistic, and the sprinkle keeps a few "loose grains" moving, as in reference 1.
* **Bolt (square):** `r < 0.035` reflects outward.

### D.6 Initial state and "poster" pre-settle

* Init: i.i.d. uniform. Circle uses `r = 0.98√u₁`, `φ = 2πu₂`; square uses `[−0.98, 0.98]²`. θ_i comes from the hash, and the pre-shuffled order makes prefixes uniform.
* **Poster pre-settle (no audio needed):** on mount and on bird change while `locked`, drive the plate with a **synthetic pure tone at `peakHz`** (S = δ at that bin) at Γ_rms = 4, for 150 substeps. That is the bird's **signature figure**: what this bird's main note does to its plate. On WebGPU, run all steps in the first frame (≈ 45 ms). On WebGL2, spread 30 steps per frame behind a 300 ms fade-in. Then **freeze** (no fake motion before the user listens).
* SSR and no-JS also get a poster: `poster.ts` runs marching squares (96²) on ψ of the signature mode and outputs an SVG path (1.5 px white stroke plus a slight blur filter). It is pure TS, so it renders in the Cloudflare Worker during SSR.

### D.7 Transitions

* **Bird to bird, same shape:** nothing is reset. The calibration glides (C.7) and the new song physically reorganises the sand. Old lines that land in new antinodes are thrown off, and new nodal lines collect them. This is the most "real" transition, and the most beautiful.
* **Circle ↔ square:**
  1. Gate the drive (Γ → 0 over 150 ms). All grains freeze.
  2. `snapshot` pass: `aux.xy ← state.xy`.
  3. `morph` pass for 700 ms: `state.xy = mix(from, map(from), smoothstep(t))`, using the **Shirley–Chiu concentric map** (area-preserving, so density stays uniform; inverse map for circle → square). Plate meshes crossfade over the same window.
  4. Swap mode table and calibration, then ungate.
* **Reduced motion:** grains fade out (200 ms), are remapped instantly, and fade in.
* **"Clear plate" (optional UI):** a `sprinkle` pass re-seeds every grain uniformly with the drop-in animation. It is the physical equivalent of wiping and re-pouring the sand.

### D.8 Freeze and zero-cost silence

If `gammaRms < 0.2`, every grain is below its threshold. Even rim antinodes reach at most about 3.6 × RMS, and `θ_min = 0.6`. In that case the CPU **skips the compute dispatch entirely**. With no morph, spawn or camera motion pending, the view also drops to **render-on-demand** (E.9). Silence costs nothing.

---

## E. Rendering (three@0.186.1)

### E.1 Decision: Option 1, `WebGPURenderer` + TSL compute, with its WebGL2 fallback

**Verified in the r186 sources** (npm tarball unpacked at `scratchpad/three-src-physics/package`; examples pulled from the GitHub `r186` tag):

| Fact | Source |
|---|---|
| `WebGPURenderer` falls back to `WebGLBackend` automatically via `getFallback` (warns "running under WebGL2 backend"). `forceWebGL: true` forces WebGL2. | `src/renderers/webgpu/WebGPURenderer.js:41, 53–71` |
| `init()` tries the backend, then the fallback, and rejects if both fail (no WebGL2 → we catch and go to Canvas2D) | `src/renderers/common/Renderer.js:784–830` |
| **Compute on WebGL2 works through transform feedback**: `RASTERIZER_DISCARD`, `beginTransformFeedback(POINTS)`, `drawArraysInstanced(POINTS, 0, 1, count)` for instanced storage, then `switchBuffers()` | `src/renderers/webgl-fallback/WebGLBackend.js:918–1000` |
| TF varyings use `gl.SEPARATE_ATTRIBS`, so **≤ 4 written buffers per compute pass** (the minimum `MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS`) | `WebGLBackend.js:1774–1778` |
| GLSL builder: `supports.storageBuffer = false`. Every storage buffer referenced in a compute pass becomes a TF output (`registerTransform`) | `src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js:103–106, 1502–1530`; `src/nodes/accessors/StorageBufferNode.js:370–385` |
| On the fallback, `buffer.element(i)` **ignores i** (it reads the invocation's own vertex attribute) unless the node is a PBO (`setPBO(true)`, a texture copy each pass). Writes always go to the invocation's own element | `src/nodes/utils/StorageArrayElementNode.js:78–110`; `GLSLNodeBuilder.js:385–563` |
| Indirect dispatch and array dispatch sizes are **not** supported on the fallback (`warnOnce`) | `WebGLBackend.js:955–968` |
| `renderer.compute(node, dispatchSize?)` (sync after init) / `computeAsync` | `Renderer.js:2877, 2992` |
| Compute count bounds-guard uniform: `if (index >= count) return;` updated from `computeNode.count` | `src/nodes/gpgpu/ComputeNode.js:181–221, 294–310` |
| WebGPU dispatch recomputed when `count` changes; 2D split above `maxComputeWorkgroupsPerDimension` | `src/renderers/webgpu/WebGPUBackend.js:1889–1983` |
| `instancedArray(count, type)` → `StorageInstancedBufferAttribute` | `src/nodes/accessors/Arrays.js:47` |
| `.toAttribute()` to read storage as a per-instance vertex attribute | `src/nodes/accessors/BufferAttributeNode.js:443` |
| `uniformArray` packs float elements to vec4 stride; mutate `.array[i]` | `src/nodes/accessors/UniformArrayNode.js:95, 225–233, 375` |
| `uniform(value, type)` | `src/nodes/core/UniformNode.js:241` |
| `textureLoad` = texture without sampler (texelFetch / WGSL textureLoad) | `src/nodes/accessors/TextureNode.js:1034` |
| `hash(seed)` → PCG, [0, 1) (do not confuse with `NodeUtils.hash`, an internal cyrb53) | `src/nodes/math/Hash.js:11–22` |
| `atan(y, x)` two-argument form (atan2) | `src/nodes/math/MathNode.js:689–697` |
| `shapeCircle()` soft disc for sprites | `src/nodes/shapes/Shapes.js:13` |
| `PointsNodeMaterial` + **`Sprite` instancing** honours `sizeNode` (px × `screenDPR`). WebGPU `Points` are 1 px only | `src/materials/nodes/PointsNodeMaterial.js:19–33, 94–110`; `src/nodes/display/ScreenNode.js:190` |
| `Sprite.count` (instances) | `src/objects/Sprite.js:113–119` |
| Example pattern: `instancedArray` + `Fn(...)().compute(N)` + `SpriteNodeMaterial.positionNode = positions.toAttribute()` + `sprite.count = N` + `await renderer.init()` | `examples/webgpu_compute_particles.html:74–141, 168–172` (r186 tag) |
| `PostProcessing` is deprecated (r183) → **`RenderPipeline`**; `render()` (sync); `outputColorTransform` | `src/renderers/common/PostProcessing.js`; `RenderPipeline.js:22, 75, 130, 165` |
| `pass(scene, camera)`; `bloom(node, strength, radius, threshold)` | `src/nodes/display/PassNode.js:1085`; `examples/jsm/tsl/display/BloomNode.js:597` |
| Device/context loss → `renderer.onDeviceLost(info)`, after which the renderer is **permanently** dead (`_isDeviceLost`) | `Renderer.js:595, 1348–1362`; `WebGLBackend.js:231–249`; `WebGPUBackend.js:268–279` |
| `getArrayBufferAsync(attribute)` readback (parity tests) | `Renderer.js:2097` |
| `renderer.dispose()` is **async** | `Renderer.js:2696` |
| `NeutralToneMapping` | `src/constants.js:483` |
| `examples/jsm/capabilities/WebGPU.js` performs a **top-level `await navigator.gpu.requestAdapter()`** at import. **Do not import it**; feature-detect `'gpu' in navigator` ourselves | `examples/jsm/capabilities/WebGPU.js:1–6` |
| `three.webgpu.js` and `three.module.js` both import `./three.core.js`, so core classes are shared, not duplicated | `build/three.webgpu.js:6`, `build/three.module.js:6` |
| Option 2 alternative: `GPUComputationRenderer` (fragment ping-pong; `setDataType(FloatType\|HalfFloatType)`; `init()` fails without vertex textures) | `examples/jsm/misc/GPUComputationRenderer.js:104–260` |

**Why Option 1 (physical-fidelity reasons first):**

1. **f32 state everywhere with no extensions.** WebGPU uses f32 storage buffers, and the WebGL2 fallback uses f32 transform-feedback vertex buffers. Option 2 needs `EXT_color_buffer_float` for RGBA32F render targets. Its HalfFloat fallback is **physically wrong** for us: the ulp at |x| ≈ 0.5 is 2⁻¹¹ ≈ 4.9e-4, larger than the per-frame drift near nodes (≈ 1e-4), so grains would stall or bias exactly where the figure forms.
2. **One kernel source, two backends**, with automatic fallback (`Renderer.init`), and the same PCG hash on both, which enables parity tests.
3. Our kernel is a **perfect fit for TF semantics**. Each grain reads and writes only its own element, there are no neighbour reads, no atomics and no shared memory, and each pass writes ≤ 2 buffers (≤ 4 allowed).
4. Instanced sprites with true pixel sizing (`PointsNodeMaterial`) on both backends.

Costs: the WebGPU chunk is **≈ 917 KB minified / ≈ 251 KB gzip** for the APIs we import (measured with `bun build --minify` of a probe entry). It is lazy-loaded. TSL has API churn, so pin `three@0.186.1` exactly. **Option 2 is the documented contingency** if a fallback bug blocks release. `PlateSimulation` is backend-agnostic (F.2), so the swap is contained in `gpu/`.

Vite: add an **exact-match alias** `{ find: /^three$/, replacement: 'three/webgpu' }`, so any addon importing `'three'` (e.g. `RoundedBoxGeometry`) resolves to the same build.

### E.2 Buffers (written in compute)

| Buffer | Type | Content | Written by |
|---|---|---|---|
| `state` | `instancedArray(N, 'vec4')` | x, y, θ_i, mobility | init, step, morph, sprinkle |
| `aux` | `instancedArray(N, 'vec4')` | fromX, fromY, spawnT, unused | snapshot, step (square: spawnT), sprinkle |

Per-grain looks (size factor, luminance, flicker phase) are derived in the material from `hash(instanceIndex + k)`, so no buffer is needed.

### E.3 Kernels (TSL sketch, circle step)

```ts
// src/cymatics/gpu/sandKernels.ts
import { Vector4, type DataTexture } from 'three/webgpu';
import { Fn, If, float, int, ivec2, vec2, vec4, uniform, uniformArray, instancedArray, instanceIndex,
  textureLoad, hash, atan, cos, sin, sqrt, log, length, clamp, min, max, floor, mix, select } from 'three/tsl';

export function createSandKernels(N: number, lut: DataTexture, LUT_W = 512) {
  const state = instancedArray(N, 'vec4');
  const aux = instancedArray(N, 'vec4');
  const u = {
    dt: uniform(1 / 60), frame: uniform(0, 'uint'),
    sigma: uniform(0.09), kappa: uniform(4e-4), gsat: uniform(4), W: uniform(0.3),
    slot: uniformArray(Array.from({ length: 8 }, () => new Vector4()), 'vec4'),   // circle: (lutRow, n, 0, 0)
    M: uniformArray(Array.from({ length: 16 }, () => new Vector4()), 'vec4'),      // row j = M[2j], M[2j+1]
  };

  const radial = (row: any, r: any) => {                                   // vec3(R̂, R̂′, nR̂/r)
    const fx = clamp(r, 0, 1).mul(LUT_W - 1);
    const i0 = min(int(floor(fx)), int(LUT_W - 2));
    const t = fx.sub(float(i0));
    return mix(textureLoad(lut, ivec2(i0, row)).xyz, textureLoad(lut, ivec2(i0.add(1), row)).xyz, t);
  };

  const fieldCircle = (p: any) => {                                        // returns { E, gradE }
    const r = length(p).toVar();
    const th = atan(p.y, p.x).add(Math.PI / 2).toVar();                    // θ − θ_d with θ_d = −π/2
    const er = p.div(max(r, 1e-6)).toVar();
    const et = vec2(er.y.negate(), er.x);
    const q: any[] = [], g: any[] = [];
    for (let k = 0; k < 8; k++) {                                          // unrolled at graph-build time
      const s = u.slot.element(k);
      const R = radial(int(s.x), r).toVar();
      const c = cos(s.y.mul(th)), sn = sin(s.y.mul(th));
      q.push(R.x.mul(c).toVar());
      g.push(er.mul(R.y.mul(c)).sub(et.mul(R.z.mul(sn))).toVar());        // ∇(R cos nθ)
    }
    let E: any = float(0), gradE: any = vec2(0);
    for (let j = 0; j < 8; j++) {
      const a = u.M.element(2 * j), b = u.M.element(2 * j + 1);
      const v = a.x.mul(q[0]).add(a.y.mul(q[1])).add(a.z.mul(q[2])).add(a.w.mul(q[3]))
        .add(b.x.mul(q[4])).add(b.y.mul(q[5])).add(b.z.mul(q[6])).add(b.w.mul(q[7])).toVar();  // (M̃q)_j
      E = E.add(q[j].mul(v));
      gradE = gradE.add(g[j].mul(v.mul(2)));
    }
    return { E, gradE };
  };

  const stepCircle = Fn(() => {
    const st = state.element(instanceIndex);
    const p = st.xy.toVar();
    const { E, gradE } = fieldCircle(p);
    const gam = sqrt(max(E, 0)).toVar();
    const mob = clamp(gam.sub(st.z).div(u.W), 0, 1).toVar();             // st.z = θ_i
    const gs = min(gam, u.gsat);
    const drift = select(gam.lessThan(u.gsat), gradE, vec2(0)).mul(u.kappa.negate());
    const seed = instanceIndex.add(u.frame.mul(0x9e3779b1));
    const u1 = max(hash(seed), 1e-7), u2 = hash(seed.add(0x68e31da4));
    const xi = vec2(cos(u2.mul(2 * Math.PI)), sin(u2.mul(2 * Math.PI))).mul(sqrt(log(u1).mul(-2)));
    const np = p.add(drift.mul(mob).mul(u.dt)).add(xi.mul(u.sigma.mul(mob).mul(gs).mul(sqrt(u.dt)))).toVar();
    const nr = length(np);
    If(nr.greaterThan(0.985), () => { np.assign(np.mul(float(2 * 0.985).sub(nr).div(nr))); });
    st.assign(vec4(np, st.z, mob));
  });

  return { state, aux, u, stepCircle: stepCircle().compute(N).setName('sand.step.circle') /* + stepSquare, init, snapshot, morph, sprinkle */ };
}
```

`stepSquare` is the same shape, with the analytic field. Slot = (m, n, normInv, pair), `X = (x+1)/2`:

```
ψ   = normInv·[cos(aX)cos(bY) + pair·cos(bX)cos(aY)],   a = mπ, b = nπ
∂ψ/∂x = ½·normInv·[−a sin(aX)cos(bY) − pair·b sin(bX)cos(aY)]
∂ψ/∂y = ½·normInv·[−b cos(aX)sin(bY) − pair·a cos(bX)sin(aY)]
```

It adds edge handling (reflect, or fall with p = 0.25 → re-seed, setting `aux.z = 0.35`) and the bolt obstacle. Per-frame CPU work is `u.dt.value = dtSub; u.frame.value++`, plus copying `slots` and `M̃` into `u.slot.array` / `u.M.array` (mutate the `Vector4`s in place), then `renderer.compute(kernels.stepCircle)` × substeps. Each `compute()` call is its own render id, so `uniformArray` (RENDER update type) refreshes per call (`Renderer.js:2900`).

### E.4 Grains (sprites)

```ts
// src/cymatics/gpu/grains.ts
const st = kernels.state.toAttribute();                                         // per-instance vec4
const h1 = hash(instanceIndex.add(11)), h2 = hash(instanceIndex.add(23));
const lift = st.w.mul(uLift).mul(sin(time.mul(h1.mul(15).add(25)).add(h2.mul(6.283))).mul(0.5).add(0.5));
const mat = new PointsNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: false });
mat.positionNode = vec3(st.x, st.y, lift);                                       // plate in XY, z up toward camera
mat.sizeNode = uGrainPx.mul(mix(0.7, 1.3, h1));                                  // CSS px; ×screenDPR inside material
mat.colorNode = vec4(vec3(0.95, 0.93, 0.89).mul(mix(0.7, 1.0, h2)).mul(st.w.mul(uFlicker).mul(h1.sub(0.5)).add(1)), 1);
mat.opacityNode = shapeCircle().mul(uGrainAlpha);
const grains = new Sprite(mat); grains.count = N; grains.frustumCulled = false;
```

* **Density → brightness:** use additive blending into the HalfFloat output buffer (the WebGPURenderer default `outputBufferType`) with `renderer.toneMapping = NeutralToneMapping`. Set `uGrainAlpha = clamp(0.10/(ρ·A), 0.05, 0.8)`, where ρ is grains per device px² of plate and A = π(s·dpr/2)². The uniform "dust" then reads as about 10 % grey grain (reference 2), and nodal lines at 6–15× density saturate to white (reference 1). Example: plate radius 340 CSS px at DPR 2 with 262k grains gives ρ = 0.18, A = 7.1, α ≈ 0.08.
* Mobile grains get `lift` (z hop) and a ±25 % luminance flicker scaled by mobility, so active zones visibly **dance** while frozen grains are perfectly still. Both are 0 under reduced motion.

### E.5 Plate look

* **Scene:** opaque canvas, `scene.background = Color(props.background)` (the column colour), so there are no alpha or bloom interactions.
* **Camera:** perspective, fov 28°, **10° tilt** (camera at `(0, −d·sin10°, d·cos10°)` looking at the origin). Distance fits a radius of 1.1 (plate, rim and margin): `d = 1.1/tan(fov/2)/min(1, aspect)`. Optional pointer parallax of ±1.5° (fine pointer only, lerped, off under reduced motion).
* **Circle:**
  * plate `CylinderGeometry(1, 1, 0.02, 256)`, top at z = 0, `MeshStandardNodeMaterial({ color: 0x0b0b0e, roughness: 0.55, metalness: 0.6 })`;
  * **white rim** `TorusGeometry(1.0, 0.014, 12, 256)` with `MeshStandardNodeMaterial({ color: 0xecebe6, roughness: 0.45 })` (reference 2);
  * a small felt bow pad at θ_d.
* **Square:** `RoundedBoxGeometry(2, 2, 0.03, 4, 0.008)` in matte black (roughness 0.7, metalness 0.3), plus a **centre bolt** `SphereGeometry(0.03)` hemisphere in brushed steel (reference 1).
* **Lights:** `DirectionalLight(0xffffff, 2.0)` from upper-left `(−1.2, 1.6, 2.5)`, plus `HemisphereLight(0xffffff, 0x202024, 0.4)`. The effect is a subtle sheen streak across the dark plate. No shadows.
* **Optional "field" view** (debug or education toggle): the plate `emissiveNode` gets `amber × smoothstep(0, 9, E(x))`, evaluated by the **same** TSL field function on `positionLocal.xy`. It shows where the plate is vibrating.
* **Bloom (high tier only):** `pipeline = new RenderPipeline(renderer)`, `scenePass = pass(scene, camera)`, `const c = scenePass.getTextureNode()`, `pipeline.outputNode = c.add(bloom(c, 0.3, 0.15, 0.6))`, then `pipeline.render()` instead of `renderer.render()`. Only saturated lines glow.

### E.6 Crispness, DPR, resize

* `renderer.setPixelRatio(min(devicePixelRatio, tierCap))` (`Renderer.js:2181`). Grain size is in **CSS px** and the material multiplies by `screenDPR`, so grains stay 1.3–1.5 CSS px at any DPR. Hairline nodal lines come from grain **density**, not from large sprites.
* `antialias: true` on high and mid tiers, to anti-alias the rim. Additive sprites don't need MSAA. On low tier, `antialias: false`.
* A `ResizeObserver` on the host calls `renderer.setSize(w, h, false)` (`Renderer.js:2216`; CSS sizes the canvas to 100 %), updates `camera.aspect` and the fit distance, and sets `uGrainPx = base·clamp(plateRadiusCss/320, 0.75, 1.4)`. Updates are coalesced to one rAF.

### E.7 Reduced motion and accessibility

* `matchMedia('(prefers-reduced-motion: reduce)')` (live listener) turns off grain lift and flicker, parallax and bloom. Shape changes use fade/remap/fade. Physics stays on, because the migration **is** the content.
* A **Pause plate** control (WCAG 2.2.2) freezes the visual while audio continues. Optionally, audio can pause while visuals continue.
* No flashes: there is no onset-driven brightness pulse on the plate, and UI pulses are ≤ 3 Hz (WCAG 2.3.1).
* The canvas has `role="img"` and a live `aria-label` updated at most every 2 s, e.g. "Sand on a circular plate forming 4 nodal diameters and 1 nodal circle, driven by the Alagoas antwren's song".

### E.8 Fallbacks

1. **WebGPU unavailable** → automatic WebGL2 backend (same code).
2. **`renderer.init()` rejects** (no WebGL2) or times out after 4 s → `Canvas2DPlateSimulation`. It reuses the **CPU reference stepper** (`sandModel.ts`) with 12,288 grains at 30 fps. Grains accumulate in a Float32 buffer, are tone-mapped to `ImageData`, and the frame is `putImageData`'d. About 5–10 ms per frame in JS.
3. **No JS / SSR / pre-hydration** → `<ClientOnly fallback={<PlatePoster/>}>` (`ClientOnly` and `useHydrated` exist in `@tanstack/react-router@1.170.46`, `dist/esm/ClientOnly.d.ts`) shows the SVG signature figure (D.6).

### E.9 Context and device loss; offscreen; render-on-demand

* `renderer.onDeviceLost = (info) => sim.handleLost(info)`. Stop the loop, dispose what can be disposed, and call `onDeviceLost`. `CymaticsView` bumps a React `key` to get a **new canvas and a new renderer**, which re-inits, rebuilds the LUT texture, and re-runs the poster settle. This is attempted at most 3 times in 60 s, then the view moves to Canvas2D. The renderer cannot recover in place (`_isDeviceLost`, `Renderer.js:1360`).
* An `IntersectionObserver` (threshold 0) and `visibilitychange` call `renderer.setAnimationLoop(null)` when the canvas is offscreen or the page is hidden.
* **Render-on-demand:** when `gammaRms < 0.2`, nothing is animating (no morph, spawn, flicker or parallax) and 30 idle frames have passed, stop the loop. `wake()` restarts it on new drive, resize, a prop change or pointer movement.

### E.10 Disposal (unmount)

`setAnimationLoop(null)` → `computeNode.dispose()` for every kernel (Renderer listens for the `dispose` event and frees pipelines and bindings, `Renderer.js:2928–2940`) → material, geometry and texture `.dispose()` (LUT texture included) → `pipeline?.dispose()` → `await renderer.dispose()` → `canvas.remove()` → disconnect the observers. The async `init()` is guarded with a `disposed` flag: if unmount happens first, dispose immediately after `init()` resolves. That keeps StrictMode double-mount safe.

### E.11 Frame budget (targets)

| Stage | High (262k, WebGPU) | Low (65k, mobile) |
|---|---|---|
| Analyzer + ModeBank (CPU) | 0.15 ms | 0.3 ms |
| Sand step (GPU), ×1–2 substeps | 0.4–1.2 ms | 0.5–2 ms |
| Render (sprites + plate) | 0.5–1.5 ms (+0.6 ms bloom) | 1–3 ms |
| Silence | ~0 (compute skipped, loop asleep) | ~0 |

---

## F. Modules, interfaces, data flow, tests

### F.1 Layout

```
src/audio/
  types.ts                  BirdSongAsset, EngineState, EngineSnapshot, AudioEngine
  unlock.ts                 createAudioContext, primeInGesture, IosPlaybackSession
  LoopLoader.ts             fetch + decode + LRU + prefetch
  AudioEngine.ts            WebAudioEngine (voices, crossfade, pause, visibility)
  SongAnalyzer.ts           AnalyserNode wrapper → SongFeatures
  spectral.ts               pure: dB↔power, one-pole α(dt,τ), parabolic peak, centroid, flux, median/MAD, band window
  AudioEngineProvider.tsx   client-only singleton context + useSyncExternalStore hook
src/cymatics/
  types.ts                  PlateShape, Mode, ModeTable, PlateCalibration, DriveState, CymaticsStatus
  physics/
    bessel.ts               besselJ, besselJp, besselI, besselIp (trapezoid, f64)
    circularPlate.ts        CIRCLE_MODES_NU033 table, frequencyEquation, cFromMoment/cFromShear, buildRadialLut
    squarePlate.ts          squareModes(), psiSquare(), gradSquare()
    modeTable.ts            buildModeTable(shape, drive) → modes with Λ, P, labels
    calibration.ts          calibrate(), equivalentPlate()
    transfer.ts             accelerance()
    ModeBank.ts             cross-spectral matrix, top-K slots, AGC, glide
    sandModel.ts            SAND constants + CPU reference stepper + pcgHash (bit-identical to three's TSL hash)
    plateMap.ts             Shirley–Chiu square↔disk (+ inverse)
    poster.ts               marching squares → SVG path (SSR-safe)
  gpu/
    createRenderer.ts       tier detection, WebGPURenderer init with timeout, backend report
    lut.worker.ts           buildRadialLut in a Worker (transferable)
    radialLutTexture.ts     DataTexture(FloatType, Nearest)
    sandKernels.ts          init / stepCircle / stepSquare / snapshot / morph / sprinkle
    grains.ts               PointsNodeMaterial + Sprite
    plateScene.ts           meshes, rim, bolt, lights, camera fit
    postfx.ts               RenderPipeline + bloom (high tier)
    GpuPlateSimulation.ts   implements PlateSimulation
  fallback/Canvas2DPlateSimulation.ts
  useCymaticsDriver.ts      glue: engine + analyzer + ModeBank → sim.setDriveSource
  CymaticsView.tsx          React client component (lazy chunk)
  PlatePoster.tsx           SSR/no-GPU SVG poster
```

The route imports `PlatePoster` statically and `CymaticsView` via `React.lazy(() => import('~/cymatics/CymaticsView'))` inside `<ClientOnly>`, so `three/webgpu` never reaches the SSR bundle or the initial chunk.

### F.2 Key interfaces

```ts
// src/cymatics/types.ts
export type PlateShape = 'circle' | 'square';
export interface Mode { index: number; Lambda: number; P: number; label: string;
  n: number; s: number;                         // circle: n diameters, s circles ; square: m=s, n=n
  lutRow?: number; normInv?: number; pair?: boolean }
export interface ModeTable { shape: PlateShape; drive: 'rim' | 'centre'; modes: readonly Mode[] }
export interface PlateCalibration { shape: PlateShape; C: number; signature: number; Q: Float32Array;
  plate: { material: 'Al'; sizeMm: number; thicknessMm: number } }

export interface PlateSimulation {
  readonly backend: 'webgpu' | 'webgl2' | 'canvas2d';
  readonly grainCount: number;
  setShape(shape: PlateShape, opts?: { reducedMotion?: boolean }): Promise<void>;   // morph
  setDriveSource(fn: (dt: number) => DriveState): void;                            // pulled each frame
  settlePoster(drive: DriveState, steps: number): Promise<void>;
  sprinkle(fraction?: number): void;
  setOptions(o: { reducedMotion: boolean; showField: boolean; paused: boolean; bloom: boolean }): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  wake(): void;
  onStatus(fn: (s: CymaticsStatus) => void): () => void;
  dispose(): Promise<void>;
}
export interface CymaticsStatus { backend: string; fps: number; grains: number; gammaRms: number;
  dominant: string | null; plateLabel: string; state: 'initialising' | 'running' | 'idle' | 'lost' | 'fallback' }

// src/cymatics/CymaticsView.tsx
export interface CymaticsViewProps {
  bird: { id: string; song: BirdSongAsset; commonName: string; plate?: PlateShape };
  shape?: PlateShape;                 // UI override; default bird.plate ?? 'circle'
  quality?: 'auto' | 'high' | 'mid' | 'low';
  paused?: boolean;                   // visual pause (WCAG 2.2.2)
  showField?: boolean;
  background?: string;                // column colour
  className?: string;
  onStatus?: (s: CymaticsStatus) => void;
}
```

`CymaticsView` gets the `AudioEngine` from context. It owns one `PlateSimulation`, re-created when the device-loss `key` changes. `useCymaticsDriver` creates the `SongAnalyzer` (connected to `engine.songBus`) once the engine is unlocked. It creates one `ModeBank` per shape, calls `calibrate()` when `bird` or `shape` changes, and installs the pull-based drive source. React state is touched **only** for status, throttled to 10 Hz through a store.

### F.3 Per-frame data flow

```
renderer.setAnimationLoop(tick)                                          (sim-owned loop)
tick(t):
  dt = min(t − t_prev, 50 ms)/1000
  features = analyzer.update(dt, engine.isAudible)        B.2   — S_b, peak, flux …       [~0.05 ms]
  drive    = bank.update(features, dt)                    C.5–C.8 — slots, M̃, Γ_rms        [~0.1 ms]
  sim: copy drive.slots → u.slot.array, drive.M → u.M.array
  if drive.gammaRms ≥ 0.2 or morph/spawn/settle active:
      for i in 1..ceil(dt/(1/60)): u.dt = dt/n; u.frame++; renderer.compute(step[shape])     [GPU]
  pipeline ? pipeline.render() : renderer.render(scene, camera)                              [GPU]
  every 100 ms → status store (dominant mode label, Γ_rms, fps, backend)
  idle 30 frames with nothing animating → setAnimationLoop(null)  (wake() restarts)
```

### F.4 Testing strategy (Vitest, `environment: 'node'`, colocated `*.test.ts`)

| Module | Tests |
|---|---|
| `bessel.ts` | Reference values (SciPy): `J0(1) = 0.7651976865579666`, `J1(1) = 0.4400505857449335`, `I0(1) = 1.2660658777520082`, `J5(10) = −0.2340615281867936`, `I3(5) = 10.331150169151138`. Tolerance 1e-12 absolute for J, 1e-10 relative for I where I > 1e-6. Zeros `j₀,₁ = 2.404825557695773`, `j′₁,₁ = 1.841183781340659`. Derivative identities `J_n′ = (J_{n−1} − J_{n+1})/2`, `I_n′ = (I_{n−1} + I_{n+1})/2` (1e-12). Appendix C zero tables. |
| `circularPlate.ts` | For every row: `|F_n(λ)|` ≈ 0 relative to scale (< 1e-9), with a sign change at λ ± 1e-6. `|C_M − C_V|/|C| < 1e-8`. **Completeness:** scanning λ ∈ (0.5, 15.8] in steps of 0.005 plus bisection for each n ≤ 12 finds **exactly** the 37 table roots, so none are missing. The number of nodal circles of R equals s. Nodal radii match Appendix A (±1e-3). Simpson `∫R̂² r dr·(n==0 ? 2π : π)/π = 1` (1e-6). Chladni fit exponent ∈ [1.95, 2.05]. |
| `buildRadialLut` | Interpolated R̂ and R̂′ against direct evaluation at 4001 radii: max error < 5e-4 (and R̂′/λ < 5e-4). The nR/r channel is finite at r = 0 with the correct limits. |
| `squarePlate.ts` | Orthonormality by 64² Gauss–Legendre quadrature, `|⟨ψ_jψ_k⟩ − δ| < 1e-10`. P = 0 for any odd index. P signs = `(−1)^((m+n)/2)`. Degenerate pairs (Λ = 100, 200) are listed together. The analytic gradient matches central differences (1e-6). |
| `transfer.ts` | `|H(f_k)| = Q`, phase −90° at resonance; `H → −1` for r ≫ 1; `H ≈ r²` for r ≪ 1. |
| `calibration.ts` | `peakHz` maps **exactly** onto the signature `f_k`. Mode count in band within `nTarget ± 2` for a grid of synthetic bands (ratio 1.3–3). Q ∈ [30, 120]. Deterministic. Out-of-table bands fall back without throwing. Worked example in C.6 reproduced (snapshot). |
| `ModeBank.ts` | A pure tone at `f_k` → `M̃_kk/trace > 0.9`. A tone at mid-gap → coherent two-mode M with off-diagonal sign = sign(P_jP_k·Re(H_jH_k*)). Flat broadband → diagonal-dominant. M is symmetric PSD (eigenvalues ≥ −1e-9). Slot hysteresis: ±10 % noise on S causes no slot changes over 100 frames. AGC: a step down by 20 dB gives `Γ_rms` 6 → 0.6, recovering with a 6 s half-life. Zero allocations (spy on `Float32Array`). |
| `spectral.ts` | Parabolic peak recovers a synthetic Blackman-windowed tone within 0.05 bin. One-pole frame-rate invariance: 60 vs 120 Hz updates agree within 1e-6 after 1 s. Noise-floor tracker converges to a stationary noise floor within 10 s and does not swallow a 2 s tone 20 dB above it. |
| `sandModel.ts` (CPU reference) | **Physics regression:** circle (4,1) at resonance, G = 6, 20k grains, seeded, 120 substeps → ≥ 65 % of grains in Γ < 1 zones (area ≤ 20 %). **Freeze:** with G = 0, one step leaves positions bit-identical. **Frame-rate invariance:** 120 × (1/60) against 240 × (1/120) agree on that metric within ±4 %. Lip: no grain at r > 0.985. Square loss rate respects the 0.5 %/s budget. `pcgHash` equals three's `Hash.js` formula for 10⁴ seeds. |
| `plateMap.ts` | Round-trip error < 1e-6. Constant Jacobian (area preservation) within 1e-6 by finite differences. Boundary maps to boundary. |
| `poster.ts` | Path is non-empty, closed segments lie on `|ψ| < 1e-2`, output is deterministic (snapshot). |
| `AudioEngine.ts` | With a fake `AudioContext` (controllable `decodeAudioData` promises, recorded `setValueCurveAtTime` calls): A → B → C within 100 ms starts only C. A stale decode is cached but not started. **No AudioParam ever gets two curves.** Pause marks `isAudible = false` synchronously. Visibility hidden → suspend; visible → resume, with the watchdog moving to `interrupted`. `dispose` closes the context. |

GPU parity is checked in a Playwright smoke test (outside Vitest), run in headless Chromium with `?renderer=webgpu` and `?renderer=webgl`. After a fixed-seed poster settle, it reads back `state` with `renderer.getArrayBufferAsync(kernels.state.value)` and compares the D.3 metric with the CPU reference within ±5 %. That is statistical parity; transcendental ulps differ, so bitwise parity isn't expected. `?debug=1` adds an overlay showing the spectrum with mode markers at f_k, a heat-map of M̃, Γ_rms, slots, backend and fps, plus sliders for `nTarget`, κ_Q, G_max, σ and κ.

---

## G. Risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | TSL / `WebGPURenderer` API churn | Pin `three@0.186.1` exactly. All TSL lives in `gpu/` (≈ 4 files). Physics is pure TS with full tests. Option 2 (GPUComputationRenderer, f32) is a documented contingency behind the same `PlateSimulation` interface. |
| 2 | WebGL2 fallback compute limits (index ignored, ≤ 4 TF outputs, no atomics, no indirect dispatch) | Kernels touch only their own element and write ≤ 2 buffers. Dispatch is always a number. Covered by the forced-WebGL parity test. |
| 3 | Precision: drift smaller than a half-float ulp | f32 state only (storage/TF). No HalfFloat state anywhere. LUT in f32 with manual lerp. |
| 4 | Bessel accuracy and stability on GPU | No GPU Bessel. f64 CPU build (1e-13) → LUT (3e-4). Self-verifying table tests (BC residuals, completeness scan). |
| 5 | Physics mis-specified (BC sign errors, wrong ordering) | Two independent C expressions must agree to 1e-14. The membrane-model comparison and Chladni-law fit are in tests. The prototype renders match textbook figures. |
| 6 | Legibility: the plate may rarely hit a resonance (high Q) | Per-bird calibration places the main note exactly on a resonance. ≈ 6 modes in band. κ_Q = 8 keeps mid-gap at about −18 dB. The AGC normalises to recent resonant peaks. Tuning sliders in the debug overlay. |
| 7 | Figures broken by quadrature background (low Q) or exciter near-field (rim drive) | Q ≥ 30 (≥ 100 effective on the dense circle spectrum). Top-8 modal truncation. Both were found and fixed in prototypes. |
| 8 | iOS: silent switch, `interrupted` state, autoplay | `audioSession.type = 'playback'`, HTMLAudio shim, gesture-only unlock, a state machine with a "Tap to resume" UI, and a resume watchdog. |
| 9 | AAC priming / padding causing loop gaps | Periodic 250 ms handles plus manifest `loop` (offset-invariant). Length-based trim fallback. Sample-accurate `AudioBufferSourceNode` looping. |
| 10 | Frame-rate-dependent analysis | `smoothingTimeConstant = 0`. Every smoother uses α(dt, τ). Sim uses Euler–Maruyama scaling. All covered by tests. |
| 11 | Audio/visual desync (Bluetooth) | `outputLatency` compensation queue (≤ 300 ms). Sand integration hides the remainder. |
| 12 | Rapid switching races, memory growth | Tokens, a staleness check before decode, a 120 ms settle debounce, two-gain-stage fades, a voice cap, a 48 MB decoded LRU and an encoded-prefetch map. |
| 13 | Mobile performance and thermals | Tiers, a prefix-count downgrade, no compute in silence, render-on-demand, a pause offscreen or hidden, DPR cap 2, no bloom on low tier. |
| 14 | Device/context loss | `onDeviceLost` → remount with a new canvas (≤ 3 times per 60 s) → Canvas2D fallback. Poster re-settle. |
| 15 | SSR breakage (WebGPU globals, top-level await) | three is only in a lazy client chunk. Never import `capabilities/WebGPU.js`. `ClientOnly` + SVG poster from pure TS. |
| 16 | Bundle size (≈ 251 KB gzip for the GPU chunk) | Lazy-loaded after first paint. The poster covers the wait. LUT built in a Worker in parallel with `renderer.init()`. |
| 17 | Motion sensitivity / flashing | Reduced-motion mode, a visual-pause control, no onset flashes, bloom off under reduced motion. |
| 18 | Over-claiming physics in the UI | UI copy says "simulated aluminium plate, Ø300 mm × 3.0 mm, bowed at the rim". It notes that modal damping is increased (Q 30–120 against hundreds for real plates) for legibility, and that frequencies are the song's own (a single thickness scaling, with no pitch warping). |

---

## Appendix A — Circular free-edge plate, ν = 0.33 (unit radius; λ² ≤ 246; 37 modes)

`P_rim` is the RMS-normalised value of ψ at the rim on the drive axis (the participation factor for rim drive).

| k | n | s | λ | λ² | C | N = ∫₀¹R²r dr | P_rim | nodal-circle radii |
|---|---|---|---|---|---|---|---|---|
| 0 | 2 | 0 | 2.293913024 | 5.2620 | 2.2190516e-01 | 7.4663275e-02 | +2.3213 | - |
| 1 | 0 | 1 | 3.011461217 | 9.0689 | -8.3809850e-02 | 1.0349879e-01 | -1.4875 | 0.679 |
| 2 | 3 | 0 | 3.499127642 | 12.2439 | 9.6356899e-02 | 4.8624528e-02 | +2.5507 | - |
| 3 | 1 | 1 | 4.529137545 | 20.5131 | -1.9007158e-02 | 6.7962704e-02 | -2.0682 | 0.781 |
| 4 | 4 | 0 | 4.639743227 | 21.5272 | 4.5824584e-02 | 3.5223862e-02 | +2.7341 | - |
| 5 | 5 | 0 | 5.749942903 | 33.0618 | 2.2795918e-02 | 2.7241715e-02 | +2.8896 | - |
| 6 | 2 | 1 | 5.936541131 | 35.2425 | -5.5653620e-03 | 5.0997597e-02 | -2.1020 | 0.823 |
| 7 | 0 | 2 | 6.205398340 | 38.5070 | 3.1191407e-03 | 5.0746802e-02 | +1.4314 | 0.391, 0.841 |
| 8 | 6 | 0 | 6.841689469 | 46.8087 | 1.1660547e-02 | 2.1998728e-02 | +3.0261 | - |
| 9 | 3 | 1 | 7.274683339 | 52.9210 | -1.8637187e-03 | 4.0705616e-02 | -2.1513 | 0.847 |
| 10 | 1 | 2 | 7.736864213 | 59.8591 | 7.0499264e-04 | 4.0603688e-02 | +2.0292 | 0.497, 0.870 |
| 11 | 7 | 0 | 7.920820339 | 62.7394 | 6.0805770e-03 | 1.8316540e-02 | +3.1487 | - |
| 12 | 4 | 1 | 8.566114413 | 73.3783 | -6.7890454e-04 | 3.3756325e-02 | -2.2023 | 0.863 |
| 13 | 8 | 0 | 8.990690253 | 80.8325 | 3.2162305e-03 | 1.5602239e-02 | +3.2607 | - |
| 14 | 2 | 2 | 9.185643037 | 84.3760 | 1.8982197e-04 | 3.3869753e-02 | +2.0536 | 0.560, 0.888 |
| 15 | 0 | 3 | 9.370844487 | 87.8127 | -1.2769549e-04 | 3.3789056e-02 | -1.4216 | 0.257, 0.591, 0.893 |
| 16 | 5 | 1 | 9.823823119 | 96.5075 | -2.6225488e-04 | 2.8745651e-02 | -2.2512 | 0.875 |
| 17 | 9 | 0 | 10.053428971 | 101.0714 | 1.7199689e-03 | 1.3526803e-02 | +3.3641 | - |
| 18 | 3 | 2 | 10.578455318 | 111.9037 | 5.7156512e-05 | 2.9040070e-02 | +2.0851 | 0.604, 0.899 |
| 19 | 1 | 3 | 10.909100408 | 119.0085 | -2.8447327e-05 | 2.8970194e-02 | -2.0159 | 0.351, 0.644, 0.907 |
| 20 | 6 | 1 | 11.055922722 | 122.2334 | -1.0583920e-04 | 2.4964228e-02 | -2.2974 | 0.884 |
| 21 | 10 | 0 | 11.110483318 | 123.4428 | 9.2790247e-04 | 1.1893726e-02 | +3.4606 | - |
| 22 | 4 | 2 | 11.930160985 | 142.3287 | 1.8617140e-05 | 2.5393782e-02 | +2.1186 | 0.637, 0.908 |
| 23 | 11 | 0 | 12.162885947 | 147.9358 | 5.0419793e-04 | 1.0578760e-02 | +3.5513 | - |
| 24 | 7 | 1 | 12.267829694 | 150.4996 | -4.4198108e-05 | 2.2012156e-02 | -2.3407 | 0.892 |
| 25 | 2 | 3 | 12.382603417 | 153.3289 | -7.2582231e-06 | 2.5364687e-02 | -2.0324 | 0.415, 0.681, 0.917 |
| 26 | 0 | 4 | 12.525181124 | 156.8802 | 5.3683626e-06 | 2.5334983e-02 | +1.4183 | 0.192, 0.441, 0.692, 0.919 |
| 27 | 12 | 0 | 13.211402292 | 174.5412 | 2.7561460e-04 | 9.4996863e-03 | +3.6370 | - |
| 28 | 5 | 2 | 13.250092007 | 175.5649 | 6.4315788e-06 | 2.2538235e-02 | +2.1519 | 0.662, 0.915 |
| 29 | 8 | 1 | 13.463350936 | 181.2618 | -1.8972405e-05 | 1.9646127e-02 | -2.3815 | 0.898 |
| 30 | 3 | 3 | 13.808494235 | 190.6745 | -2.0395663e-06 | 2.2555840e-02 | -2.0542 | 0.462, 0.708, 0.924 |
| 31 | 1 | 4 | 14.068580951 | 197.9250 | 1.1822909e-06 | 2.2523944e-02 | +2.0099 | 0.272, 0.499, 0.724, 0.928 |
| 32 | 6 | 2 | 14.544567808 | 211.5445 | 2.3266597e-06 | 2.0239370e-02 | +2.1843 | 0.683, 0.920 |
| 33 | 9 | 1 | 14.645271798 | 214.4840 | -8.3315921e-06 | 1.7709419e-02 | -2.4200 | 0.903 |
| 34 | 4 | 3 | 15.197488495 | 230.9637 | -6.1632345e-07 | 2.0300854e-02 | -2.0782 | 0.499, 0.729, 0.930 |
| 35 | 2 | 4 | 15.558493097 | 242.0667 | 2.9105766e-07 | 2.0279288e-02 | +2.0216 | 0.330, 0.541, 0.748, 0.934 |
| 36 | 0 | 5 | 15.674661492 | 245.6950 | -2.2814996e-07 | 2.0266126e-02 | -1.4168 | 0.153, 0.352, 0.552, 0.753, 0.935 |

The next modes, (10,1) at λ² = 250.136 and (7,2) at 250.212, are a near-degenerate pair and fall just past the cutoff. The cutoff therefore sits below them on purpose.

```ts
// src/cymatics/physics/circularPlate.ts
export type CircleModeRow = readonly [n: number, s: number, lambda: number, C: number, norm2: number];
export const CIRCLE_MODES_NU033: readonly CircleModeRow[] = [
  // [n, s, lambda, C, norm2]   (unit radius, nu = 0.33, free edge)
  [ 2, 0, 2.293913023699,  2.2190516171e-01, 7.4663274894e-02],
  [ 0, 1, 3.011461217048, -8.3809849994e-02, 1.0349879133e-01],
  [ 3, 0, 3.499127642421,  9.6356898945e-02, 4.8624527529e-02],
  [ 1, 1, 4.529137545458, -1.9007158117e-02, 6.7962703713e-02],
  [ 4, 0, 4.639743227307,  4.5824584377e-02, 3.5223862057e-02],
  [ 5, 0, 5.749942903008,  2.2795918327e-02, 2.7241715015e-02],
  [ 2, 1, 5.936541131205, -5.5653619610e-03, 5.0997597204e-02],
  [ 0, 2, 6.205398340493,  3.1191407299e-03, 5.0746801710e-02],
  [ 6, 0, 6.841689469264,  1.1660546888e-02, 2.1998727513e-02],
  [ 3, 1, 7.274683338640, -1.8637187493e-03, 4.0705615715e-02],
  [ 1, 2, 7.736864212920,  7.0499263683e-04, 4.0603688058e-02],
  [ 7, 0, 7.920820339254,  6.0805770160e-03, 1.8316539526e-02],
  [ 4, 1, 8.566114413138, -6.7890453974e-04, 3.3756325463e-02],
  [ 8, 0, 8.990690252576,  3.2162305001e-03, 1.5602239276e-02],
  [ 2, 2, 9.185643037123,  1.8982196891e-04, 3.3869753227e-02],
  [ 0, 3, 9.370844486637, -1.2769548660e-04, 3.3789056383e-02],
  [ 5, 1, 9.823823118530, -2.6225488426e-04, 2.8745651174e-02],
  [ 9, 0, 10.053428971011,  1.7199689396e-03, 1.3526803216e-02],
  [ 3, 2, 10.578455317809,  5.7156512471e-05, 2.9040069822e-02],
  [ 1, 3, 10.909100408233, -2.8447327075e-05, 2.8970194187e-02],
  [ 6, 1, 11.055922721604, -1.0583920204e-04, 2.4964227744e-02],
  [10, 0, 11.110483318288,  9.2790246625e-04, 1.1893726050e-02],
  [ 4, 2, 11.930160985043,  1.8617139955e-05, 2.5393781560e-02],
  [11, 0, 12.162885947273,  5.0419793282e-04, 1.0578760197e-02],
  [ 7, 1, 12.267829693714, -4.4198107971e-05, 2.2012155715e-02],
  [ 2, 3, 12.382603417314, -7.2582230584e-06, 2.5364686525e-02],
  [ 0, 4, 12.525181124156,  5.3683625889e-06, 2.5334983434e-02],
  [12, 0, 13.211402292298,  2.7561460335e-04, 9.4996863373e-03],
  [ 5, 2, 13.250092007033,  6.4315788005e-06, 2.2538234607e-02],
  [ 8, 1, 13.463350936054, -1.8972405032e-05, 1.9646127038e-02],
  [ 3, 3, 13.808494235414, -2.0395663266e-06, 2.2555840439e-02],
  [ 1, 4, 14.068580950871,  1.1822909413e-06, 2.2523944366e-02],
  [ 6, 2, 14.544567807893,  2.3266596987e-06, 2.0239370229e-02],
  [ 9, 1, 14.645271797838, -8.3315920733e-06, 1.7709418745e-02],
  [ 4, 3, 15.197488495112, -6.1632344562e-07, 2.0300854372e-02],
  [ 2, 4, 15.558493097319,  2.9105766296e-07, 2.0279287618e-02],
  [ 0, 5, 15.674661491611, -2.2814996298e-07, 2.0266125772e-02],
] as const;
```

## Appendix B — Square guided-edge plate, centre-driven: symmetric even–even modes (Λ = m² + n² ≤ 260)

`P = ψ̂(centre)`: ±2 for (0,n) and m = n; ±2√2 = ±2.83 for 0 < m < n; sign = (−1)^((m+n)/2). Physical f at L = 300 mm, h = 1 mm Al: 26.97 Hz × Λ.

| k | (m,n)+ | Λ | P | | k | (m,n)+ | Λ | P |
|---|---|---|---|---|---|---|---|---|
| 0 | (0,2) | 4 | −2 | | 16 | (8,8) | 128 | +2 |
| 1 | (2,2) | 8 | +2 | | 17 | (6,10) | 136 | +2.83 |
| 2 | (0,4) | 16 | +2 | | 18 | (0,12) | 144 | +2 |
| 3 | (2,4) | 20 | −2.83 | | 19 | (2,12) | 148 | −2.83 |
| 4 | (4,4) | 32 | +2 | | 20 | (4,12) | 160 | +2.83 |
| 5 | (0,6) | 36 | −2 | | 21 | (8,10) | 164 | −2.83 |
| 6 | (2,6) | 40 | +2.83 | | 22 | (6,12) | 180 | −2.83 |
| 7 | (4,6) | 52 | −2.83 | | 23 | (0,14) | 196 | −2 |
| 8 | (0,8) | 64 | +2 | | 24 | (2,14) | 200 | +2.83 (degenerate with 25) |
| 9 | (2,8) | 68 | −2.83 | | 25 | (10,10) | 200 | +2 |
| 10 | (6,6) | 72 | +2 | | 26 | (8,12) | 208 | +2.83 |
| 11 | (4,8) | 80 | +2.83 | | 27 | (4,14) | 212 | −2.83 |
| 12 | (0,10) | 100 | −2 (degenerate with 13) | | 28 | (6,14) | 232 | +2.83 |
| 13 | (6,8) | 100 | −2.83 | | 29 | (10,12) | 244 | −2.83 |
| 14 | (2,10) | 104 | +2.83 | | 30 | (8,14) | 260 | −2.83 |
| 15 | (4,10) | 116 | −2.83 | | | | | |

## Appendix C — Bessel zeros (test fixtures)

Dirichlet zeros `j_{n,s}` (J_n = 0):

| n | s=1 | s=2 | s=3 | s=4 |
|---|---|---|---|---|
| 0 | 2.404826 | 5.520078 | 8.653728 | 11.791534 |
| 1 | 3.831706 | 7.015587 | 10.173468 | 13.323692 |
| 2 | 5.135622 | 8.417244 | 11.619841 | 14.795952 |
| 3 | 6.380162 | 9.761023 | 13.015201 | 16.223466 |
| 4 | 7.588342 | 11.064709 | 14.372537 | 17.615966 |
| 5 | 8.771484 | 12.338604 | 15.700174 | 18.980134 |
| 6 | 9.936110 | 13.589290 | 17.003820 | 20.320789 |
| 7 | 11.086370 | 14.821269 | 18.287583 | 21.641541 |
| 8 | 12.225092 | 16.037774 | 19.554536 | 22.945173 |

Neumann zeros `j′_{n,s}` (J_n′ = 0; for n = 0 the trivial zero 0 comes first):

| n | s=1 | s=2 | s=3 | s=4 |
|---|---|---|---|---|
| 0 | 0 | 3.831706 | 7.015587 | 10.173468 |
| 1 | 1.841184 | 5.331443 | 8.536316 | 11.706005 |
| 2 | 3.054237 | 6.706133 | 9.969468 | 13.170371 |
| 3 | 4.201189 | 8.015237 | 11.345924 | 14.585848 |
| 4 | 5.317553 | 9.282396 | 12.681908 | 15.964107 |
| 5 | 6.415616 | 10.519861 | 13.987189 | 17.312842 |
| 6 | 7.501266 | 11.734936 | 15.268181 | 18.637443 |
| 7 | 8.577836 | 12.932386 | 16.529366 | 19.941853 |
| 8 | 9.647422 | 14.115519 | 17.774012 | 21.229063 |

## Appendix D — References

* A. W. Leissa, *Vibration of Plates*, NASA SP-160 (1969), ch. 2 (free circular plates) and ch. 4 (rectangular).
* E. F. F. Chladni, *Entdeckungen über die Theorie des Klanges* (1787). T. D. Rossing & N. H. Fletcher, *The Physics of Musical Instruments*: Chladni's law `f ≈ C(m+2n)^p`.
* W. Ritz, "Theorie der Transversalschwingungen einer quadratischen Platte mit freien Rändern", *Ann. Phys.* 28 (1909).
* P. H. Tuan et al., "Exploring the resonant vibration of thin plates: reconstruction of Chladni patterns and determination of resonant wave numbers", *J. Acoust. Soc. Am.* 137 (2015).
* M. Faraday, "On a peculiar class of acoustical figures…", *Phil. Trans. R. Soc.* 121 (1831): powders at antinodes.
* P. Shirley & K. Chiu, "A Low Distortion Map Between Disk and Square", *J. Graphics Tools* 2(3) (1997).
* Web Audio API (W3C): AnalyserNode smoothing semantics, AudioParam automation rules (`setValueCurveAtTime` overlap), AudioBufferSourceNode looping. WebKit Audio Session API (`navigator.audioSession`).
* three.js r186 sources as cited in E.1.
