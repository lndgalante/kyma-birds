import { useContext, useSyncExternalStore } from 'react'
import { SERVER_SNAPSHOT, type EngineSnapshot } from '~/audio/engine'
import type { AudioApi } from './AudioProvider'
import { AudioApiContext } from './context'

export function useAudioApi(): AudioApi {
  const api = useContext(AudioApiContext)
  if (!api) throw new Error('useAudioApi must be used inside <AudioProvider>')
  return api
}

const serverSnapshot = () => SERVER_SNAPSHOT

/** The engine snapshot; SSR and hydration read SERVER_SNAPSHOT. */
export function useAudioSnapshot(): EngineSnapshot {
  const api = useAudioApi()
  return useSyncExternalStore(api.subscribe, api.getSnapshot, serverSnapshot)
}

/** One field of the snapshot; re-renders only when that field changes. */
export function useAudioField<K extends keyof EngineSnapshot>(key: K): EngineSnapshot[K] {
  const api = useAudioApi()
  return useSyncExternalStore(
    api.subscribe,
    () => api.getSnapshot()[key],
    () => SERVER_SNAPSHOT[key],
  )
}

const noMode = () => null

/** The plate's dominant mode key, e.g. "(3,2)"; changes a few times per second at most. */
export function useModeKey(): string | null {
  const api = useAudioApi()
  return useSyncExternalStore(api.subscribeMode, api.getModeKey, noMode)
}
