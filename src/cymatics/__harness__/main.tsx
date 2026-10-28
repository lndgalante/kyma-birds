// Plate lab: mounts <CymaticsPlate> with a controllable drive — a synthetic PlateDriveSource or the real
// audio engine playing a bird song. Usable by hand; Playwright drives it through `window.lab`.
import { StrictMode, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createAudioEngine } from '~/audio/engine/AudioEngine'
import type { BirdSongAsset, DriveFrame, PlateDriveSource } from '~/audio/engine/types'
import birdsJson from '~/data/birds.json'
import CymaticsPlate from '../CymaticsPlate'
import { PlateController, type PlateStats } from '../gpu/PlateController'
import { LOOK, TIERS } from '../params'
import { makeCalibration } from '../physics/calibration'
import type { PlateBird, PlateError, PlateShape, PlateTelemetry, QualityPreference } from '../types'

interface BirdEntry {
  slug: string
  commonName: string
  photo: { accentColor: string }
  audio: Omit<BirdSongAsset, 'id'> & { bandHz: { p10: number; p50: number; p90: number } }
}
const birds = birdsJson as unknown as BirdEntry[]
const bySlug = new Map(birds.map((b) => [b.slug, b]))
const birdOf = (slug: string): BirdEntry => bySlug.get(slug) ?? birds[0]
const plateBirdOf = (b: BirdEntry): PlateBird => ({
  id: b.slug,
  bandHz: b.audio.bandHz,
  peakHz: b.audio.peakHz,
})

// ── Lab state (one mutable store; React reads it through useSyncExternalStore) ───────────────

type Mode = 'synthetic' | 'engine'
interface LabState {
  mode: Mode
  bird: string
  shape: PlateShape
  quality: QualityPreference
  size: number
  strict: boolean
  mounted: boolean
  key: number
  held: boolean
  reducedMotion: boolean | undefined
  debug: boolean
  scatterToken: number
  // synthetic drive
  playing: boolean
  rank: number | null // when set, f1Hz follows the bird's calibration at this rank
  f1Hz: number
  f2Hz: number
  w2: number
  drive: number
  voiced: boolean
  tonal: boolean
}

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d)
const bool = (k: string, d: boolean) => (q.has(k) ? q.get(k) !== '0' && q.get(k) !== 'false' : d)

let state: LabState = {
  mode: q.get('mode') === 'engine' ? 'engine' : 'synthetic',
  bird: bySlug.has(q.get('bird') ?? '') ? q.get('bird')! : 'tui',
  shape: q.get('shape') === 'square' ? 'square' : 'circle',
  quality: (q.get('quality') as QualityPreference) ?? 'auto',
  size: num('size', 640),
  strict: bool('strict', true),
  mounted: bool('mounted', true),
  key: 0,
  held: bool('held', false),
  reducedMotion: q.has('rm') ? bool('rm', false) : undefined,
  debug: bool('debug', false),
  scatterToken: 0,
  playing: bool('playing', false),
  rank: q.has('f1') ? null : num('rank', 3),
  f1Hz: num('f1', 3000),
  f2Hz: num('f2', 0),
  w2: num('w2', 0),
  drive: num('drive', 0.85),
  voiced: bool('voiced', true),
  tonal: bool('tonal', true),
}
const listeners = new Set<() => void>()
function setState(patch: Partial<LabState>) {
  state = { ...state, ...patch }
  if (state.rank !== null) state.f1Hz = rankToHz(state.bird, state.rank)
  listeners.forEach((l) => l())
  synthListeners.forEach((l) => l())
}
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
const useLab = () => useSyncExternalStore(subscribe, () => state)

/** Inverse of the bird's calibration (§6.6): rank → bird Hz, piecewise log-linear through 3 anchors. */
function rankToHz(slug: string, rank: number): number {
  const b = birdOf(slug)
  const cal = makeCalibration(b.audio.bandHz, b.audio.peakHz)
  const [h0, h1, h2] = cal.hz.map(Math.log2)
  const [r0, r1, r2] = cal.ranks
  const x =
    rank <= r1
      ? h1 + ((rank - r1) * (h1 - h0)) / (r1 - r0)
      : h1 + ((rank - r1) * (h2 - h1)) / (r2 - r1)
  return 2 ** x
}
state.f1Hz = state.rank !== null ? rankToHz(state.bird, state.rank) : state.f1Hz

