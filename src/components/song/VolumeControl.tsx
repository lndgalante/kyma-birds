import type { CSSProperties } from 'react'
import { useAudioApi, useAudioField } from '~/audio/useAudio'
import { COPY } from '~/lib/copy'
import { IconButton } from '../shell/IconButton'

/** Mute plus a volume slider; the slider is hidden in Field, where hardware keys do the job. */
export function VolumeControl() {
  const api = useAudioApi()
  const volume = useAudioField('volume')
  const muted = useAudioField('muted')
  const pct = Math.round(volume * 100)
  return (
    <div className="volume">
      <IconButton
        label={COPY.muteAria}
        icon={muted ? 'muted' : 'volume'}
        pressed={muted}
        onClick={() => api.setMuted(!muted)}
        className="volume__mute"
      />
      <input
        type="range"
        className="range volume__slider"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label={COPY.volumeAria}
        aria-valuetext={`${pct}%`}
        style={{ '--fill': `${muted ? 0 : pct}%` } as CSSProperties}
        data-muted={muted || undefined}
        onChange={(e) => {
          const v = Number(e.currentTarget.value) / 100
          api.setVolume(v)
          if (muted && v > 0) api.setMuted(false)
        }}
      />
    </div>
  )
}
