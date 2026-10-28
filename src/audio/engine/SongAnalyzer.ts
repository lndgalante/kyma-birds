import { FrameHistory, type AnalysisFrame } from './dsp/FrameHistory'
import { Gate } from './dsp/Gate'
import { NoiseFloor } from './dsp/NoiseFloor'
import { OnsetDetector } from './dsp/OnsetDetector'
import { alpha } from './dsp/onePole'
import { PitchTracker } from './dsp/PitchTracker'
import {
  bandWeights,
  createBandEdges,
  dbToPow,
  parabolicPeak,
  type BandEdges,
} from './dsp/spectral'
import { ANALYSIS } from './params'
import type { BirdSongAsset, DriveFrame, SongFeatures } from './types'

/** The slice of AnalyserNode the analyzer reads (tests pass scripted frames). */
export interface AnalyserLike {
  readonly fftSize: number
  getFloatFrequencyData(array: Float32Array<ArrayBuffer>): void
}

export interface AnalyzerHost {
  readonly currentTime: number
  readonly sampleRate: number
  isAudible(): boolean
  currentSongId(): string | null
}

/** Raw per-frame values for debug overlays and the harness. Mutated in place. */
export interface AnalyzerDebug {
  snrDb: number
  levelDb: number
  loud: number
  crest: number
  f1raw: number
  flux: number
  onsetThreshold: number
}

const LOG_EPS = 1e-12

/**
 * Live analysis of the bus (pre-volume): per-bin noise floor → clean band power → gate, loudness,
 * syllable-aware pitch, second line, onsets → a timestamped history read at the heard time.
 * Every per-frame path is allocation-free.
 */
export class SongAnalyzer {
  readonly bins: number
  readonly binHz: number
  readonly debug: AnalyzerDebug = {
    snrDb: 0,
    levelDb: -120,
    loud: 0,
    crest: 0,
    f1raw: 0,
    flux: 0,
    onsetThreshold: 0,
  }

  private readonly analyser: AnalyserLike
  private readonly host: AnalyzerHost
  private readonly history: FrameHistory
  private readonly db: Float32Array<ArrayBuffer>
  private readonly pow: Float64Array
  private readonly clean: Float64Array
  private readonly w: Float32Array
  private readonly wNext: Float32Array
  private readonly edges: BandEdges = createBandEdges()
  private readonly edgesNext: BandEdges = createBandEdges()
  private readonly floor: NoiseFloor
  private readonly gate = new Gate(ANALYSIS.openHoldSec, ANALYSIS.closeHoldSec)
  private readonly pitch = new PitchTracker()
  private readonly onsets: OnsetDetector
  private readonly maxBin: number

  private hasBand = false
  private glideUntil = 0
  private floorResetAt = 0
  private lastNowMs = -Infinity
  private peakDb = -Infinity // the first frame sets it, and again once each new voice is alone
  private voiced = false
  private drive = 0
  private tonal = false
  private f2 = 0
  private w2 = 0

  constructor(analyser: AnalyserLike, host: AnalyzerHost) {
    this.analyser = analyser
    this.host = host
    this.bins = analyser.fftSize / 2
    this.binHz = host.sampleRate / analyser.fftSize
    this.db = new Float32Array(this.bins)
    this.pow = new Float64Array(this.bins)
    this.clean = new Float64Array(this.bins)
    this.w = new Float32Array(this.bins)
    this.wNext = new Float32Array(this.bins)
    this.floor = new NoiseFloor(this.bins)
    this.onsets = new OnsetDetector(this.bins)
    this.history = new FrameHistory(ANALYSIS.historySize, this.bins)
    // Bins above every possible band edge never need power or floor tracking.
    const top = Math.min(ANALYSIS.bandHiMaxHz, 0.45 * host.sampleRate)
    this.maxBin = Math.min(this.bins - 2, Math.ceil(top / this.binHz) + 1)
  }

  /** A new voice starts at context time t0: glide to its band and re-learn the floor. */
  onVoiceStart(song: Pick<BirdSongAsset, 'bandHz'>, t0: number): void {
    const { p10, p90 } = song.bandHz
    bandWeights(this.wNext, this.binHz, p10, p90, this.host.sampleRate, this.edgesNext)
    if (this.hasBand) {
      // Union of the old and new bands while the crossfade plays both.
      const w = this.w
      const wn = this.wNext
      for (let b = 0; b < w.length; b++) if (wn[b] > w[b]) w[b] = wn[b]
      this.edges.lo = Math.min(this.edges.lo, this.edgesNext.lo)
      this.edges.hi = Math.max(this.edges.hi, this.edgesNext.hi)
      this.edges.loBin = Math.min(this.edges.loBin, this.edgesNext.loBin)
      this.edges.hiBin = Math.max(this.edges.hiBin, this.edgesNext.hiBin)
      this.glideUntil = t0 + ANALYSIS.bandGlideSec
    } else {
      this.applyNextBand()
      this.hasBand = true
    }
    this.floorResetAt = t0 + ANALYSIS.bandGlideSec
  }

