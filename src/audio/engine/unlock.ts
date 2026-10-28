import { AUDIO } from './params'

type NavWithSession = Navigator & { audioSession?: { type: string } }

/** Client-only; called lazily from listen(), never at module scope. */
export function createAudioContext(): AudioContext {
  const nav = (typeof navigator === 'undefined' ? undefined : navigator) as
    NavWithSession | undefined
  if (nav?.audioSession) {
    // Without this, iOS routes Web Audio through the ringer and the silent switch mutes it.
    try {
      nav.audioSession.type = 'playback'
    } catch {
      // non-fatal
    }
  }
  const g = globalThis as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  if (!Ctor) throw new Error('unsupported')
  return new Ctor({ latencyHint: AUDIO.latencyHint })
}

/** Must run synchronously inside the gesture handler. */
export function primeInGesture(ctx: AudioContext): Promise<void> {
  const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume()
  // Legacy WebKit only unlocks after a source starts inside the gesture; costs nothing elsewhere.
  try {
    const s = ctx.createBufferSource()
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    s.connect(ctx.destination)
    s.start()
    s.onended = () => s.disconnect()
  } catch {
    // non-fatal: resume() is what matters on current engines
  }
  return resumed
}
