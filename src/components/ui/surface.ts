/**
 * Ribbon's surfaces as class recipes (values in styles/tokens.css), for cn() beside the
 * element's own size, padding and layout. One light, from above: a panel's top is lighter than
 * its foot, a part has a lit top edge (in `shadow-part` and `shadow-panel`), and a bed sinks
 * below the surface around it.
 */

/** A machined panel: the song strip (the one boxed surface on the instrument). */
export const PANEL = 'rounded-card bg-linear-to-b from-ground-raised to-ground shadow-panel'

/**
 * A bed sunk into a panel: the spectrum's well. Set 8px inside the panel, its 12px radius stays
 * concentric with the panel's 20px.
 */
export const BED = 'rounded-bed bg-ground-sunken shadow-bed'

/**
 * A machined part: metal lit from above with a dark rim (the play cap, the now-playing cap, the
 * fader's thumb, the outline button). Give it a radius: `rounded-full` for caps and pills,
 * `rounded-part` for small parts.
 */
export const METAL =
  'border border-ground-sunken bg-linear-to-b from-metal-hi to-metal-lo text-ink shadow-part'

/** METAL on hover: one step lighter (the button's transition eases the gradient). */
export const METAL_LIFT = 'hover:from-metal-hi-lift hover:to-metal-lo-lift'

/** The one lit primary, lit from inside: the Listen disc. Nothing else is signal-filled. */
export const LIT = 'bg-signal text-on-signal shadow-part inset-shadow-lit'
