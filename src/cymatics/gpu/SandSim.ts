// Sand state on the GPU (docs/specs/engine.md §7, §8.3): one GPUComputationRenderer variable 'tState',
// RGBA32F (x, y, mobility, visible-from), stepped at a fixed dt.
import {
  DataTexture,
  FloatType,
  RGBAFormat,
  type ShaderMaterial,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js'
import { SIM } from '../params'
import type { PlateShape } from '../types'
import { PCG, SAND_STEP_FRAG, SCATTER_FRAG } from './shaders'

export class SandSim {
  readonly count: number
  private readonly gpu: GPUComputationRenderer
  private readonly stateVar: Variable
  private readonly scatterMat: ShaderMaterial
  private readonly stepUniforms
  private readonly scatterUniforms

  constructor(
    private readonly renderer: WebGLRenderer,
    readonly w: number,
    readonly h: number,
    field: Texture,
    shape: PlateShape,
  ) {
    this.count = w * h
    this.gpu = new GPUComputationRenderer(w, h, renderer)
    // A 1×1 seed is enough: scatter() overwrites both targets before anything reads them.
    const seed = new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType)
    seed.needsUpdate = true
    this.stateVar = this.gpu.addVariable('tState', PCG + SAND_STEP_FRAG, seed)
    this.gpu.setVariableDependencies(this.stateVar, [this.stateVar])
    this.stepUniforms = {
      uField: { value: field },
      uFieldExt: { value: SIM.fieldExt },
      uDt: { value: SIM.dt },
      uGmax: { value: SIM.gMax },
      uSigma: { value: SIM.sigma },
      uKappa: { value: SIM.kappa },
      uW: { value: SIM.w },
      uGsat: { value: SIM.gSat },
      uDriftMax: { value: SIM.driftMax },
      uKick: { value: 1 },
      uFrame: { value: 0 },
      uClock: { value: 0 },
      uThetaLo: { value: SIM.thetaLo },
      uThetaHi: { value: SIM.thetaHi },
      uHeavyFrac: { value: 0 },
      uHeavyMul: { value: SIM.heavyMul },
      uRim: { value: SIM.rim },
      uTrickle: { value: 0 },
      uShape: { value: 0 },
    }
    Object.assign(this.stateVar.material.uniforms, this.stepUniforms)
    this.stateVar.material.name = 'PlateSandStep'
    const err = this.gpu.init()
    if (err) {
      this.gpu.dispose()
      throw new Error(err)
    }
    this.scatterUniforms = {
      uSeed: { value: 0 },
      uClock: { value: 0 },
      uPour: { value: 0 },
      uRim: { value: SIM.rim },
      uShape: { value: 0 },
    }
    this.scatterMat = this.gpu.createShaderMaterial(PCG + SCATTER_FRAG, this.scatterUniforms)
    this.scatterMat.name = 'PlateSandScatter'
    this.setShape(shape)
  }

  /** The current state texture (it flips on every step). */
  get texture(): Texture {
    return this.gpu.getCurrentRenderTarget(this.stateVar).texture
  }

  setShape(shape: PlateShape): void {
    const s = shape === 'circle' ? 0 : 1
    this.stepUniforms.uShape.value = s
    this.stepUniforms.uHeavyFrac.value = SIM.heavyFrac[shape]
    this.scatterUniforms.uShape.value = s
  }

  /** Uniform scatter into both targets; grains fade in between `clock` and `clock + pour`. */
  scatter(seed: number, clock: number, pour: number): void {
    const u = this.scatterUniforms
    u.uSeed.value = seed % 0x1000000 // exact as a float uniform below 2^24
    u.uClock.value = clock
    u.uPour.value = pour
    this.gpu.doRenderTarget(this.scatterMat, this.gpu.getCurrentRenderTarget(this.stateVar))
    this.gpu.doRenderTarget(this.scatterMat, this.gpu.getAlternateRenderTarget(this.stateVar))
  }

  /** One fixed SIM.dt step. `frame` salts the noise; exact below 2^24 (about 26 h at 180 steps/s). */
  step(frame: number, clock: number, kick: number, trickle: number): void {
    const u = this.stepUniforms
    u.uFrame.value = frame % 0x1000000
    u.uClock.value = clock
    u.uKick.value = kick
    u.uTrickle.value = trickle
    this.gpu.compute()
  }

  /** Reads the whole state back (debug/tests only; allocates and stalls the pipeline). */
  read(): Float32Array {
    const out = new Float32Array(this.count * 4)
    const rt = this.gpu.getCurrentRenderTarget(this.stateVar)
    this.renderer.readRenderTargetPixels(rt, 0, 0, this.w, this.h, out)
    return out
  }

  dispose(): void {
    // gpu.dispose() frees the targets, the step material and the seed texture, not createShaderMaterial's.
    this.gpu.dispose()
    this.scatterMat.dispose()
  }
}
