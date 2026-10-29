// GLSL for the plate (docs/specs/engine.md §7.3, §8.3). Three-free strings only.
//
// Every shader runs as a ShaderMaterial, so three prefixes `#version 300 es`, the precision qualifiers,
// `#define texture2D texture` and `#define gl_FragColor pc_fragColor`: write texture()/texelFetch() and
// gl_FragColor. Constants that also exist on the CPU side are spliced in from params.ts.
import { DRIVE, SIM } from '../params'
import { PCG_GLSL } from '../physics/pcg'

/** pcg3d / rand3 / spawnPos, bit-identical to physics/pcg.ts. */
export const PCG = PCG_GLSL

/** Full-screen passes: the geometry already spans clip space (FullScreenQuad triangle, PlaneGeometry(2, 2)). */
const CLIP_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`
export const FIELD_VERT = CLIP_VERT
export const PLATE_VERT = CLIP_VERT
export const PROBE_VERT = CLIP_VERT

/** Float render-target probe (§8.1 step 3): these exact values must survive an RGBA32F round trip. */
export const PROBE_VALUE = [0.123, -4.5, 1e5, 1.0] as const
export const PROBE_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(${PROBE_VALUE.map(glslFloat).join(', ')}); }
`

/** Field pass → 256² RGBA16F: (U1, U2, ∂I/∂x, ∂I/∂y) over [−uExt, uExt]². */
export const FIELD_FRAG = /* glsl */ `
#define MAX_SLOTS ${DRIVE.maxSlots}
#define LUT_W ${SIM.lutWidth}
uniform sampler2D uLut;
uniform float uLutRMax, uExt, uRes, uBoltR;
uniform vec4 uSlot[MAX_SLOTS];
uniform vec2 uCoef[MAX_SLOTS];
uniform int uCount, uShape;
vec2 radial(float row, float r) {
  float x = clamp(r / uLutRMax, 0.0, 1.0) * float(LUT_W - 1);
  int i0 = min(int(x), LUT_W - 2); float t = x - float(i0); int iy = int(row + 0.5);
  return mix(texelFetch(uLut, ivec2(i0, iy), 0).rg, texelFetch(uLut, ivec2(i0 + 1, iy), 0).rg, t);
}
void main() {
  vec2 p = (gl_FragCoord.xy / uRes * 2.0 - 1.0) * uExt;
  float u1 = 0.0, u2 = 0.0; vec2 g1 = vec2(0.0), g2 = vec2(0.0);
  float r = max(length(p), 1e-4); vec2 er = p / r;
  if (uShape == 0) {
    vec2 et = vec2(-er.y, er.x);
    float th = atan(p.y, p.x) - 1.5707963268;
    for (int i = 0; i < MAX_SLOTS; i++) {
      if (i >= uCount) break;
      vec4 s = uSlot[i]; vec2 c = uCoef[i];
      vec2 R = radial(s.x, r);
      float cn = cos(s.y * th), sn = sin(s.y * th);
      float phi = R.x * cn;
      vec2 gphi = R.y * cn * er - (s.y * R.x / r) * sn * et;
      u1 += c.x * phi; u2 += c.y * phi; g1 += c.x * gphi; g2 += c.y * gphi;
    }
  } else {
    const float HP = 1.5707963268;
    vec2 a = (p + 1.0) * HP;
    for (int i = 0; i < MAX_SLOTS; i++) {
      if (i >= uCount) break;
      vec4 s = uSlot[i]; vec2 c = uCoef[i]; float m = s.x, n = s.y, kk = s.z;
      float cmx = cos(m * a.x), cnx = cos(n * a.x), cmy = cos(m * a.y), cny = cos(n * a.y);
      float smx = sin(m * a.x), snx = sin(n * a.x), smy = sin(m * a.y), sny = sin(n * a.y);
      float phi = kk * (cmx * cny + cnx * cmy);
      vec2 gphi = kk * HP * vec2(-m * smx * cny - n * snx * cmy, -n * cmx * sny - m * cnx * smy);
      u1 += c.x * phi; u2 += c.y * phi; g1 += c.x * gphi; g2 += c.y * gphi;
    }
    if (uBoltR > 0.0) {
      float e0 = 0.55 * uBoltR, t = clamp((r - e0) / (uBoltR - e0), 0.0, 1.0);
      float h = t * t * (3.0 - 2.0 * t), dh = 6.0 * t * (1.0 - t) / (uBoltR - e0);
      g1 = h * g1 + u1 * dh * er; g2 = h * g2 + u2 * dh * er; u1 *= h; u2 *= h;
    }
  }
  gl_FragColor = vec4(u1, u2, 2.0 * (u1 * g1 + u2 * g2));
}
`

