// Real-browser harness for the audio engine (driven by a Playwright script; also usable by hand).
// Exposes `window.harness` with checks that return plain JSON.
import birdsJson from '../../../data/birds.json'
import { createAudioEngine, type WebAudioEngine } from '../AudioEngine'
import { FADE_IN } from '../fades'
import { resolveLoopRegion } from '../loopRegion'
import { ANALYSIS, AUDIO } from '../params'
import { SongAnalyzer, type AnalyzerHost } from '../SongAnalyzer'
import { createDriveFrame, createSongFeatures, type BirdSongAsset } from '../types'

interface BirdEntry {
  slug: string
  commonName: string
  audio: {
    src: string
    durationSec: number
    sampleRate: number
    validFrames: number
    primingFrames: number
    bandHz: { p10: number; p50: number; p90: number }
    peakHz: number
  }
}

const birds = birdsJson as unknown as BirdEntry[]
const bySlug = new Map(birds.map((b) => [b.slug, b]))
// Exactly the shell's adapter (engine.md §9.3): extra manifest fields ride along untouched.
const assetOf = (b: BirdEntry): BirdSongAsset => ({ id: b.slug, ...b.audio })
const bird = (slug: string) => {
  const b = bySlug.get(slug)
  if (!b) throw new Error(`unknown bird ${slug}`)
  return b
}

const errors: string[] = []
window.addEventListener('error', (e) => errors.push(`error: ${e.message}`))
window.addEventListener('unhandledrejection', (e) => errors.push(`rejection: ${String(e.reason)}`))

let engine = createAudioEngine() as WebAudioEngine

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const frame = () => new Promise<number>((r) => requestAnimationFrame(r))
async function waitFor(cond: () => boolean, timeoutMs = 8000) {
  const end = performance.now() + timeoutMs
  while (!cond()) {
    if (performance.now() > end) throw new Error('waitFor timed out')
    await frame()
  }
}

// ── Statistics ─────────────────────────────────────────────────────────────────────────────

interface Sample {
  t: number
  voiced: boolean
  f1: number
  f1raw: number
  drive: number
  onset: number
  tonal: boolean
  f2: number
  w2: number
  snr: number
  loud: number
  flux?: number
  thr?: number
  crest?: number
}

const round = (x: number, d = 0) => {
  const k = 10 ** d
  return Math.round(x * k) / k
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return NaN
  const i = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * p))
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function weightedPercentile(values: number[], weights: number[], p: number) {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  const total = weights.reduce((s, w) => s + w, 0)
  if (!(total > 0)) return NaN
  let acc = 0
  for (const i of idx) {
    acc += weights[i]
    if (acc >= p * total) return values[i]
  }
  return values[idx[idx.length - 1]]
}

function summarize(samples: Sample[], b: BirdEntry, seconds: number) {
  const voiced = samples.filter((s) => s.voiced)
  const f1 = voiced.map((s) => s.f1).sort((a, b) => a - b)
  const raw = voiced.map((s) => s.f1raw).filter((f) => f > 0)
  raw.sort((a, b) => a - b)
  const drives = samples.map((s) => s.drive).sort((a, b) => a - b)
  const { p10, p90 } = b.audio.bandHz
  const inBand = voiced.filter((s) => s.f1 >= p10 / 1.2 && s.f1 <= p90 * 1.2).length
  const onsets = samples.filter((s) => s.onset === 1).length
  const tonal = voiced.filter((s) => s.tonal).length
  const f2 = voiced.filter((s) => s.f2 > 0).length
  const snr = samples.map((s) => s.snr).sort((a, b) => a - b)
  const pct = (n: number, d: number) => (d > 0 ? round((100 * n) / d, 1) : 0)
  return {
    frames: samples.length,
    voicedPct: pct(voiced.length, samples.length),
    f1: {
      p10: round(percentile(f1, 0.1)),
      p50: round(percentile(f1, 0.5)),
      p90: round(percentile(f1, 0.9)),
    },
    f1DriveWeighted: {
      p10: round(
        weightedPercentile(
          voiced.map((s) => s.f1),
          voiced.map((s) => s.drive),
          0.1,
        ),
      ),
      p50: round(
        weightedPercentile(
          voiced.map((s) => s.f1),
          voiced.map((s) => s.drive),
          0.5,
        ),
      ),
      p90: round(
        weightedPercentile(
          voiced.map((s) => s.f1),
          voiced.map((s) => s.drive),
          0.9,
        ),
      ),
    },
    f1raw: {
      p10: round(percentile(raw, 0.1)),
      p50: round(percentile(raw, 0.5)),
      p90: round(percentile(raw, 0.9)),
    },
    manifest: { ...b.audio.bandHz, peak: b.audio.peakHz },
    inBandPct: pct(inBand, voiced.length),
    tonalPct: pct(tonal, voiced.length),
    line2Pct: pct(f2, voiced.length),
    onsetsPerSec: round(onsets / seconds, 2),
    onsetsPerVoicedSec: round(
      onsets / Math.max(1e-9, (voiced.length / samples.length) * seconds),
      2,
    ),
    drive: {
      mean: round(drives.reduce((s, d) => s + d, 0) / Math.max(1, drives.length), 3),
      p50: round(percentile(drives, 0.5), 3),
      p90: round(percentile(drives, 0.9), 3),
      over05Pct: pct(drives.filter((d) => d > 0.5).length, drives.length),
    },
    snrDb: {
      p10: round(percentile(snr, 0.1), 1),
      p50: round(percentile(snr, 0.5), 1),
      p90: round(percentile(snr, 0.9), 1),
    },
  }
}