// ── Drive sources ────────────────────────────────────────────────────────────────────────────

const synthListeners = new Set<() => void>()
let onsetAt = -Infinity
const sweep = { active: false, t0: 0, sec: 1, from: 0, to: 0 }

const synthetic: PlateDriveSource = {
  read(nowMs: number, out: DriveFrame): DriveFrame {
    const s = state
    let f1 = s.f1Hz
    if (sweep.active) {
      const u = Math.min(1, (nowMs - sweep.t0) / (sweep.sec * 1000))
      f1 = rankToHz(s.bird, sweep.from + (sweep.to - sweep.from) * u)
      if (u >= 1) sweep.active = false
    }
    out.time = nowMs / 1000
    out.audible = s.playing
    out.songId = s.bird
    out.voiced = s.playing && s.voiced
    out.drive = s.playing ? s.drive : 0
    out.f1Hz = f1
    out.f2Hz = s.f2Hz
    out.w2 = s.w2
    out.tonal = s.tonal
    out.onset = Math.exp(-Math.max(0, nowMs - onsetAt) / 90)
    return out
  },
  isAudible: () => state.playing,
  subscribe(cb) {
    synthListeners.add(cb)
    return () => synthListeners.delete(cb)
  },
}

const engine = createAudioEngine()
const assetOf = (b: BirdEntry): BirdSongAsset => ({ id: b.slug, ...b.audio })

// One stable source for the plate; the lab switches what it reads from.
const source: PlateDriveSource = {
  read: (now, out) =>
    state.mode === 'engine' ? engine.driveSource.read(now, out) : synthetic.read(now, out),
  isAudible: () =>
    state.mode === 'engine' ? engine.driveSource.isAudible() : synthetic.isAudible(),
  subscribe(cb) {
    const a = synthetic.subscribe(cb)
    const b = engine.driveSource.subscribe(cb)
    return () => {
      a()
      b()
    }
  },
}

// ── Event log ────────────────────────────────────────────────────────────────────────────────

interface LabEvent {
  t: number
  type: 'ready' | 'error' | 'telemetry'
  data: unknown
}
const events: LabEvent[] = []
let lastTelemetry: PlateTelemetry | null = null
let telemetryCount = 0
const consoleErrors: string[] = []
window.addEventListener('error', (e) => consoleErrors.push(`error: ${e.message}`))
window.addEventListener('unhandledrejection', (e) =>
  consoleErrors.push(`rejection: ${String(e.reason)}`),
)
const log = (type: LabEvent['type'], data: unknown) => {
  if (type !== 'telemetry') events.push({ t: performance.now(), type, data })
}

// ── UI ───────────────────────────────────────────────────────────────────────────────────────

function Slider(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange(v: number): void
  fmt?: (v: number) => string
}) {
  return (
    <label>
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
      />
      <output>{props.fmt ? props.fmt(props.value) : props.value.toFixed(2)}</output>
    </label>
  )
}

function Check(props: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={props.value}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span>{props.label}</span>
    </label>
  )
}

const engineSubscribe = (cb: () => void) => engine.subscribe(cb)
const engineSnapshot = () => engine.getSnapshot()
function useEngineState() {
  return useSyncExternalStore(engineSubscribe, engineSnapshot)
}

