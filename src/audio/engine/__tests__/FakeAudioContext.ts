// Minimal Web Audio stand-in for node tests: a manual clock, recording AudioParams that throw like
// browsers do on overlapping curves, controllable decodes and context state transitions.

type ParamEvent =
  | { type: 'curve'; time: number; duration: number; curve: Float32Array }
  | { type: 'target'; time: number; target: number; tau: number }
  | { type: 'set'; time: number; value: number }

const notSupported = (msg: string) => new DOMException(msg, 'NotSupportedError')
const invalidState = (msg: string) => new DOMException(msg, 'InvalidStateError')

export class FakeAudioParam {
  value: number
  events: ParamEvent[] = []
  /** Every automation call, including cancelled ones (cancel itself is logged too). */
  log: (ParamEvent | { type: 'cancel'; time: number })[] = []
  curveCount = 0

  constructor(value: number) {
    this.value = value
  }

  private curveCovering(t: number) {
    return this.events.find((e) => e.type === 'curve' && t >= e.time && t < e.time + e.duration)
  }

  setValueCurveAtTime(curve: Float32Array, time: number, duration: number) {
    const end = time + duration
    for (const e of this.events) {
      if (e.type === 'curve') {
        if (time < e.time + e.duration && e.time < end) throw notSupported('overlapping curve')
      } else if (e.time >= time && e.time < end) {
        throw notSupported('event inside curve')
      }
    }
    const ev: ParamEvent = { type: 'curve', time, duration, curve: Float32Array.from(curve) }
    this.events.push(ev)
    this.log.push(ev)
    this.curveCount++
    return this
  }

  setTargetAtTime(target: number, time: number, tau: number) {
    if (this.curveCovering(time)) throw notSupported('setTarget inside curve')
    const ev: ParamEvent = { type: 'target', time, target, tau }
    this.events.push(ev)
    this.log.push(ev)
    return this
  }

  setValueAtTime(value: number, time: number) {
    if (this.curveCovering(time)) throw notSupported('setValue inside curve')
    const ev: ParamEvent = { type: 'set', time, value }
    this.events.push(ev)
    this.log.push(ev)
    return this
  }

  cancelScheduledValues(time: number) {
    this.events = this.events.filter((e) => e.time < time)
    this.log.push({ type: 'cancel', time })
    return this
  }

  lastTarget(): number | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i]
      if (e.type === 'target') return e.target
      if (e.type === 'set') return e.value
    }
    return null
  }
}

export class FakeAudioNode {
  readonly context: FakeAudioContext
  outputs = new Set<FakeAudioNode>()
  connected = true

  constructor(ctx: FakeAudioContext) {
    this.context = ctx
  }

  connect<T extends FakeAudioNode>(dest: T): T {
    this.outputs.add(dest)
    return dest
  }

  disconnect() {
    this.outputs.clear()
    this.connected = false
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1)
}

export class FakeAudioBuffer {
  readonly length: number
  readonly sampleRate: number
  readonly numberOfChannels: number
  readonly tag: string

  constructor(channels: number, length: number, sampleRate: number, tag = '') {
    this.numberOfChannels = channels
    this.length = length
    this.sampleRate = sampleRate
    this.tag = tag
  }

  get duration() {
    return this.length / this.sampleRate
  }
}

export class FakeBufferSource extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null
  loop = false
  loopStart = 0
  loopEnd = 0
  onended: (() => void) | null = null
  startTime: number | null = null
  startOffset = 0
  stopTime: number | null = null
  ended = false

  start(when = 0, offset = 0) {
    if (this.startTime !== null) throw invalidState('start twice')
    this.startTime = when
    this.startOffset = offset
  }

  stop(when = 0) {
    if (this.startTime === null) throw invalidState('stop before start')
    this.stopTime = Math.max(when, this.context.currentTime)
  }
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048
  smoothingTimeConstant = 0.8
  minDecibels = -100
  maxDecibels = -30
  reads = 0
  /** Scripted spectrum; default is digital silence. */
  frame: (out: Float32Array) => void = (out) => out.fill(-Infinity)

  get frequencyBinCount() {
    return this.fftSize / 2
  }

  getFloatFrequencyData(out: Float32Array) {
    this.reads++
    this.frame(out)
  }
}

interface PendingDecode {
  bytes: ArrayBuffer
  resolve: (b: FakeAudioBuffer) => void
  reject: (e: unknown) => void
}

