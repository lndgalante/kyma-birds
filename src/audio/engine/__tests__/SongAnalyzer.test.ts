import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANALYSIS } from '../params'
import { SongAnalyzer, type AnalyserLike, type AnalyzerHost } from '../SongAnalyzer'
import { createDriveFrame, createSongFeatures } from '../types'
import { FFT, frameDb, rng } from './synth'

const SR = 48000
const FRAME_MS = 1000 / 60

type Tone = { hz: number; db: number }

function setup(band = { p10: 2000, p50: 3000, p90: 4000 }) {
  const rand = rng(42)
  let tones: Tone[] = []
  let noiseDb = -90
  const host = {
    currentTime: 0,
    sampleRate: SR,
    audible: true as boolean,
    isAudible() {
      return this.audible
    },
    currentSongId: () => 'bird',
  } satisfies AnalyzerHost & { audible: boolean }
  const analyser = {
    fftSize: FFT,
    reads: 0,
    getFloatFrequencyData(out: Float32Array) {
      this.reads++
      frameDb(out, SR, noiseDb, tones, rand)
    },
  } satisfies AnalyserLike & { reads: number }
  const an = new SongAnalyzer(analyser, host)
  an.onVoiceStart({ bandHz: band }, 0)
  let nowMs = 1000
  const out = createDriveFrame()
  const api = {
    an,
    host,
    analyser,
    out,
    set(t: Tone[], noise = noiseDb) {
      tones = t
      noiseDb = noise
      return api
    },
    /** Advances `sec` at 60 Hz and returns the drive frame at the current time. */
    run(sec: number, each?: (f: typeof out) => void) {
      const n = Math.round(sec * 60)
      for (let i = 0; i < n; i++) {
        host.currentTime += 1 / 60
        nowMs += FRAME_MS
        an.update(nowMs)
        an.readDrive(host.currentTime, out)
        each?.(out)
      }
      return out
    },
    get nowMs() {
      return nowMs
    },
  }
  return api
}

