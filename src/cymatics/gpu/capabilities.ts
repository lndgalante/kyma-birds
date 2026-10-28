// Renderer creation and the float probe (docs/specs/engine.md §8.1). Synchronous by design: the plate is
// created inside a React effect and StrictMode disposes and recreates it immediately.
import {
  FloatType,
  NoBlending,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import type { PlateError } from '../types'
import { PROBE_FRAG, PROBE_VALUE, PROBE_VERT } from './shaders'

export interface ProbedRenderer {
  renderer: WebGLRenderer
  canvas: HTMLCanvasElement
  /** The first attempt failed on failIfMajorPerformanceCaveat: likely a software rasteriser. */
  caveat: boolean
}

function makeRenderer(caveat: boolean): ProbedRenderer {
  // A fresh canvas per attempt: a failed attempt may leave a default context bound to its canvas.
  const canvas = document.createElement('canvas')
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    premultipliedAlpha: true,
    powerPreference: 'default',
    failIfMajorPerformanceCaveat: !caveat,
  })
  return { renderer, canvas, caveat }
}

/**
 * Frees the context at once (browsers cap live contexts at about 16). `stale`: the context was lost since
 * the GPU objects were made, so their handles are invalid and deleting them would only raise GL errors.
 */
export function releaseRenderer(
  renderer: WebGLRenderer,
  canvas: HTMLCanvasElement,
  stale = false,
): void {
  renderer.setAnimationLoop(null)
  if (!stale) renderer.dispose()
  if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
  canvas.remove()
}

/** Creates the renderer and proves float render targets work, or explains why the plate can't run. */
export function createProbedRenderer(): ProbedRenderer | PlateError {
  let probed: ProbedRenderer
  try {
    probed = makeRenderer(false)
  } catch {
    try {
      probed = makeRenderer(true)
    } catch (e) {
      return {
        code: 'webgl-unavailable',
        recoverable: false,
        message: e instanceof Error ? e.message : 'WebGL2 is unavailable',
      }
    }
  }
  const { renderer, canvas } = probed
  const reason = floatSupportProblem(renderer)
  if (reason) {
    releaseRenderer(renderer, canvas)
    return { code: 'float-unsupported', recoverable: false, message: reason }
  }
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = true
  return probed
}

/** null when RGBA32F targets render and read back exactly; otherwise a reason. */
function floatSupportProblem(renderer: WebGLRenderer): string | null {
  if (!renderer.extensions.has('EXT_color_buffer_float')) return 'EXT_color_buffer_float is missing'
  if (renderer.capabilities.maxVertexTextures < 1) return 'No vertex texture units'
  if (renderer.capabilities.precision !== 'highp') return 'highp is unavailable'

  const rt = new WebGLRenderTarget(1, 1, {
    type: FloatType,
    format: RGBAFormat,
    depthBuffer: false,
  })
  const material = new ShaderMaterial({
    vertexShader: PROBE_VERT,
    fragmentShader: PROBE_FRAG,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  })
  const quad = new FullScreenQuad(material)
  const px = new Float32Array(4)
  let compileError = false
  const prevHandler = renderer.debug.onShaderError
  renderer.debug.onShaderError = () => {
    compileError = true
  }
  try {
    renderer.setRenderTarget(rt)
    quad.render(renderer)
    renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px)
  } finally {
    renderer.setRenderTarget(null)
    renderer.debug.onShaderError = prevHandler
    quad.dispose()
    material.dispose()
    rt.dispose()
  }
  if (compileError) return 'The float probe shader failed to compile'
  for (let i = 0; i < 4; i++) {
    const want = PROBE_VALUE[i]
    if (!(Math.abs(px[i] - want) <= 1e-6 * Math.abs(want))) {
      return `Float render targets are inexact (${px[i]} for ${want})`
    }
  }
  return null
}