export class FakeAudioContext {
  currentTime = 0
  sampleRate = 48000
  state: AudioContextState = 'suspended'
  baseLatency = 0.005
  outputLatency = 0.02
  readonly destination: FakeAudioNode
  readonly sources: FakeBufferSource[] = []
  readonly gains: FakeGainNode[] = []
  readonly analysers: FakeAnalyserNode[] = []
  readonly pendingDecodes: PendingDecode[] = []
  decodeCalls = 0
  resumeCalls = 0
  suspendCalls = 0
  closeCalls = 0
  /** When set, decodes settle on their own (after a microtask) with this result. */
  autoDecode: ((bytes: ArrayBuffer) => FakeAudioBuffer | Error) | null = null
  private listeners = new Set<() => void>()

  constructor() {
    this.destination = new FakeAudioNode(this)
  }

  createGain() {
    const g = new FakeGainNode(this)
    this.gains.push(g)
    return g
  }

  createBufferSource() {
    const s = new FakeBufferSource(this)
    this.sources.push(s)
    return s
  }

  createAnalyser() {
    const a = new FakeAnalyserNode(this)
    this.analysers.push(a)
    return a
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeAudioBuffer(channels, length, sampleRate)
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<FakeAudioBuffer> {
    this.decodeCalls++
    const auto = this.autoDecode
    if (auto) {
      return Promise.resolve().then(() => {
        const r = auto(bytes)
        if (r instanceof Error) throw r
        return r
      })
    }
    return new Promise((resolve, reject) => this.pendingDecodes.push({ bytes, resolve, reject }))
  }

  async resume() {
    this.resumeCalls++
    await Promise.resolve()
    if (this.state === 'closed') throw invalidState('closed')
    this.setState('running')
  }

  async suspend() {
    this.suspendCalls++
    await Promise.resolve()
    if (this.state === 'closed') throw invalidState('closed')
    this.setState('suspended')
  }

  async close() {
    this.closeCalls++
    await Promise.resolve()
    this.setState('closed')
  }

  getOutputTimestamp() {
    return { contextTime: 0, performanceTime: 0 } // "not available" → latency fallback
  }

  addEventListener(type: string, fn: () => void) {
    if (type === 'statechange') this.listeners.add(fn)
  }

  removeEventListener(type: string, fn: () => void) {
    if (type === 'statechange') this.listeners.delete(fn)
  }

  /** Simulates the platform changing state (interruptions) or our own resume/suspend landing. */
  setState(s: AudioContextState) {
    if (this.state === s) return
    this.state = s
    for (const fn of Array.from(this.listeners)) fn()
  }

  /** Advances the audio clock (only while running) and fires `onended` for stopped sources. */
  advance(sec: number) {
    if (this.state === 'running') this.currentTime += sec
    for (const s of this.sources) {
      if (!s.ended && s.stopTime !== null && this.currentTime >= s.stopTime) {
        s.ended = true
        s.onended?.()
      }
    }
  }

  /** Bytes are tagged by the fake fetch with their URL, so decodes can be told apart. */
  static tagOf(bytes: ArrayBuffer): string {
    return new TextDecoder().decode(bytes)
  }
}

/** Manual timers (setTimer/clearTimer/now) for EngineOptions. */
export class FakeTimers {
  nowMs = 0
  private seq = 0
  private queue: { id: number; at: number; fn: () => void }[] = []

  setTimer = (fn: () => void, ms: number): unknown => {
    const id = ++this.seq
    this.queue.push({ id, at: this.nowMs + ms, fn })
    return id
  }

  clearTimer = (h: unknown) => {
    this.queue = this.queue.filter((t) => t.id !== h)
  }

  now = () => this.nowMs

  advance(ms: number) {
    const end = this.nowMs + ms
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at || a.id - b.id)
      const next = this.queue[0]
      if (!next || next.at > end) break
      this.queue.shift()
      this.nowMs = next.at
      next.fn()
    }
    this.nowMs = end
  }

  get pending() {
    return this.queue.length
  }
}

export interface FetchCall {
  url: string
  init: RequestInit | undefined
}

/** Fake fetch: 200 with the URL as the body, unless the URL is in `status`. */
export function createFakeFetch(status: Record<string, number> = {}) {
  const calls: FetchCall[] = []
  const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal
      if (signal?.aborted) return reject(new DOMException('aborted', 'AbortError'))
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      queueMicrotask(() => {
        if (signal?.aborted) return
        const code = status[url] ?? 200
        const body = new TextEncoder().encode(url)
        resolve({
          ok: code >= 200 && code < 300,
          status: code,
          arrayBuffer: async () => body.buffer.slice(0) as ArrayBuffer,
        } as Response)
      })
    })
  }
  return { fetch: fetchImpl as typeof fetch, calls }
}

/** Lets every pending promise chain settle. */
export async function flush(rounds = 20) {
  for (let i = 0; i < rounds; i++) await Promise.resolve()
}