function Panel() {
  const s = useLab()
  const snap = useEngineState()
  const [stats, setStats] = useState('')
  useEffect(() => {
    const id = setInterval(() => {
      const c = [...PlateController.live][0]
      const st = c?.stats()
      setStats(
        st
          ? `${st.tier} ${st.grains} grains  ${st.px.w}×${st.px.h}px @${st.pixelRatio}\n` +
              `fps ${st.fps.toFixed(0)}  p50 ${st.frameMs.p50.toFixed(1)}  p75 ${st.frameMs.p75.toFixed(1)} ms\n` +
              `mode ${st.drive.modeKey ?? '—'}  Γrms ${st.drive.gammaRms.toFixed(2)}  slots ${st.drive.count}  move ${st.drive.canMove}\n` +
              `running ${st.running}  steps ${st.steps}  renders ${st.renders}  field ${st.fieldRenders}\n` +
              `point ${st.pointPx.toFixed(2)}px  alpha ${st.alpha.toFixed(3)}  live ${PlateController.live.size}`
          : 'no plate',
      )
    }, 250)
    return () => clearInterval(id)
  }, [])
  const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)}k` : v.toFixed(0))
  return (
    <div className="panel">
      <fieldset>
        <legend>Plate</legend>
        <label>
          <span>bird</span>
          <select value={s.bird} onChange={(e) => lab.setBird(e.currentTarget.value)}>
            {birds.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.commonName}
              </option>
            ))}
          </select>
          <span />
        </label>
        <div className="row">
          {(['circle', 'square'] as const).map((sh) => (
            <button key={sh} aria-pressed={s.shape === sh} onClick={() => setState({ shape: sh })}>
              {sh}
            </button>
          ))}
          <select
            value={s.quality}
            onChange={(e) => setState({ quality: e.currentTarget.value as QualityPreference })}
          >
            {['auto', 'high', 'medium', 'low'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <Slider
          label="size"
          min={200}
          max={960}
          step={1}
          value={s.size}
          onChange={(v) => setState({ size: v })}
          fmt={(v) => `${v}px`}
        />
        <Check label="held" value={s.held} onChange={(v) => setState({ held: v })} />
        <Check
          label="reduced motion"
          value={!!s.reducedMotion}
          onChange={(v) => setState({ reducedMotion: v })}
        />
        <Check label="debug field" value={s.debug} onChange={(v) => setState({ debug: v })} />
        <Check
          label="StrictMode (remounts)"
          value={s.strict}
          onChange={(v) => lab.remount({ strict: v })}
        />
        <div className="row">
          <button onClick={() => lab.scatter()}>Scatter</button>
          <button onClick={() => lab.remount()}>Remount</button>
          <button onClick={() => setState({ mounted: !s.mounted })}>
            {s.mounted ? 'Unmount' : 'Mount'}
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend>Drive</legend>
        <div className="row">
          {(['synthetic', 'engine'] as const).map((m) => (
            <button key={m} aria-pressed={s.mode === m} onClick={() => setState({ mode: m })}>
              {m}
            </button>
          ))}
        </div>
        {s.mode === 'synthetic' ? (
          <>
            <Check
              label="playing (audible)"
              value={s.playing}
              onChange={(v) => setState({ playing: v })}
            />
            <Slider
              label="rank"
              min={-0.45}
              max={11.45}
              step={0.05}
              value={s.rank ?? 3}
              onChange={(v) => setState({ rank: v })}
            />
            <Slider
              label="f1"
              min={Math.log2(150)}
              max={Math.log2(12000)}
              step={0.005}
              value={Math.log2(s.f1Hz)}
              onChange={(v) => setState({ rank: null, f1Hz: 2 ** v })}
              fmt={(v) => hz(2 ** v)}
            />
            <Slider
              label="drive"
              min={0}
              max={1}
              step={0.01}
              value={s.drive}
              onChange={(v) => setState({ drive: v })}
            />
            <Slider
              label="f2"
              min={0}
              max={12000}
              step={10}
              value={s.f2Hz}
              onChange={(v) => setState({ f2Hz: v })}
              fmt={hz}
            />
            <Slider
              label="w2"
              min={0}
              max={0.6}
              step={0.01}
              value={s.w2}
              onChange={(v) => setState({ w2: v })}
            />
            <Check label="voiced" value={s.voiced} onChange={(v) => setState({ voiced: v })} />
            <Check label="tonal" value={s.tonal} onChange={(v) => setState({ tonal: v })} />
            <div className="row">
              <button onClick={() => lab.onset()}>Onset</button>
              <button onClick={() => lab.sweep(0, 8, 3)}>Sweep 0→8</button>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <button onClick={() => void lab.engineListen()}>Listen</button>
              <button onClick={() => engine.toggle()}>Play / pause</button>
            </div>
            <pre>{`${snap.state}${snap.error ? ` (${snap.error})` : ''}  ${snap.playingId ?? ''}`}</pre>
          </>
        )}
      </fieldset>
      <pre>{stats}</pre>
    </div>
  )
}

function Stage() {
  const s = useLab()
  const snap = useEngineState()
  const b = birdOf(s.bird)
  const plateBird = useMemo(() => plateBirdOf(b), [b])
  const paused = s.mode === 'engine' ? snap.state !== 'playing' : !s.playing
  return (
    <div className="stage" data-shape={s.shape} style={{ width: s.size, height: s.size }}>
      {s.mounted && (
        <CymaticsPlate
          key={s.key}
          source={source}
          bird={plateBird}
          plateShape={s.shape}
          paused={paused}
          held={s.held}
          scatterToken={s.scatterToken}
          reducedMotion={s.reducedMotion}
          quality={s.quality}
          debug={s.debug}
          accentColor={b.photo.accentColor}
          onReady={(i) => log('ready', i)}
          onError={(e: PlateError) => log('error', e)}
          onTelemetry={(t) => {
            lastTelemetry = t
            telemetryCount++
            log('telemetry', t)
          }}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <>
      <Panel />
      <Stage />
    </>
  )
}

// ── Mounting and the scripting API ───────────────────────────────────────────────────────────

let root: Root | null = null
function render() {
  root?.unmount()
  root = createRoot(document.getElementById('root')!)
  root.render(
    state.strict ? (
      <StrictMode>
        <App />
      </StrictMode>
    ) : (
      <App />
    ),
  )
}

const live = () => [...PlateController.live]
const one = () => {
  const c = live()[0]
  if (!c) throw new Error('no live plate')
  return c
}

const lab = {
  state: () => state,
  set: (patch: Partial<LabState>) => setState(patch),
  setBird(slug: string) {
    setState({ bird: slug })
    if (state.mode === 'engine') engine.load(assetOf(birdOf(slug)))
  },
  scatter: () => setState({ scatterToken: state.scatterToken + 1 }),
  onset() {
    onsetAt = performance.now()
    synthListeners.forEach((l) => l())
  },
  sweep(fromRank: number, toRank: number, sec: number) {
    Object.assign(sweep, { active: true, t0: performance.now(), sec, from: fromRank, to: toRank })
    synthListeners.forEach((l) => l())
  },
  /** Remount the whole React root (optionally toggling StrictMode). */
  remount(patch: Partial<LabState> = {}) {
    state = { ...state, ...patch, key: state.key + 1 }
    render()
  },
  async engineListen(slug = state.bird) {
    setState({ mode: 'engine', bird: slug })
    const p = engine.listen() // synchronous prefix must run inside the gesture
    engine.load(assetOf(birdOf(slug)))
    await p
  },
  engineState: () => engine.getSnapshot(),
  engineToggle: () => engine.toggle(),
  counts: () => ({
    created: PlateController.createdCount,
    disposed: PlateController.disposedCount,
    live: PlateController.live.size,
    canvases: document.querySelectorAll('.stage canvas').length,
  }),
  stats: (): PlateStats => one().stats(),
  simulate: (sec: number, fps = 60) => one().simulate(sec, fps),
  resume: () => one().resume(),
  bench: (frames = 120) => one().bench(frames),
  forceDowngrade: () => one().forceDowngrade(),
  loseContext: () => one().loseContext(),
  restoreContext: () => one().restoreContext(),
  /** Summary of the sand state: positions hash plus mobility stats (a frozen pattern hashes identically). */
  stateDigest() {
    const s = one().readState()
    let h = 2166136261
    let moving = 0
    const u = new Uint32Array(s.buffer)
    for (let i = 0; i < s.length; i += 4) {
      h = Math.imul(h ^ u[i], 16777619)
      h = Math.imul(h ^ u[i + 1], 16777619)
      if (s[i + 2] > 0) moving++
    }
    return { hash: h >>> 0, grains: s.length / 4, moving }
  },
  rankToHz: (rank: number) => rankToHz(state.bird, rank),
  /** Lab only: patch LOOK / TIERS in place (they are plain objects at runtime) and remount. */
  tune(patch: { look?: object; tiers?: object }) {
    deepAssign(LOOK, patch.look)
    deepAssign(TIERS, patch.tiers)
    lab.remount()
  },
  look: () => ({ look: LOOK, tiers: TIERS }),
  events: () => events,
  telemetry: () => lastTelemetry,
  telemetryCount: () => telemetryCount,
  errors: () => consoleErrors,
}

function deepAssign(target: object, patch: object | undefined) {
  if (!patch) return
  const t = target as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object')
      deepAssign(t[k] as object, v as object)
    else t[k] = v
  }
}

declare global {
  interface Window {
    lab: typeof lab
  }
}
window.lab = lab
render()
