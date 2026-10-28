import { createClientOnlyFn } from '@tanstack/react-start'
import { createAudioEngine } from './AudioEngine'
import type { AudioEngine } from './types'

export * from './types'
export { createAudioEngine }
export type { EngineInspection, WebAudioEngine } from './AudioEngine'
export type { AnalyzerDebug } from './SongAnalyzer'
export { AUDIO, ANALYSIS } from './params'

/** The one engine per app. Client-only; survives HMR so there is never a second AudioContext. */
export const getAudioEngine: () => AudioEngine = createClientOnlyFn(() => {
  const g = globalThis as { __kymaAudioEngine?: AudioEngine }
  return (g.__kymaAudioEngine ??= createAudioEngine())
})
