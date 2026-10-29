import { useAudioApi, useAudioField } from '~/audio/useAudio'
import { Slider } from '~/components/ui/slider'
import { COPY } from '~/lib/copy'
import { IconButton } from '../shell/IconButton'

/**
 * Mute plus the volume fader. The fader is hidden in Field, where hardware keys do the job, and in
 * compact landscape or a narrow strip, where it would squeeze the spectrum to a sliver.
 */
export function VolumeControl() {
  const api = useAudioApi()
  const volume = useAudioField('volume')
  const muted = useAudioField('muted')
  const pct = Math.round(volume * 100)
  return (
    <div className="volume flex flex-none items-center gap-1.5 no-js:hidden">
      <IconButton
        label={COPY.muteAria}
        icons={['volume', 'muted']}
        pressed={muted}
        shortcut={{ keys: 'M', spoken: 'M' }}
        onClick={() => api.setMuted(!muted)}
        // Where it ends the strip, the 40px fine-pointer button moves 2px in, so its hover disc
        // sits concentric with the capsule's end as the 44px touch target does.
        className="volume__mute pointer-fine:field-or-compact:me-0.5 pointer-fine:song-narrow:me-0.5"
      />
      <Slider
        // The 6px margin sets the fader's end 16px in from the strip's end.
        className="range volume__slider me-1.5 w-24 field-or-compact:hidden song-narrow:hidden"
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