// ── Checks ─────────────────────────────────────────────────────────────────────────────────

/** Decode every song at 44.1 kHz and at the device rate; loop region and seam continuity. */
async function decodeAll() {
  const live = new AudioContext()
  const deviceRate = live.sampleRate
  await live.close()
  const out = []
  for (const b of birds) {
    const bytes = await (await fetch(b.audio.src)).arrayBuffer()
    const rows: Record<string, unknown> = { slug: b.slug, manifestSec: b.audio.durationSec }
    for (const rate of [44100, deviceRate]) {
      const ctx = new OfflineAudioContext(1, 1, rate)
      const buf = await ctx.decodeAudioData(bytes.slice(0))
      const region = resolveLoopRegion(assetOf(b), buf.duration)
      const x = buf.getChannelData(0)
      let firstNonZero = 0
      while (firstNonZero < x.length && x[firstNonZero] === 0) firstNonZero++
      let lastNonZero = x.length - 1
      while (lastNonZero > 0 && x[lastNonZero] === 0) lastNonZero--
      // Seam: the jump from the loop's last sample back to its first, vs typical steps.
      const s = Math.round(region.start * rate)
      const e = Math.round(region.end * rate) - 1
      let stepSum = 0
      for (let i = s + 1; i <= e; i++) stepSum += Math.abs(x[i] - x[i - 1])
      const meanStep = stepSum / Math.max(1, e - s)
      const seam = Math.abs(x[s] - x[e])
      rows[`r${rate}`] = {
        decodedSec: round(buf.duration, 6),
        frames: buf.length,
        excessFrames: round(buf.length - b.audio.durationSec * rate, 1),
        mode: region.mode,
        loopStart: round(region.start, 6),
        loopEnd: round(region.end, 6),
        leadingZeros: firstNonZero,
        trailingZeros: x.length - 1 - lastNonZero,
        seamOverMeanStep: round(seam / meanStep, 2),
      }
    }
    out.push(rows)
  }
  return { deviceRate, birds: out }
}

/**
 * Full-loop analysis faster than real time: the song runs through an OfflineAudioContext that
 * suspends every 1/60 s so the real SongAnalyzer reads the real AnalyserNode, exactly as the
 * engine's rAF readers would (fade-in and band handling included).
 */
