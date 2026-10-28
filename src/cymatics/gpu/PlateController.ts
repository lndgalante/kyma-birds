// One plate: renderer, loop, observers, transitions, governor, telemetry and disposal
// (docs/specs/engine.md §8.5–§8.9, §10, §11). Each instance owns its own canvas and GL context.
import { OrthographicCamera, Scene, type WebGLRenderer } from 'three'
import { createDriveFrame, type DriveFrame, type PlateDriveSource } from '~/audio/engine/types'
import { DRIVE, LOOK, SIM, TIERS } from '../params'
import { ModeBank, type FieldDrive } from '../physics/ModeBank'
import { SubstepAccumulator } from '../physics/substeps'
import type {
  PlateBird,
  PlateError,
  PlateReadyInfo,
  PlateShape,
  PlateTelemetry,
  QualityPreference,
  Tier,
} from '../types'
import { createProbedRenderer, releaseRenderer, type ProbedRenderer } from './capabilities'
import { FieldPass } from './FieldPass'
import { Governor } from './governor'
import { GrainLayer } from './GrainLayer'
import { computeLayout, createLayout, shapeEase, type LayoutInput } from './layout'
import { PlateLayer } from './PlateLayer'
import { SandSim } from './SandSim'
import { lowerTier, minTier, pickTier, readTierEnv } from './tier'

export interface PlateControllerOptions {
  quality: QualityPreference
  source: PlateDriveSource
  bird: PlateBird | null
  shape: PlateShape
  paused: boolean
  held: boolean
  /** undefined → follow `prefers-reduced-motion`. */
  reducedMotion?: boolean
  accentColor?: string
  debug: boolean
  onReady(info: PlateReadyInfo): void
  onError(error: PlateError): void
  onTelemetry(t: PlateTelemetry): void
  /** The context came back: the owner remounts with a fresh canvas (same path as the first mount). */
  onRestored(): void
}

/** Debug snapshot (`window.__kymaPlate.stats()`, the plate lab). Allocates; never call per frame. */
export interface PlateStats {
  tier: Tier
  grains: number
  sim: { w: number; h: number }
  css: { w: number; h: number }
  px: { w: number; h: number }
  pixelRatio: number
  pointPx: number
  alpha: number
  fps: number
  frameMs: { p50: number; p75: number; capShare: number }
  running: boolean
  visible: boolean
  held: boolean
  paused: boolean
  reducedMotion: boolean
  shape: PlateShape
  shapeMix: number
  transition: boolean
  clock: number
  steps: number
  renders: number
  fieldRenders: number
  downgrades: number
  drive: {
    count: number
    energy: number
    gammaRms: number
    canMove: boolean
    modeKey: string | null
  }
  gl: {
    calls: number
    points: number
    triangles: number
    geometries: number
    textures: number
    programs: number
  }
}

// The governor's verdict outlives a remount: a context restore or a quality-prop change must not
// re-learn that this device can't hold the tier it just dropped.
const session: { downgrades: number; cap: Tier | null } = { downgrades: 0, cap: null }

const SLEEP_FRAMES = 30
const SCATTER_AWAKE_SEC = 1.0
const BIRD_CACHE = 4

type Listener = () => void

export class PlateController {
  /** Live controllers (debugging, the plate lab's StrictMode check). */
  static readonly live = new Set<PlateController>()
  static createdCount = 0
  static disposedCount = 0

  /**
   * Synchronous: probes, creates the renderer, bakes the LUT, builds and warms every GPU object and
   * appends its own canvas to `host`. Returns the controller, or why the plate can't run.
   */
  static create(host: HTMLElement, opts: PlateControllerOptions): PlateController | PlateError {
    const probed = createProbedRenderer()
    if (!('renderer' in probed)) return probed
    try {
      return new PlateController(host, probed, opts)
    } catch (e) {
      releaseRenderer(probed.renderer, probed.canvas)
      return {
        code: 'init-failed',
        recoverable: false,
        message: e instanceof Error ? e.message : String(e),
      }
    }
  }

