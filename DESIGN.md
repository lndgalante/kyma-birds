# Design: Kyma Birds

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System

- Genre: atmospheric; brief: minimal, simple, a feeling of nature, relaxation and breathing
- Shape of the first page: app screen (the instrument: the bird, the song strip, the plate)
- Theme: Ribbon, colourway habitat light: a near-neutral night that each bird's habitat colour fills (olive, ochre, pale moss), drifting over 1.4s when the bird changes; the one signal is each bird's own colour (`lib/theme.ts`)
- Axes: dark/grotesk-sans/chromatic · posture: restrained

## Tokens

`src/styles/tokens.css` is the source of truth; `src/styles/app.css` maps it onto Tailwind utilities (colours in `@theme inline`, so each bird's room reaches every element). The roles, by the project's names:

```css
:root {
  --night: oklch(13.2% 0.005 258);  --night-2: oklch(17.4% 0.005 258);  --night-0: oklch(10.4% 0.005 258);
  /* bg-ground / -raised / -sunken = the bird's room, set inline by lib/theme.ts: the photo's dominant
     hue at L 13.4–16% and C 0.024 up to what sRGB holds that dark (about 0.04), raised +4.2%, sunken −2.8%
     at the same chroma; the night where no bird is themed */
  --ink: oklch(93.5% 0.012 85);  --ink-2: oklch(83% 0.012 85);  --ink-3: oklch(72% 0.012 85);  --ink-4: oklch(55% 0.01 85);
  --line: oklch(93.5% 0.012 85 / 0.13);  --line-2: oklch(93.5% 0.012 85 / 0.23);  --line-photo: oklch(1 0 0 / 0.1);
  --signal: per bird (default oklch(82% 0.095 68));  --on-signal: oklch(18% 0.015 60);  focus = the signal, with a dark halo
  --plate-surface: oklch(0% 0 0 / 0.3) → oklch(0% 0 0 / 0.42);  --plate-rim: oklch(54% 0.008 85);  --plate-sand: oklch(95% 0.012 85);
  --font-display: "Instrument Sans Variable";  --font-sans: "Figtree Variable" (with italic);  no mono
  --radius-card: 20px;  --radius-bed: 12px;  --radius-part: 6px;  controls and the song strip rounded-full
  --shadow-part, --shadow-bed, --shadow-dialog, --shadow-sheet: near-neutral drops and insets, no lit edges
  --dur-1..5: 120 / 200 / 320 / 480 / 700ms;  --dur-room: 1400ms;  --ease-breath: cubic-bezier(0.37, 0, 0.63, 1)
}
```

Contrast is tested on every bird's room (`lib/__tests__/theme.test.ts`): ink to ink-3 at 4.5:1 or more on the ground and both steps, ink-4 (parts, never text) at 3:1, the signal at 4.5:1. Hairlines are translucent ink, so they take each room's hue and drift with it.

Type: a fixed app scale, ratio 1.2 from 16px (`text-xs` 12px is the floor, `text-4xl` 39.8px the largest); weights 400 and 500 only. Heads are Instrument Sans 400 (`tracking-display` at 23px and up, `tracking-title` below, and on bird names); figures Instrument Sans with tabular numerals; labels Figtree 500 a step smaller, sentence case, untracked, `text-ink-3`. Curly apostrophes and quotes in all copy. The spacing scale, durations, eases and z levels live in `tokens.css`.

## Surfaces

Recipes in `src/components/ui/surface.ts`, all flat: `PANEL` (the song strip, a capsule a step lighter than the room, the one boxed surface on the instrument), `BED` (the spectrum's sunken well), `PART` and `PART_LIFT` (a quiet part: a translucent sand fill, a `line-2` hairline, one step lighter on hover), `LIT` (the one lit primary). Nothing is machined: no metal gradients, no lit edges, no shadow under a pill. Rules, not boxes, everywhere else; the bird sits unboxed on the room. Radii nest concentrically (the strip's 32px ends = the play cap's 22 + its 10px inset; a tooltip's 12px around a 6px key cap).

The plate: the page paints its surface (a translucent near-black shade the room shows through), a stone hairline rim and a soft contact shadow (`plate-disc`), under the poster and the canvas alike; the canvas draws only the sand. Resting sand is settled dust, dim toward the rim, and wakes with the song.

## Controls

- Primary: `LIT`, the signal fill lit from inside: only the Listen disc, the page's only first action
- Secondary: the quiet pill (`Button` `outline`): `PART`, 40px, 44px on coarse pointers; pressed (Hold) drops to the room's sunken step with a signal label and a 2px signal ring; disabled loses its fill
- Icon buttons: ghost, round, 40px; text links ink-2 with a 1px underline that turns to the signal on hover
- Pills, caps and the Listen disc press to 96% (not the masthead's text links or the rail's ticks); tooltips name the shortcut and skip their entrance once one is open

## The instrument

- On the main screen: the photo; the name, the scientific name and, for a threatened bird only, its status in plain words; the song's description (clamped as the card gets short); one dim caption with the linked photo and song credits; Details. The song strip: the play cap, an unlabelled spectrum (faint octave lines, bars, the band bracket) and the volume. The plate, and under it Hold pattern, Take photo and Scatter sand, centered as a group. On roomy layouts the three buttons have equal widths and inline H, P and S key caps; phones and compact landscape hide the key caps and use a camera icon for Take photo.
- Not on the main screen: figures (band, peak, loop), the live kHz readout, the Hz numerals, the IUCN scale and the full credits live in Details and `/credits`; mode numbers are spoken only (Describe pattern, the plate's caption) and printed on the saved photo; the keyboard shortcuts live in About and the tooltips.
- Before the first Listen only the Listen disc asks for anything: the song strip and the plate's controls wait invisible in space held for them, then fade in and stay. The first Tab offers "Skip to Listen"; the line under the disc says "Muted." instead of "Sound on." when mute is remembered.
- Phones: the photo carries only the name (across the photo's full width), then the scientific name with a Details pill at its end, over a scrim on its bottom third that eases out above the name; the photo keeps 240px before the plate grows past 200px, so the scrim stays a third (a phone under about 656px tall lets the photo shrink to a 152px header). The pager sits at the foot of the screen in thumb reach (beside the song strip in landscape). Stacked and Split set the pager's arrows at the frequency rail's ends.

## Motion

- Character: calm, breath-paced; state only. The room drifts between birds over `--dur-room` on `--ease-breath`; the plate breathes with the song (about 0.6s in, 1.8s out, soft onset kicks); the song crossfades over 1.2s in and 0.9s out, and pause releases over about 0.6s.
- The Listen disc never moves until pressed; behind it the bird's colour breathes (11s, 4.5 in and 6.5 out) three times, then rests. Its exit is an opacity fade over `--dur-5` while the sand wakes.
- The strip and the plate's controls reveal once over `--dur-5`; play/pause and mute glyphs cross-fade (`--dur-3`, scale and blur); the band bracket tweens over 900ms; Take photo's shutter 700ms; dialogs close in 200ms ease-out; the rail's ticks answer hover in `--dur-1`. While playing, only the sand, the spectrum and the loop ring move.
- Under reduced motion everything ends at once except elements marked `.keep-motion`; the room drift shortens to 400ms, the Listen glow stays still, the sand stops shimmering.

## Exports

`src/styles/tokens.css` in this project, already in Tailwind v4 form (`@theme static` plus `:root`) and mapped onto shadcn/ui's semantic names in `app.css`.