async function offlineAnalyze(slug: string, sampleRate = 48000, maxSec = 40, traceEvery = 0) {
  const b = bird(slug)
  const asset = assetOf(b)
  const bytes = await (await fetch(b.audio.src)).arrayBuffer()
  const seconds = Math.min(maxSec, b.audio.durationSec + 1)
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate)
  const buffer = await ctx.decodeAudioData(bytes)
  const region = resolveLoopRegion(asset, buffer.duration)
  const src = new AudioBufferSourceNode(ctx, {
    buffer,
    loop: true,
    loopStart: region.start,
    loopEnd: region.end,
  })
  const fade = new GainNode(ctx, { gain: 0 })
  const analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 })
  const sink = new GainNode(ctx, { gain: 0 })
  src.connect(fade).connect(analyser).connect(sink).connect(ctx.destination)
  const t0 = AUDIO.startDelaySec
  fade.gain.setValueCurveAtTime(FADE_IN, t0, AUDIO.xfInSec)
  src.start(t0, region.start)
  const host: AnalyzerHost = {
    get currentTime() {
      return ctx.currentTime
    },
    sampleRate,
    isAudible: () => true,
    currentSongId: () => slug,
  }
  const an = new SongAnalyzer(analyser, host)
  an.onVoiceStart(asset, t0)
  const samples: Sample[] = []
  let cpuSum = 0
  let cpuMax = 0
  const step = 1 / 60
  for (let k = 1; k * step < seconds - step; k++) {
    const t = k * step
    void ctx.suspend(t).then(() => {
      const c0 = performance.now()
      an.update(t * 1000)
      const c = performance.now() - c0
      cpuSum += c
      cpuMax = Math.max(cpuMax, c)
      const f = an.pick(Infinity)!
      const d = an.debug
      samples.push({
        t,
        voiced: f.voiced,
        f1: f.f1Hz,
        f1raw: d.f1raw,
        drive: f.drive,
        onset: f.onset,
        tonal: f.tonal,
        f2: f.f2Hz,
        w2: f.w2,
        snr: d.snrDb,
        loud: d.loud,
        flux: d.flux,
        thr: d.onsetThreshold,
        crest: d.crest,
      })
      void ctx.resume()
    })
  }
  await ctx.startRendering()
  // Skip the band glide / floor learning and the fade-in, then exactly one loop.
  const from = t0 + Math.max(ANALYSIS.bandGlideSec, AUDIO.xfInSec) + 0.02
  const loopSamples = samples.filter((s) => s.t >= from && s.t < from + b.audio.durationSec)
  return {
    slug,
    sampleRate,
    loopMode: region.mode,
    summary: summarize(loopSamples, b, b.audio.durationSec),
    updateMs: { mean: round(cpuSum / Math.max(1, samples.length), 4), max: round(cpuMax, 3) },
    trace: loopSamples
      .filter((_, i) => traceEvery > 0 && i % traceEvery === 0)
      .map((s) => [
        round(s.t, 2),
        s.voiced ? 1 : 0,
        round(s.f1),
        round(s.f1raw),
        round(s.drive, 2),
        round(s.snr, 1),
        round(s.loud, 2),
        round(s.flux ?? 0, 1),
        round(s.thr ?? 0, 1),
        s.onset === 1 ? 1 : 0,
        round(s.crest ?? 0, 1),
      ]),
  }
}

/** Plays a song through the real engine for `seconds` and records what the plate would read. */
async function realtimeRun(slug: string, seconds = 8) {
  const b = bird(slug)
  engine.load(assetOf(b))
  if (!engine.getSnapshot().unlocked) await engine.listen()
  await waitFor(() => {
    const s = engine.getSnapshot()
    return s.state === 'playing' && s.playingId === slug
  })
  await sleep(700) // crossfade + band glide + floor re-learn
  const out = createDriveFrame()
  const feat = createSongFeatures()
  const samples: Sample[] = []
  let maxVoices = 0
  let lastTime = -1
  let loopPosMax = 0
  let wrongSong = 0
  const end = performance.now() + seconds * 1000
  while (performance.now() < end) {
    const now = await frame()
    engine.driveSource.read(now, out)
    engine.readFeatures(performance.now(), feat)
    maxVoices = Math.max(maxVoices, engine.inspect().voices.length)
    loopPosMax = Math.max(loopPosMax, feat.loopPosition)
    if (out.songId !== slug) wrongSong++
    if (out.time === lastTime) continue
    lastTime = out.time
    const d = engine.analysisDebug!
    samples.push({
      t: out.time,
      voiced: out.voiced,
      f1: out.f1Hz,
      f1raw: d.f1raw,
      drive: out.drive,
      onset: out.onset,
      tonal: out.tonal,
      f2: out.f2Hz,
      w2: out.w2,
      snr: d.snrDb,
      loud: d.loud,
    })
  }
  const v = engine.inspect().voices.find((x) => x.id === slug && !x.retiring)
  return {
    slug,
    sampleRate: engine.inspect().sampleRate,
    decodedSec: v ? round(v.bufferDuration, 6) : null,
    manifestSec: b.audio.durationSec,
    loopMode: v?.region.mode ?? null,
    region: v ? { start: round(v.region.start, 6), end: round(v.region.end, 6) } : null,
    maxVoices,
    wrongSongFrames: wrongSong,
    loopPosMax: round(loopPosMax, 3),
    summary: summarize(samples, b, seconds),
  }
}

