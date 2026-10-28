# Kyma Birds — Cymatics Engine Design Spec

**Angle: visual beauty and legibility.** Target stack: three@0.186.1, TanStack Start (React 19.3), Cloudflare Workers. Modules live under `src/audio/` and `src/cymatics/` and mount client-only.

Every three.js API below was checked against the real `three@0.186.1` npm tarball (`npm pack three@0.186.1`, extracted to `scratchpad/three-src-visual/package`). The `webgpu_*` example HTML files are not in the npm package, so they were fetched from the GitHub tag `r186`. Citations are `path:line` in that tree. All numeric constants for the sand were tuned with a NumPy prototype of the exact dynamics in section D. Its output images are listed in the appendix.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Renderer | **Classic `WebGLRenderer` + `GPUComputationRenderer` (ping-pong float textures) + `ShaderMaterial` points**. WebGPU/TSL is kept as a later backend behind the same `PlateSimulation` interface (E.12). |
| Song driver | **A `FeatureTrack` is precomputed in a Web Worker** from the decoded loop: FFT 2048, hop 512. It is indexed by an output-latency-aware loop clock. **A live `AnalyserNode` is the fallback** until the track is ready, and is used if the worker fails. |
| Mode basis | Circle: `J_n(k r) cos nθ` with `J_n'(k)=0` (free-edge approximation), from a CPU-built Bessel LUT. Square: `cos(nπ(x+1)/2)cos(mπ(y+1)/2) ± (n↔m)`, computed analytically in the shader. Each table is curated down to 48 good-looking modes. |
| Sound → modes | Per-bird **rank-spread calibration**: each bird gets a distinct "signature mode", ordered by pitch. Driven-oscillator (Lorentzian) response with a per-mode Q. **Coherent signed superposition**, sparsified to ≤6 modes, sharpened by tonality, with a dominance hysteresis that produces the "snap". |
| Sand | 65k / 131k / 262k grains. Kick when local acceleration exceeds the grain's threshold, drift down `∇(U²)`, sub-threshold creep, friction. Grains **freeze in silence**. Free edge spills; a rimmed edge reflects. |
| Look | Grains are additive mass splats into a half-float density target at plate device resolution, then **exposure-normalised tonemap** `1−exp(−e·H)`. Quarter-res blur feeds glow, contact shadow and ridge lighting. Short motion streaks for airborne grains. Two presets: `crisp` (ref 1) and `soft` (ref 2). |

### Seven legibility principles (these drive most of the numbers)

1. **Two time scales.** Notes (under 100 ms) make sand *jump and sparkle*: onset kicks. Phrases (0.2–1.2 s) set the *pattern*: mode coefficients. A per-note pattern would be mush. A per-phrase pattern can be read.
2. **Coherent superposition, so nodal lines are always crisp.** `U = Σ cᵢφᵢ` with signed `cᵢ`. Its zero set is a set of curves even mid-morph (validated in `morph.png`). Summing energies incoherently would collapse the lines into blurry dots.
3. **Sparsity and snap.** At most 6 active modes, sharpened by `|c|^γ`. The dominant mode only changes when a challenger is ≥1.3× stronger for ≥100 ms. That change triggers a "snap" (drift ×1.8 plus a glow pulse) so the moment a pattern locks is visible.
4. **Silence means freeze.** Drive goes to 0 within about 160 ms and coefficients are *held*, not decayed. Friction stops every grain within about 0.2 s, and nothing on the plate animates (no shimmer, no noise). This is how real sand holds its last pattern.
5. **Loud means crisp.** Line half-width is about `θ/(D·|∇U|)`. Drive is compressed into `[0.55, 1]` while the bird is singing, so patterns stay sharp. Quieter passages read as softer bands, never as nothing.
6. **Each bird looks different.** A higher-pitched bird gets a more complex signature mode, and signatures sit at least 5 ranks apart. Tonality sets crispness: a whistle gives one clean mode, a buzz gives blended modes. Onset rate sets how much the sand dances.
7. **Curated modes.** Drop the modes that look bad on a plate: circular high-n "whispering gallery" modes with a large untouched centre disk, the rocking (1,1) mode, and the square (1,1+) star blob.

---

## 1. What the references teach (rendering targets)

