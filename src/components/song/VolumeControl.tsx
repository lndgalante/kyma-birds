import { useAudioApi, useAudioField } from '~/audio/useAudio'
import { Slider } from '~/components/ui/slider'
import { COPY } from '~/lib/copy'
import { IconButton } from '../shell/IconButton'

/**
 * Mute plus a volume slider. The slider is hidden in Field, where hardware keys do the job, and in
 * compact landscape, where it would squeeze the spectrum to a sliver.
 */
export function VolumeControl() {
  const api = useAudioApi()
  const volume = useAudioField('volume')
  const muted = useAudioField('muted')
  const pct = Math.round(volume * 100)
  return (
    <div className="volume flex flex-none items-center gap-1 no-js:hidden split:w-full split:gap-0.5">
      <IconButton
        label={COPY.muteAria}
        icon={muted ? 'muted' : 'volume'}
        pressed={muted}
        shortcut={{ keys: 'M', spoken: 'M' }}
        onClick={() => api.setMuted(!muted)}
        className="volume__mute"
      />
      <Slider
        className="range volume__slider w-24 field-or-compact:hidden split:me-1.5 split:w-auto split:min-w-0 split:flex-auto"
        min={0}
        max={100}
        step={1}
        value={[pct]}
        aria-label={COPY.volumeAria}
        aria-valuetext={`${pct}%`}
        muted={muted}
        onValueChange={([value]) => {
          const v = value / 100
          api.setVolume(v)
          if (muted && v > 0) api.setMuted(false)
        }}
      />
    </div>
  )
}
