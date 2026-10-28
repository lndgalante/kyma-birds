export interface AnalysisFrame {
  time: number // AudioContext time the analysis describes
  songId: string | null
  voiced: boolean
  drive: number
  f1Hz: number
  f2Hz: number
  w2: number
  tonal: boolean
  onset: number
  spectrum: Float32Array // 0..1 per linear bin; owned by this slot, reused on wrap
}

/** Timestamped ring of analysis frames, so readers can look up what the listener hears now. */
export class FrameHistory {
  readonly frames: readonly AnalysisFrame[]
  private head = 0 // next slot to write
  private size = 0

  constructor(slots: number, bins: number) {
    const frames: AnalysisFrame[] = []
    for (let i = 0; i < slots; i++) {
      frames.push({
        time: 0,
        songId: null,
        voiced: false,
        drive: 0,
        f1Hz: 0,
        f2Hz: 0,
        w2: 0,
        tonal: false,
        onset: 0,
        spectrum: new Float32Array(bins),
      })
    }
    this.frames = frames
  }

  get count(): number {
    return this.size
  }

  /** The slot for a new frame (the oldest one once full). The caller fills it in place. */
  push(): AnalysisFrame {
    const slot = this.frames[this.head]
    this.head = (this.head + 1) % this.frames.length
    if (this.size < this.frames.length) this.size++
    return slot
  }

  latest(): AnalysisFrame | null {
    if (this.size === 0) return null
    const n = this.frames.length
    return this.frames[(this.head - 1 + n) % n]
  }

  /** Newest frame with time ≤ heard, or the oldest frame if all are newer. */
  pick(heard: number): AnalysisFrame | null {
    const n = this.frames.length
    for (let i = 1; i <= this.size; i++) {
      const f = this.frames[(this.head - i + n) % n]
      if (f.time <= heard) return f
    }
    return this.size === 0 ? null : this.frames[(this.head - this.size + n) % n]
  }
}