| Reference | Observation | Recipe item |
|---|---|---|
| 1 (square, centre bolt) | Near-black matte plate (about sRGB #0b0b0b). Crisp **single** white sand lines 4–8 px wide. Dense knots where lines cross. | Coherent field, creep 0.8 (prevents doubled lines), exposure tonemap that saturates lines to near-white. |
| 1 | Sparse scattered grains, many of them **short dashes**. These are airborne grains motion-blurred by the camera shutter. | Velocity-oriented capsule splats, length `|v|·shutter`, capped at 12 px. |
| 1 | A sand mound ring around the bolt. | A "flat zone" around the bolt (`U·smoothstep(0.55r_c, r_c, r)`, r_c=0.12) where grains stop. Bolt drawn as an analytic shiny sphere. |
| 2 (circle, phone reel) | Dark plate (about #121214) with a bone-white **rim ring** and a soft dark halo. A **grainy coat** remains everywhere. Soft glowing blobs/lines with 8-fold symmetry. | `soft` preset: 22 % "heavy" grains (threshold ×3) keep a coat. Afterimage persistence gives a long-exposure softness. Stronger glow. Rim lip reflects grains. |
| both | Warm white sand (salt/sugar), no colour. | Sand colour in linear (0.92, 0.90, 0.86). Optional per-bird accent tint of at most 8 %, in glow only. |

---

## A. Audio (`src/audio/`)

### A.1 Graph

```
AudioBufferSourceNode(loop) → voiceGain(crossfade) ┐
AudioBufferSourceNode(loop) → voiceGain(crossfade) ┤→ bus (sum, pre-volume) ─┬→ analyser (fftSize 2048, tap only)
                                                   │                         └→ master (volume²) → mute → destination
```

* The analyser taps **before** volume and mute, so the plate keeps moving when the user mutes. Muting is "watch silently".
* There is one `AudioContext` per page. Create it **eagerly in a suspended state** on mount: decoding works on a suspended context, so the first bird is decoded before the first tap. Use `latencyHint: 'interactive'`. `'playback'` can add 100 ms or more of output latency, which hurts audio/visual sync.

### A.2 Unlock (autoplay policy, iOS)

```ts
// src/audio/AudioEngine.ts
import '@tanstack/react-start/client-only'

/** MUST be called synchronously inside a click / pointerup / keydown(Enter|Space) handler.
 *  Do not await anything before it (Safari loses the user activation). */
unlock(): Promise<void> {
  const ctx = this.ensureContext()                       // sync
  setPlaybackSession()                                   // iOS silent switch, see below
  const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume()
  // legacy WebKit unlock: start a 1-frame silent buffer inside the gesture
  const src = ctx.createBufferSource()
  src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
  src.connect(ctx.destination); src.start(0)
  this.keepAlive?.play().catch(() => {})                 // only exists when audioSession API is missing on iOS
  return resumed.then(() => { this.unlocked = true; this.setState('playing') })
}

function setPlaybackSession() {
  const s = (navigator as any).audioSession
  if (s && 'type' in s) { try { s.type = 'playback' } catch {} ; return }   // WebKit Audio Session API (feature-detected)
  // Fallback for older iOS: a looping, silent <audio playsinline> started in the same gesture switches the
  // page's session to "playback", so Web Audio is audible with the ring/silent switch ON.
}
```

* Use `click`, not `pointerdown`. On touch devices `pointerdown` does not grant user activation. Scrolling or swiping the picker never unlocks audio, so the first sound needs a tap: a "Tap to listen" button over the plate, or tapping a bird card.
* When using the `<audio>` keep-alive, set `navigator.mediaSession.metadata` to the bird's name and wire the play/pause action handlers. Lock-screen controls then match the app.

### A.3 Fetch, decode, seamless loop preparation

```ts
async load(a: BirdSongAsset, signal: AbortSignal): Promise<PreparedSong> {
  const hit = this.decoded.get(a.id); if (hit) return hit                       // LRU(3) of decoded songs
  let bytes = this.compressed.get(a.id)                                          // LRU(8) of ArrayBuffers (~0.2–0.5 MB each)
  if (!bytes) {
    const res = await fetch(a.src, { signal, credentials: 'omit' })
    if (!res.ok) throw new Error(`audio ${res.status}`)
    bytes = await res.arrayBuffer(); this.compressed.set(a.id, bytes)
  }
  const buf = await this.ctx!.decodeAudioData(bytes.slice(0))                    // slice: decode DETACHES its input
  const song = prepareLoop(buf, { durationSec: a.durationSec })                  // pure, below
  this.decoded.set(a.id, song)
  this.buildFeatureTrack(a, song)                                                // worker, fire-and-forget
  return song
}
```

`prepareLoop` is pure and covered by tests. It exists because AAC has **encoder priming** (Apple's encoder writes 2112 samples) and **end padding**. Some decoders strip them and some don't, and a leftover gap is an audible click on every loop.

1. `findContentBounds(channels)`: count leading and trailing runs where every channel has `|x| < 1e-5` (decoded priming/padding is near-exact silence), searching at most 0.1 s at each end. A field recording has ambience at both ends, so a true silence run means codec padding.
2. If the manifest provides `durationSec`, use `end = start + round(durationSec·sr)`, clamped.
3. Measure the seam discontinuity: `jump = |x[end−1] − x[start]| / rms(diff(x)) near the seam`. If `jump > 4`, bake a **12 ms equal-power seam crossfade**: mix the last F samples into the first F, then drop the last F. Otherwise use the original buffer and set `source.loopStart/loopEnd` with no copy.
4. Return `{ buffer, loopStart, loopEnd, loopDur }`.

If decoding fails (for example Firefox on Linux without AAC codecs), retry with `fallbackSrc` (Opus or MP3) when the manifest has one. Otherwise go to the `error` state and show "This browser can't play this recording". The plate stays in its coat state.

### A.4 Voices, crossfade, rapid switching, stale decodes

```ts
async select(a: BirdSongAsset, { crossfadeSec = 1.2 } = {}): Promise<'started'|'superseded'|'failed'> {
  const seq = ++this.seq
  this.inflight?.abort(); const ac = (this.inflight = new AbortController())
  this.emit({ type: 'loading', birdId: a.id })
  // Keep the old song while loading. If loading is slow, fade it out so the sound never contradicts the picker.
  const slow = setTimeout(() => seq === this.seq && this.fadeOutAll(0.35), 700)
  let song: PreparedSong
  try { song = await this.load(a, ac.signal) }
  catch (e) { clearTimeout(slow); if (seq !== this.seq) return 'superseded'; this.fail(a, e); return 'failed' }
  clearTimeout(slow)
  if (seq !== this.seq) return 'superseded'            // stale decode: keep it cached, don't play it
  if (this.userPaused) { this.pending = song; return 'started' }   // starts on resume()
  this.startVoice(a.id, song, crossfadeSec)
  return 'started'
}

private startVoice(id: string, s: PreparedSong, dur: number) {
  const ctx = this.ctx!, t0 = ctx.currentTime + 0.03
  for (const v of this.voices) { this.ramp(v, 0, dur, t0); v.src.stop(t0 + dur + 0.05) }
  const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(this.bus)
  const src = ctx.createBufferSource()
  Object.assign(src, { buffer: s.buffer, loop: true, loopStart: s.loopStart, loopEnd: s.loopEnd })
  src.connect(gain); src.start(t0, s.loopStart)
  const v: Voice = { id, src, gain, startedAt: t0, loopStart: s.loopStart, loopDur: s.loopDur, fade: null }
  this.ramp(v, 1, dur, t0)
  src.onended = () => { src.disconnect(); gain.disconnect(); this.voices = this.voices.filter(x => x !== v) }
  this.voices.push(v); this.current = v
  this.emit({ type: 'voicestart', birdId: id, startedAt: t0, loopDur: s.loopDur })
}

/** Equal-power ramp that is safe to interrupt mid-fade (rapid switching). */
private ramp(v: Voice, to: number, dur: number, t0: number) {
  const g = v.gain.gain, from = currentFadeGain(v.fade, t0)        // analytic value of the scheduled curve at t0
  g.cancelScheduledValues(t0); g.setValueAtTime(from, t0)          // portable (Firefox has no cancelAndHoldAtTime)
  const d = dur * Math.abs(to - from); if (d < 0.01) { g.setValueAtTime(to, t0); v.fade = null; return }
  const t1 = t0 + 0.005                                            // start the curve 1 quantum later: never overlaps setValueAtTime
  g.setValueCurveAtTime(powerCurve(from, to, 32), t1, d)
  v.fade = { from, to, t0: t1, dur: d }
}
// powerCurve(from,to,n)[i] = sqrt(from²·(1−x) + to²·x), x=i/(n−1): monotonic, no overshoot, constant summed power.
```

* Several voices can overlap under rapid switching. Each one fades from its *actual current* gain, which is computed analytically, so there are no jumps. Voices still scheduled to stop are stopped and disconnected on `ended`.
* Prefetch: `prefetch([prev, next])` fetches compressed bytes for the neighbouring cards. It does not decode them (decoded audio costs about 5.8 MB per 30 s mono at 48 kHz). The picker commits a selection 250 ms after scrolling settles (`scrollend`, falling back to a debounce). The audio engine then only ever sees settled selections.

### A.5 Pause, resume, volume, mute

* `pause()`: fade `master` to 0 over 80 ms, then `ctx.suspend()` (which stops the hardware and saves battery). Pause the keep-alive `<audio>`. Set `userPaused = true`. **The visuals freeze automatically** because `ModeBank` receives `playing=false`, which closes the gate and drives D to 0 (section C.8).
* `resume()`: call it from a gesture. `ctx.resume()`, then fade master in over 120 ms. Start `pending` if a selection arrived while paused. The loop position is preserved because `currentTime` stops while the context is suspended.
* Volume uses `master.gain.setTargetAtTime(v*v, now, 0.02)` (perceptual square-law taper). Mute uses a separate `mute` gain with `setTargetAtTime(0|1, now, 0.015)`. Volume is remembered in `localStorage`, wrapped in try/catch.

### A.6 Page visibility, interruptions, bfcache

```ts
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (ctx.state === 'running') { this.autoSuspended = true; this.fadeAndSuspend(0.06) } }
  else if (this.autoSuspended && !this.userPaused) {
    this.autoSuspended = false
    ctx.resume().catch(() => this.emit({ type: 'needs-gesture' }))
  }
})
ctx.onstatechange = () => {
  const s = ctx.state as string                              // WebKit reports 'interrupted' (calls, Siri, other apps)
  if (s === 'interrupted' || (s === 'suspended' && !this.userPaused && !this.autoSuspended)) this.emit({ type: 'needs-gesture' })
}
addEventListener('pagehide', () => this.fadeAndSuspend(0)); addEventListener('pageshow', e => e.persisted && /* same as visible */ 0)
```

`needs-gesture` shows a small "Tap to resume" pill over the plate. Its click handler calls `resume()`.

### A.7 Song clock (audio/visual sync)

The analyser path and the precomputed track both describe what is *about to be heard*. On Bluetooth the speaker can lag by 40–250 ms. Visuals should follow what the listener actually hears:

```ts
readClock(nowPerfMs: number): SongClock | null {
  const v = this.current; if (!v || !this.ctx) return null
  const ctx = this.ctx, running = ctx.state === 'running'
  let heard: number
  const ts = running && ctx.getOutputTimestamp?.()
  if (ts && ts.contextTime! > 0) heard = ts.contextTime! + (nowPerfMs - ts.performanceTime!) / 1000   // extrapolate to this frame
  else heard = ctx.currentTime - (running ? ((ctx as any).outputLatency ?? ctx.baseLatency ?? 0) : 0)
  const t = Math.max(0, heard - v.startedAt)
  return { birdId: v.id, positionSec: v.loopStart + (t % v.loopDur), loopDurationSec: v.loopDur, running }
}
```

### A.8 Lifecycle and cleanup

* Use a module-level singleton, `getAudioEngine()`, with `acquire()`/`release()` reference counting. The final `release()` defers disposal with `setTimeout(0)` so React StrictMode's mount-unmount-mount cycle doesn't destroy it.
* `dispose()`: stop and disconnect all voices, `analyser.disconnect()`, remove the `visibilitychange`, `pagehide`/`pageshow` and `statechange` listeners, pause and remove the keep-alive element, terminate the feature worker, then `await ctx.close()`. Clear the LRUs.

---

## B. Analysis (`src/audio/analysis/`)

### B.1 Two feature sources, one interface

| | **FeatureTrack** (primary) | **LiveAnalyzer** (fallback) |
|---|---|---|
| Source | Decoded PCM in a Worker (`new Worker(new URL('./featureTrack.worker.ts', import.meta.url), { type: 'module' })`). Mono mixdown on the main thread (about 3 ms), transferred as a `Float32Array`. | `AnalyserNode` on `bus` |
| Window | Hann 2048, hop 512 (10.7 ms at 48 kHz). Circular indexing across the loop seam, so features loop seamlessly. | Blackman 2048 (built in) |
| Noise floor | Per-bin **20th percentile over the whole clip**. This removes stationary insects, hum and wind. | Minimum statistics: `floor[b] = min(floor[b] + 3 dB/s·dt, P[b])` |
| Normalisation | Global stats: `L = clamp((L_dB − p20 − 3)/(p95 − p20 − 3), 0, 1)` | Running peak with a 1.5 dB/s release, `L = clamp((L_dB − floor − 3)/max(peak − floor − 3, 12), 0, 1)` |
| Onsets | Peak-picked with **look-ahead**, so there is no detection lag | Causal threshold |
| Why primary | Deterministic: the same moment of the loop always gives the same pattern, so a bird's pattern sequence becomes recognisable. No jitter. Exact sync. About 85 ms of compute for a 30 s loop. | Works before the track is ready (about 150 ms after decode) and if the worker fails. |

Both sources call the **same pure functions** in `features.ts`, which are tested once.

### B.2 AnalyserNode settings (live path)

`fftSize = 2048`: 42.7 ms window at 48 kHz, 23.4 Hz bins. Parabolic interpolation gets peak frequency to about ±3 Hz, which is far finer than a mode's catchment width (≥2–3 %). Set `smoothingTimeConstant = 0`, because the built-in symmetric smoothing smears onsets; we smooth asymmetrically ourselves. Set `minDecibels = −110` and `maxDecibels = −10` (they only affect byte data). Read `getFloatFrequencyData` into a preallocated `Float32Array(1024)` and `getFloatTimeDomainData` into a `Float32Array(2048)`. Allocate nothing per frame.

### B.3 Per-frame features

The analysis band is `[lo, hi] = [max(120, p10/1.6), min(0.45·sr, 1.6·p90)]`, using the manifest's `bandHz`.

```ts
// features.ts (pure)
export function pickPeaks(pDb: Float32Array, floorDb: Float32Array, binHz: number, lo: number, hi: number,
                          outHz: Float32Array, outAmp: Float32Array, K = 3): number
// 1. local maxima b in [lo,hi] with pDb[b] − floorDb[b] ≥ 9 dB (tonal salience)
// 2. parabolic interpolation on dB: δ = 0.5(a−c)/(a−2b+c); f = (k+δ)·binHz; peakDb = b − 0.25(a−c)δ
// 3. sort by peakDb, enforce ≥ 1/6 octave separation
// 4. harmonic suppression: drop a peak within ±3 % of 2× or 3× a stronger kept peak (else a harmonic drives a far-away mode)
// 5. amp = 10^((peakDb − strongestDb)/20); keep amp ≥ 0.25 (−12 dB); return count
export function bandPowerAboveFloor(...): number      // Σ max(0, P−Pfloor) (linear) → loudness dB
export function centroidHz(...): number               // Σ f·p / Σ p over band, p above floor
export function tonality(...): number                 // flatness = geomean/mean of p over band;
                                                      // T = clamp((0.56 − flatness)/0.5, 0, 1); white noise ≈ 0.56 → 0, whistle → 1
export function spectralFlux(prevDb, curDb, floorDb, lo, hi): number // mean over band bins (above floor+3 dB) of max(0, cur−prev) dB
// onset: flux > max(1.2·median(flux, 0.5 s), median + 1 dB) AND local max (offline: neighbours t±1) AND ≥ 50 ms since last
// onsetStrength = clamp((flux − thr)/(2·thr), 0, 1)
```

* **Gate** (on the normalised L): open at 0.12, close at 0.07, minimum hold 80 ms.
* **No usable peaks** (buzzy calls with no peak 9 dB above the floor): use the spectral centroid as a single pseudo-peak with `amp = 1`. Low tonality then automatically gives a blended, softer pattern.

### B.4 Sampling the FeatureTrack

`track.sample(pos, prevPos, out)` linearly interpolates the continuous features between hops. `onset` takes the **maximum over (prevPos, pos]**, accounting for wrap-around, so a frame never skips an onset. Peaks come from the nearest hop, which avoids interpolating across a pitch jump.

### B.5 Smoothing (one-pole, dt-invariant: `y += (x−y)·(1−exp(−dt/τ))`)

| Signal | τ attack | τ release | Note |
|---|---|---|---|
| Drive D | 20 ms | 160 ms | after the gate and compression `0.55 + 0.45·L^0.6` |
| Loudness (UI) | 15 ms | 250 ms | |
| Tonality T | 150 ms | 150 ms | |
| Centroid | 60 ms | 60 ms | |
| Onset pulse | instant | 90 ms | multiplies the kick |
| Peak frequency | glide 30 ms in log-f if within 4 %, else jump | hold 120 ms after the gate closes | removes FFT jitter while keeping real jumps |
| Mode coefficients | 180 ms (when \|target\| > \|c\|) | 1.2 s | only while gated. **Held** while silent. |
| Dominant mode | challenger ≥ 1.3× for ≥ 100 ms | — | each change emits a snap, rate-limited to one per 400 ms |

### B.6 Bird personality (computed once per FeatureTrack)

| Statistic | Effect |
|---|---|
| `T̄` = median tonality over gated frames | sharpening `γ = 1.2 + 1.6·T̄`: a whistle gives one clean mode, a buzz gives a blend |
| `onsetRate` = onsets per gated second | `kickGain = 0.8 + 0.4·clamp(onsetRate/8, 0, 1)`: trills dance, slow whistles stay calm |
| `p10, p90` of the strongest peak's frequency | refines the calibration window (C.6). The manifest `bandHz` is used until the track exists. |

---

## C. Plate physics (`src/cymatics/math/`)

### C.1 Field model

Plate coordinates are `p ∈ [−1,1]²`: the circle has radius 1, the square has half-width 1. A thin plate driven harmonically at frequency `f` vibrates as `w(p,t) = Re[Σᵢ Hᵢ(f) Fᵢ φᵢ(p) e^{i2πft}]`. A grain hops when the local acceleration amplitude exceeds g. We keep only the **normalised envelope**:

```
U(p,t) = Σᵢ cᵢ(t) φᵢ(p) / Σᵢ|cᵢ(t)|        (|φᵢ| ≤ 1, so |U| ≤ 1)
A(p,t) = D(t) · |U(p,t)|                   local "acceleration / g" proxy that grains compare to their threshold θ
```

"Crisp approximation": the true time average is `|Σ Hᵢφᵢ|²` with complex `Hᵢ`. Using real signed `cᵢ = |Hᵢ|·sgn(1 − rᵢ²)` drops the quadrature part, so the nodal set stays a set of curves while patterns morph. Below resonance a mode responds in phase, above it out of phase. The sign is what makes mixtures form new shapes (rows 1, 3 and 4 of `morph.png`).

### C.2 Circular plate (reference 2)

`φ_{n,s}(r,θ) = J_n(k_{n,s} r)·cos(n(θ − θ₀)) / N_{n,s}`, where `k_{n,s}` is the s-th positive zero of `J_n'`. This is the free-edge (Neumann) approximation: sand leaves the rim instead of piling there. `N` normalises `max|φ| = 1` on the disk. Here n is the number of nodal diameters. `θ₀ = 0` for every mode and bird, which keeps line orientation consistent and patterns comparable.

The frequency axis is `λ = k²`, because plate dispersion gives ω ∝ k². The first entries, computed and checked against SciPy:

| rank | (n,s) | k | λ/λ₀ | diameters / circles |
|---|---|---|---|---|
| — | (1,1) **dropped** | 1.8412 | 1.00 | rocking |
| 0 | (2,1) | 3.0542 | 2.75 | 2 / 0 |
| 1 | (0,1) | 3.8317 | 4.33 | 0 / 1 |
| 2 | (3,1) | 4.2012 | 5.21 | 3 / 0 |
| 3 | (4,1) | 5.3176 | 8.34 | 4 / 0 |
| 4 | (1,2) | 5.3314 | 8.39 | 1 / 1 |
| 5 | (2,2) | 6.7061 | 13.27 | 2 / 1 |
| 6 | (0,2) | 7.0156 | 14.52 | 0 / 2 |
| 7 | (3,2) | 8.0152 | 18.95 | 3 / 1 |
| 8 | (1,3) | 8.5363 | 21.50 | 1 / 2 |
| 9 | (4,2) | 9.2824 | 25.42 | 4 / 1 |
| … | … up to k ≈ 22 | | | |

**Curation** (`modeTable.ts`, pure):
* Drop (1,1).
* Drop modes whose **dead-centre radius** `r₀ > 0.42`, where `r₀` is the largest r with `|J_n(kr)|/max < 0.1`. This removes (5,1), (6,1), (7,1)… and (10,2), (11,2)…, which would leave a big untouched disk of sand (`atlas_circle.png`).
* Cap n at 12 and take the first 48 survivors. Of the first 72 raw modes, 54 survive.
* Aesthetic weights: n=1 gets 0.7, n=0 gets 0.9, everything else 1.0.
* Upgrade path: a true Kirchhoff free-edge radial function `J_n(λr) + C·I_n(λr)` only changes the CPU LUT builder.

### C.3 Square plate (reference 1)

```
c_n(x) = cos(nπ(x+1)/2)                                  (∂/∂x = 0 at x = ±1: free-edge-like)
φ±_{n,m} = [c_n(x)c_m(y) ± c_m(x)c_n(y)] / N,   n < m          φ_{n,n} = c_n(x)c_n(y) / N
λ = (n² + m²)·(1 ± 0.03)·(1 + 0.004·(hash(n,m,±) − ½))
```

* The ±3 % splits the degenerate pair so that a pitch glide flips a pattern between its + and − forms, as real plates do. The hash detune breaks accidental degeneracies such as (0,5) and (3,4), which both give n²+m² = 25.
* Exclude n+m < 2, (0,1±) and (1,1+). Take n, m ≤ 11 and keep the first 48 by λ.
* Drive-point coupling: `κ = 0.5 + 0.5·|φ(0,0)|`. A centre driver favours (even,even,+) modes, which are the D4-symmetric "classic Chladni" ones.
* Bolt flat zone, `r_c = 0.12`: `U ← U·h(r)` with `h = smoothstep(0.55 r_c, r_c, r)`. Grains that slide in stop there and form the mound ring of reference 1 (validated in `m3.png` and `m5.png`).

### C.4 Eigenfrequency ordering and Chladni's law

Modes are sorted by λ, and rank `i = 0…47` is the **mode axis**. For circular plates, Chladni's empirical law is `f ≈ C·(m + 2n)^p` with p ≈ 2 (m nodal diameters, n nodal circles). The exact Bessel eigenvalues follow the same trend and are what we use. Square plates follow the analogue `f ∝ n² + m²`.

Each mode also gets a Q tied to local mode density, so that every mode has a similar "catchment" on the axis:

`Qᵢ = λᵢ / (0.45·Δλᵢ)`, with `Δλᵢ = (λ_{i+2} − λ_{i−2})/4` (one-sided at the ends), clamped to [6, 150].

### C.5 Bessel functions: CPU double precision, GPU LUT

* **CPU** (`bessel.ts`): Miller backward recurrence normalised with `J₀ + 2ΣJ₂ₖ = 1`. Start index `m = 2⌊(max(n+1, x) + 16 + √(40·max(n+1, x)))/2⌋`, rescaling when values exceed 1e250. Derivative: `J_n' = (J_{n−1} − J_{n+1})/2`, and `J₀' = −J₁`. Zeros of `J_n'`: scan in steps of 0.02 starting at x = 0.02, then bisect 80 times. **Measured:** the absolute error against SciPy is at most 1.4e-16 at 8 reference points (n up to 20, x up to 30). `j'_{0,1..3} = 3.831705970207512, 7.015586669815619, 10.173468135062723` and `j'_{12,1} = 13.878843069697275` match `scipy.special.jnp_zeros`.
* **LUT** (`radialLut.ts`): a `Float32Array` laid out as **RG32F, 1024 × 48**. R holds `J_n(k r)/N` and G holds `k·J_n'(k r)/N` (the exact radial derivative, not a finite difference), at `r_j = j/1023`. Generating 64 × 1024 Bessel arrays took about 20 ms in Bun, so build it at startup.
  ```ts
  new THREE.DataTexture(data, 1024, 48, THREE.RGFormat, THREE.FloatType)  // DataTexture defaults to NearestFilter (src/textures/DataTexture.js:32)
  ```
* **GPU sampling:** two `texelFetch` calls plus `mix`, i.e. manual linear interpolation. Float32 linear filtering needs `OES_texture_float_linear`, which iOS lacks; three only warns when it's missing (`src/renderers/webgl/WebGLTextures.js:666`). `texelFetch` is available because three compiles `ShaderMaterial` as GLSL ES 3.0 (`#version 300 es`, `src/renderers/webgl/WebGLProgram.js:804-829`).
  * Interpolation error is bounded by `h²/8·max|R''| ≈ (1/1023)²/8·k² ≈ 5.8e-5` at k = 22, so nodal lines shift by about 1e-4 plate units. That is far below one texel.
* **Why not evaluate Bessel functions in the shader:** upward recurrence is unstable for n > x. Polynomial and Hankel-asymptotic forms need regime branches, and fp32 cancellation near zeros gives errors of 1e-3 to 1e-2 *exactly at the nodal lines*, which are the thing we draw. The LUT has none of these problems and also gives the exact derivative.

### C.6 Per-bird calibration (`calibration.ts`)

```ts
/** Each bird gets a distinct signature rank, ordered by pitch. */
export function assignSignatureRanks(birds: { id: string; peakHz: number }[],
  { lo = 4, hi = 40, minSep = 5, fLo = 300, fHi = 9000 } = {}): Map<string, number> {
  const s = [...birds].sort((a, b) => a.peakHz - b.peakHz || a.id.localeCompare(b.id))
  const r = s.map(b => lo + (hi - lo) * clamp01(Math.log(b.peakHz / fLo) / Math.log(fHi / fLo)))
  const sep = Math.min(minSep, (hi - lo) / Math.max(1, s.length - 1))
  for (let i = 1; i < r.length; i++) r[i] = Math.max(r[i], r[i - 1] + sep)          // push up
  const over = r[r.length - 1] - hi; if (over > 0) for (let i = 0; i < r.length; i++) r[i] -= over
  for (let i = r.length - 2; i >= 0; i--) r[i] = Math.min(r[i], r[i + 1] - sep)      // push down
  return new Map(s.map((b, i) => [b.id, Math.max(lo, Math.min(hi, r[i]))]))
}

export function makeCalibration(b: BirdSongAsset, signatureRank: number): BirdCalibration {
  const oct = Math.log2(b.bandHz.p90 / b.bandHz.p10)
  return { birdId: b.id, peakHz: b.peakHz, signatureRank,
           halfSpanOct: Math.max(0.2, 0.5 * oct),
           halfWindowRanks: clamp(4 + 6 * oct, 5, 10), rotation: 0 }
}

/** Bird Hz → continuous rank ρ. p10..p90 spans about ±W ranks around the signature; tails are compressed. */
export function birdToRank(fHz: number, c: BirdCalibration): number {
  const x = Math.log2(fHz / c.peakHz) / c.halfSpanOct
  return c.signatureRank + c.halfWindowRanks * 1.6 * Math.tanh(x / 1.6)
}
export function lambdaAtRank(t: ModeTable, rho: number): number {   // geometric interpolation of λ along ranks
  const i = clamp(Math.floor(rho), 0, t.modes.length - 2), f = clamp(rho - i, 0, 1)
  return Math.exp(t.logLambda[i] * (1 - f) + t.logLambda[i + 1] * f)
}
```

* Calibrations are computed for **both** plate shapes when the manifest loads. Rank numbers are per table, and both tables have 48 modes.
* If a bird is nearly monotone (FeatureTrack pitch IQR under 0.1 octave), widen `halfWindowRanks` so that its IQR covers at least 2.5 ranks. Every bird should visit at least 3 patterns.

### C.7 Driven response: how the song excites modes (`response.ts`)

```ts
export function modeTargets(peaksHz: Float32Array, peaksAmp: Float32Array, nPeaks: number,
                            cal: BirdCalibration, t: ModeTable, dominant: number, gamma: number,
                            out: Float32Array): void {
  out.fill(0)
  for (let k = 0; k < nPeaks; k++) {
    const lam = lambdaAtRank(t, birdToRank(peaksHz[k], cal))
    for (let i = 0; i < t.modes.length; i++) {
      const r = lam / t.lambda[i], Q = t.Q[i], d = 1 - r * r
      const mag = (1 / Q) / Math.hypot(d, r / Q)        // driven damped oscillator, normalised (peak ≈ 1 at r = 1)
      out[i] += peaksAmp[k] * mag * (d >= 0 ? 1 : -1) * t.weight[i] * t.coupling[i]
    }
  }
  if (dominant >= 0) for (let i = 0; i < out.length; i++) if (!compatible(t, i, dominant)) out[i] *= 0.25
  sparsifySharpen(out, 6, gamma)                         // keep top 6 by |·|, |c| ← |c|^γ, then Σ|c| = 1
}
// compatible: circle → n_i==n_d || n_i==0 || n_d==0 || gcd(n_i,n_d) ≥ 2   (mixture keeps D_gcd symmetry)
//             square → same unordered parity class {n%2, m%2}                 (mixture keeps mirror symmetry)
```

With bandwidth set to 0.45 of the local spacing:
* A peak a quarter of the spacing away from mode i gives `|H_i| = 0.67` and `|H_{i+1}| = 0.29`. After γ = 2 the dominant mode holds about 84 % of the weight.
* At the exact midpoint both modes respond at 0.41 with opposite signs, which produces a crisp hybrid pattern.
* Incompatible-symmetry mixtures (row 2 of `morph.png`) look lopsided. That is why non-dominant classes are attenuated.

### C.8 Mode amplitude dynamics (`ModeBank.ts`, pure TS, no DOM)

```ts
update(f: SongFeatures, dt: number, playing: boolean): ModeDrive {
  const gated = playing && f.gate
  this.D = onePole(this.D, gated ? 0.55 + 0.45 * Math.pow(f.loudness, 0.6) : 0, dt, 0.020, 0.160)
  if (gated) {
    modeTargets(f.peakHz, f.peakAmp, f.peakCount, this.cal, this.table, this.dominant, this.gamma, this.target)
    for (let i = 0; i < this.c.length; i++) {
      const grow = Math.abs(this.target[i]) > Math.abs(this.c[i]) && Math.sign(this.target[i]) === Math.sign(this.c[i] || this.target[i])
      this.c[i] = onePole(this.c[i], this.target[i], dt, grow ? 0.18 : 1.2, 1.2)
    }
  }                                            // silent → c held: the pattern is remembered
  this.updateDominance(dt)                     // ≥1.3× for ≥100 ms → snap: snapEnv = 1 (τ 0.30 s), event, rate limit 400 ms
  this.onsetPulse = Math.max(f.onset, this.onsetPulse * Math.exp(-dt / 0.09))
  this.scrambleEnv = Math.max(0, this.scrambleEnv - dt / this.scrambleDur)
  return this.pack()                           // top-8 by |c| into slots; kEff, norm, dirty flag
}
```

`pack()` fills `ModeDrive`:
* `slots: Float32Array(8×4)` with `coef = cᵢ/(Nᵢ·Σ|c|)`.
* `invKEff = Σ|c| / Σ|c|kᵢ`: the drift is normalised by the effective wavenumber, so pattern-formation speed stays similar across complexities.
* `drive = D`
* `kickGain = personality.kickGain·(1 + 0.8·onsetPulse)`
* `kappaGain = 1 + 0.8·snapEnv`
* `agitation = 0.35·ease(scrambleEnv)`
* `glowPulse = 0.3·snapEnv`
* `dirty`: the field is only re-rendered when some `|Δcoef| > 1e-3` or the shape changed.

**Bird switch (on `voicestart`):** `setBird(cal, personality, {transition: true})`. For 0.5 s the coefficients decay toward 0 (τ 0.35 s) instead of being held. `scramble(0.35, 0.45)` makes the old pattern melt into a haze, then the new bird's song forms its own pattern over about 1–1.5 s. Dominance is reset. The total feels like a breath, not a cut.

### C.9 Field pass (fragment shader into a 512² RGBA16F target: U, ∂U/∂x, ∂U/∂y)

```glsl
precision highp float;
#define MAX_SLOTS 8
#define LUT_W 1024
uniform sampler2D uLut;            // RG32F NEAREST: (R, dR/dr) per circle mode row
uniform vec4  uSlot[MAX_SLOTS];    // circle (coef, n, row, _)   square (coef, n, m, sign)  [sign=0 for n==m]
uniform int   uSlotCount, uShape;  // 0 circle, 1 square
uniform float uRot, uClampR;
varying vec2 vUv;

vec2 radial(int row, float r) {
  float x = clamp(r, 0.0, 1.0) * float(LUT_W - 1);
  int i0 = int(x); int i1 = min(i0 + 1, LUT_W - 1);
  return mix(texelFetch(uLut, ivec2(i0, row), 0).rg, texelFetch(uLut, ivec2(i1, row), 0).rg, x - float(i0));
}
void main() {
  vec2 p = vUv * 2.0 - 1.0; float u = 0.0; vec2 g = vec2(0.0);
  if (uShape == 0) {
    float r = max(length(p), 1e-3); vec2 er = p / r, et = vec2(-er.y, er.x); float th = atan(p.y, p.x) - uRot;
    for (int i = 0; i < MAX_SLOTS; i++) { if (i >= uSlotCount) break;
      vec4 s = uSlot[i]; vec2 R = radial(int(s.z), r); float c = cos(s.y * th), sn = sin(s.y * th);
      u += s.x * R.x * c;
      g += s.x * (R.y * c * er - s.y * R.x * sn / r * et);
    }
  } else {
    const float H = 1.5707963; vec2 a = (p + 1.0) * H;
    for (int i = 0; i < MAX_SLOTS; i++) { if (i >= uSlotCount) break;
      vec4 s = uSlot[i]; float n = s.y, m = s.z, sg = s.w;
      float cnx = cos(n*a.x), cmx = cos(m*a.x), cny = cos(n*a.y), cmy = cos(m*a.y);
      float dnx = -n*H*sin(n*a.x), dmx = -m*H*sin(m*a.x), dny = -n*H*sin(n*a.y), dmy = -m*H*sin(m*a.y);
      u += s.x * (cnx*cmy + sg*cmx*cny);
      g += s.x * vec2(dnx*cmy + sg*dmx*cny, cnx*dmy + sg*cmx*dny);
    }
  }
  if (uClampR > 0.0) {                                  // bolt flat zone (square)
    float r = length(p), a = 0.55 * uClampR, t = clamp((r - a) / (uClampR - a), 0.0, 1.0);
    float h = t*t*(3.0 - 2.0*t), dh = 6.0*t*(1.0 - t) / (uClampR - a);
    g = h * g + u * dh * p / max(r, 1e-4); u *= h;
  }
  gl_FragColor = vec4(u, g, 0.0);
}
```

* The target is `WebGLRenderTarget(512, 512, { type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false })`. Half float is filterable in core WebGL2.
* It is rendered with `FullScreenQuad` (`examples/jsm/postprocessing/Pass.js:138-191`).
* Cost at 512² with 8 slots: about 4M LUT fetches, well under 0.3 ms on desktop.

---

## D. Sand simulation (`src/cymatics/gl/SandSim.ts`)

### D.1 Quality tiers

| Tier | Grains (sim texture) | Field | Plate RT cap | DPR cap | Blur | Persistence |
|---|---|---|---|---|---|---|
| high | 262,144 (512×512) | 512² | 2048 | 2.5 | 2 levels | yes |
| medium | 131,072 (512×256) | 512² | 1536 | 2 | 2 levels | yes |
| low | 65,536 (256×256) | 256² | 1024 | 2 | 1 level | no |

**Auto-selection:**
* `matchMedia('(pointer: coarse)')` with a short screen side under 900 CSS px → low.
* Otherwise high when `renderer.capabilities.maxTextureSize ≥ 8192` and `navigator.hardwareConcurrency ≥ 8`.
* Otherwise medium.

**Governor:**
* If the frame-time EMA stays above 22 ms for 1.5 s, first halve `geometry.setDrawRange` (instant) and recompute exposure from the visible count. On the next bird switch, rebuild at the lower tier.
* Never upgrade automatically, to avoid oscillating.
* Reference attributes are generated in a shuffled order, so any drawRange prefix is a spatially uniform subset.

### D.2 State layout (GPUComputationRenderer: 2 variables plus 1 static texture)

| Texture | RGBA content |
|---|---|
| `texturePos` (variable) | x, y, alpha (fade-in, ≤0 while waiting to pour), — |
| `textureVel` (variable) | vx, vy, heat (recent kick energy, drives sparkle and streaks), — |
| `uProps` (static `DataTexture` RGBA32F) | θᵢ (threshold), sizeFactor ∈ [0.7, 1.4], brightness ∈ [0.75, 1.25], seed |

* `θᵢ = clamp(θ̄·exp(0.45·N(0,1)), 0.04, 0.35)`. A heavy fraction h of grains gets `θ×3`: crisp uses θ̄ = 0.06, h = 0.04; soft uses θ̄ = 0.08, h = 0.22.
* `GPUComputationRenderer.compute()` binds every dependency from `renderTargets[currentTextureIndex]` before writing `next` (`examples/jsm/misc/GPUComputationRenderer.js:260-295`, binding at :278). **Both variables run the same `stepGrain()` on the same inputs with the same PCG random stream**, keyed by `gl_FragCoord` and the substep counter. Their outputs are therefore bit-consistent: position writes P and velocity writes V. This also makes respawn decisions agree between the two passes, with no lagged Euler step.

### D.3 Dynamics: equations and validated constants

Per substep, with fixed `dt = 1/120 s` and `n = clamp(round(frameDt·120), 0, 4)` substeps per frame:

```
A   = D·|U(p)|                                     local amplitude (bilinear sample of field RT)
ex  = max(A − θᵢ, 0) + agitation                   excess over this grain's hop threshold
v  += −κ·κGain·D·2U·∇U·invKEff · (ex>0 ? 1 : creep) · dt      drift toward nodes (−∇U²) + sub-threshold creep
v  += σ·kickGain·ex·√dt · N₂(0,1)                  random hop (Brownian kick ∝ excess)
v  *= exp(−dt/τ);   |v| ≤ vmax;   if D<0.004 ∧ agitation=0 ∧ |v|<0.002 → v = 0   (freeze)
p  += v·dt;   heat = max(heat·e^(−dt/0.15), clamp(3·ex,0,1));   alpha = min(1, alpha + dt/0.35)
```

| Constant | Value | Why |
|---|---|---|
| κ (drift) | 12 | readable structure at 0.25 s, readable pattern at 0.6 s, crisp at 1.2–1.6 s (`m1.png`) |
| σ (kick) | 7 (crisp 8) | antinode grains reach an RMS speed of about 0.5 units/s |
| creep | 0.8 | **0.25 produced doubled parallel lines** (grains stall at both edges of the threshold band, `m2.png`). 0.8 gives single crisp lines (`m3.png`). Creep scales with D, so it stops in silence. |
| τ friction | 0.06 s | grains stop within about 0.2 s of the drive stopping, which is the freeze |
| vmax | 1.2 units/s | stability with streak length capped |
| D compression | `0.55 + 0.45·L^0.6` | at D = 0.45 lines are about 2× wider and fuzzy (`m3.png` panel b) |

### D.4 GLSL step (shared chunk, included in both compute shaders)

```glsl
uniform sampler2D uField, uProps;
uniform float uDt, uDrive, uAgit, uKappa, uKick, uCreep, uFric, uVMax, uInvK, uStep, uRimMode;  // uStep: substep counter (float, wraps at 2^24)
uniform int uShape;

uvec3 pcg3d(uvec3 v) { v = v * 1664525u + 1013904223u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;
                       v ^= v >> 16u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y; return v; }
vec3 rand3(float salt) { return vec3(pcg3d(uvec3(uvec2(gl_FragCoord.xy), uint(uStep + salt)))) * (1.0 / 4294967296.0); }
float plateSdf(vec2 p) { return uShape == 0 ? length(p) - 1.0 : max(abs(p.x), abs(p.y)) - 1.0; }

void stepGrain(inout vec4 P, inout vec4 V, vec4 G) {
  vec3 r = rand3(0.0);
  vec4 F = texture2D(uField, P.xy * 0.5 + 0.5);
  float U = F.x; vec2 gU = F.yz * uInvK;
  float ex = max(uDrive * abs(U) - G.x, 0.0) + uAgit;
  V.xy += -uKappa * uDrive * 2.0 * U * gU * (ex > 0.0 ? 1.0 : uCreep) * uDt;
  float rr = sqrt(-2.0 * log(max(r.x, 1e-7)));
  V.xy += uKick * ex * sqrt(uDt) * rr * vec2(cos(6.2831853 * r.y), sin(6.2831853 * r.y));
  V.xy *= exp(-uDt / uFric);
  float sp = length(V.xy); if (sp > uVMax) V.xy *= uVMax / sp;
  if (uDrive < 0.004 && uAgit <= 0.0 && sp < 0.002) V.xy = vec2(0.0);
  P.xy += V.xy * uDt;
  V.z = max(V.z * exp(-uDt / 0.15), clamp(3.0 * ex, 0.0, 1.0));
  P.z = min(1.0, P.z + uDt / 0.35);
  float d = plateSdf(P.xy);
  if (d > 0.0) {
    if (uRimMode > 0.5) {                               // rimmed plate (ref 2): reflect, restitution 0.3
      vec2 n = uShape == 0 ? normalize(P.xy) : (abs(P.x) > abs(P.y) ? vec2(sign(P.x), 0.0) : vec2(0.0, sign(P.y)));
      P.xy -= n * (d + 0.002); float vn = dot(V.xy, n); if (vn > 0.0) V.xy -= 1.3 * vn * n;
    } else {                                            // free edge (ref 1): grain falls off → sprinkled back elsewhere
      vec3 h = rand3(7919.0);
      P.xy = uShape == 0 ? sqrt(h.x) * 0.97 * vec2(cos(6.2831853*h.y), sin(6.2831853*h.y)) : (h.xy * 2.0 - 1.0) * 0.97;
      P.z = 0.0; V = vec4(0.0, 0.0, 0.6, 0.0);         // fades in over 0.35 s, lands with a little sparkle
    }
  }
}
// velocity shader: vec2 uv = gl_FragCoord.xy / resolution.xy; P,V,G = texture2D(texturePos|textureVel|uProps, uv); stepGrain(P,V,G); gl_FragColor = V;
// position shader: identical, gl_FragColor = P;
```

`resolution` and the `texturePos`/`textureVel` sampler declarations are injected by `GPUComputationRenderer`: `addResolutionDefine`, and `init()` prepends `uniform sampler2D <dep>` (`GPUComputationRenderer.js:189-251`, prepend at :243, binding at :278). Respawning about 1.6 % of grains per second on the free edge recreates reference 1's sparse scatter of loose grains.

### D.5 Setup (verified API)

```ts
const gpu = new GPUComputationRenderer(W, H, renderer)                                // misc/GPUComputationRenderer.js:113
if (!renderer.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType) // :135; ext requested at WebGLExtensions.js:33
const pos0 = gpu.createTexture(), vel0 = gpu.createTexture()                         // :424 (RGBA FloatType DataTexture)
seedCoat(pos0.image.data, shape)                                                     // stratified + jitter (D.6)
const posVar = gpu.addVariable('texturePos', POS_FRAG, pos0)                         // :150
const velVar = gpu.addVariable('textureVel', VEL_FRAG, vel0)
gpu.setVariableDependencies(posVar, [posVar, velVar]); gpu.setVariableDependencies(velVar, [posVar, velVar])  // :178
Object.assign(posVar.material.uniforms, sharedUniforms); Object.assign(velVar.material.uniforms, sharedUniforms) // same objects → set once
const err = gpu.init(); if (err) throw new Error(err)                                // :189 returns string|null
// per substep: sharedUniforms.uStep.value = (step++ % 16777216); gpu.compute()       // :260
// read:  gpu.getCurrentRenderTarget(posVar).texture                                  // :299
```

* Half-float fallback is a degraded mode. Position precision near |x| = 1 is about 5e-4 (about 0.2 px at 800 px), so slow creep steps get lost and lines stay a little thicker. It is acceptable.
* If neither `EXT_color_buffer_float` nor `EXT_color_buffer_half_float` is present, use the 2D fallback (E.8).

### D.6 Initial state, pour, transitions, sleep

* **Coat.** Grains sit on a √N×√N stratified jittered grid. For the circle, the square grid is mapped to the disk with the Shirley–Chiu concentric mapping, which keeps the stratification. The result is an even coat with no clumps. Alpha is 1.
* **Pour (first load only):** `alpha = −delayᵢ/0.35` with `delayᵢ = 1.2·seedᵢ`, so grains appear over 1.2 s, each landing with `heat = 0.5`. Reduced motion skips this and starts from the coat.
* **Bird switch:** a scramble (agitation 0.35 over 0.45 s) followed by the new pattern (C.8). Reduced motion: no scramble, just a slower direct morph.
* **Shape switch (circle ↔ square)** takes 0.8 s:
  * The composite morphs the plate mask between the two SDFs: `mix(circleSdf, boxSdf, t)`.
  * The field switches at once to the new table, with the bird's rank for that shape.
  * `uShape` switches. Grains that are now outside the plate respawn (sprinkle).
  * Agitation 0.4 lets the sand flow into the new geometry.
  * Rim mode and look preset switch together (crisp ↔ soft).
* **Sleep.** When `D < 0.004`, agitation is 0 and no transition has run for 0.8 s, stop calling `gpu.compute()`. The sand is frozen anyway. The render loop also stops (E.10), and the canvas keeps its last frame.

---

## E. Rendering (`src/cymatics/gl/`)

### E.1 Backend choice (verified against r186)

**Chosen: option (2), `WebGLRenderer` + `GPUComputationRenderer` + `ShaderMaterial` points.**

| Factor | (1) `WebGPURenderer` + TSL compute | (2) WebGL2 GPGPU, **chosen** |
|---|---|---|
| Bundle (measured, `bun build --minify`, gzip) | 249 KB (WebGPURenderer, node materials, TSL) | **138 KB** (WebGLRenderer, GPUComputationRenderer, EffectComposer, UnrealBloomPass) |
| Initialisation | async `await renderer.init()` (`src/renderers/common/Renderer.js:784`). `compute()` before init only warns and falls back to `computeAsync` (`:2883`, `:2992`), which is awkward under React StrictMode. | synchronous constructor. Throws when context creation fails (`WebGLRenderer.js:417-421`), so feature detection is a simple try/catch. |
| Compute on the WebGL2 fallback | **Works**, via transform feedback: `WebGLBackend.compute()` enables `RASTERIZER_DISCARD`, `beginTransformFeedback(gl.POINTS)` and `drawArrays(Instanced)` (`src/renderers/webgl-fallback/WebGLBackend.js:918-1000`). The count must be a single number; arrays and indirect dispatch only warn (`:955-967`). Storage-buffer reads at other indices go through PBO textures that are copied after every dispatch (`webgl-fallback/nodes/GLSLNodeBuilder.js:380-563`). This is a second execution path with its own performance to test. | one path everywhere: fragment-shader ping-pong, the most battle-tested GPGPU route in WebGL2 |
| Points | `PointsNodeMaterial` sprite path (`src/materials/nodes/PointsNodeMaterial.js:90-173`). Reading storage in the vertex stage needs `requiredLimits: { maxStorageBuffersInVertexStage: 1 }` (r186 `examples/webgpu_compute_points.html:131`), which some compat or mobile adapters lack. The alternative is `.toAttribute()` (`BufferAttributeNode.js:443`, used in `webgpu_compute_particles.html:134`). | `gl_PointSize` plus `gl_PointCoord`, with full control |
| Device loss | `renderer.onDeviceLost` (`Renderer.js:595, 1348`) means a full renderer rebuild | `webglcontextlost`/`webglcontextrestored` are handled by three (`WebGLRenderer.js:403-404, 1113-1143`); only our passes are rebuilt |
| Needed scale | ≤262k grains, no atomics needed (density is accumulated with additive blending) | sufficient |

The WebGPU route would pay off beyond about 1M grains, or for atomics-based splatting. `PlateSimulation` is backend-agnostic so a TSL implementation can replace `SandSim` later (E.12).

Also avoid importing `three/addons/capabilities/WebGPU.js`: it uses top-level `await navigator.gpu.requestAdapter()` (`examples/jsm/capabilities/WebGPU.js:3-5`).

### E.2 Render graph and targets (per frame)

```
FieldPass (if dirty) ─► fieldRT 512² RGBA16F linear
SandSim ×n substeps ─► pos/vel 512² RGBA32F nearest (ping-pong)
GrainPass ─► densityRT S² RGBA16F  (R = mass, G = airborne mass)   S = plate diameter in device px (≤ cap)
   ├─ crisp: clear 0                soft: "fade quad" dst *= p, p = exp(−frameDt/0.05)   (afterimage, no extra RT)
   └─ Points: additive mass splats
CoveragePass ─► cov¼ (S/4)²  = 1−exp(−e·H) (downsample) → blurH → blurV  (σ ≈ 2 texels ≈ 8 px)  = B1
             └► cov⅛ (S/8)²  → blurH → blurV = B2 (wide halo; high/medium only)
Composite ─► canvas (plane mesh, optional tilt): plate + sand + glow + shadow + ridge light + rim/bolt + dither
```

* `renderer.autoClear = false`. Each target is cleared explicitly with `setClearColor(0x000000, 0)`.
* Density targets use `{ type: HalfFloatType, depthBuffer: false, generateMipmaps: false }` (defaults: `src/core/RenderTarget.js:59-62`).
* `HalfFloatType` blending is allowed in WebGL2 with `EXT_color_buffer_float` or `EXT_color_buffer_half_float`; three requests both (`WebGLExtensions.js:33-36`). Blending into 32F targets would need `EXT_float_blend`, which is avoided.
* Fade quad: `CustomBlending`, `blendSrc = ZeroFactor`, `blendDst = SrcAlphaFactor`, output alpha `p`. Grain mass is multiplied by `(1−p)`, so a frozen pattern converges to the same brightness.
* Memory at S = 1200: density 11.5 MB, blur targets under 2 MB, sim 4×4 MB plus props 4 MB.

### E.3 Grain splats

The geometry is a `BufferGeometry` whose `position` attribute holds `(u, v, 0)` texel-centre references, shuffled. Three derives the draw count from `position.count` (`WebGLRenderer.js:1238-1246`), so this attribute is required. Set `points.frustumCulled = false`.

The material is a `ShaderMaterial` with `blending: AdditiveBlending, premultipliedAlpha: true`, which three maps to `gl.blendFunc(ONE, ONE)` (`WebGLState.js:643-653`). Set `depthTest: false, depthWrite: false, transparent: true`.

```glsl
// vertex
uniform sampler2D uPos, uVel, uProps; uniform float uExtent, uPxPerUnit, uGrainPx, uShutter, uStreak, uSparkle, uTime;
varying vec2 vDir; varying float vLen, vSize, vMass, vAir;
float h11(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
void main() {
  vec4 P = texture2D(uPos, position.xy), V = texture2D(uVel, position.xy), G = texture2D(uProps, position.xy);
  vec2 vpx = V.xy * uPxPerUnit;
  float len = min(length(vpx) * uShutter * uStreak, 12.0);           // shutter 1/60 s → 0.5 u/s at 600 px/u = 5 px dash
  float size = max(uGrainPx * G.y, 1.0);
  gl_PointSize = size + len + 1.0;
  vDir = len > 0.05 ? normalize(vpx) : vec2(1.0, 0.0); vLen = len; vSize = size; vAir = V.z;
  float twinkle = mix(1.0, 0.5 + h11(G.w * 917.0 + floor(uTime * 24.0)), uSparkle * V.z);   // only airborne grains twinkle
  vMass = clamp(P.z, 0.0, 1.0) * G.z * twinkle;
  gl_Position = vec4(P.xy / uExtent, 0.0, 1.0);                       // plate → densityRT clip space (extent 1.06)
}
// fragment: velocity-aligned capsule, mass-normalised
void main() {
  float box = vSize + vLen + 1.0;
  vec2 q = (gl_PointCoord - 0.5) * box; q.y = -q.y;                  // gl_PointCoord origin is top-left
  vec2 d = vec2(dot(q, vDir), dot(q, vec2(-vDir.y, vDir.x)));
  d.x = max(abs(d.x) - 0.5 * vLen, 0.0);
  float w = 1.0 - smoothstep(0.6, 1.0, length(d) / (0.5 * vSize));
  if (w <= 0.0) discard;
  float m = vMass * w / (0.63 * vSize * vSize + vSize * vLen);        // ≈ ∫w → every grain deposits ~its mass
  gl_FragColor = vec4(m, m * vAir, 0.0, 1.0);
}
```

* `uGrainPx = dpr × grainCss`, with crisp 0.75 and soft 0.9 CSS px, and never below 1 device px.
* Settled grains never twinkle, so a frozen pattern is perfectly still.

### E.4 Composite: the plate look recipe

**Exposure normalisation.** The look is independent of resolution and grain count:

`e = −ln(1 − coat) / ρ₀`, where `ρ₀ = N_visible / A_plate_px`

`coat` is the coverage of an untouched uniform layer: crisp 0.18, soft 0.26. For example, 262k grains on a 1200 px disk give ρ₀ = 0.23 and e = 0.86. A single isolated grain lands at about 0.4 coverage (a visible speck), and lines with 10 or more grains per px saturate to near-white.

```glsl
#include <common>
#include <dithering_pars_fragment>
uniform sampler2D uDensity, uB1, uB2; uniform vec2 uTexel1;  // B1 texel size
uniform float uExposure, uExtent, uPxPerUnit, uGlowA, uGlowB, uGlowPulse, uShadow, uRidge, uSheen, uAirGain, uShapeT, uRimW, uBoltR;
uniform vec3 uPlateIn, uPlateOut, uSand, uAirTint, uGlowTint, uRimColor; uniform vec2 uLight;   // uLight = normalize(-0.55, 0.62)
varying vec2 vUv;
void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uExtent;
  float sdf = mix(length(p) - 1.0, max(abs(p.x), abs(p.y)) - 1.0, uShapeT);   // shape morph
  float aa = 1.5 / uPxPerUnit, inside = 1.0 - smoothstep(-aa, 0.0, sdf);
  vec2 D = texture2D(uDensity, vUv).rg;
  float sand = 1.0 - exp(-uExposure * D.r), air = 1.0 - exp(-uExposure * D.g);
  float b1 = texture2D(uB1, vUv).r, b2 = texture2D(uB2, vUv).r;
  // plate: radial falloff + static diagonal sheen + pixel-locked-to-plate micro-noise + contact shadow
  vec3 plate = mix(uPlateIn, uPlateOut, clamp(dot(p, p), 0.0, 1.0));
  plate += uSheen * exp(-pow((dot(p, vec2(0.7071)) + 0.6) / 0.5, 2.0));
  plate *= 1.0 + 0.012 * (rand(floor(vUv / uTexel1 * 4.0)) - 0.5);
  plate *= 1.0 - uShadow * texture2D(uB1, vUv - uLight * uTexel1 * 0.75).r;    // ≈3 px offset at full res
  // ridge lighting: normal from blurred coverage
  float gx = texture2D(uB1, vUv + vec2(uTexel1.x, 0)).r - texture2D(uB1, vUv - vec2(uTexel1.x, 0)).r;
  float gy = texture2D(uB1, vUv + vec2(0, uTexel1.y)).r - texture2D(uB1, vUv - vec2(0, uTexel1.y)).r;
  vec3 n = normalize(vec3(-gx * 6.0, -gy * 6.0, 1.0));
  float lam = clamp(dot(n, normalize(vec3(uLight, 0.62))), 0.0, 1.5);
  vec3 col = mix(plate, uSand * (0.82 + uRidge * lam), sand);
  col += uAirTint * air * uAirGain;
  col += uGlowTint * (uGlowA * b1 + uGlowB * b2) * 0.5 * (1.0 + uGlowPulse) * smoothstep(0.04, -0.02, sdf); // glow masked to plate
  col *= inside;
  // circle: bone rim ring with 1 px dark gap + soft outer halo (alpha), square: 1 px bevel highlight on top/left edges
  // square: bolt = analytic sphere (r = uBoltR): base 0.35·nz, specular pow(dot(reflect, light), 40)·0.9
  gl_FragColor = vec4(col, /* plate+rim+halo coverage, premultiplied */ 1.0);
  #include <colorspace_fragment>     // linearToOutputTexel → sRGB canvas (ShaderChunk/colorspace_fragment.glsl.js)
  #include <dithering_fragment>      // material.dithering = true → #define DITHERING (WebGLProgram.js:778)
}
```

**Presets** (`looks.ts`; all colours linear). These were validated in `m5.png`. An earlier pass with a plate base around 0.03 linear read as grey (`m4.png`); the references need about 0.004–0.007.

| Parameter | `crisp` (square, ref 1) | `soft` (circle, ref 2) |
|---|---|---|
| plate centre → edge | (0.0062, 0.0062, 0.0064) → (0.0040, 0.0040, 0.0042) ≈ #141414 → #0d0d0d | (0.0070, 0.0068, 0.0076) → (0.0045, 0.0044, 0.0050) |
| sheen | 0.004 | 0.005 |
| sand / airborne tint | (0.92, 0.90, 0.86) / (1.0, 0.98, 0.94) | (0.90, 0.89, 0.86) / same |
| coat, grain size (CSS px) | 0.18, 0.75 | 0.26, 0.90 |
| glow A / B, tint | 0.14 / 0.06, (0.95, 0.92, 0.86) | 0.25 / 0.12, same (+ ≤8 % bird accent) |
| shadow, ridge | 0.35, 0.25 | 0.30, 0.20 |
| streaks, sparkle, airGain | 1.0, 1.0, 0.25 | 0.6, 0.7, 0.20 |
| persistence τ | 0 (clear) | 0.05 s |
| θ̄, heavy fraction, σ | 0.06, 0.04, 8 | 0.08, 0.22, 7 |
| edge | free (spill → sprinkle), 1 px bevel | rim lip (reflect). Ring at r ∈ [1.006, 1.024], colour 0.75 linear (#e1e0dc). Outer halo alpha falloff to r = 1.07. |
| bolt | r = 0.03, flat zone 0.12 | none |

The canvas uses `alpha: true` and outputs premultiplied colour. The plate with its halo can then sit over the bird photo on mobile, as in reference 2, or over the dark column on desktop.

### E.5 Crisp at high DPR, and resize

* Size the backing store exactly. Use `ResizeObserver` with `{ box: 'device-pixel-content-box' }` where supported (Chromium and Firefox) and take `devicePixelContentBoxSize`. Otherwise use `round(cssSize × min(devicePixelRatio, tierDprCap))`. Call `renderer.setPixelRatio(1)` and `renderer.setSize(w, h, false)`, passing device pixels and leaving the CSS size alone (`WebGLRenderer.js:640, 671`).
* Plate RT `S` = plate diameter in device px, clamped to the tier cap. At zero tilt the composite samples it 1:1.
* Grains are at least 1 device px with an analytic soft edge, so `antialias: false` (no MSAA). Dithering removes banding in the dark gradients.
* On resize, debounce 100 ms, then reallocate density and blur targets and recompute `uPxPerUnit`, `uGrainPx` and exposure. Simulation state is in plate units and is untouched, so the pattern survives the resize.

### E.6 Tilt, lighting, bloom

* **Tilt.** The composite draws on a `PlaneGeometry(2·ext, 2·ext)` seen by a `PerspectiveCamera(15°)`. Rotation follows the pointer over the canvas, at most 3°, using a critically damped spring (ω = 7 rad/s), and returns to neutral when the pointer leaves. The light direction and sheen are fixed in plate space, so they move with the plate and read as a real surface. Disabled for coarse pointers and reduced motion. There is **no idle drift**: a held pattern must look still.
* **Bloom.** Use the custom B1/B2 glow above, not `UnrealBloomPass`. It is cheaper and is masked to the plate. `UnrealBloomPass(resolution, strength, radius, threshold)` (`examples/jsm/postprocessing/UnrealBloomPass.js:46`) is a drop-in alternative via `EffectComposer` (half-float targets by default, `EffectComposer.js:69`) if a designer wants it.
* **Snap pulse.** `uGlowPulse = 0.3·snapEnv`. That is about a +3–5 % luminance change, rate-limited to 400 ms.

### E.7 Reduced motion and photosensitivity

`prefers-reduced-motion: reduce`, or the `reducedMotion` prop:
* streaks, sparkle and tilt are off
* the pour animation is off (start from the coat)
* the scramble becomes a direct morph
* σ ×0.6
* snap pulses are off

Pattern formation stays, because it *is* the content. It stops with the Play/Pause control, which satisfies "pause, stop, hide" (WCAG 2.2.2).

The plate never changes whole-plate luminance by more than 10 % faster than 3 Hz (WCAG 2.3.1). Twinkle is confined to small, sparse grains.

### E.8 Fallbacks

* **No WebGL2**, i.e. `WebGL.isWebGL2Available()` returns false (`examples/jsm/capabilities/WebGL.js:14`) or the renderer constructor throws. Use **`StaticPlate2D`**: a Canvas2D still life driven by the *same* ModeBank.
  * On every snap, the CPU field from `cpuReference.ts` is evaluated at 256².
  * About 20k dots are drawn by rejection sampling from `p ∝ exp(−(U/0.06)²) + 0.02`, in the same palette.
  * Images crossfade over 600 ms using CSS opacity.
  * Audio is unaffected.
* **No float colour buffer at all:** same 2D fallback.
* **Too slow:** tiers plus the governor (D.1).

### E.9 Context loss

1. On `webglcontextlost`: three already calls `preventDefault()` so the context can be restored (`WebGLRenderer.js:1113-1121`). Stop the loop and set status to `context-lost`.
2. On `webglcontextrestored`: three re-initialises GL state (`:1123-1143`). Data textures re-upload from their retained `image.data` (keep the LUT and props arrays alive). **Render-target contents, which hold the sand state, are gone.** Dispose and rebuild `SandSim` and the passes, reseed the coat and restart the loop. ModeBank state survives, so the pattern re-forms within about 1 s.
3. If no restore arrives within 3 s, switch to `StaticPlate2D`.
4. A debug toggle exercises this path with `renderer.forceContextLoss()` and `forceContextRestore()` (`:607-625`).

### E.10 Pausing when offscreen, hidden or idle

The loop runs (`renderer.setAnimationLoop(cb)`, `WebGLRenderer.js:1609`) only when all of these hold:
* the canvas is intersecting (`IntersectionObserver`, threshold 0.01)
* `!document.hidden`
* at least one of: active drive, a settle window (0.8 s after D < 0.004), a transition or pour, or a moving tilt spring

Otherwise call `setAnimationLoop(null)`. The canvas keeps its last presented frame. Wake-ups: a `voicestart` or `state` event, resize, a pointer entering, a shape change.

### E.11 Disposal on unmount (in order)

1. `setAnimationLoop(null)`
2. disconnect the ResizeObserver and IntersectionObserver; remove the context-loss and pointer listeners
3. `gpu.dispose()`, which also disposes initial textures (`GPUComputationRenderer.js:321-345`)
4. dispose the field, density and blur targets, all `ShaderMaterial`s, the points geometry, the LUT and props `DataTexture`s, and the `FullScreenQuad`s. They share one module-level triangle geometry (`Pass.js:106-123`); disposing it is harmless because it re-uploads lazily.
5. `renderer.dispose()` (`WebGLRenderer.js:1086`), then `renderer.forceContextLoss()` to release GPU memory immediately. iOS caps the number of live contexts.

The `AudioEngine` is not disposed here; it is a separate singleton (A.8).

### E.12 Future WebGPU/TSL backend (sketch; APIs verified)

```ts
import { WebGPURenderer, PointsNodeMaterial } from 'three/webgpu'
import { Fn, instancedArray, instanceIndex, uniform, texture } from 'three/tsl'
const pos = instancedArray(N, 'vec4'), vel = instancedArray(N, 'vec4')     // src/nodes/accessors/Arrays.js:47
const step = Fn(() => { const P = pos.element(instanceIndex), V = vel.element(instanceIndex) /* same math as D.4 */ })().compute(N) // ComputeNode.js:294
const renderer = new WebGPURenderer({ antialias: false })                  // falls back to WebGLBackend via getFallback (WebGPURenderer.js:57-75)
await renderer.init()                                                      // Renderer.js:784
renderer.compute(step)                                                     // single pass, no duplicated step function
material.positionNode = pos.toAttribute()                                   // avoids vertex-stage storage limits
```

---

## F. Modules, interfaces, data flow, tests

### F.1 File layout

```
src/audio/
  AudioEngine.ts            singleton: context, unlock, voices, crossfade, pause, volume, visibility, clock
  iosAudioSession.ts        audioSession.type='playback' | silent <audio> keep-alive + MediaSession
  loopPrep.ts               pure: findContentBounds, seamJump, bakeSeamCrossfade
  crossfade.ts              pure: powerCurve, currentFadeGain
  lru.ts                    tiny LRU
  analysis/
    fft.ts                  pure radix-2 complex FFT + real wrapper, Hann
    features.ts             pure: pickPeaks, bandPower, centroid, tonality, flux, onset
    smoothing.ts            pure: onePole, Hold, Hysteresis
    FeatureTrack.ts         pure: build(pcm, sr, band, loop) + sample()
    featureTrack.worker.ts  wraps FeatureTrack.build
    LiveAnalyzer.ts         AnalyserNode → features (same pure fns)
    SongAnalyzer.ts         picks track | live, fills SongFeatures
  types.ts
src/cymatics/
  math/ bessel.ts radialLut.ts modeTable.ts calibration.ts response.ts ModeBank.ts cpuReference.ts   (all pure)
  gl/   CymaticsRenderer.ts FieldPass.ts SandSim.ts GrainPass.ts PostPass.ts quality.ts
        shaders/{field,grainStep,grainPos,grainVel,grains,coverage,blur,composite}.glsl.ts
  fallback/StaticPlate2D.ts
  looks.ts  telemetry.ts  CymaticsView.tsx  SongRuler.tsx  PlatePoster.tsx  types.ts
```

GLSL constants (`MAX_SLOTS`, `LUT_W`) are injected from TS through `material.defines`, so TS and GLSL can never disagree.

### F.2 Public interfaces

```ts
// audio/types.ts
export interface SongBand { p10: number; p50: number; p90: number }
export interface BirdSongAsset { id: string; src: string; bandHz: SongBand; peakHz: number; durationSec?: number; fallbackSrc?: string }
export type AudioEngineState = 'idle' | 'locked' | 'loading' | 'playing' | 'paused' | 'interrupted' | 'error'
export type AudioEngineEvent =
  | { type: 'state'; state: AudioEngineState } | { type: 'loading' | 'loaded'; birdId: string }
  | { type: 'voicestart'; birdId: string; startedAt: number; loopDur: number }
  | { type: 'featuretrack'; birdId: string } | { type: 'needs-gesture' } | { type: 'error'; birdId?: string; error: Error }
export interface SongClock { birdId: string; positionSec: number; loopDurationSec: number; running: boolean }
export interface AudioEngine {
  readonly state: AudioEngineState
  unlock(): Promise<void>                                   // call synchronously in a gesture handler
  select(a: BirdSongAsset, o?: { crossfadeSec?: number }): Promise<'started' | 'superseded' | 'failed'>
  prefetch(a: readonly BirdSongAsset[]): void
  pause(): Promise<void>; resume(): Promise<void>
  setVolume(v: number): void; setMuted(m: boolean): void
  readClock(nowPerfMs: number): SongClock | null
  getAnalyser(): AnalyserNode | null
  getFeatureTrack(birdId: string): FeatureTrack | null
  subscribe(fn: (e: AudioEngineEvent) => void): () => void
  acquire(): void; release(): void; dispose(): Promise<void>
}

// audio/analysis
export interface SongFeatures {
  t: number; gate: boolean; loudness: number
  peakHz: Float32Array; peakAmp: Float32Array; peakCount: number      // K = 3, preallocated
  centroidHz: number; tonality: number; onset: number; source: 'track' | 'live'
}
export interface BirdPersonality { tonality: number; onsetRate: number; pitchP10: number; pitchP90: number; gamma: number; kickGain: number }
export interface FeatureTrack {
  birdId: string; hopSec: number; frames: number; loopStartSec: number; loopDurSec: number; personality: BirdPersonality
  sample(posSec: number, prevPosSec: number, out: SongFeatures): void
}
export interface SongAnalyzer { setBird(a: BirdSongAsset, track: FeatureTrack | null): void; read(c: SongClock | null, dt: number, out: SongFeatures): SongFeatures }

// cymatics/types.ts
export type PlateShape = 'circle' | 'square'
export type LookName = 'crisp' | 'soft'
export interface PlateMode { index: number; shape: PlateShape; n: number; m: number; s: number; sign: -1 | 0 | 1
  k: number; lambda: number; Q: number; weight: number; coupling: number; norm: number; lutRow: number; symClass: number; label: string }
export interface ModeTable { shape: PlateShape; modes: readonly PlateMode[]; lambda: Float64Array; logLambda: Float64Array
  Q: Float64Array; weight: Float32Array; coupling: Float32Array; lut?: { data: Float32Array; width: 1024; height: number } }
export interface BirdCalibration { birdId: string; peakHz: number; signatureRank: number; halfWindowRanks: number; halfSpanOct: number; rotation: number }
export interface ModeDrive { slots: Float32Array; slotCount: number; invKEff: number; drive: number; agitation: number
  kickGain: number; kappaGain: number; glowPulse: number; dominant: number; dirty: boolean }
export interface SnapEvent { modeIndex: number; label: string; birdHz: number; at: number }
export interface ModeBank {
  setShape(s: PlateShape): void
  setBird(c: BirdCalibration, p: BirdPersonality, o: { transition: boolean }): void
  update(f: SongFeatures, dt: number, playing: boolean): ModeDrive
  scramble(strength: number, durationSec: number): void
  onSnap(fn: (e: SnapEvent) => void): () => void
  readonly coefficients: Float32Array
}
export interface PlateSimulation {
  readonly grainCount: number
  setShape(s: PlateShape, look: LookPreset, transitionSec: number): void
  setDrive(d: ModeDrive): void
  step(frameDt: number): void                       // field pass if dirty + n substeps
  reseed(mode: 'coat' | 'pour'): void
  readonly textures: { pos: THREE.Texture; vel: THREE.Texture; props: THREE.Texture; field: THREE.Texture }
  dispose(): void
}
export type CymaticsStatus = 'initialising' | 'ready' | 'fallback-2d' | 'context-lost' | 'error'
export interface CymaticsViewProps {
  engine: AudioEngine
  bird: (BirdSongAsset & { name: string }) | null
  allBirds: readonly BirdSongAsset[]                // needed for rank-spread calibration
  playing: boolean
  shape?: PlateShape                                // default 'circle'
  look?: LookName | 'auto'                          // auto: circle→soft, square→crisp
  quality?: 'auto' | 'low' | 'medium' | 'high'
  reducedMotion?: boolean                           // default: matchMedia('(prefers-reduced-motion: reduce)')
  className?: string
  onStatus?(s: CymaticsStatus): void
  onSnap?(e: SnapEvent): void
}
```

### F.3 Data flow per animation frame (no allocations)

```
setAnimationLoop(t):  dt = clamp((t − tPrev)/1000, 0, 0.1)
 1  clock = engine.readClock(t)                                   output-latency aware loop position
 2  f     = analyzer.read(clock, dt, featScratch)                 FeatureTrack.sample | LiveAnalyzer
 3  drive = modeBank.update(f, dt, playing)                       calibrate → Lorentzian → sparsify/sharpen → smooth → snap
 4  sim.setDrive(drive); sim.step(dt)                             FieldPass if dirty; n = round(dt·120) ≤ 4 GPGPU substeps
 5  view.render(dt)                                               grains → coverage/blur → composite (+ tilt spring)
 6  telemetry.publish({ dominant, birdHz, D }) at ≤15 Hz          read via useSyncExternalStore (SongRuler, aria-label)
 7  idle check → setAnimationLoop(null) when asleep
```

React never re-renders per frame. Props changes (`bird`, `shape`, `playing`) call imperative methods on `CymaticsRenderer` from `useEffect`.

**Legibility UI hooks** (optional, cheap):
* `SongRuler`: a thin Canvas2D strip under the plate. The x-axis is bird log-Hz from p10/1.6 to 1.6·p90. Each mode's resonance is drawn as a tick at `birdToRank⁻¹`. A glowing dot glides at the current peak, and the dominant tick lights up on snap. It makes the flow Bird → Song → Plate visible.
* The canvas has `role="img"` and an `aria-label` that updates on snap: "Sand pattern: 4 nodal diameters, 1 ring — Gray Antwren".

### F.4 Mounting in TanStack Start (client-only)

```tsx
// src/routes/index.tsx
import { ClientOnly } from '@tanstack/react-router'           // exported in @tanstack/react-router@1.170.46 (dist/esm/index.d.ts:8)
const CymaticsView = lazy(() => import('../cymatics/CymaticsView'))   // three.js stays out of the SSR bundle
<ClientOnly fallback={<PlatePoster shape={shape} />}>
  <Suspense fallback={<PlatePoster shape={shape} />}><CymaticsView {...props} /></Suspense>
</ClientOnly>
```

* `CymaticsView.tsx`, `AudioEngine.ts` and `CymaticsRenderer.ts` start with `import '@tanstack/react-start/client-only'`. This marker exists in `@tanstack/react-start@1.169.4` (`./client-only` export, `dist/esm/client-only.d.ts`). The import-protection plugin then flags any accidental server import.
* `PlatePoster` is an SSR-safe SVG of the empty plate (same rim, colours and size), so there is no layout shift.
* Audio files are served as hashed static assets with `Cache-Control: public, max-age=31536000, immutable` and `Content-Type: audio/mp4`.

### F.5 Testing (Vitest, `environment: 'node'`, pure modules only)

| File | Asserts |
|---|---|
| `bessel.test.ts` | J and J′ against SciPy to 1e-12: J₀(1)=0.7651976865579666, J₀′(1)=−0.44005058574493355, J₅(10)=−0.2340615281867936, J₅′(10)=−0.10257192200861184, J₁₂(30)=0.14825335109966, J₃(0.1)=2.0820315754756272e-5, J₂₀(15)=0.007360234079223488. Recurrence identity `J_{n−1}+J_{n+1} = (2n/x)J_n` holds on 1000 random points. x = 0 edge case. Zeros of J′: n0 = [3.831705970207512, 7.015586669815619, 10.173468135062723], n1 = [1.8411837813406593, 5.331442773525033, 8.536316366346284], n4 = [5.317553126083995, 9.282396285241614], n12 = [13.878843069697275], to 1e-9. |
| `radialLut.test.ts` | Each row has max\|R\| = 1. G matches a central finite difference of R within 1e-3. A JS emulation of the GPU's texelFetch-and-lerp is within 1e-4 of exact at 10k random r. Neumann edge: \|G(1)\| < 1e-3. |
| `modeTable.test.ts` | Each table has 48 modes with strictly increasing λ after detune. Circle excludes (1,1) and every mode with r₀ > 0.42; inline snapshot of the first 12 (n,s): (2,1),(0,1),(3,1),(4,1),(1,2),(2,2),(0,2),(3,2),(1,3),(4,2),(2,3),(0,3). Square excludes (1,1+); (0,5−) and (3,4−) are not equal in λ; coupling is 1 for (0,2+) and 0.5 for (1,2±). Q is within [6, 150]. |
| `calibration.test.ts` | Signature ranks are monotonic in peakHz, at least `sep` apart, within [4, 40], and deterministic on ties. `birdToRank(peakHz) = signature`. `birdToRank(p90) ≈ signature + W·1.6·tanh(1/1.6)`. Bounded for 20 kHz input. |
| `response.test.ts` | \|H\| peaks at fᵢ, the −3 dB width is fᵢ/Q (±5 %), and the sign flips across resonance. Sparsify keeps ≤6 with Σ\|c\| = 1. Harmonic suppression drops 2f. The incompatible-class factor is applied. |
| `ModeBank.test.ts` | onePole is dt-invariant (1×16 ms equals 2×8 ms to 1e-6). Coefficients are held when the gate is closed. Dominance switches only after 1.3× for 100 ms; snaps are rate-limited. D reaches below 0.004 within 0.8 s of silence. `playing=false` freezes. A transition decays and scrambles. |
| `features.test.ts`, `fft.test.ts` | FFT matches a naive DFT. A 3 kHz sine gives a peak within 2 Hz, tonality above 0.9 and centroid near 3 kHz. White noise gives tonality below 0.15. A tone burst gives an onset within one hop. A stationary 5 kHz "insect" drone is absorbed by the floor and yields no peak. |
| `loopPrep.test.ts`, `crossfade.test.ts` | Trims 2112 zero samples of priming and the end padding. After the seam crossfade the max jump is under 4× the local diff RMS. `powerCurve` has from²+to²-consistent power and is monotonic. `currentFadeGain` is correct mid-fade. |
| `cpuReference.test.ts` | A JS port of `stepGrain` (also used by the 2D fallback): 2k grains, single mode, D = 0.9, 240 steps → mean \|U\| at grain positions drops from about 0.5 to under 0.08. With D = 0, positions are unchanged after 60 steps once settled. Every grain stays inside the plate. Respawns are uniform (χ² test). |
| `AudioEngine.test.ts` | A fake `AudioContext` with a manual clock: a superseded `select` returns 'superseded' and starts no voice. A stale decode is cached. Overlapping crossfades never schedule overlapping curves (the fake throws like Chrome). Hidden → suspend, visible → resume. |

Outside Vitest: a Playwright smoke test at `/?debug=cymatics&seed=1&t=12.0` with a fixed FeatureTrack time. It checks for no GL errors and a non-empty `renderer.info`, then takes a tolerant screenshot diff per preset. The same debug overlay shows the field texture, active slots, tier and FPS, and has sliders for the look constants.

---

## G. Risks and mitigations

| Risk | Mitigation |
|---|---|
| AAC priming or padding makes an audible gap or click at the loop seam | `prepareLoop`: trim silence runs, use manifest duration, detect the seam jump, bake a 12 ms equal-power crossfade. Unit-tested. |
| iOS silent switch mutes Web Audio; `interrupted` state | `navigator.audioSession.type='playback'`, else a silent `<audio>` keep-alive. `statechange` → "Tap to resume". |
| Autoplay blocked or wrong gesture type | Unlock only inside a `click` or `keydown` handler; nothing is awaited before `resume()`. An explicit "Tap to listen". |
| Rapid picker scrolling causes stale audio, overlaps or clicks | Commit after scrolling settles. A sequence token discards stale decodes. Fades are interruptible equal-power and computed analytically. LRU caches. |
| Patterns are jittery mush | Phrase-scale coefficients (180 ms / 1.2 s), ≤6 sparse modes, γ sharpening, dominance hysteresis, symmetry-compatible mixing, curated modes. |
| All birds look alike | Rank-spread signatures at least 5 apart and ordered by pitch; personality-driven γ and kick. |
| The song→plate connection is not perceived | Onset kicks are instant (note → sand jumps). Snap moments with a glow pulse. Output-latency-aligned clock. Optional SongRuler. Silence freezes. |
| Doubled or blurry lines | Creep 0.8 (validated), loud = crisp compression, coherent field, exposure tonemap. |
| No float render targets, or no float linear filtering (iOS) | Manual LUT lerp, half-float field, `setDataType(HalfFloatType)` fallback, Canvas2D still mode. |
| GPU cost on phones, thermals, battery | Tiers, governor (drawRange first), sleep when frozen, pause offscreen or hidden, DPR caps. |
| WebGL context loss | Rebuild sim and passes on restore and reseed the coat; 2D fallback if not restored within 3 s. |
| SSR imports three or touches `window` | `ClientOnly` plus `lazy`, and the `@tanstack/react-start/client-only` marker. No top-level-await capability module. |
| Decoded audio memory | LRU of 3 decoded and 8 compressed. Mono mixdown only for the worker. |
| AAC not decodable (some Linux Firefox builds) | `fallbackSrc` in the manifest; otherwise an explicit error UI. The plate stays in its coat. |
| Photosensitivity and motion sensitivity | No whole-plate flashing (≤3 Hz, <10 % luminance). Reduced-motion preset. Pause freezes everything. |
| Bessel inaccuracy at nodal lines | CPU double precision (SciPy parity 1e-16), RG32F LUT with the exact derivative, error about 6e-5. Tested. |

---

## Appendix A: verified API index (three@0.186.1 unless noted)

* `examples/jsm/misc/GPUComputationRenderer.js`
  * constructor :113, `setDataType` :135, `addVariable` :150, `setVariableDependencies` :178
  * `init` :189 (checks `maxVertexTextures`; returns an error string), `compute` :260
  * `getCurrentRenderTarget` :299, `dispose` :321, `createRenderTarget` :394 (RGBA, dataType, Nearest, no depth), `createTexture` :424
* `examples/jsm/postprocessing/Pass.js`: `FullScreenQuad` :138 (shared fullscreen triangle :106-123), exported at :191
* `src/renderers/WebGLRenderer.js`
  * constructor options :70-85 (includes the new `outputBufferType`)
  * context creation errors :417-421, context lost/restored listeners :403-404 and handlers :1113-1143
  * `forceContextLoss` / `forceContextRestore` :607-625, `setPixelRatio` :640, `setSize` :671
  * `dispose` :1086, `setAnimationLoop` :1609, draw count from `position.count` :1238-1246, `setRenderTarget` :2934
* `src/renderers/webgl/WebGLExtensions.js:33-38` (auto-requests `EXT_color_buffer_float`, `OES_texture_float_linear`, `EXT_color_buffer_half_float`)
* `src/renderers/webgl/WebGLTextures.js:666` (float + linear filter without the extension only warns)
* `src/renderers/webgl/WebGLCapabilities.js` (`isWebGL2: true`, `maxTextureSize`, `maxVertexTextures`)
* `src/renderers/webgl/WebGLProgram.js:804-829` (GLSL ES 3.0 for `ShaderMaterial`), `:778` (DITHERING define)
* `src/renderers/webgl/WebGLState.js:643-653` (Additive + premultipliedAlpha → `blendFunc(ONE, ONE)`)
* `src/renderers/shaders/ShaderChunk/colorspace_fragment.glsl.js`, `dithering_*`
* `src/textures/DataTexture.js:32` (Nearest by default), `src/core/RenderTarget.js:59-62`
* `src/constants.js`: `HalfFloatType` :699, `FloatType` :691, `RGFormat` :804, `AdditiveBlending` :133, `CustomBlending` :157
* WebGPU path (not used in v1):
  * `src/renderers/webgpu/WebGPURenderer.js:57-75` (`forceWebGL` / `getFallback`)
  * `src/renderers/common/Renderer.js:784` (init), `:2883` (compute before init), `:2992` (computeAsync), `:595/:1348` (`onDeviceLost`)
  * `src/nodes/accessors/Arrays.js:47` (`instancedArray`), `src/nodes/gpgpu/ComputeNode.js:294` (`compute`), `src/nodes/accessors/BufferAttributeNode.js:443` (`toAttribute`)
  * `src/renderers/webgl-fallback/WebGLBackend.js:918-1000` (transform-feedback compute), `.../nodes/GLSLNodeBuilder.js:380-563` (PBO)
  * r186 `examples/webgpu_compute_points.html:131`, `examples/webgpu_compute_particles.html:74-172`
  * `examples/jsm/capabilities/WebGPU.js:3-5` (top-level await)
* `build/three.cjs` is deprecated in r186 (ESM-only), so use ESM imports only.
* `@tanstack/react-router@1.170.46` exports `ClientOnly` and `useHydrated`. `@tanstack/react-start@1.169.4` has the `./client-only` marker export.

## Appendix B: prototype evidence (scratchpad `proto-visual/`)

* `atlas_circle.png`, `atlas_square.png`: raw mode atlases. They justify the curation (dead-centre blobs; (1,1); (1,1+)).
* `morph.png`: coherent mixtures keep lines crisp. The row 1 midpoint looks like reference 2's four petals. Row 2 shows why incompatible symmetries are attenuated.
* `m1.png`: formation at 0.25, 0.6 and 1.6 s. `m2.png`: doubled lines with creep 0.25. `m3.png`: creep 0.8 at D = 0.8, D = 0.45 and the crisp settings, plus the circle.
* `m5.png`: the full composite recipe for both presets (darkened plate). `m4.png`: the earlier, too-grey plate.
* `sandsim.py`, `look.py`: NumPy reference of D.3 and E.4. `bessel.ts`: the Bessel code with a self-test against SciPy. `curate.py`: mode metrics.
