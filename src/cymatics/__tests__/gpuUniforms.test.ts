// three silently ignores a uniform the shader declares but the material never provides (it stays 0), so a
// typo would only show up as a wrong-looking plate. Build each GPU object against a recording fake renderer
// and check every declared uniform is bound.
import type { WebGLRenderer } from 'three'
import { describe, expect, it } from 'vitest'
import { FieldPass } from '../gpu/FieldPass'
import { GrainLayer } from '../gpu/GrainLayer'
import { PlateLayer } from '../gpu/PlateLayer'
import { SandSim } from '../gpu/SandSim'
import { FIELD_FRAG, PCG, PROBE_FRAG, PROBE_VALUE } from '../gpu/shaders'
import { DRIVE, SIM } from '../params'
import { PCG_GLSL } from '../physics/pcg'

function fakeRenderer() {
  const calls: string[] = []
  let target: unknown = null
  const r = {
    calls,
    capabilities: { maxVertexTextures: 16 },
    xr: { enabled: false },
    shadowMap: { autoUpdate: false },
    getRenderTarget: () => target,
    setRenderTarget: (t: unknown) => {
      target = t
    },
    render: () => calls.push('render'),
    readRenderTargetPixels: () => {},
  }
  return r as typeof r & WebGLRenderer
}

/** Uniform names declared in a GLSL source (arrays without their size). */
function declaredUniforms(src: string): string[] {
  const names: string[] = []
  for (const m of src.matchAll(/^\s*uniform\s+\w+\s+([^;]+);/gm)) {
    for (const part of m[1].split(',')) names.push(part.trim().replace(/\[.*$/, ''))
  }
  return names
}

function expectBound(material: { vertexShader: string; fragmentShader: string; uniforms: object }) {
  const declared = new Set([
    ...declaredUniforms(material.vertexShader),
    ...declaredUniforms(material.fragmentShader),
  ])
  expect(declared.size).toBeGreaterThan(0)
  for (const name of declared) expect(Object.keys(material.uniforms)).toContain(name)
}

describe('GPU objects bind every uniform their shaders declare', () => {
  const renderer = fakeRenderer()
  const field = new FieldPass(renderer, 'square')

  it('FieldPass', () => {
    const mat = (field as unknown as { material: Parameters<typeof expectBound>[0] }).material
    expectBound(mat)
    const u = mat.uniforms as Record<string, { value: unknown }>
    expect(u.uBoltR.value).toBe(SIM.boltFlatR)
    field.setShape('circle')
    expect(u.uBoltR.value).toBe(0)
    expect(u.uShape.value).toBe(0)
  })

  it('FieldPass.render hands the drive arrays over without copying', () => {
    const slots = new Float32Array(DRIVE.maxSlots * 4)
    const coefs = new Float32Array(DRIVE.maxSlots * 2)
    field.render({ count: 99, slots, coefs })
    const u = (field as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms
    expect(u.uSlot.value).toBe(slots)
    expect(u.uCoef.value).toBe(coefs)
    expect(u.uCount.value).toBe(DRIVE.maxSlots)
    expect(renderer.getRenderTarget()).toBe(null)
  })

  it('SandSim (step and scatter materials)', () => {
    const sim = new SandSim(renderer, 8, 4, field.texture, 'circle')
    const internals = sim as unknown as {
      stateVar: { material: Parameters<typeof expectBound>[0] }
      scatterMat: Parameters<typeof expectBound>[0]
    }
    expectBound(internals.stateVar.material)
    expectBound(internals.scatterMat)
    expect(sim.count).toBe(32)
    // Float uniforms are exact only below 2^24: the counters wrap there.
    sim.step(2 ** 24 + 5, 1, 1.4, 0.01)
    const su = internals.stateVar.material.uniforms as Record<string, { value: number }>
    expect(su.uFrame.value).toBe(5)
    expect(su.uKick.value).toBe(1.4)
    sim.setShape('square')
    expect(su.uHeavyFrac.value).toBe(SIM.heavyFrac.square)
    sim.scatter(2 ** 24 + 7, 3, 0.5)
    const cu = internals.scatterMat.uniforms as Record<string, { value: number }>
    expect(cu.uSeed.value).toBe(7)
    sim.dispose()
  })

  it('GrainLayer and PlateLayer', () => {
    const grains = new GrainLayer(8, 4, field.texture)
    expectBound(grains.points.material)
    // position.x is the grain index GRAIN_VERT reads (keeps attribute 0 a live array).
    const ids = () => Array.from(grains.points.geometry.getAttribute('position').array)
    expect(ids()).toEqual(Array.from({ length: 32 }, (_, i) => i))
    expect(grains.points.geometry.boundingSphere).not.toBeNull()
    grains.resize(4, 4, field.texture)
    expect(ids()).toEqual(Array.from({ length: 16 }, (_, i) => i))
    expect(grains.uniforms.uStateW.value).toBe(4)
    const plate = new PlateLayer(field.texture)
    expectBound(plate.mesh.material)
    grains.dispose()
    plate.dispose()
    field.dispose()
  })
})

describe('shader sources', () => {
  it('splice the CPU constants and the verified PCG chunk', () => {
    expect(PCG).toBe(PCG_GLSL)
    expect(FIELD_FRAG).toContain(`#define MAX_SLOTS ${DRIVE.maxSlots}`)
    expect(FIELD_FRAG).toContain(`#define LUT_W ${SIM.lutWidth}`)
  })

  it('write the probe value as GLSL float literals', () => {
    expect(PROBE_FRAG).toContain('vec4(0.123, -4.5, 100000.0, 1.0)')
    expect(PROBE_VALUE).toEqual([0.123, -4.5, 1e5, 1])
  })
})