describe('SongAnalyzer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('tracks a 3 kHz tone: voiced, f1 ≈ 3 kHz (±3 Hz), drive → loud', () => {
    const s = setup()
    s.set([]).run(1) // the floor learns the room first, as during a fade-in
    const f = s.set([{ hz: 3000, db: -30 }]).run(2)
    expect(f.voiced).toBe(true)
    expect(f.tonal).toBe(true)
    expect(Math.abs(f.f1Hz - 3000)).toBeLessThan(3)
    expect(f.drive).toBeGreaterThan(0.95)
    expect(s.an.debug.loud).toBeGreaterThan(0.95)
    expect(f.songId).toBe('bird')
  })

  it('re-learns the floor at t0 + 0.6 even when the first frame was digital silence', () => {
    const s = setup()
    s.set([], -400).run(0.1) // fade-in start: nothing but −∞ bins
    s.set([], -60).run(1)
    // A floor stuck at −160 dB would read 90+ dB of SNR on plain noise.
    expect(s.an.debug.snrDb).toBeLessThan(6)
    expect(s.out.voiced).toBe(false)
  })

  it('keeps white noise unvoiced', () => {
    const s = setup()
    let voicedFrames = 0
    s.set([], -60).run(6, (f) => {
      if (f.voiced) voicedFrames++
    })
    expect(voicedFrames).toBe(0)
    expect(s.out.drive).toBe(0)
  })

  it('drops drive with τ 0.2 and unvoices when not audible', () => {
    const s = setup()
    s.set([]).run(1)
    const d0 = s.set([{ hz: 3000, db: -30 }]).run(2).drive
    const f1 = s.out.f1Hz
    s.host.audible = false
    const reads = s.analyser.reads
    const f = s.run(0.2)
    expect(f.voiced).toBe(false)
    expect(f.drive).toBeCloseTo(d0 * Math.exp(-1), 9)
    expect(f.f1Hz).toBe(f1) // last pitch held
    expect(s.analyser.reads).toBe(reads) // nothing is read while inaudible
  })

  it('does not double-update for two calls within 4 ms', () => {
    const s = setup()
    s.an.update(5000)
    s.an.update(5003.9)
    expect(s.analyser.reads).toBe(1)
    s.an.update(5004)
    expect(s.analyser.reads).toBe(2)
    s.an.update(4000) // time going backwards is ignored too
    expect(s.analyser.reads).toBe(2)
  })

  it('reports a non-harmonic second line and ignores harmonics', () => {
    const s = setup({ p10: 1500, p50: 2500, p90: 4000 })
    s.set([]).run(1)
    let f = s
      .set([
        { hz: 2000, db: -30 },
        { hz: 2900, db: -33 },
      ])
      .run(1)
    expect(f.voiced).toBe(true)
    expect(Math.abs(f.f1Hz - 2000)).toBeLessThan(5)
    expect(Math.abs(f.f2Hz - 2900)).toBeLessThan(10)
    expect(f.w2).toBeCloseTo(0.3, 1)
    f = s
      .set([
        { hz: 2000, db: -30 },
        { hz: 4000, db: -31 },
      ])
      .run(1)
    expect(f.f2Hz).toBe(0)
    expect(f.w2).toBe(0)
  })

  it('glides to a new band through the union of both', () => {
    const s = setup()
    s.set([]).run(1)
    s.set([{ hz: 3000, db: -30 }]).run(1)
    s.an.onVoiceStart({ bandHz: { p10: 576, p50: 630, p90: 698 } }, s.host.currentTime)
    s.run(0.3)
    expect(s.out.voiced).toBe(true) // 3 kHz still inside the union
    s.set([]).run(0.5) // glide ends; the floor re-learns on the new voice
    expect(s.out.voiced).toBe(false)
    s.set([{ hz: 3000, db: -30 }]).run(1)
    expect(s.out.voiced).toBe(false) // out of the new band
    const f = s.set([{ hz: 630, db: -30 }]).run(1)
    expect(f.voiced).toBe(true)
    expect(Math.abs(f.f1Hz - 630)).toBeLessThan(3)
  })

  it("scores a quiet new voice against its own peak, not the previous voice's", () => {
    const s = setup()
    s.set([]).run(1)
    s.set([{ hz: 3000, db: -12 }]).run(3) // a loud bird
    const t0 = s.host.currentTime
    s.an.onVoiceStart({ bandHz: { p10: 2000, p50: 3000, p90: 4000 } }, t0)
    s.run(0.2) // the crossfade still plays the old voice
    s.set([]).run(0.6) // the floor re-learns once the new voice is alone
    // 24 dB below the old peak: loud would read 0 for about 7 s if the peak carried over.
    let voicedAt = -1
    let maxLoud = 0
    s.set([{ hz: 3000, db: -36 }]).run(1, (f) => {
      maxLoud = Math.max(maxLoud, s.an.debug.loud)
      if (f.voiced && voicedAt < 0) voicedAt = s.host.currentTime - t0
    })
    expect(maxLoud).toBeGreaterThan(0.95)
    expect(voicedAt).toBeGreaterThan(0)
    expect(voicedAt).toBeLessThan(ANALYSIS.bandGlideSec + 1)
    expect(s.out.drive).toBeGreaterThan(0.9)
  })

  it('serves UI features from the same history', () => {
    const s = setup()
    s.set([]).run(1)
    s.set([{ hz: 3000, db: -30 }]).run(1)
    const feat = s.an.readFeatures(s.host.currentTime, createSongFeatures())
    expect(feat.voiced).toBe(true)
    expect(feat.dominantHz).toBeCloseTo(s.out.f1Hz, 9)
    expect(feat.binHz).toBeCloseTo(SR / FFT, 12)
    expect(feat.sampleRate).toBe(SR)
    expect(feat.spectrum).toHaveLength(FFT / 2)
    const bin = Math.round(3000 / (SR / FFT))
    expect(feat.spectrum![bin]).toBeGreaterThan(0.5)
    expect(feat.spectrum![10]).toBeLessThan(0.3) // −90 dB noise → about (−90 + 100) / 80
    s.set([], -200).run(0.5)
    const quiet = s.an.readFeatures(s.host.currentTime, feat)
    expect(quiet.voiced).toBe(false)
    expect(quiet.dominantHz).toBeNull()
    expect(quiet.spectrum![10]).toBe(0) // below minDecibels clamps to 0
  })

  it('is allocation-free per frame', () => {
    const s = setup()
    s.set([]).run(1)
    s.set([
      { hz: 2000, db: -30 },
      { hz: 2900, db: -33 },
    ])
    const host = s.host
    const an = s.an
    const out = createDriveFrame()
    const feat = createSongFeatures()
    // Pre-render the scripted frames so the fake analyser itself does not allocate.
    const frames: Float32Array[] = []
    for (let i = 0; i < 30; i++) {
      const fr = new Float32Array(FFT / 2)
      s.analyser.getFloatFrequencyData(fr)
      frames.push(fr)
    }
    let k = 0
    s.analyser.getFloatFrequencyData = (o: Float32Array) => o.set(frames[k++ % frames.length])
    const f32 = vi.spyOn(globalThis, 'Float32Array')
    const f64 = vi.spyOn(globalThis, 'Float64Array')
    const arr = vi.spyOn(globalThis, 'Array')
    let now = s.nowMs
    for (let i = 0; i < 120; i++) {
      host.currentTime += 1 / 60
      now += FRAME_MS
      an.update(now)
      an.readDrive(host.currentTime, out)
      an.readFeatures(host.currentTime, feat)
    }
    host.audible = false
    for (let i = 0; i < 10; i++) {
      host.currentTime += 1 / 60
      now += FRAME_MS
      an.update(now)
    }
    expect(f32).not.toHaveBeenCalled()
    expect(f64).not.toHaveBeenCalled()
    expect(arr).not.toHaveBeenCalled()
  })
})