/**
 * GPUComputationRenderer variable 'tState' (RGBA32F: x, y, mobility, visible-from). init() prepends
 * `uniform sampler2D tState;`. Frozen grains (mob = 0) are written back bit-identical.
 */
export const SAND_STEP_FRAG = /* glsl */ `
uniform sampler2D uField;
uniform float uFieldExt, uDt, uGmax, uSigma, uKappa, uW, uGsat, uDriftMax, uKick;
uniform float uFrame, uClock, uThetaLo, uThetaHi, uHeavyFrac, uHeavyMul, uRim, uTrickle;
uniform int uShape;
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(tState, tc, 0);
  vec2 p = s.xy; float w = s.w;
  vec3 k = rand3(uvec3(uvec2(tc), 0x2A5Fu));
  float theta = mix(uThetaLo, uThetaHi, k.x) * (k.y < uHeavyFrac ? uHeavyMul : 1.0);
  vec4 F = texture(uField, p / (2.0 * uFieldExt) + 0.5);
  float gam = uGmax * sqrt(F.x * F.x + F.y * F.y);
  float mob = clamp((gam - theta) / uW, 0.0, 1.0);
  if (mob > 0.0) {
    vec3 r = rand3(uvec3(uvec2(tc), uint(uFrame)));
    vec2 xi = sqrt(-2.0 * log(max(r.x, 1e-7))) * vec2(cos(6.283185307 * r.y), sin(6.283185307 * r.y));
    vec2 drift = -uKappa * mob * uGmax * uGmax * F.zw * uDt;
    float dl = length(drift);
    if (dl > uDriftMax) drift *= uDriftMax / dl;
    p += drift + xi * (uSigma * uKick * mob * min(gam, uGsat) * sqrt(uDt));
    if (uShape == 0) {
      float rr = length(p);
      if (rr > uRim) p *= max(2.0 * uRim - rr, 0.5 * uRim) / rr;
    } else {
      p = mix(p, sign(p) * 2.0 - p, step(1.0, abs(p)));
      p = clamp(p, -1.0, 1.0);
    }
  }
  vec3 t = rand3(uvec3(uvec2(tc), uint(uFrame) ^ 0x9E3779B9u));
  bool bad = !(abs(p.x) < 4.0 && abs(p.y) < 4.0);
  if (bad || t.z < uTrickle) { p = spawnPos(t, uShape, uRim); w = uClock + 0.15 * t.x; mob = 0.0; }
  gl_FragColor = vec4(p, mob, w);
}
`

/** Uniform scatter into BOTH tState targets (gpu.doRenderTarget). Grains fade in from clock + pour·u. */
export const SCATTER_FRAG = /* glsl */ `
uniform float uSeed;
uniform float uClock, uPour, uRim;
uniform int uShape;
void main() {
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec3 r = rand3(uvec3(uvec2(tc), uint(uSeed) * 747796405u + 1u));
  gl_FragColor = vec4(spawnPos(r, uShape, uRim), 0.0, uClock + uPour * r.z);
}
`

/**
 * One point per grain, addressed by the grain index in `position.x` (three declares it vec3; y, z = 0).
 * Equal to gl_VertexID under drawArrays, but reading it keeps attribute 0 live (see GrainLayer).
 */