  /** Runs the per-frame analysis at most once per `dedupeMs` (the UI and plate loops share it). */
  update(nowMs: number): void {
    const A = ANALYSIS
    const elapsed = nowMs - this.lastNowMs
    if (!(elapsed >= A.dedupeMs)) return
    this.lastNowMs = nowMs
    const dt = Math.min(0.1, Math.max(0, elapsed / 1000))
    const t = this.host.currentTime
    if (this.glideUntil > 0 && t >= this.glideUntil) {
      this.glideUntil = 0
      this.applyNextBand()
    }

    const prev = this.history.latest()
    const slot = this.history.push()
    slot.time = t
    slot.songId = this.host.currentSongId()

    if (!this.hasBand || !this.host.isAudible()) {
      this.voiced = false
      this.gate.reset()
      this.pitch.update(0, false, t, dt)
      this.drive += (0 - this.drive) * alpha(dt, A.driveRelease)
      this.onsets.decay(dt)
      if (prev && prev !== slot) slot.spectrum.set(prev.spectrum)
      this.fill(slot)
      return
    }

    this.analyser.getFloatFrequencyData(this.db)
    const { db, pow, clean, w, edges, maxBin } = this
    const floorDb = A.floorDb
    for (let b = 0; b <= maxBin; b++) {
      let d = db[b]
      if (!(d > floorDb)) d = floorDb // NaN, −∞ and digital silence
      db[b] = d
      pow[b] = dbToPow(d)
    }

    // Noise floor: learn from the first audible frame, re-learn once the new voice is alone.
    // The first frame is usually the silent start of a fade-in, so it must not cancel the
    // pending re-learn at t0 + glide. The loudness peak restarts there too: a quiet bird must
    // not be scored against the previous bird's peak (at t0 the old voice could re-seed it).
    const relearn = this.floorResetAt > 0 && t >= this.floorResetAt
    if (relearn) {
      this.floorResetAt = 0
      this.peakDb = -Infinity
    }
    if (relearn || !this.floor.initialized) {
      this.floor.reset(pow)
    } else {
      this.floor.update(pow, dt)
    }
    const N = this.floor.n

    const lo = edges.loBin
    const hi = Math.min(edges.hiBin, maxBin)
    let sumP = 0
    let sumN = 0
    let sumX = 0
    let sumFX = 0
    for (let b = 0; b <= maxBin; b++) {
      const wb = w[b]
      if (wb > 0) {
        sumP += pow[b] * wb
        sumN += N[b] * wb
        const x = Math.max(0, pow[b] - A.floorK * N[b]) * wb
        clean[b] = x
        sumX += x
        sumFX += x * b
      } else {
        clean[b] = 0
      }
    }

    const snrDb = 10 * Math.log10((sumP + 1e-30) / (sumN + 1e-30))
    const levelDb = 10 * Math.log10(sumX + LOG_EPS)
    this.peakDb = Math.max(levelDb, this.peakDb - A.peakDecayDbPerSec * dt)
    const loudRaw = 1 + (levelDb - this.peakDb) / A.loudRangeDb
    const loud = loudRaw < 0 ? 0 : loudRaw > 1 ? 1 : loudRaw

    const voiced = this.gate.update(
      snrDb > A.snrOpenDb && loud > A.loudOpen,
      snrDb < A.snrCloseDb || loud < A.loudClose,
      dt,
    )
    this.voiced = voiced

    // Primary line: the strongest local maximum of the clean band power.
    let b1 = -1
    let x1 = 0
    for (let b = Math.max(1, lo); b <= hi; b++) {
      const x = clean[b]
      if (x > x1 && x >= clean[b - 1] && x > clean[b + 1]) {
        x1 = x
        b1 = b
      }
    }
    let f1raw = 0
    let tonal = false
    let crest = 0
    if (b1 > 0 && sumX > 0) {
      const nBand = Math.max(hi - lo + 1, A.crestMinBins)
      crest = (x1 * nBand) / sumX
      tonal = crest >= A.tonalCrest
      f1raw = tonal
        ? (b1 + parabolicPeak(db[b1 - 1], db[b1], db[b1 + 1])) * this.binHz
        : (sumFX / sumX) * this.binHz
    }
    this.tonal = tonal

    // Secondary line: a strong non-harmonic peak at least a third of an octave away.
    let f2raw = 0
    let w2raw = 0
    if (tonal) {
      let b2 = -1
      let x2 = 0
      for (let b = Math.max(1, lo); b <= hi; b++) {
        const x = clean[b]
        if (x <= x2 || x < clean[b - 1] || x <= clean[b + 1]) continue
        const f = b * this.binHz
        if (Math.abs(Math.log2(f / f1raw)) < A.secondMinOct) continue
        if (nearRatio(f, f1raw, 2) || nearRatio(f, f1raw, 3) || nearRatio(f, f1raw, 0.5)) continue
        x2 = x
        b2 = b
      }
      if (b2 > 0) {
        const m2rel = x2 / x1
        if (m2rel >= A.secondMinRel) {
          f2raw = (b2 + parabolicPeak(db[b2 - 1], db[b2], db[b2 + 1])) * this.binHz
          w2raw = Math.min(A.secondMaxW, A.secondMaxW * m2rel)
        }
      }
    }

    this.pitch.update(f1raw, voiced, t, dt)
    if (voiced) {
      if (f2raw > 0) {
        this.f2 = this.f2 > 0 ? glideLog2(this.f2, f2raw, alpha(dt, A.line2Tau)) : f2raw
        this.w2 = w2raw
      } else {
        this.f2 = 0
        this.w2 = 0
      }
    }

    const target = voiced ? loud : 0
    this.drive +=
      (target - this.drive) * alpha(dt, target > this.drive ? A.driveAttack : A.driveRelease)

    this.onsets.update(clean, N, lo, hi, voiced, t, dt)

    const spec = slot.spectrum
    const all = this.bins
    for (let b = 0; b < all; b++) {
      const v = (db[b] - A.minDb) / (A.maxDb - A.minDb)
      spec[b] = v > 0 ? (v < 1 ? v : 1) : 0 // NaN → 0
    }
    this.fill(slot)

    const d = this.debug
    d.snrDb = snrDb
    d.levelDb = levelDb
    d.loud = loud
    d.crest = crest
    d.f1raw = f1raw
    d.flux = this.onsets.flux
    d.onsetThreshold = this.onsets.threshold
  }

