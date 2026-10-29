// Sand grains as GL points (docs/specs/engine.md §8.3, §8.4): one vertex per state texel, additive over the
// plate. The position attribute holds each grain's index. The shader reads it so that attribute 0 is a
// live array: an unread one makes Firefox emulate attrib 0 on desktop GL and warn on every link.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  type Texture,
} from 'three'
import { LOOK, SIM } from '../params'
import { hexToRgb } from './layout'
import { GRAIN_FRAG, GRAIN_VERT, PCG } from './shaders'

export class GrainLayer {
  readonly points: Points<BufferGeometry, ShaderMaterial>
  readonly uniforms

  constructor(stateW: number, stateH: number, state: Texture) {
    this.uniforms = {
      uState: { value: state },
      uStateW: { value: stateW },
      uScale: { value: new Vector2(1, 1) },
      uPointPx: { value: 1 },
      uAlpha: { value: 0.1 },
      uFade: { value: 1 },
      uClock: { value: 0 },
      uFrame: { value: 0 },
      uJitter: { value: 0 },
      uFlicker: { value: LOOK.flicker as number },
      uBoltR: { value: LOOK.boltR },
      uShapeMix: { value: 0 },
      uGrainFade: { value: SIM.grainFadeSec },
      uRestLift: { value: 0 },
      uRestAlpha: { value: LOOK.restAlpha },
      uRestFalloff: { value: LOOK.restFalloff },
      uSizeRange: { value: new Vector2(...LOOK.grainSize) },
      uAlphaRange: { value: new Vector2(...LOOK.grainAlpha) },
      uSand: { value: new Vector3(...hexToRgb(LOOK.sand)) },
    }
    const material = new ShaderMaterial({
      name: 'PlateGrains',
      vertexShader: PCG + GRAIN_VERT,
      fragmentShader: GRAIN_FRAG,
      uniforms: this.uniforms,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.points = new Points(makeGeometry(stateW * stateH), material)
    this.points.frustumCulled = false
    this.points.renderOrder = 1
  }

  /** New grain count after a governor downgrade; the material (and its program) is kept. */
  resize(stateW: number, stateH: number, state: Texture): void {
    this.points.geometry.dispose()
    this.points.geometry = makeGeometry(stateW * stateH)
    this.uniforms.uStateW.value = stateW
    this.uniforms.uState.value = state
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}

function makeGeometry(count: number): BufferGeometry {
  const ids = new Float32Array(count) // exact below 2^24; the high tier is 2^18
  for (let i = 0; i < count; i++) ids[i] = i
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(ids, 1))
  // Indices, not positions: a fixed bound keeps three from deriving a bogus one when sorting.
  g.boundingSphere = new Sphere(new Vector3(), 2)
  return g
}