interface Watch {
  maxVoices: number
  playingIds: string[]
  states: string[]
}

/** Records every playingId/state change and the voice count on each frame until stopped. */
function watch(): { data: Watch; stop: () => void } {
  const data: Watch = { maxVoices: 0, playingIds: [], states: [] }
  let running = true
  const off = engine.onState((s) => {
    if (data.playingIds.at(-1) !== s.playingId) data.playingIds.push(String(s.playingId))
    if (data.states.at(-1) !== s.state) data.states.push(s.state)
  })
  const loop = () => {
    if (!running) return
    data.maxVoices = Math.max(data.maxVoices, engine.inspect().voices.length)
    requestAnimationFrame(loop)
  }
  loop()
  return {
    data,
    stop: () => {
      running = false
      off()
    },
  }
}

/**
 * Rapid switching. Each run: optionally a fresh engine (cold caches), start `from`, then load
 * `ids` with `gapMs` between loads (0 = back to back in one task), and record what plays.
 */
async function rapidSwitch(
  runs: { name: string; ids: string[]; gapMs: number; fresh?: boolean; from?: string }[] = [
    {
      name: 'cold-200ms',
      ids: ['musician-wren', 'common-nightingale', 'jocotoco-antpitta', 'kakapo', 'common-loon'],
      gapMs: 200,
      fresh: true,
    },
    {
      name: 'cold-0ms',
      ids: [
        'screaming-piha',
        'white-rumped-shama',
        'andean-solitaire',
        'rufous-bellied-thrush',
        'chalk-browed-mockingbird',
      ],
      gapMs: 0,
      fresh: true,
    },
    {
      name: 'warm-100ms',
      ids: ['tui', 'musician-wren', 'kakapo', 'jocotoco-antpitta', 'common-loon'],
      gapMs: 100,
    },
  ],
) {
  const result: Record<string, unknown> = {}
  for (const { name, ids, gapMs, fresh, from = 'tui' } of runs) {
    if (fresh || !engine.getSnapshot().unlocked) {
      await engine.dispose()
      engine = createAudioEngine() as WebAudioEngine
      engine.load(assetOf(bird(from)))
      await engine.listen()
      await waitFor(() => engine.getSnapshot().state === 'playing', 15000)
    }
    const w = watch()
    const t0 = performance.now()
    for (const id of ids) {
      engine.load(assetOf(bird(id)))
      if (gapMs > 0) await sleep(gapMs)
    }
    const last = ids[ids.length - 1]
    const lastLoadAt = performance.now()
    await waitFor(
      () => engine.getSnapshot().playingId === last && engine.getSnapshot().state === 'playing',
      15000,
    )
    const settledMs = performance.now() - lastLoadAt
    await sleep(800) // let retiring voices finish
    w.stop()
    const lastIdx = w.data.playingIds.lastIndexOf(last)
    result[name] = {
      loads: ids,
      gapMs,
      maxVoices: w.data.maxVoices,
      playingIds: w.data.playingIds,
      states: w.data.states,
      endsOnLast: engine.getSnapshot().playingId === last,
      startedSuperseded: w.data.playingIds.filter((x) => ids.slice(0, -1).includes(x)),
      staleAfterLast: w.data.playingIds
        .slice(lastIdx + 1)
        .filter((x) => x !== last && x !== 'null'),
      voicesAfter: engine.inspect().voices.map((v) => v.id),
      totalMs: round(performance.now() - t0 - 800),
      settleMsAfterLastLoad: round(settledMs),
    }
  }
  return result
}

