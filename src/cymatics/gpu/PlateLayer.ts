// The plate itself (docs/specs/engine.md §8.3): a full-screen quad that shades the square's surface, bevel
// and bolt, drawn first with no blending so its alpha also cuts the plate out of the transparent canvas.
// The circle's surface and rim are the page's (PLATE_FRAG), so over the circle it only clears.
import {
  Mesh,
  NoBlending,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Texture,
} from 'three'
import { LOOK, SIM } from '../params'
import { hexToRgb } from './layout'
import { PCG, PLATE_FRAG, PLATE_VERT } from './shaders'

const rgb = (hex: string) => new Vector3(...hexToRgb(hex))

export class PlateLayer {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>
  readonly uniforms

  constructor(field: Texture) {
    this.uniforms = {
      uViewportPx: { value: new Vector2(1, 1) },
      uScale: { value: new Vector2(1, 1) },
      uPxPerUnit: { value: 1 },
      uShapeMix: { value: 0 },
      uBoltR: { value: LOOK.boltR },
      uGmax: { value: SIM.gMax },
      uFieldExt: { value: SIM.fieldExt },
      uDebug: { value: 0 },
      uField: { value: field },
      uAccent: { value: new Vector3(1, 1, 1) },
      uSquareIn: { value: rgb(LOOK.plate.squareIn) },
      uSquareOut: { value: rgb(LOOK.plate.squareOut) },
    }
    const material = new ShaderMaterial({
      name: 'PlateSurface',
      vertexShader: PLATE_VERT,
      fragmentShader: PCG + PLATE_FRAG,
      uniforms: this.uniforms,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    this.mesh = new Mesh(new PlaneGeometry(2, 2), material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 0
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