  /** History entry describing context time `heard` (newest with time ≤ heard, else oldest). */
  pick(heard: number): AnalysisFrame | null {
    return this.history.pick(heard)
  }

  /** Copies the analysis at `heard` into `out` (audible is left to the engine). */
  readDrive(heard: number, out: DriveFrame): DriveFrame {
    const f = this.history.pick(heard)
    if (!f) {
      out.time = heard
      out.songId = null
      out.voiced = false
      out.drive = 0
      out.f1Hz = 0
      out.f2Hz = 0
      out.w2 = 0
      out.tonal = false
      out.onset = 0
      return out
    }
    out.time = f.time
    out.songId = f.songId
    out.voiced = f.voiced
    out.drive = f.drive
    out.f1Hz = f.f1Hz
    out.f2Hz = f.f2Hz
    out.w2 = f.w2
    out.tonal = f.tonal
    out.onset = f.onset
    return out
  }

  /** UI features at `heard`, except loopPosition (the engine owns voices). */
  readFeatures(heard: number, out: SongFeatures): SongFeatures {
    const f = this.history.pick(heard)
    out.binHz = this.binHz
    out.sampleRate = this.host.sampleRate
    if (!f) {
      out.songId = null
      out.loudness = 0
      out.voiced = false
      out.dominantHz = null
      out.spectrum = null
      return out
    }
    out.songId = f.songId
    out.loudness = f.drive
    out.voiced = f.voiced
    out.dominantHz = f.voiced && f.f1Hz > 0 ? f.f1Hz : null
    out.spectrum = f.spectrum
    return out
  }

  private fill(slot: AnalysisFrame): void {
    slot.voiced = this.voiced
    slot.drive = this.drive
    slot.f1Hz = this.pitch.f1
    slot.f2Hz = this.f2
    slot.w2 = this.w2
    slot.tonal = this.tonal
    slot.onset = this.onsets.onset
  }

  private applyNextBand(): void {
    this.w.set(this.wNext)
    const e = this.edges
    const n = this.edgesNext
    e.lo = n.lo
    e.hi = n.hi
    e.loBin = n.loBin
    e.hiBin = n.hiBin
  }
}

function nearRatio(f: number, f1: number, ratio: number): boolean {
  const target = f1 * ratio
  return Math.abs(f - target) <= ANALYSIS.harmonicTol * target
}

/** One-pole step from `fromHz` toward `toHz` in the log2 domain (glides evenly in pitch). */
function glideLog2(fromHz: number, toHz: number, a: number): number {
  const l = Math.log2(fromHz)
  return 2 ** (l + (Math.log2(toHz) - l) * a)
}
