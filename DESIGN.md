# Design: Kyma Birds

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System

- Genre: atmospheric
- Shape of the first page: app screen (the instrument: the bird, the song strip, the plate)
- Theme: Ribbon, colourway two-in-the-morning; the one signal is each bird's own colour (`lib/theme.ts`)
- Axes: dark/grotesk-sans/chromatic · posture: restrained

## Tokens

`src/styles/tokens.css` is the source of truth; `src/styles/app.css` maps it onto Tailwind utilities (colours in `@theme inline`, so each bird's palette reaches every element). The roles, by the project's names:

```css
:root {
  --night: oklch(13.2% 0.022 258);  --night-2: oklch(17.4% 0.024 258);  --night-0: oklch(10.4% 0.02 258);
  /* bg-ground / -raised / -sunken = the night mixed with the bird's tinted ground at --bird-tint (16%) */
  --ink: oklch(93.5% 0.012 85);  --ink-2: oklch(83% 0.016 250);  --ink-3: oklch(72% 0.02 255);  --ink-4: oklch(55% 0.02 255);
  --line: oklch(27% 0.022 258);  --line-2: oklch(36% 0.022 258);
  --signal: per bird (default oklch(82% 0.095 68));  --on-signal: oklch(18% 0.015 60);  focus = the signal, with a dark halo
  --metal-hi: oklch(44% 0.012 255);  --metal-lo: oklch(27% 0.014 255);
  --font-display: "Instrument Sans Variable";  --font-sans: "Figtree Variable" (with italic);  no mono
  --radius-card: 20px;  --radius-bed: 12px;  --radius-part: 6px;  controls rounded-full
  --shadow-part, --shadow-panel, --shadow-bed, --shadow-dialog: one light from above, an edge light folded in
}
```

Type: a fixed app scale, ratio 1.2 from 16px (`text-xs` 12px is the floor, `text-4xl` 39.8px the largest); weights 400 and 500 only. Heads are Instrument Sans 400 (`tracking-display` at 23px and up, `tracking-title` below, and on bird names); figures Instrument Sans with tabular numerals; labels Figtree 500 a step smaller, sentence case, untracked, `text-ink-3`. The spacing scale, durations (`--dur-1..5`, `--dur-micro/short/long`), eases and z levels live in `tokens.css`.

## Surfaces

Recipes in `src/components/ui/surface.ts`: `PANEL` (the song strip, the one boxed surface on the instrument), `BED` (a recessed well), `METAL` and `METAL_LIFT` (machined parts and pills), `LIT` (the one lit primary). Rules, not boxes, everywhere else; the bird sits unboxed on the night.

## Controls

- Primary: `LIT`, the signal fill lit from inside: only the Listen disc
- Secondary: the machined pill (`Button` `outline`): metal gradient, 40px, 44px on coarse pointers; pressed is recessed with signal text
- Icon buttons: ghost, round, 40px; text links ink-2 with a 1px underline that turns to the signal on hover

## Motion

- Character: calm; state only (the bird cross-fade, the loop ring, the flow wire's dash while playing, three Listen pulses). Under reduced motion everything ends at once except elements marked `.keep-motion`.

## Exports

`src/styles/tokens.css` in this project, already in Tailwind v4 form (`@theme static` plus `:root`) and mapped onto shadcn/ui's semantic names in `app.css`.