  private readonly renderer: WebGLRenderer
  private readonly canvas: HTMLCanvasElement
  private readonly opts: PlateControllerOptions
  private tier: Tier
  private readonly modeBank = new ModeBank()
  private readonly frame: DriveFrame = createDriveFrame()
  private drive: FieldDrive
  private readonly field: FieldPass
  private sim: SandSim
  private readonly grains: GrainLayer
  private readonly plate: PlateLayer
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly substeps = new SubstepAccumulator()
  private readonly governor = new Governor()
  private readonly layout = createLayout()
  private readonly layoutIn: LayoutInput

  private disposed = false
  private lost = false
  private failed = false
  private frozen = false // debug: simulate() owns the clock
  private running = false
  private idleFrames = 0
  private last = -1
  private clock = 0
  private stepFrame = 0
  private renderFrame = 0
  private seed = (Math.random() * 0xffffff) >>> 0
  private fpsMs = 0
  private telemetryAt = -Infinity
  private readyFired = false
  private shaderError: string | null = null
  private renders = 0
  private fieldRenders = 0
  private downgrades = 0

  private shape: PlateShape // what the bank, field and sand are configured for
  private targetShape: PlateShape // where the shell wants to be (differs mid-transition)
  private shapeMix: number
  private ext: number
  private fade = 1
  private readonly trans = {
    active: false,
    t: 0,
    fromMix: 0,
    toMix: 0,
    fromExt: 1,
    toExt: 1,
    swap: false,
    fade0: 1,
  }
  private fadeUntil = 0
  private awakeUntil = 0
  private fieldStale = true
  private needsRender = true
  private resizePending = true
  private layoutDirty = true
  private cssW = 0
  private cssH = 0
  private pixelRatio = 1
  private visible = true
  private pageHidden = false

  private paused: boolean
  private held: boolean
  private debug = false
  private reducedMotionProp: boolean | undefined
  private reducedMotionMedia = false
  private reducedMotion = false
  private bird: PlateBird | null
  private readonly birdCache = new Map<string, PlateBird>()
  private configuredId: string | null = null
  private source: PlateDriveSource
  private unsubscribe: Listener = () => {}

  private resizeObs: ResizeObserver | null = null
  private intersectObs: IntersectionObserver | null = null
  private dprQuery: MediaQueryList | null = null
  private motionQuery: MediaQueryList | null = null

