import { useAudioField } from '~/audio/useAudio'

/** The wire between zones: a hairline and arrowhead; a slow accent dash runs along it while playing. */
export function FlowLine() {
  const state = useAudioField('state')
  return (
    <span className="flow-line" aria-hidden="true" data-live={state === 'playing' || undefined} />
  )
}
