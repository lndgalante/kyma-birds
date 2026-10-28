// The vibration field (docs/specs/engine.md §8.3): 256² RGBA16F (U1, U2, ∂I/∂x, ∂I/∂y), re-rendered only
// when the mode coefficients move. The radial LUT is baked once per controller; the GPU never runs Bessel.
import {
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  NoBlending,
  RGBAFormat,
  RGFormat,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { DRIVE, SIM } from '../params'
import type { FieldSlots } from '../physics/sandReference'
import { bakeRadialLut, LUT_ROWS } from '../physics/radialLut'
import type { PlateShape } from '../types'
import { FIELD_FRAG, FIELD_VERT } from './shaders'

export class FieldPass {
  private readonly target: WebGLRenderTarget
  private readonly lut: DataTexture
  private readonly material: ShaderMaterial
  private readonly quad: FullScreenQuad
  private readonly uniforms

  constructor(
    private readonly renderer: WebGLRenderer,
    shape: PlateShape,
  ) {
    const res = SIM.fieldRes
    this.target = new WebGLRenderTarget(res, res, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    })
    this.lut = new DataTexture(bakeRadialLut(), SIM.lutWidth, LUT_ROWS, RGFormat, FloatType)
    this.lut.needsUpdate = true
    this.uniforms = {
      uLut: { value: this.lut as Texture },
      uLutRMax: { value: SIM.lutRMax },
      uExt: { value: SIM.fieldExt },
      uRes: { value: res },
      uBoltR: { value: 0 },
      uSlot: { value: new Float32Array(DRIVE.maxSlots * 4) as Float32Array },
      uCoef: { value: new Float32Array(DRIVE.maxSlots * 2) as Float32Array },
      uCount: { value: 0 },
      uShape: { value: 0 },
    }
    this.material = new ShaderMaterial({
      name: 'PlateField',
      vertexShader: FIELD_VERT,
      fragmentShader: FIELD_FRAG,
      uniforms: this.uniforms,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new FullScreenQuad(this.material)
    this.setShape(shape)
  }

  get texture(): Texture {
    return this.target.texture
  }

  /** The bolt's flat zone exists only on the square. */
  setShape(shape: PlateShape): void {
    this.uniforms.uShape.value = shape === 'circle' ? 0 : 1
    this.uniforms.uBoltR.value = shape === 'square' ? SIM.boltFlatR : 0
  }

  /** Renders the field for `drive`. With count 0 the field clears to zero, which freezes every grain. */
  render(drive: FieldSlots): void {
    const u = this.uniforms
    u.uSlot.value = drive.slots
    u.uCoef.value = drive.coefs
    u.uCount.value = Math.min(drive.count, DRIVE.maxSlots)
    const prev = this.renderer.getRenderTarget()
    this.renderer.setRenderTarget(this.target)
    this.quad.render(this.renderer)
    this.renderer.setRenderTarget(prev)
  }

  dispose(): void {
    this.quad.dispose()
    this.material.dispose()
    this.target.dispose()
    this.lut.dispose()
  }
}