  private constructor(host: HTMLElement, probed: ProbedRenderer, opts: PlateControllerOptions) {
    this.renderer = probed.renderer
    this.canvas = probed.canvas
    this.opts = opts
    this.source = opts.source
    this.paused = opts.paused
    this.held = opts.held
    this.bird = opts.bird
    this.reducedMotionProp = opts.reducedMotion
    this.shape = opts.shape
    this.targetShape = opts.shape
    this.shapeMix = opts.shape === 'square' ? 1 : 0
    this.ext = LOOK.extent[opts.shape]

    let tier = pickTier(opts.quality, readTierEnv(), probed.caveat)
    if (opts.quality === 'auto' && session.cap) tier = minTier(tier, session.cap)
    this.tier = tier

    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const logs = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)]
      this.shaderError = logs.filter((s) => s && s.trim()).join('\n') || 'Shader link failed'
    }

    const canvas = this.canvas
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    canvas.setAttribute('aria-hidden', 'true')
    host.appendChild(canvas)

    this.field = new FieldPass(this.renderer, this.shape)
    const cfg = TIERS[tier]
    this.sim = new SandSim(this.renderer, cfg.w, cfg.h, this.field.texture, this.shape)
    this.grains = new GrainLayer(cfg.w, cfg.h, this.sim.texture)
    this.plate = new PlateLayer(this.field.texture)
    this.scene.add(this.plate.mesh, this.grains.points)
    this.layoutIn = {
      wPx: 1,
      hPx: 1,
      cssW: 1,
      cssH: 1,
      pixelRatio: 1,
      ext: this.ext,
      shape: this.shape,
      grains: this.sim.count,
      grainCss: cfg.grainCss,
    }

    this.rememberBird(this.bird)
    this.modeBank.configure(this.shape, this.bird)
    this.configuredId = this.bird?.id ?? null
    this.drive = this.modeBank.update(this.frame, 0, true)

    this.motionQuery =
      typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
    this.reducedMotionMedia = this.motionQuery?.matches ?? false
    this.applyReducedMotion()

    // Warm every program now, so a compile failure surfaces here as 'init-failed' (§10), not mid-loop.
    this.cssW = host.clientWidth
    this.cssH = host.clientHeight
    this.applySize()
    this.applyLayout()
    this.field.render(this.drive)
    this.fieldStale = false
    this.scatterNow(this.reducedMotion ? 0 : SIM.pourSec)
    this.sim.step(this.stepFrame++, this.clock, 1, 0) // zero field: every grain stays bit-identical
    this.grains.uniforms.uState.value = this.sim.texture
    this.draw()
    if (this.shaderError) throw new Error(this.shaderError)
    this.needsRender = true

    // Observers last: nothing above may leave a listener behind if it throws.
    this.unsubscribe = this.source.subscribe(this.onSourceChange)
    this.resizeObs = new ResizeObserver(this.onResize)
    this.resizeObs.observe(host)
    this.intersectObs = new IntersectionObserver(this.onIntersect, { threshold: 0 })
    this.intersectObs.observe(host)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.pageHidden = document.visibilityState === 'hidden'
    this.watchDpr()
    this.motionQuery?.addEventListener('change', this.onMotionChange)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    this.setDebug(opts.debug, opts.accentColor)

    PlateController.live.add(this)
    PlateController.createdCount++
    // Warm up from this build, not from page load (rAF times share performance.now()'s origin).
    this.governor.reset(performance.now())
    this.wake()
  }

  // ── Prop setters (idempotent) ───────────────────────────────────────────────────────────────

  setShape(shape: PlateShape): void {
    if (this.disposed || shape === this.targetShape) return
    this.targetShape = shape
    const toMix = shape === 'square' ? 1 : 0
    const toExt = LOOK.extent[shape]
    const tr = this.trans
    if (this.reducedMotion) {
      tr.active = false
      this.shapeMix = toMix
      this.ext = toExt
      this.fade = 1
      if (shape !== this.shape) this.swapShape(0)
    } else {
      tr.active = true
      tr.t = 0
      tr.fromMix = this.shapeMix
      tr.toMix = toMix
      tr.fromExt = this.ext
      tr.toExt = toExt
      // Reversing before the swap only morphs back; the configured shape never changed.
      tr.swap = shape !== this.shape
      tr.fade0 = this.fade
    }
    this.layoutDirty = true
    this.needsRender = true
    this.wake()
  }

  setBird(bird: PlateBird | null): void {
    if (this.disposed) return
    this.bird = bird
    this.rememberBird(bird)
    // While a song is heard, calibration follows the voice in tick(); otherwise follow the prop.
    if (this.paused || !this.source.isAudible()) {
      this.modeBank.configure(this.shape, bird)
      this.configuredId = bird?.id ?? null
    }
    this.wake()
  }

  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return
    this.paused = paused
    this.wake()
  }

  setHeld(held: boolean): void {
    if (this.disposed || held === this.held) return
    this.held = held
    if (!held) {
      this.fieldStale = true
      this.substeps.reset()
    }
    this.wake()
  }

  scatter(): void {
    if (this.disposed) return
    // With no song to re-form it, the pattern the mode key names is gone: report silence at once.
    if (this.paused || !this.source.isAudible()) {
      this.modeBank.silence()
      this.emitTelemetry()
    }
    this.scatterNow(this.reducedMotion ? 0 : SIM.scatterPourSec)
    this.awakeUntil = this.clock + SCATTER_AWAKE_SEC
    this.wake()
  }

  setReducedMotion(reducedMotion: boolean | undefined): void {
    if (this.disposed) return
    this.reducedMotionProp = reducedMotion
    this.applyReducedMotion()
    this.wake()
  }

  setDebug(debug: boolean, accentColor?: string): void {
    if (this.disposed) return
    this.debug = debug
    this.plate.uniforms.uDebug.value = debug ? 1 : 0
    if (accentColor) {
      const rgb = cssColorToRgb(accentColor)
      if (rgb) this.plate.uniforms.uAccent.value.set(rgb[0], rgb[1], rgb[2])
    }
    // Per-frame GL counters only make sense summed over the whole tick.
    this.renderer.info.autoReset = !debug
    const w = window as { __kymaPlate?: PlateController }
    if (debug) w.__kymaPlate = this
    else if (w.__kymaPlate === this) delete w.__kymaPlate
    this.needsRender = true
    this.wake()
  }

  setSource(source: PlateDriveSource): void {
    if (this.disposed || source === this.source) return
    this.unsubscribe()
    this.source = source
    this.unsubscribe = source.subscribe(this.onSourceChange)
    this.wake()
  }

  // ── Disposal (§8.9) ─────────────────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.running = false

    this.resizeObs?.disconnect()
    this.intersectObs?.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.motionQuery?.removeEventListener('change', this.onMotionChange)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.unsubscribe()

    // After a loss the GL handles are dead (a restored context is a new one): only the context goes.
    if (!this.lost) {
      this.sim.dispose()
      this.field.dispose()
      this.grains.dispose()
      this.plate.dispose()
    }
    this.renderer.debug.onShaderError = null
    releaseRenderer(this.renderer, this.canvas, this.lost) // dispose, forceContextLoss, canvas.remove()

    const w = window as { __kymaPlate?: PlateController }
    if (w.__kymaPlate === this) delete w.__kymaPlate
    PlateController.live.delete(this)
    PlateController.disposedCount++
  }

  // ── The frame (§8.8) ────────────────────────────────────────────────────────────────────────

  private readonly tick = (time: number): void => {
    if (this.disposed || this.lost || this.failed) return
    // 1 · clock
    const interval = this.last < 0 ? 0 : time - this.last
    const dt = Math.min(0.1, Math.max(0, interval / 1000))
    this.last = time
    this.clock += dt
    if (interval > 0 && interval < 250) {
      this.fpsMs = this.fpsMs === 0 ? interval : this.fpsMs + (interval - this.fpsMs) * 0.1
    }
    if (this.debug) this.renderer.info.reset()

    // 2 · latency-compensated drive
    const frame = this.source.read(time, this.frame)
    const audible = frame.audible && !this.paused

    // 3 · calibration follows the voice actually heard (the shell may already show the next bird)
    const sid = frame.songId
    if (audible && sid && sid !== this.configuredId) {
      const b = this.birdCache.get(sid)
      if (b) {
        this.modeBank.configure(this.shape, b)
        this.configuredId = sid
      }
    }

    // 4 · mode envelopes → slot arrays
    const drive = this.modeBank.update(frame, dt, this.paused)
    this.drive = drive

    // 5 · telemetry ≤ 8 Hz
    if (time - this.telemetryAt >= 1000 / DRIVE.telemetryHz) {
      this.telemetryAt = time
      this.emitTelemetry()
    }

    // 6 · transitions and sizing
    this.updateTransition(dt)
    let resized = false
    if (this.resizePending) {
      this.applySize()
      resized = true
    }
    if (this.layoutDirty) this.applyLayout()

    // 7 · field and sand
    let stepped = false
    if (!this.held) {
      if (drive.dirty || this.fieldStale) {
        this.field.render(drive)
        this.fieldStale = false
        this.fieldRenders++
      }
      const trickle =
        this.shape === 'square' && audible && frame.drive > 0.05 ? SIM.trickleRate * SIM.dt : 0
      const n = this.substeps.advance(dt, drive.canMove || trickle > 0)
      if (n > 0) {
        const kick = this.reducedMotion ? 1 : 1 + SIM.onsetKick * frame.onset
        for (let i = 0; i < n; i++) this.sim.step(this.stepFrame++, this.clock, kick, trickle)
        this.grains.uniforms.uState.value = this.sim.texture
        stepped = true
      }
    } else if (drive.dirty) {
      this.fieldStale = true // the bank moved on while the picture was held
    }
    if (this.governor.sample(time, interval, stepped)) this.downgrade(time)

    // 8 · draw only when something visible changed; an undrawn frame keeps the last picture
    const fading = this.clock < this.fadeUntil
    if (stepped || this.trans.active || fading || resized || this.needsRender || this.debug) {
      this.draw()
      if (this.checkShaderError()) return
      if (!this.readyFired) {
        this.readyFired = true
        this.opts.onReady({ tier: this.tier, grains: this.sim.count, renderer: 'webgl2' })
      }
    }

    // 9 · sleep once nothing can change for a while
    const busy =
      this.source.isAudible() ||
      drive.canMove ||
      this.trans.active ||
      fading ||
      this.clock < this.awakeUntil ||
      this.resizePending
    this.idleFrames = busy ? 0 : this.idleFrames + 1
    if (this.idleFrames >= SLEEP_FRAMES) {
      this.stopLoop()
      this.emitTelemetry()
    }
  }

  private draw(): void {
    const g = this.grains.uniforms
    g.uClock.value = this.clock
    g.uFrame.value = this.renderFrame++ % 0x1000000
    g.uFade.value = this.fade
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
    this.renders++
    this.needsRender = false
  }

  private updateTransition(dt: number): void {
    const tr = this.trans
    if (!tr.active) return
    tr.t += dt
    const u = Math.min(1, tr.t / LOOK.shapeSec)
    const e = shapeEase(u)
    this.shapeMix = tr.fromMix + (tr.toMix - tr.fromMix) * e
    this.ext = tr.fromExt + (tr.toExt - tr.fromExt) * e
    const f = Math.min(1, tr.t / LOOK.grainFadeOutSec)
    this.fade = tr.swap ? tr.fade0 * (1 - f) : tr.fade0 + (1 - tr.fade0) * f
    this.layoutDirty = true
    if (u >= 1) {
      tr.active = false
      this.fade = 1
      if (tr.swap) this.swapShape(SIM.shapeSwapPourSec)
    }
  }

  /** The configured shape changes: reset the bank (§8.5), re-aim the field and pour fresh sand. */
  private swapShape(pour: number): void {
    const shape = this.targetShape
    this.shape = shape
    const bird = (this.configuredId && this.birdCache.get(this.configuredId)) || this.bird
    this.modeBank.configure(shape, bird)
    this.configuredId = bird?.id ?? null
    this.field.setShape(shape)
    this.fieldStale = true
    this.sim.setShape(shape)
    this.scatterNow(pour)
    this.layoutDirty = true
  }

  private scatterNow(pour: number): void {
    // Without a pour the grains must be visible at once, not fade in over grainFadeSec.
    const from = pour > 0 ? this.clock : this.clock - SIM.grainFadeSec
    this.sim.scatter(this.seed++, from, pour)
    this.fadeUntil = pour > 0 ? this.clock + pour + SIM.grainFadeSec : this.clock
    this.substeps.reset()
    this.needsRender = true
  }

  private downgrade(time: number): void {
    const next = lowerTier(this.tier)
    if (!next || session.downgrades >= TIERS.governor.maxDowngrades) return
    session.downgrades++
    session.cap = next
    this.downgrades++
    this.tier = next
    const cfg = TIERS[next]
    this.sim.dispose()
    this.sim = new SandSim(this.renderer, cfg.w, cfg.h, this.field.texture, this.shape)
    this.grains.resize(cfg.w, cfg.h, this.sim.texture)
    this.scatterNow(0)
    this.resizePending = true // the DPR cap may differ
    this.governor.reset(time)
    this.emitTelemetry()
  }

  private applySize(): void {
    const pr = Math.min(window.devicePixelRatio || 1, TIERS[this.tier].dprCap)
    this.pixelRatio = pr
    this.renderer.setPixelRatio(pr)
    this.renderer.setSize(Math.max(1, this.cssW), Math.max(1, this.cssH), false)
    this.resizePending = false
    this.layoutDirty = true
    this.needsRender = true // resizing the drawing buffer clears it
  }

  private applyLayout(): void {
    const li = this.layoutIn
    li.wPx = this.canvas.width
    li.hPx = this.canvas.height
    li.cssW = this.cssW
    li.cssH = this.cssH
    li.pixelRatio = this.pixelRatio
    li.ext = this.ext
    li.shape = this.shape
    li.grains = this.sim.count
    li.grainCss = TIERS[this.tier].grainCss
    const L = computeLayout(li, this.layout)
    const g = this.grains.uniforms
    g.uScale.value.set(L.scaleX, L.scaleY)
    g.uPointPx.value = L.pointPx
    g.uAlpha.value = L.alpha
    g.uJitter.value = this.reducedMotion ? 0 : L.jitter
    g.uShapeMix.value = this.shapeMix
    const p = this.plate.uniforms
    p.uViewportPx.value.set(li.wPx, li.hPx)
    p.uScale.value.set(L.scaleX, L.scaleY)
    p.uPxPerUnit.value = L.pxPerUnit
    p.uShapeMix.value = this.shapeMix
    this.layoutDirty = false
  }

  private applyReducedMotion(): void {
    this.reducedMotion = this.reducedMotionProp ?? this.reducedMotionMedia
    this.grains.uniforms.uFlicker.value = this.reducedMotion ? 0 : LOOK.flicker
    this.layoutDirty = true
    this.needsRender = true
  }

  private emitTelemetry(): void {
    const f = this.frame
    this.opts.onTelemetry({
      modeKey: this.drive.dominantKey,
      dominantHz: f.voiced && f.audible && f.f1Hz > 0 ? f.f1Hz : null,
      gammaRms: this.drive.gammaRms,
      tier: this.tier,
      grains: this.sim.count,
      fps: this.fpsMs > 0 ? Math.round(1000 / this.fpsMs) : 0,
    })
  }

  private rememberBird(bird: PlateBird | null): void {
    if (!bird) return
    this.birdCache.delete(bird.id)
    this.birdCache.set(bird.id, bird)
    while (this.birdCache.size > BIRD_CACHE) {
      const oldest = this.birdCache.keys().next().value
      if (oldest === undefined) break
      this.birdCache.delete(oldest)
    }
  }

  private checkShaderError(): boolean {
    if (!this.shaderError || this.failed) return false
    this.failed = true
    this.stopLoop()
    this.opts.onError({ code: 'init-failed', recoverable: false, message: this.shaderError })
    return true
  }

  // ── Loop control (§8.7) ─────────────────────────────────────────────────────────────────────

  private wake(): void {
    this.idleFrames = 0
    if (this.disposed || this.lost || this.failed || this.frozen) return
    if (this.running || !this.visible || this.pageHidden) return
    this.running = true
    this.last = -1
    this.renderer.setAnimationLoop(this.tick)
  }

  private stopLoop(): void {
    if (!this.running) return
    this.renderer.setAnimationLoop(null)
    this.running = false
  }

  private readonly onSourceChange = (): void => this.wake()

  private readonly onResize = (entries: ResizeObserverEntry[]): void => {
    const r = entries[entries.length - 1]?.contentRect
    if (!r || (r.width === this.cssW && r.height === this.cssH && !this.resizePending)) return
    this.cssW = r.width
    this.cssH = r.height
    this.resizePending = true
    this.wake()
  }

  private readonly onIntersect = (entries: IntersectionObserverEntry[]): void => {
    const e = entries[entries.length - 1]
    if (!e) return
    this.visible = e.isIntersecting
    if (this.visible) this.wake()
    else this.stopLoop()
  }

  private readonly onVisibility = (): void => {
    this.pageHidden = document.visibilityState === 'hidden'
    if (this.pageHidden) this.stopLoop()
    else this.wake()
  }

  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange)
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    this.dprQuery.addEventListener('change', this.onDprChange)
  }

  private readonly onDprChange = (): void => {
    if (this.disposed) return
    this.watchDpr()
    this.resizePending = true
    this.wake()
  }

  private readonly onMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotionMedia = e.matches
    this.applyReducedMotion()
    this.wake()
  }

  private readonly onContextLost = (): void => {
    if (this.disposed) return
    this.lost = true
    this.stopLoop()
    this.opts.onError({
      code: 'context-lost',
      recoverable: true,
      message: 'The WebGL context was lost',
    })
  }

  private readonly onContextRestored = (): void => {
    if (this.disposed) return
    this.opts.onRestored()
  }

  // ── Debug surface (window.__kymaPlate, the plate lab) ─────────────────────────────────────────

  stats(): PlateStats {
    const info = this.renderer.info
    return {
      tier: this.tier,
      grains: this.sim.count,
      sim: { w: this.sim.w, h: this.sim.h },
      css: { w: this.cssW, h: this.cssH },
      px: { w: this.canvas.width, h: this.canvas.height },
      pixelRatio: this.pixelRatio,
      pointPx: this.layout.pointPx,
      alpha: this.layout.alpha,
      fps: this.fpsMs > 0 ? 1000 / this.fpsMs : 0,
      frameMs: {
        p50: this.governor.p50(),
        p75: this.governor.p75(),
        capShare: this.governor.capShare(),
      },
      running: this.running,
      visible: this.visible && !this.pageHidden,
      held: this.held,
      paused: this.paused,
      reducedMotion: this.reducedMotion,
      shape: this.shape,
      shapeMix: this.shapeMix,
      transition: this.trans.active,
      clock: this.clock,
      steps: this.stepFrame,
      renders: this.renders,
      fieldRenders: this.fieldRenders,
      downgrades: this.downgrades,
      drive: {
        count: this.drive.count,
        energy: this.drive.energy,
        gammaRms: this.drive.gammaRms,
        canMove: this.drive.canMove,
        modeKey: this.drive.dominantKey,
      },
      gl: {
        calls: info.render.calls,
        points: info.render.points,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      },
    }
  }

  /** The sand state (x, y, mob, visibleFrom per grain). Stalls the GPU; debug only. */
  readState(): Float32Array {
    return this.sim.read()
  }

  /**
   * Debug: take the clock away from rAF and advance `seconds` of plate time at `fps` synchronously
   * (deterministic captures). The live loop stays off until resume().
   */
  simulate(seconds: number, fps = 60): void {
    if (this.disposed) return
    this.frozen = true
    this.stopLoop()
    const stepMs = 1000 / fps
    let t = this.last >= 0 ? this.last : performance.now()
    this.last = t
    const frames = Math.round(seconds * fps)
    for (let i = 0; i < frames && !this.lost && !this.failed; i++) {
      t += stepMs
      this.tick(t)
    }
    this.needsRender = true
    this.draw()
  }

  resume(): void {
    this.frozen = false
    this.wake()
  }

  /** Debug: GPU cost of one full frame (field + one sim step + draw), synchronised with readPixels. */
  bench(frames = 120): { msPerFrame: number; tier: Tier; grains: number; px: [number, number] } {
    const wasFrozen = this.frozen
    this.frozen = true
    this.stopLoop()
    const gl = this.renderer.getContext()
    const px = new Uint8Array(4)
    const sync = () => {
      this.renderer.setRenderTarget(null)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    }
    sync()
    const t0 = performance.now()
    for (let i = 0; i < frames; i++) {
      this.field.render(this.drive)
      this.sim.step(this.stepFrame++, this.clock, 1, 0)
      this.grains.uniforms.uState.value = this.sim.texture
      this.draw()
    }
    sync()
    const ms = (performance.now() - t0) / frames
    this.frozen = wasFrozen
    this.wake()
    return {
      msPerFrame: ms,
      tier: this.tier,
      grains: this.sim.count,
      px: [this.canvas.width, this.canvas.height],
    }
  }

  /** Debug: the governor's downgrade, on demand. */
  forceDowngrade(): void {
    this.downgrade(performance.now())
    this.wake()
  }

  /** Debug: simulate a context loss (three caches the extension; a lost context won't hand it out). */
  loseContext(): void {
    this.renderer.forceContextLoss()
  }

  restoreContext(): void {
    this.renderer.forceContextRestore()
  }
}

/** Any CSS colour → display-sRGB 0..1 by letting a 2D canvas resolve it. Debug overlay only. */
function cssColorToRgb(color: string): [number, number, number] | null {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.canvas.width = 1
  ctx.canvas.height = 1
  ctx.fillStyle = '#000'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0] / 255, d[1] / 255, d[2] / 255]
}