async function transport() {
  const r: Record<string, unknown> = {}
  const out = createDriveFrame()
  const driveOver = async (ms: number) => {
    let voiced = 0
    let frames = 0
    let maxDrive = 0
    const end = performance.now() + ms
    while (performance.now() < end) {
      engine.driveSource.read(await frame(), out)
      frames++
      if (out.voiced) voiced++
      maxDrive = Math.max(maxDrive, out.drive)
    }
    return { frames, voiced, maxDrive: round(maxDrive, 3), audible: out.audible }
  }
  engine.load(assetOf(bird('white-browed-robin-chat')))
  if (!engine.getSnapshot().unlocked) await engine.listen()
  await waitFor(
    () =>
      engine.getSnapshot().state === 'playing' &&
      engine.getSnapshot().playingId === 'white-browed-robin-chat',
  )
  r.playing = await driveOver(1500)

  engine.pause()
  const audibleRightAfterPause = engine.driveSource.isAudible()
  await sleep(400)
  r.pause = {
    audibleRightAfterPause,
    state: engine.getSnapshot().state,
    contextState: engine.inspect().contextState,
    drive: await driveOver(300),
  }
  await engine.play()
  r.resume = {
    state: engine.getSnapshot().state,
    contextState: engine.inspect().contextState,
    voices: engine.inspect().voices.length,
    drive: await driveOver(1500),
  }

  for (let i = 0; i < 7; i++) {
    engine.toggle()
    await sleep(40)
  }
  await sleep(600)
  const s = engine.getSnapshot()
  r.rapidToggle = {
    state: s.state,
    contextState: engine.inspect().contextState,
    wantPlaying: engine.inspect().wantPlaying,
    consistent:
      (s.state === 'paused' && engine.inspect().contextState === 'suspended') ||
      (s.state === 'playing' && engine.inspect().contextState === 'running'),
  }
  if (s.state !== 'playing') await engine.play()

  engine.setMuted(true)
  r.muted = {
    snapshot: engine.getSnapshot().muted,
    audible: engine.driveSource.isAudible(),
    drive: await driveOver(1500),
  }
  engine.setMuted(false)
  engine.setVolume(0)
  r.volumeZero = { volume: engine.getSnapshot().volume, drive: await driveOver(1500) }
  engine.setVolume(0.7)
  r.volumeRestored = engine.getSnapshot().volume
  return r
}

// ── Manual UI ──────────────────────────────────────────────────────────────────────────────

// getElementById + cast: workerd's global `Element` type collides with querySelector<T> here.
const select = document.getElementById('bird') as unknown as HTMLSelectElement
for (const b of birds) select.add(new Option(b.commonName, b.slug))
select.addEventListener('change', () => engine.load(assetOf(bird(select.value))))
document.getElementById('listen')!.addEventListener('click', () => {
  engine.load(assetOf(bird(select.value)))
  void engine.listen()
})
document.getElementById('toggle')!.addEventListener('click', () => engine.toggle())
document
  .getElementById('mute')!
  .addEventListener('click', () => engine.setMuted(!engine.getSnapshot().muted))
const status = document.getElementById('status')!
const canvas = document.getElementById('spectrum') as HTMLCanvasElement
const g2d = canvas.getContext('2d')!
const feat = createSongFeatures()
const drive = createDriveFrame()
const paint = (now: number) => {
  engine.readFeatures(now, feat)
  engine.driveSource.read(now, drive)
  const s = engine.getSnapshot()
  status.textContent = `${s.state} ${s.songId ?? '—'} playing=${s.playingId ?? '—'} muted=${s.muted}
voiced=${drive.voiced} f1=${drive.f1Hz.toFixed(0)} f2=${drive.f2Hz.toFixed(0)} drive=${drive.drive.toFixed(2)} onset=${drive.onset.toFixed(2)} loop=${feat.loopPosition.toFixed(3)}`
  g2d.clearRect(0, 0, canvas.width, canvas.height)
  if (feat.spectrum) {
    g2d.fillStyle = '#7ad'
    for (let i = 0; i < feat.spectrum.length; i++) {
      const h = feat.spectrum[i] * canvas.height
      g2d.fillRect(i, canvas.height - h, 1, h)
    }
  }
  requestAnimationFrame(paint)
}
requestAnimationFrame(paint)

const harness = {
  birds: birds.map((b) => b.slug),
  errors,
  decodeAll,
  offlineAnalyze,
  realtimeRun,
  rapidSwitch,
  transport,
  setMuted: (m: boolean) => engine.setMuted(m),
  snapshot: () => engine.getSnapshot(),
}
;(window as unknown as { harness: typeof harness }).harness = harness
status.textContent = 'ready'
