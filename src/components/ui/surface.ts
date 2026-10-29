/**
 * Ribbon's surfaces as class recipes (values in styles/tokens.css), for cn() beside the
 * element's own size, padding and layout. Habitat light: every surface is flat and takes the
 * bird's room, a step lighter (the strip, a part) or a step darker (a bed); only the Listen disc
 * (LIT) is lit and floats.
 */

/**
 * The one boxed surface on the instrument: the song strip, a capsule a step lighter than the
 * room. Its round ends stay concentric with what sits in them: 32 = the play cap's 22 + its
 * 10px inset (30 = 22 + 8 in Compact), and the mute button at Field's end.
 */
export const PANEL = 'rounded-full bg-ground-raised'

/**
 * A bed sunk into a panel: the spectrum's well. Its corners sit on the strip's straight run,
 * between the cap and the volume, not in the capsule's ends, so it keeps the 12px bed radius.
 */
export const BED = 'rounded-bed bg-ground-sunken shadow-bed'

/**
 * A quiet part: the play cap, the now-playing cap and the outline button. Its translucent sand
 * fill sits a step lighter than whatever it rests on (the room, the strip) and takes its hue,
 * inside a hairline ring. Forced colours drop the fill and the ring, so a border stands in. Give
 * it a radius: `rounded-full` for caps and pills, `rounded-part` for small parts.
 */
export const PART =
  'bg-ink/6 text-ink inset-ring inset-ring-line-2 forced-colors:border forced-colors:border-[ButtonText]'

/**
 * PART on hover: one step lighter (the button's transition eases the fill). A disabled or
 * pressed part keeps its own fill.
 */
export const PART_LIFT = 'hover:not-aria-disabled:not-aria-pressed:bg-ink/10'

/**
 * The one lit primary, lit from inside and the one control that floats: the Listen disc.
 * Nothing else is signal-filled.
 */
export const LIT = 'bg-signal text-on-signal shadow-part inset-shadow-lit'