export const GRAIN_VERT = /* glsl */ `
uniform sampler2D uState;
uniform int uStateW;
uniform vec2 uScale;
uniform float uPointPx, uAlpha, uFade, uClock, uFrame, uJitter, uFlicker, uBoltR, uShapeMix, uGrainFade;
uniform float uRestLift, uRestAlpha, uRestFalloff;
uniform vec2 uSizeRange, uAlphaRange;
varying float vAlpha;
varying float vSoft;
void main() {
  int id = int(position.x + 0.5);
  vec4 s = texelFetch(uState, ivec2(id % uStateW, id / uStateW), 0);
  vec3 c = rand3(uvec3(uint(id), 0x51u, 0x7Bu));
  vec3 j = rand3(uvec3(uint(id), uint(uFrame), 0x11u));
  float hop = s.z;
  vec2 p = s.xy + (j.xy - 0.5) * (uJitter * hop);
  gl_Position = vec4(p * uScale, 0.0, 1.0);
  float size = uPointPx * mix(uSizeRange.x, uSizeRange.y, c.x);
  gl_PointSize = clamp(size, 1.0, 6.0);
  vSoft = smoothstep(1.5, 2.5, size);
  float vis = clamp((uClock - s.w) / uGrainFade, 0.0, 1.0);
  float bolt = uShapeMix > 0.5 && length(s.xy) < uBoltR ? 0.0 : 1.0;
  // Resting sand is dim dust, thinner toward the rim; the song lifts it (uRestLift 0 → 1).
  float rest = mix(uRestAlpha * (1.0 - uRestFalloff * dot(s.xy, s.xy)), 1.0, uRestLift);
  vAlpha = uAlpha * uFade * vis * bolt * rest * mix(uAlphaRange.x, uAlphaRange.y, c.y)
         * (1.0 + uFlicker * hop * (j.z - 0.5));
}
`

/** Premultiplied sand splat; additive (ONE, ONE) over the plate. */
export const GRAIN_FRAG = /* glsl */ `
uniform vec3 uSand;
varying float vAlpha;
varying float vSoft;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = vAlpha * mix(1.0, 1.0 - smoothstep(0.16, 0.25, dot(d, d)), vSoft);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uSand * a, a);
}
`

/**
 * The square's surface, bevel and bolt (the plate lab), and the debug field heat. The circle's surface
 * and rim are the page's (PlateFigure's frame), so the canvas stays clear there and the room shows
 * through; the square's surface fades in as the shape morphs. Writes premultiplied display-sRGB colour
 * directly (no colorspace chunk), with alpha 0 outside the plate.
 */
export const PLATE_FRAG = /* glsl */ `
uniform vec2 uViewportPx, uScale;
uniform float uPxPerUnit, uShapeMix, uBoltR, uGmax, uFieldExt, uDebug;
uniform sampler2D uField;
uniform vec3 uAccent, uSquareIn, uSquareOut;
float sdBox(vec2 p) { vec2 d = abs(p) - 1.0; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main() {
  vec2 p = (gl_FragCoord.xy / uViewportPx * 2.0 - 1.0) / uScale;
  float aa = 1.0 / uPxPerUnit, rl = length(p);
  float sd = mix(rl - 1.0, sdBox(p), uShapeMix);
  float body = 1.0 - smoothstep(-aa, aa, sd);
  vec3 col = mix(uSquareIn, uSquareOut, clamp(dot(p, p), 0.0, 1.0));
  col *= 1.0 + 0.024 * (rand3(uvec3(uvec2(gl_FragCoord.xy), 7u)).x - 0.5);
  float bevel = max(1.0 - smoothstep(0.0, 2.0 * aa, 1.0 - p.y), 1.0 - smoothstep(0.0, 2.0 * aa, 1.0 + p.x));
  col += 0.06 * bevel * uShapeMix;
  float inBolt = (1.0 - smoothstep(uBoltR - aa, uBoltR + aa, rl)) * uShapeMix;
  vec2 q = p / uBoltR; float nz = sqrt(max(0.0, 1.0 - dot(q, q)));
  float spec = pow(max(dot(normalize(vec3(q, nz)), normalize(vec3(-0.55, 0.62, 0.9))), 0.0), 24.0);
  vec3 boltCol = vec3(0.28) + vec3(0.14) * nz + vec3(0.6) * spec;
  float outline = smoothstep(uBoltR - 2.0 * aa, uBoltR, rl) * (1.0 - smoothstep(uBoltR, uBoltR + aa, rl));
  col = mix(col, boltCol * (1.0 - 0.7 * outline), inBolt);
  float a = body * uShapeMix;
  vec3 rgb = col * a;
  if (uDebug > 0.5) {
    // Added light (premultiplied, no coverage), so it also shows over the page's circle.
    vec4 F = texture(uField, p / (2.0 * uFieldExt) + 0.5);
    rgb += body * uAccent * 0.35 * smoothstep(0.0, 8.0, uGmax * length(F.xy));
  }
  gl_FragColor = vec4(rgb, a);
}
`

/** A GLSL float literal (always with a decimal point or exponent). */
function glslFloat(x: number): string {
  const s = String(x)
  return /[.e]/.test(s) ? s : `${s}.0`
}
