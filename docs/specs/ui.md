# Kyma Birds: app shell UI/UX spec (v1)

Scope: everything except the internals of `<CymaticsPlate>` (sand, rim, bolt, physics, shaders) and the internals of `AudioEngine` (decoding, looping, analysis). This spec defines the page around them, the contracts the shell expects from them, and every user-facing string.

Stack: TanStack Start (React 19, file routes, SSR) on Cloudflare Workers, Three.js inside the plate only, Tailwind CSS v4 and shadcn/ui (Radix) themed with the Kyma tokens (no CSS-in-JS), self-hosted variable fonts via Fontsource.

---

## 0. Decisions and assumptions

No interview round was possible, so these were inferred from the brief and the two reference images. Each one is final for v1 unless the user overrides it.

| # | Decision | Why |
|---|---|---|
| D1 | Dark theme only. `color-scheme: dark`. No light theme in v1. | Both references are black plates with white sand. People listen with the lights low. The photos are lit subjects that read best on a dark ground. |
| D2 | Three zones wired in series: **01 Bird → 02 Song → 03 Plate**. The Song zone is a physical column (desktop) or strip (smaller screens) *between* the bird and the plate. | This makes the user's "Selected bird → Bird song → Cymatics plate" flow literal on screen. |
| D3 | Birds are ordered by voice pitch (`audio.bandHz.p50` ascending), so moving right means a higher voice. The rail's ends read "Low" and "High". | The picker becomes a frequency scale, so the order itself carries meaning. The loader does the sort once, and that order is used everywhere. |
| D4 | The URL is the source of truth for the committed bird: `/?bird=<slug>`. History is replaced, never pushed. With no `?bird` (or an unknown one) the committed bird is the Common Nightingale. The plate is always a circle, so there is no `?plate` param (2026-10-28, below). | Shareable state and SSR. The Back button leaves the app instead of stepping through birds. The Nightingale is the best-known songbird of the twelve, so it is the first song most people hear. |
| D5 | Sound never autoplays. A "Listen" press (or Space) is always the first sound. After that, changing birds plays the new bird's song unless the user paused. | Browser autoplay policy and WCAG 1.4.2. It also makes cause and effect visible: still sand until you listen. |
| D6 | One accent per bird, taken from its photo (`accentColor`) and clamped for contrast. The ground is lightly tinted by the photo's `dominantColor`. Sand is always neutral white. | Color shows up at page scale (the room takes on the bird's habitat), not as scattered UI tints. The sand is matter, not UI, so it never takes the accent. |
| D7 | Mobile uses a stacked "Field" layout: full-bleed photo with an overlaid label (the type treatment from reference 2), the song strip layered over the photo's lower fade, then the plate. The full "reel" variant, with the plate sitting on top of the photo, was **considered and rejected for v1** (see §2.6). | It keeps DOM order equal to visual order (Bird → Song → Plate) and never covers the bird. |
| D8 | Tailwind CSS v4 and shadcn/ui (new-york v4, vendored in `components/ui/`, Radix primitives, Lucide icons), themed with the Kyma tokens. One stylesheet, `styles/app.css`: the theme, the layout modes and container queries as custom variants, a few `@utility` rules (halos, scrims) and a base layer. Every component class name stays on its element as an unstyled hook. (2026-10-28, below; it was plain CSS with `@layer`.) | The user chose "Kyma look, built with shadcn": shadcn's consistent radii, focus rings, hover states, tooltips and dialogs, drawn in Kyma's palette, type and per-bird signal color rather than the stock look. Modern CSS stays available through variants and arbitrary values (subgrid, container queries, `@property`, scroll-driven animation). |
| D9 | Fonts: **Archivo** (variable, wdth 62–125, wght 100–900, with italics) for names and prose. **Martian Mono** (variable, wdth 75–112.5, wght 100–800) for measurements, labels and readouts. | A grotesque with a real width axis gives instrument-label uppercase (expanded) and compact display names (semi-condensed) from one family. A wide, technical mono reads like instrument readouts. Neither is on the overused list (no Inter, Space Grotesk, IBM Plex, DM, Geist or JetBrains Mono). |
| D10 | Manifest fields assumed beyond the brief: `slug` (if absent, derive it as `kebab(commonName)` in the loader) and optional `photo.alt`, `photo.labelSide`, `photo.scrim`. All optional fields have fallbacks. | These are the only extra fields the shell needs. |

**User changes, 2026-10-28.** The sections below are updated to match.
- **No plate-shape toggle: the app shows only the circle.** The Circle/Square radios, `?plate=`, the square frame, poster and caption rules, the frame's `border-radius` animation, the segmented control, the circle and square icons, `--radius-plate` and the `shape.*` strings are gone, and `plate.aria` always says "circular". The plate module keeps its square physics for the plate lab (`pnpm lab:plate`, :3102), its tests and engine.md; the shell passes `plateShape="circle"`.
- **The Listen disc is centered on the plate.** The disc's center sits exactly on the plate's center, with "Listen" and the sub-line hanging below it. On plates under 320px tall the sub-line is visually hidden and stays the button's description (§5.2).
- **The default bird is the Common Nightingale** (`DEFAULT_BIRD_SLUG` in `lib/manifest.ts`), the best-known songbird of the twelve. It is #10 of 12 on the Low → High rail. The build had defaulted to the Tūī.
- **Tailwind CSS v4 + shadcn/ui instead of plain CSS (D8).** Same look and layout, measured against the plain-CSS build in every layout mode. The CSS files this spec names (`tokens.css`, `base.css`, `layout.css`, `utilities.css`, `components/*.css`) are now one `src/styles/app.css`; where a section shows CSS for a component class, those values are Tailwind utilities on that element, and the layout modes are the variants `field:`, `stacked:`, `split:`, `compact:` (plus unions such as `field-or-compact:`). The bird's signal color is **`--signal`** (utility `signal`), formerly `--accent`, because shadcn's `accent` is its hover surface (here `--line`); `--on-accent` is likewise `--on-signal`. The sections below say `--signal`. Dialogs are shadcn's Dialog (Radix) rather than `<dialog>`: About and Details keep their look, focus moves to the close button and returns to the opener, and Details is still a bottom sheet in Field. Icons are Lucide at stroke 1.8 (the old 1.5 on a 20px grid); the solid play and pause keep the old glyph size and optical centre. New: the pager, mute and play buttons show their shortcut in a tooltip on hover or keyboard focus, the masthead hint and About's key list use key caps, the hairline buttons show the focus halo, and hover styles no longer stick after a tap.
- **Contrast on the Nightingale's photo.** Its pale-yellow photo is now the first one people see, so its `photo.scrim` went from 0.73 to 0.86 (a `scrimMin` floor in `scripts/assets/photo-config.json`), `.habitat` uses `--ink` instead of `--ink-2` (§4.3), and its two traits that repeated its habitat and range ("Dense thickets and woodland edges.", "Winters in sub-Saharan Africa.") were dropped, which also keeps the label clear of its beak at 1440×900. The worst habitat contrast went from 3.23:1 to 5.03:1.

Anti-goals (a reviewer should reject any of these): purple or neon gradients; glassmorphism or `backdrop-filter` blur panels; emoji; glowing edges; bouncy springs on data; an auto-advancing carousel; autoplaying sound; decorative particles outside the plate; skeleton shimmer over the photo (use the LQIP); a light theme toggle.

---

## 1. Concept and mood

### 1.1 Thesis

**Kyma Birds is a listening instrument with three stations wired in series, and you can see the wire between them.** A bird (photographed like a specimen, with its field label) feeds a song (shown live as a spectrum on a frequency scale), which drives a plate (sand finding the nodal lines). *Kyma* (κῦμα) is Greek for "wave" and the root of "cymatics".

Mood: **a field station after dark.** Quiet, exact and alive. The photo carries the color, the plate carries the motion, and the chrome stays small, precise and mostly monochrome, like the engraved labels on lab equipment. Nothing competes with the sand.

### 1.2 How the flow Bird → Song → Plate is made visible

Seven devices, all required:

1. **Zone labels in one aligned row.** On desktop, the head row of the three-column grid reads `01 Bird ───▸  02 Song ─▸  03 Plate`. The labels sit in the same row (each zone repeats the page grid's rows), and a 1px hairline with a 5px arrowhead runs from each label to the next zone (it is decorative and `aria-hidden`). While a song plays, the hairline carries a slow dash in `--signal` moving toward the plate (1.6s linear loop). It stops when paused and is static under reduced motion.
2. **The Song zone sits physically between the other two.** Desktop: a vertical "spine" column between card and plate. Tablet and mobile: a horizontal strip between card and plate.
3. **A spectrum on a log-frequency axis.** It runs from 500 Hz to 12 kHz with ticks at 1k, 2k, 4k and 8k. On desktop the spectrum bars grow from the bird side toward the plate side, so energy visibly flows left to right.
4. **The band bracket.** The card's data row prints `Band 2.1–4.6 kHz` from `audio.bandHz.p10–p90`. The same band is drawn as a 2px `--signal` bracket on the spectrum's frequency axis, so the static fact on the card and the live signal line up visibly.
5. **The dominant-frequency hairline.** A 1px `--ink` line crosses the spectrum at the live dominant frequency and ends in an arrowhead at the spine's plate-side edge. Under it is the readout `2.84 kHz`, and under that `→ (3, 2)`, the mode now driving the plate.
6. **The mode readout at the plate.** The Plate zone's head row repeats `Mode (3, 2)` in `--signal`, so the eye links the spine readout to the plate.
7. **Idle state shows causality.** Before Listen, the sand lies scattered and still and the caption reads "Waiting for sound". Pressing Listen makes the sand jump and find its first lines while the spectrum fills. That moment is the signature of the page.

**One color, one meaning.** `--signal` means "this bird's live signal" and is used only for: the spectrum fill and band bracket, the dash on the flow hairline, the loop-progress ring on the play button, the active rail tick, and the mode readout. Buttons, links and focus rings never use the accent.

### 1.3 What we take from the references

- Reference 2 (phone reel): the stacked field label over the photo (UPPERCASE scientific name, local name, status, one short trait per line), the dark circular plate with a light rim, and the photo-first composition.
- Reference 1 (square plate): the stark black and white contrast, crisp sand lines and loose grains (renderer), the square plate (kept in the plate module and its lab; the app shows only the circle, §0), and the center bolt as the plate's "driver" (renderer).

---

## 2. Layout

### 2.1 Layout modes

| Mode | Media condition | Typical devices |
|---|---|---|
| **Split** | `(width >= 64rem) and (min-aspect-ratio: 5/4) and (height > 34rem)` | Laptops, desktops, landscape tablets of 1024px and up |
| **Split wide** | Split and `(width >= 100rem)` | 1600px and up; sizes cap and the composition centers |
| **Stacked** | `(width >= 40rem)` and not Split and `(height > 34rem)` | Portrait tablets (768–1024), narrow desktop windows |
| **Field** | `(width < 40rem)` | Phones in portrait |
| **Compact landscape** | `(height <= 34rem) and (orientation: landscape)` | Phones in landscape |

Breakpoints are in rem, so at 200% zoom a desktop falls back to Stacked or Field and nothing clips. No layout uses a fixed `height` with `overflow: hidden` on the page. Every mode uses `min-height` and lets the page scroll vertically if the content can't fit (for example at zoom). Nothing ever scrolls horizontally except the bird track.

### 2.2 Global frame

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0f1610"> <!-- per bird, see §9.6 -->
```

```css
@layer layout {
  :root {
    --gutter: clamp(16px, 2.2vw, 32px);
    --gap: clamp(12px, 1.6vw, 24px);
    --masthead-h: 56px;
    --safe-t: env(safe-area-inset-top, 0px);
    --safe-b: env(safe-area-inset-bottom, 0px);
    --safe-l: env(safe-area-inset-left, 0px);
    --safe-r: env(safe-area-inset-right, 0px);
  }
  html, body { overflow-x: clip; }           /* belt and braces; the real fix is min-width: 0 on grid items */
  body { background: var(--ground); color: var(--ink); min-height: 100dvh; }
  .app { min-height: 100dvh; background: var(--ground); }
  .instrument > * { min-width: 0; }          /* lets the track shrink inside grid columns */
}
```

Viewport units: in Split, sizes use `dvh` (desktop has no dynamic toolbars). In Stacked, Field and Compact, *sizes* use `svh` so nothing jumps when mobile toolbars collapse, while the container uses `min-height: 100dvh`.

### 2.3 Split (desktop)

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ◎ KYMA BIRDS                                   Space to play · ← → to change bird  About  Credits │ 56px masthead
├───────────────────────────────────────────────────────────────────────────────────────┤
│ 01 Bird ─────────────────────────────▸ │ 02 Song ─▸ │ 03 Plate               Mode (3, 2) │ 40px head row
│ ┌───────────────────────────────────┐ │   ( ▶ )    │ ┌──────────────────────────────┐ │
│ │                       Gray Antwren  │ │  Playing   │ │                              │ │
│ │                   MYRMOTHERULA SNOWI│ │ 8k ┤▬▬      │ │                              │ │
│ │                   Choquinha-de-alagoas│ │ 4k ┤▬▬▬▬▬    │ │           plate              │ │
│ │       (photo)     [CR] Critically … │ │   ╞▬▬▬▬▬▬▸   │ │      (square canvas)         │ │
│ │                   Soft gray plumage. │ │ 2k ┤▬▬▬      │ │                              │ │
│ │                   Fine pointed bill. │ │ 1k ┤▬        │ │                              │ │
│ ├───────────────────────────────────┤ │            │ │                              │ │
│ │ A thin, rising series of whistles…  │ │  2.84 kHz  │ │                              │ │
│ │                                     │ │  → (3, 2)  │ │                              │ │
│ │ TRILL · BAND 2.1–4.6 kHz · PEAK 3.2 │ │            │ └──────────────────────────────┘ │
│ │ Photo  J. Doe · CC BY-SA 4.0 · …    │ │            │                                  │
│ │ Song   R. Roe · CC BY 4.0 · …       │ │            │                                  │
│ └───────────────────────────────────┘ │            │                                  │
│ LOW ││││▌││││││││ HIGH   1.8 kHz   03 / 12 ‹ ›   │ 🔈 ──●──   │ Hold  Scatter sand                      │ 48px foot row
└───────────────────────────────────────────────────────────────────────────────────────┘
```

(The speaker glyph in the diagrams stands for an SVG icon. There are no emoji in the UI.)

```css
@layer layout {
  @media (width >= 64rem) and (min-aspect-ratio: 5/4) and (height > 34rem) {
    .instrument {
      --zone-head: 40px;
      --zone-foot: 48px;
      --row-gap: 12px;
      --pad-y: 24px;
      --spine: clamp(104px, 7.5vw, 136px);
      --chrome-y: calc(var(--masthead-h) + 2 * var(--pad-y) + var(--zone-head) + var(--zone-foot) + 2 * var(--row-gap));
      --plate: min(
        100dvh - var(--chrome-y),
        (100vw - 2 * var(--gutter) - var(--spine) - 2 * var(--gap)) * 0.58,
        960px
      );

      display: grid;
      grid-template-columns: minmax(340px, 680px) var(--spine) var(--plate);
      grid-template-rows: var(--zone-head) minmax(0, 1fr) var(--zone-foot);
      justify-content: center;
      column-gap: var(--gap);
      row-gap: var(--row-gap);
      height: calc(100dvh - var(--masthead-h));
      min-height: 520px;
      padding: var(--pad-y) max(var(--gutter), var(--safe-r)) var(--pad-y) max(var(--gutter), var(--safe-l));
      max-width: 1840px;
      margin-inline: auto;
    }
    .zone { display: grid; grid-row: 1 / -1; grid-template-rows: var(--zone-head) minmax(0, 1fr) var(--zone-foot); }
    .zone-head { display: flex; align-items: center; gap: 12px; }   /* restores what Stacked hid */
    /* Each zone renders exactly three direct children: head, body, foot, on rows that repeat the page
       grid's (not a subgrid: WebKit hit-tests a subgrid's rows where they were before a relayout, and
       clicks miss the play button). The bird zone's body (track) and foot (picker-nav) share the
       carousel region, which spans rows 2–3 with the same two rows. */
    .carousel { grid-row: 2 / 4; display: grid; grid-template-rows: minmax(0, 1fr) var(--zone-foot); min-height: 0; }
    .track { height: auto; min-height: 0; }                         /* fills the body row */
    .zone--bird  { grid-column: 1; }
    .zone--song  { grid-column: 2; border-inline: 1px solid var(--line); }
    .zone--plate { grid-column: 3; }
    .plate-figure { width: var(--plate); aspect-ratio: 1; align-self: center; justify-self: center; }
  }
}
```

Resolved sizes (these are acceptance targets):

| Viewport | Plate | Card column | Spine |
|---|---|---|---|
| 1024 × 768 | 488 | ~354 | 104 |
| 1280 × 720 | 504 | ~575 | 104 |
| 1440 × 900 | 684 | ~539 | 108 |
| 1920 × 1080 | 864 | 680 (capped) | 136 |
| 2560 × 1440 | 960 (capped) | 680 (capped) | 136 |

**Split wide (≥ 100rem):** the same grid. Caps apply (plate 960, card 680) and the composition centers on the tinted ground. The masthead content aligns to the same max-width.

### 2.4 Stacked (tablet portrait and narrow desktop)

```
┌──────────────────────────────────────────┐
│ ◎ KYMA BIRDS                About Credits │ 56px masthead bar
│ ┌──────────────────────────────────────┐ │
│ │ (photo, overlay card)                 │ │ card: clamp(300px, 34svh, 520px) tall
│ │ Gray Antwren          MYRMOTHERULA …  │ │
│ └──────────────────────────────────────┘ │
│ 01 Bird  LOW ││││▌│││││││ HIGH  03 / 12 ‹ ›│ 48px bird nav row
│ 02 Song (▶) ▁▂▅▇▆▃▂▁  2.84 kHz → (3, 2) 🔈 ─●─│ 64px song strip
│              ╭────────────╮               │
│              │   plate    │               │ plate: min(100vw − 2·gutter, 36svh, 640px)
│              ╰────────────╯               │
│ 03 Plate · Mode (3, 2)   Hold  Scatter sand│ 48px plate foot row
└──────────────────────────────────────────┘
```

Cascade order of the layout variants in `app.css`: Field (`width < 40rem`), then Stacked (`width >= 40rem`), then Split, which overrides Stacked (it restores the zone heads and the rail), then Compact landscape last. Registering them in that order keeps every media query simple.

```css
@media (width >= 40rem) {
  .instrument {
    --plate: min(100vw - 2 * var(--gutter), 36svh, 640px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: 12px;
    padding: 16px max(var(--gutter), var(--safe-r)) calc(16px + var(--safe-b)) max(var(--gutter), var(--safe-l));
    min-height: calc(100dvh - var(--masthead-h));
  }
  .track { height: clamp(300px, 34svh, 520px); }
  .zone-head { display: none; }             /* zone labels move inline into each nav/strip/foot row */
}
```

At 820 × 1180 it fits with no scroll: 56 + 374 + 48 + 64 + 396 + 48 + gaps and padding (about 108) ≈ 1094.

### 2.5 Field (phone portrait)

```
┌─────────────────────────────┐ ← safe-area top (photo bleeds under the status bar)
│ ◎ KYMA BIRDS          About │ masthead overlays the photo (48px + safe-t)
│ Gray Antwren                │ field label: common name (display)
│ MYRMOTHERULA SNOWI          │
│ Choquinha-de-alagoas     PT │
│ [CR] Critically endangered  │
│ Soft gray plumage.          │ max 3 traits
│ Fine pointed bill.          │
│ Secretive insectivore.      │
│          (photo)            │ photo region: max(300px, 46svh)
│ Details                     │
│ Photo J. Doe (CC BY-SA) · Song R. Roe (CC BY)    ‹ 03/12 › │ compact credit + pager
│▓▓ (▶)  ▁▂▅▇▅▂▁  2.84 kHz  🔈 ▓│ song strip, 56px, layered over the photo's bottom fade
└─────────────────────────────┘
          ╭───────────╮
          │   plate   │          min(100vw − 2·gutter, 36svh, 440px)
          ╰───────────╯
 Mode (3, 2)   Hold  Scatter sand      44px plate foot row
                                       + safe-area bottom
```

```css
@media (width < 40rem) {
  .instrument {
    --gutter: 16px;
    --plate: min(100vw - 2 * var(--gutter), 36svh, 440px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 100dvh;
    padding-bottom: calc(12px + var(--safe-b));
  }
  .masthead { position: absolute; inset: 0 0 auto 0; padding-top: var(--safe-t); background: none; z-index: 10; }
  .zone--bird .track { height: max(300px, 46svh); }   /* full-bleed: no side padding, radius 0 */
  .zone--song { margin-top: -56px; position: relative; z-index: 2; }   /* layered on the photo's fade */
  .zone-head, .picker-rail { display: none; }         /* headings stay in the a11y tree via .sr-only twins */
  .zone--bird { position: relative; }
  .zone--bird .picker-nav { position: absolute; inset-inline-end: 16px; bottom: calc(56px + 8px); z-index: 1; }
  .bird-card .caption { padding-bottom: calc(56px + 12px); }          /* credit and Details sit above the strip */
  .bird-card .credit-line--compact { max-width: calc(100% - 152px); }  /* never runs under the pager */
}
```

The photo's bottom 96px fades into `--ground` with a mask applied to `.photo` only (never to the card, or the credit text would fade with it): `mask-image: linear-gradient(to bottom, #000 calc(100% - 96px), transparent)`. The song strip sits on that fade, so the strip needs no panel background.

The pager (`‹ 03 / 12 ›`, 44px targets) sits at the photo's bottom-right on the same line as the compact credit, and it comes after the track in the DOM (see §3.1). Masthead: wordmark on the left, "About" on the right. Below 380px wide, the wordmark collapses to the glyph plus "KYMA".

### 2.6 Rejected: the "reel" overlay (plate on the photo, as in reference 2)

To put the plate on top of the photo while the song controls sit below it, the visual order has to be Bird → Plate → Song while the DOM order is Bird → Song → Plate. That breaks focus and reading order, and the plate covers the lower third of the bird. If a full-bleed "reel" view is wanted later, build it as a separate fullscreen mode (`?view=reel`) with its own DOM order. Not in v1.

### 2.7 Compact landscape (phones in landscape)

The layout has two columns: the card on the left (`1fr`) and the plate on the right (`min(100svh - 72px, 50vw)`). There is no spine and no rail. The plate foot row holds Play, the Hz readout, the mode readout and the plate controls (Hold, Scatter sand). The masthead overlays the card. The page may scroll vertically.

### 2.8 Safe areas

- Field: the photo bleeds under the status bar, and the masthead pads with `--safe-t`. Side paddings everywhere use `max(var(--gutter), var(--safe-l|r))`. The last row pads with `--safe-b`.
- Dialogs and sheets pad their bottom with `calc(24px + var(--safe-b))`.

---

## 3. The bird picker

### 3.1 Structure and DOM order (the same in every mode)

```
section.zone.zone--bird [aria-labelledby=zone-bird]
  header.zone-head               → <h2 id="zone-bird"><span aria-hidden="true">01</span> Bird</h2> + flow hairline
  div.carousel [role=region aria-roledescription=carousel aria-label="Birds"]
    div#bird-track.track         → 12 × <article class="bird-card" role="tabpanel" aria-roledescription="slide" …>
    div.picker-nav               → PickerRail (tablist) · counter · PickerPager (prev/next)
```

The nav comes after the track in the DOM and sits under it visually in every mode, so focus order matches visual order.

### 3.2 Track CSS (native scroll and mandatory snap)

```css
@layer components {
  .track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;      /* no browser back-swipe at the ends */
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    border-radius: var(--radius-4);
    /* no gap: each slide is exactly one scrollport wide */
  }
  .track::-webkit-scrollbar { display: none; }
  .bird-card {
    scroll-snap-align: center;
    scroll-snap-stop: always;            /* one bird per swipe, even on a hard flick */
    container: card / size;
    position: relative;
    height: 100%;
  }
  .bird-card[data-initial] { scroll-initial-target: nearest; }   /* Chromium 133+; the inline script covers the rest */

  @media (prefers-reduced-motion: no-preference) {
    .track { scroll-behavior: smooth; }
  }
}
```

Input methods, all native unless noted:

- **Touch swipe and trackpad horizontal swipe:** native scrolling. The `snap-stop: always` rule keeps it to one bird per gesture.
- **Mouse wheel and trackpad vertical swipe (Split and Compact only, `(pointer: fine)`):** `useWheelStep`. It uses a passive `wheel` listener on the track. When `|deltaY| > |deltaX|`, it accumulates `deltaY` (multiplied by 16 if `deltaMode === 1`). When the total reaches 60, it steps ±1 and then ignores wheel input until 400ms pass with no wheel events, which swallows trackpad inertia. In Stacked and Field it is disabled, because there vertical wheel input should scroll the page.
- **Prev/next buttons:** 40×40 hit area in Split (32px visual), 44×44 elsewhere. At either end the button gets `aria-disabled="true"`. It stays focusable and is dimmed to `--ink-4`, and a press does nothing. Native `disabled` is avoided because it would drop focus to `<body>`.
- **Keyboard:** see §8.3.
- **Mouse drag:** not implemented. Buttons, wheel, rail and keys cover mouse users.

### 3.3 Rail (the index), counter and pager

```
LOW  │ │ │ ▌ │ │ │ │ │ │ │ │  HIGH    Gray Antwren · 1.8 kHz    03 / 12   ‹  ›
```

- `PickerRail` is a `role="tablist"` (`aria-label="Choose a bird"`, `aria-describedby` → sr text "Birds are ordered from lowest to highest voice.") with 12 `<button role="tab">` elements. Each tab has `id="tab-<slug>"`, `aria-controls="slide-<slug>"`, `aria-selected`, `aria-label={commonName}`, and a roving `tabIndex` (`0` on the selected tab, `-1` on the rest).
- Tick visuals: hit area 24 × 40px (24 × 44 on coarse pointers). The tick is drawn as a centered `::before`: 1 × 12px `--ink-3`; on hover 1 × 16px `--ink-2`; when selected 2 × 20px `--signal`. Ticks are evenly spaced. The end caps "Low" and "High" are mono labels and `aria-hidden` (the sr description covers them).
- **Hover/focus label:** to the right of the rail, one line, Martian Mono 11px `--ink-2` (the `mono-data` role, §7.2). When a tick is hovered or focused it shows that bird's `commonName · p50`. Otherwise it shows the active bird. This replaces tooltips.
- **Counter:** `03 / 12`. The current number is in `--ink` and ` / 12` in `--ink-3`, set in Martian Mono 12px with `tabular-nums`, `aria-hidden="true"` (slides carry "3 of 12").
- Field: the rail is hidden and the pager shows `‹ 03 / 12 ›`.

### 3.4 Two indices: `viewIndex` (instant) and the committed bird (settled)

| | `viewIndex` | committed `bird` |
|---|---|---|
| Changes when | The slide under the scrollport changes, mid-gesture | The scroll has settled **and** 250ms have passed with no new movement |
| Drives | Counter, rail selection, `inert` on slides, the theme (`--signal`, `--ground`), image priority | URL `?bird`, audio switch, plate figure label, live announcement, `<title>`, `theme-color`, Media Session |
| Owner | `Instrument` local state (passed into `BirdZone`, set by `useSnapIndex`) | URL search param (TanStack Router) |

`useSnapIndex(trackRef, { count, initialIndex, onView, onSettle })`:

```ts
// 1. View index, fastest source available
if ('onscrollsnapchanging' in window) {
  track.addEventListener('scrollsnapchanging', e => setView(indexOf(e.snapTargetInline)))
} else {
  // IntersectionObserver(root: track, threshold: [0.55]): the slide crossing 55% visible becomes the view index.
  // Batch with requestAnimationFrame; ignore entries while a programmatic scroll is pending.
}

// 2. Settle detection
const settleEvent =
  'onscrollsnapchange' in window ? 'scrollsnapchange' :
  'onscrollend' in window ? 'scrollend' : null          // else: 'scroll' + 140ms idle timer

// 3. Commit after dwell
on settle → clearTimeout(dwell); dwell = setTimeout(() => onSettle(viewIndex, source), 250)
on any new scroll start → clearTimeout(dwell)

// 4. Programmatic navigation
goTo(i, { source }) {
  i = clamp(i, 0, count - 1); pending = i; setView(i)            // UI jumps to the target at once
  const distance = Math.abs(i - currentIndex)
  if (reducedMotion || distance > 2) {
    // instant: fade the track to 0 over 100ms, set scrollLeft, fade back in over 160ms (no fade under reduced motion)
    track.scrollTo({ left: slide(i).offsetLeft, behavior: 'instant' })
  } else {
    track.scrollTo({ left: slide(i).offsetLeft, behavior: 'smooth' })
  }
  // settle fires → commit with this source; pending cleared
}
```

Resize: browsers re-snap after layout changes. As a fallback, a `ResizeObserver` on the track corrects `scrollLeft` when it drifts more than 2px from `viewIndex * clientWidth`.

Focus safety: when the outgoing slide becomes `inert` while `document.activeElement` is inside it, focus the incoming slide (`tabIndex={-1}`) with `{ preventScroll: true }`.

### 3.5 Deep linking

```ts
// src/lib/search.ts
export type BirdSearch = { bird?: string }                       // `/` and `/credits`; no `plate`: the plate is always a circle

export function validateBirdSearch(raw: Record<string, unknown>): BirdSearch {
  return {
    bird: typeof raw.bird === 'string' && SLUGS.has(raw.bird) ? raw.bird : undefined, // unknown slug → the default bird, silently
  }
}

// commit
navigate({ to: '/', search: prev => ({ ...prev, bird: slug }), replace: true, resetScroll: false })
```

- No `?bird` on first load (or an unknown slug) means the default bird, the Common Nightingale: `committedIndexOf(birds, slug)` in `lib/manifest.ts` falls back to `DEFAULT_BIRD_SLUG`. The param is only added once the user changes bird. An unknown slug is also removed from the address bar on mount.
- **Initial scroll without a flash:** SSR marks the deep-linked slide `data-initial` (for `scroll-initial-target`) and renders this inline script directly after the track. It runs before first paint because the stylesheet is render-blocking:

```tsx
<script dangerouslySetInnerHTML={{ __html:
  `(function(t){if(t)t.scrollLeft=${committedIndex}*t.clientWidth})(document.getElementById('bird-track'))`
}} />
```

### 3.6 Prefetching

- **Images:** the committed slide gets `loading="eager" fetchpriority="high"`, plus a `<link rel="preload" as="image">` in `head()` (§9.6). Slides within ±2 of `viewIndex` get `loading="eager"` with the default priority. All others get `loading="lazy"`. The attribute updates as `viewIndex` moves, and switching lazy to eager starts the fetch.
- **Audio:** once the committed song is playing (or 1.5s after commit if idle or paused), call `audio.prefetch(src)` for the neighbors at ±1. This fetches compressed bytes only, with `priority: 'low'`, into a 6-entry LRU of ArrayBuffers. Decoding happens on demand. Skip the prefetch when `navigator.connection?.saveData` is true.
- **Plate code:** `CymaticsPlate` (Three.js) is a lazy chunk mounted in `<ClientOnly>`, so it loads right after hydration and never blocks LCP (the photo).

---

## 4. Bird card

### 4.1 Content (DOM order = reading order)

```tsx
<article id={`slide-${b.slug}`} className="bird-card" role="tabpanel" aria-roledescription="slide"
         aria-labelledby={`tab-${b.slug}`} aria-describedby={`pos-${b.slug}`}
         inert={i !== viewIndex} tabIndex={-1} data-initial={i === committedIndex || undefined}
         style={photoVars(b)} data-label-side={labelSide(b)}>
  <span id={`pos-${b.slug}`} className="sr-only">{i + 1} of {total}</span>
  <BirdPhoto bird={b} priority={priority} />
  <div className="field-label">                       {/* overlays the photo, after reference 2 */}
    <h3 className="card-name">{b.commonName}</h3>       {/* always here, in every mode: DOM order = visual order */}
    <p className="sci">{b.scientificName}</p>
    <ul className="local-names">
      <li lang="pt-BR">{b.localNames.pt}<span className="lang-tag" aria-hidden="true">PT</span></li>
      <li lang="es">{b.localNames.es}<span className="lang-tag" aria-hidden="true">ES</span></li>
    </ul>
    <StatusChip code={b.iucnStatus.code} label={b.iucnStatus.label} />
    <ul className="traits">{b.traits.map(t => <li key={t}>{t}</li>)}</ul>
    <p className="habitat">{b.region} — {b.habitat}</p>
  </div>
  <div className="caption">
    <p className="song-desc">{b.songDescription}</p>
    <SongFacts character={b.songCharacter} band={b.audio.bandHz} peakHz={b.audio.peakHz} durationSec={b.audio.durationSec} />
    <CreditLine credits={b.credits} slug={b.slug} />
    <button className="details-btn" type="button" onClick={openDetails}>Details</button>
  </div>
</article>
```

(Use `role="tabpanel"` because the rail is a tablist that controls the slides, following the APG "carousel with tabs" pattern.)

### 4.2 Two card modes via container queries (not viewport queries)

| Card mode | Container condition | Composition |
|---|---|---|
| **Captioned** | `@container card (min-width: 380px) and (min-height: 600px)` | Photo on top (at least 55% of the card) with the field label (common name, scientific name, local names, status, traits, habitat) overlaid in the top corner opposite the bird. A caption panel below on `--ground-raised` holds "what you hear": the song description, song facts and full two-line credits. Details is hidden. Typical in Split. |
| **Overlay** | otherwise | Full-bleed photo with the field label at top-start or top-end. The caption is overlaid at bottom-start over a bottom scrim. The song description shows only if `(min-height: 420px)`, which is typical for Stacked. Credits use the compact one-line form. Details is shown. Typical in Field and Stacked. |

```css
.bird-card { display: grid; grid-template: "photo" minmax(0, 1fr) / 100%; }
.bird-card > * { grid-area: photo; }                      /* overlay by default */
.bird-card .caption { align-self: end; padding: 20px 24px; position: relative; z-index: 1; }
.photo::after {                                           /* bottom scrim, overlay mode only */
  content: ""; position: absolute; inset: auto 0 0 0; height: 55%;
  background: linear-gradient(to top, oklch(from var(--scrim) l c h / 0.82), transparent);
}

@container card (min-width: 380px) and (min-height: 600px) {
  .bird-card { grid-template: "photo" minmax(55%, 1fr) "caption" auto / 100%; background: var(--ground-raised); }
  .bird-card .caption { grid-area: caption; align-self: start; padding: 18px 24px 22px; }
  .photo::after { content: none; }
  .details-btn { display: none; }
}
```

The `<h3>` is always the first element of the field label, so heading, label and caption follow the same order in the DOM and on screen in both modes.

### 4.3 Field label (the reference 2 treatment)

- **Side:** `photo.labelSide` if present; otherwise `focal.x <= 0.5 ? 'end' : 'start'` (the label goes opposite the bird). It is anchored at the top with a 24px inset (16px in Field, below the masthead).
- **Scrim:** a radial gradient behind the label only. No blur, no panel.

```css
.bird-card[data-label-side="end"]   .field-label { justify-self: end;   text-align: end; }
.bird-card[data-label-side="start"] .field-label { justify-self: start; text-align: start; }
.field-label { align-self: start; max-width: min(34ch, 62cqi); padding: 24px; position: relative; z-index: 1;
  text-shadow: 0 1px 2px oklch(0 0 0 / 0.45); }
.bird-card::after {                                  /* label scrim */
  content: ""; grid-area: photo; pointer-events: none;
  background: radial-gradient(130% 80% at var(--scrim-x, 100%) 0%,
              oklch(from var(--scrim) l c h / var(--scrim-a, 0.72)) 0%, transparent 62%);
}
.bird-card[data-label-side="start"]::after { --scrim-x: 0%; }
```

Target: under every label glyph, the local background stays at or below L 0.40. With `--ink-2` that gives 5.2:1 or better. `photo.scrim` (0–1, optional, computed offline by sampling the label box) overrides `--scrim-a`.
- **Stacked lines, one fact per line, as in reference 2:**
  - `.card-name` (h3, display), 6px below it (§4.4).
  - `.sci`: UPPERCASE via CSS, Archivo 640, `font-stretch: 112%`, 13px/1.2, `letter-spacing: 0.07em`, `--ink`.
  - `.local-names li`: Archivo 400, 15px/1.3, `--ink`. The lang tag is Martian Mono 11px `--ink-3`, 6px inline-start margin.
  - `StatusChip` (§4.5), 8px above and below.
  - `.traits li`: Archivo 450, 14px/1.32, `--ink-2`. Each trait sits on its own line with no bullets. Overlay mode shows at most 3 (CSS `li:nth-child(n+4) { display: none }`); the full list lives in Details. Captioned mode shows 6.
  - `.habitat`: Martian Mono 11px/1.45 `--ink`, 8px top margin. It sits lowest on the photo, where the scrim has faded, so it takes the full ink (§0, 2026-10-28).

### 4.4 Common name and caption

- `.card-name` (h3, first line of the field label): Archivo 620, `font-stretch: 88%`, `font-size: clamp(1.75rem, 6.4cqi, 3.5rem)`, line-height 1.02, `letter-spacing: -0.02em`, `text-wrap: balance`, `--ink`. It follows the label's alignment (end-aligned when the label sits top-end).
- `.song-desc`: Archivo 400, 15px/1.5, `--ink-2`, `max-width: 52ch`, `text-wrap: pretty`, clamped to 3 lines in overlay mode (`line-clamp: 3`; the full text is in Details).
- `SongFacts` is one line of Martian Mono 11px. Labels are UPPERCASE `--ink-3` and values are 12px `--ink-2`, separated by 16px gaps:
  `TRILL   BAND 2.1–4.6 kHz   PEAK 3.2 kHz   LOOP 0:24`. Use an en dash in ranges and a non-breaking space before units.
- `CreditLine`: §6.1.

### 4.5 IUCN status chip

```
┌────┬─────────────────────────┐
│ CR │ Critically endangered   │   height 24px; code block 28px wide
└────┴─────────────────────────┘
```

```css
.status { display: inline-flex; align-items: stretch; height: 24px; border-radius: var(--radius-1);
  box-shadow: inset 0 0 0 1px oklch(from var(--status) l c h / 0.55);
  background: oklch(from var(--ground) l c h / 0.72); white-space: nowrap; }
.status__code { display: grid; place-items: center; min-width: 28px; padding-inline: 6px;
  background: var(--status); color: var(--on-status);
  font: 600 11px/1 var(--font-mono); letter-spacing: 0.04em; }
.status__label { padding-inline: 8px; align-self: center; font: 500 13px/1 var(--font-sans); color: var(--ink); }
.status[data-code="LC"] { --status: var(--iucn-lc); } /* … NT VU EN CR EW EX DD NE */
```

- The code text and the label text are always both present, so color is never the only cue.
- Accessible text: `<span class="status__code" aria-hidden="true">CR</span><span class="status__label">Critically endangered</span>`, plus sr-only "IUCN status:" before it.
- The Details sheet adds a scale strip `LC NT VU EN CR EW EX` with the current code filled and the others outlined, so the status reads as a position on a scale.

### 4.6 Photo, focal crop and LQIP

```tsx
function BirdPhoto({ bird: b, priority }: { bird: Bird; priority: 'high' | 'auto' | 'lazy' }) {
  return (
    <figure className="photo" style={{
      '--lqip': `url("${b.photo.lqip}")`,
      '--fx': b.photo.focal.x, '--fy': b.photo.focal.y,
      backgroundColor: b.photo.dominantColor,
    } as React.CSSProperties}>
      <img
        src={b.photo.srcSm}
        srcSet={`${b.photo.srcSm} 800w, ${b.photo.src} 1600w`}
        sizes="(min-width: 64rem) 680px, 100vw"
        width={b.photo.width} height={b.photo.height}
        alt={b.photo.alt ?? `${b.commonName}. ${b.traits.slice(0, 2).join(' ')}`}
        loading={priority === 'lazy' ? 'lazy' : 'eager'}
        fetchPriority={priority === 'high' ? 'high' : 'auto'}
        decoding={priority === 'high' ? 'sync' : 'async'}
        data-fade={priority === 'high' ? undefined : ''}   /* no fade on the LCP image */
        onLoad={e => e.currentTarget.setAttribute('data-loaded', '')}
      />
    </figure>
  )
}
```

```css
.photo { position: relative; overflow: clip; margin: 0; }
.photo::before {                         /* LQIP blur-up */
  content: ""; position: absolute; inset: 0; background: var(--lqip) center / cover;
  filter: blur(18px); transform: scale(1.12);
}
.photo img { position: relative; width: 100%; height: 100%; object-fit: cover;
  object-position: calc(var(--fx) * 100%) calc(var(--fy) * 100%);
  outline: 1px solid oklch(1 0 0 / 0.08); outline-offset: -1px; }
.js .photo img[data-fade]:not([data-loaded]) { opacity: 0; }
.photo img[data-fade] { transition: opacity var(--dur-4) var(--ease-out); }
```

- The `js` class is set on `<html>` by a one-line inline script in `__root`. Without JS, images are never hidden.
- The LCP (committed) image is never faded, so it paints as soon as it decodes and the LQIP sits under it.
- **Subtle parallax (progressive enhancement):** inside `@supports (animation-timeline: view())` and `(prefers-reduced-motion: no-preference)`:

```css
.photo img { scale: 1.08; animation: drift linear both; animation-timeline: view(inline); }
@keyframes drift { from { translate: 4% 0; } to { translate: -4% 0; } }
```

### 4.7 Per-bird theming

`lib/theme.ts` turns the manifest hex colors into clamped OKLCH once per bird. It is memoized and doesn't depend on relative color syntax at runtime:

```ts
export function birdTheme(b: Bird): React.CSSProperties {
  const dom = hexToOklch(b.photo.dominantColor)
  const acc = hexToOklch(b.photo.accentColor)
  const hue = acc.c < 0.03 ? dom.h : acc.h                         // gray bird → borrow the habitat hue
  const accent = fitSrgb({ l: clamp(acc.l, 0.76, 0.86), c: clamp(acc.c, 0.07, 0.15), h: hue })
  const gc = clamp(dom.c * 0.35, 0.006, 0.03)
  return {
    '--signal': oklch(accent),
    '--ground': oklch({ l: 0.19, c: gc, h: dom.h }),
    '--ground-raised': oklch({ l: 0.23, c: gc, h: dom.h }),
    '--ground-sunken': oklch({ l: 0.155, c: gc * 0.8, h: dom.h }),
    '--scrim': oklch({ l: 0.14, c: gc, h: dom.h }),
  } as React.CSSProperties
}
// fitSrgb: binary-search chroma down until the color is inside sRGB (keep L and H).
```

The style is applied on `.app` from `birds[viewIndex]`, so the room shifts while you swipe. Transitions use registered properties:

```css
@property --signal        { syntax: '<color>'; inherits: true; initial-value: oklch(0.8 0.11 150); }
@property --ground        { syntax: '<color>'; inherits: true; initial-value: oklch(0.19 0.014 150); }
@property --ground-raised { syntax: '<color>'; inherits: true; initial-value: oklch(0.23 0.014 150); }
@property --ground-sunken { syntax: '<color>'; inherits: true; initial-value: oklch(0.155 0.012 150); }
.app { transition: --signal var(--dur-4) var(--ease-in-out), --ground var(--dur-4) var(--ease-in-out),
                   --ground-raised var(--dur-4) var(--ease-in-out), --ground-sunken var(--dur-4) var(--ease-in-out); }
```

Measured contrast: an accent with L ≥ 0.76 on any tinted ground (L 0.19, C ≤ 0.03) is **≥ 8.2:1**, and on `--ground-raised` **≥ 7.5:1**.

---

## 5. Audio UX and plate controls

### 5.1 Audio states

| State | Entered when | Transport (play button) | State text | Plate |
|---|---|---|---|---|
| `idle` | Page load, before any gesture | Play icon; ring empty | "Ready" | Still sand, Listen gate visible, caption "Waiting for sound" |
| `loading` | Listen pressed (or bird committed while on) and the buffer isn't decoded yet | Spinner arc (900ms linear rotation; under reduced motion a static dashed ring) | "Loading" | Old pattern holds and settles naturally |
| `playing` | The buffer started | Pause icon; ring = loop progress in `--signal` | "Playing" | Live |
| `paused` | The user paused | Play icon; ring frozen | "Paused" | Sand rests where it is |
| `error` | Fetch or decode failed | Retry icon | "Can't play" + inline "This song didn't load." and a "Try again" button | Still; caption "No sound" |

`muted` is a flag, not a state. The state text then reads "Muted" (playing continues, and the plate keeps moving because analysis runs before the output gain).

**Switching birds:**
- `playing` → fade the old gain to 0 over 900ms. Start the new buffer at gain 0 and ramp it to the target over 1.2s (equal-power), so the old song exhales while the new one inhales alongside the 1.4s room fade. If the new buffer isn't ready, show `loading` between the two. Abort the previous fetch with `AbortController` if the user moves on again.
- `paused` → load the new bird silently and stay paused.
- `idle` → fetch the new bird's bytes (no decode, no AudioContext) so the first Listen is fast.
- The spine's band bracket tweens from the old band to the new over 480ms (`--ease-in-out`).
- The plate is **not** reset on a bird change. The sand migrating from the old pattern to the new one is the show. "Scatter sand" is the only reset.

**First gesture (Listen, Play or Space):**
1. Inside the event handler, synchronously: create or resume the `AudioContext`. On iOS, `if ('audioSession' in navigator) navigator.audioSession.type = 'playback'` so the ring/silent switch doesn't mute Web Audio.
2. Decode the committed song (already fetched) and start the loop.
3. The gate fades out (opacity 1 → 0 and scale 1 → 0.98, 320ms `--ease-out`) and then unmounts. **If focus was on the gate button, move it to the transport's play/pause button** so keyboard users can pause straight away.

**Background tab:** the audio keeps playing (people may want ambient listening). The plate's rAF loop pauses naturally.

**Media Session (progressive enhancement):** while playing, set `MediaMetadata` `{ title: commonName, artist: scientificName, album: 'Kyma Birds', artwork: [{ src: photo.srcSm, sizes: '800x…', type: 'image/webp' }] }`. Handlers: `play`, `pause`, `previoustrack`/`nexttrack` → `goTo(i ± 1, { source: 'media' })`. Don't add a hidden `<audio>` hack to force OS controls.

**Persistence (per-viewer convenience):** `volume` and `muted` go in `localStorage` under `kyma:audio`, with every read and write in try/catch. Never persist "has listened". The gate always shows on a fresh load.

### 5.2 Listen gate

The disc is centered on the plate: its center sits exactly on the plate's center, and the label and sub-line hang below it. It is **not** a modal: the rest of the page stays fully usable, and you can browse birds silently first.

```
            ┌──────────────┐
            │   ( ▶ )      │   112px disc (88px in Field): solid --ink, play glyph in --ground
            └──────────────┘
                Listen            Archivo 600, 17px, --ink
   Sound on. Watch the sand follow the song.   Archivo 400, 13px, --ink-2, max 28ch
```

- **Layout:** `.gate` fills the plate figure and is a size container (`container: gate / size`). `.gate__stack` (the button plus the sub-line) sits at `top: 50%` and is lifted by half the disc plus the button's 6px padding (`translate: 0 calc(var(--disc) / -2 - 6px)`), so the disc's center lands on the plate's center whatever the text below it measures. `--disc` is 112px, or 88px under 40rem. Under `@container gate (height < 320px)` the sub-line is visually hidden, because it would run off the plate; it stays the button's `aria-describedby` description. The cut-off is in px like the gate's text, so a larger default font size doesn't hide the line where it fits.
- It is a single `<button>`. The visible text "Listen" is contained in the accessible name `aria-label="Listen to the Gray Antwren"`, and the sub-line is referenced with `aria-describedby`.
- Behind it, the plate shows resting sand dimmed by a radial scrim (`--scrim` at 0.5 alpha toward the center).
- Breath: a soft pool of the bird's `--signal` behind the disc swells and settles (11s a breath, 4.5s in and 6.5s out, `--ease-breath`). It breathes **3 times and then rests**. The disc itself never moves until it is pressed. Under reduced motion the pool is still.
- `:active` → `scale: 0.96` (120ms). While the first decode runs (>150ms), the disc shows the loading arc and the label reads "Loading…".

### 5.3 Transport and Song zone

**Spine (Split), top to bottom inside the body row:**
1. Play/pause, 56px disc. It is the single filled control on the page: `--ink` fill and `--ground` glyph. The loop ring is 2px `--signal` on a 1px `--line` track, 4px outside the disc. `aria-label`: "Play song" or "Pause song", toggled. Use no `aria-pressed`, since the label changes.
2. State text: Martian Mono 11px UPPERCASE `--ink-3`, 8px below. It sits in a `role="status"` wrapper scoped to the transport, which announces "Loading", "Playing", "Paused" and errors politely.
3. Spectrum: `<canvas>` with flex 1 and min-height 180px. Frequency is on the y-axis (log, 500 Hz at the bottom to 12 kHz at the top). Tick labels 1k / 2k / 4k / 8k in Martian Mono 11px `--ink-3` sit at the inline start. Bars grow toward the plate. Fill is `--signal` at 0.85 alpha, and the band bracket is a 2px `--signal` line with 6px end caps at the left edge. `peakHz` is a 4px notch on the bracket. The dominant hairline is 1px `--ink` across the full width, ending in a 5px arrowhead at the right edge. The canvas is DPR-aware (cap DPR at 2) and redraws on rAF only while playing; when paused or idle it draws one static frame. **Accessibility:** `role="img"` and `aria-label="Live spectrum. Song band 2.1 to 4.6 kHz, peak 3.2 kHz."` (static per bird).
4. Readout: `2.84` Martian Mono 450 at 24px (`font-stretch: 87.5%`), unit `kHz` at 11px `--ink-3`. Below it, an SVG arrow and `(3, 2)` in 13px `--signal`. It updates at 8 Hz from a throttled snapshot (§9.2). **Silence handling:** when loudness falls below the gate for >400ms, hold the last value and dim it to `--ink-3`. Before any sound, show `—` (sr: "No sound yet").
5. Foot row: Mute (40px icon button, `aria-label="Mute"`, `aria-pressed`) and Volume (a Radix slider, 0–100 in steps of 1, 72–96px wide; its `role="slider"` thumb carries `aria-label="Volume"` and `aria-valuetext="70%"`). Styling: 2px `--line-2` track, `--ink` fill, and a 12px `--ink` dot painted by the 24×24px thumb, which is the hit target.

**Strip (Stacked, Field, Compact):** one row, 64px (56px in Field): `[02 Song label (Stacked only)] [Play 48] [Spectrum flex, 40px tall, frequency on x, bars grow up] [Readout: 15px value + 11px unit / mode] [Mute 44] [Volume 96 (Stacked only)]`. In Field the volume slider is hidden and the hardware volume is used.

**No-JS:** inside the Song zone, `<noscript>` renders `<audio controls loop preload="none" src={audio.src}>` with the label "Play the song".

### 5.4 Plate zone controls

| Control | Element | Behavior |
|---|---|---|
| Hold | `<button aria-pressed>` with text "Hold" | Freezes the sand in place; audio and readouts keep running. When pressed the button is filled `--ink` with `--ground` text, and the caption shows "Held". |
| Scatter sand | `<button>` with text "Scatter sand" | Re-randomizes the grains (`scatterToken++`). Disabled-looking but focusable (`aria-disabled`) while Hold is on. |
| Describe pattern | `<button>`, visually hidden until focused (skip-link style) | Announces through the global status region, e.g. "Mode (3, 2): 3 nodal diameters and 2 nodal circles. Following the song at 2.84 kHz." Uses `describeMode()` from the plate module; falls back to "Mode (3, 2)". |

The plate head row (Split) shows `03 Plate` on the left and `Mode (3, 2)` on the right (Martian Mono 13px, label `--ink-3`, value `--signal`). In other modes the mode readout leads the plate foot row.

There is no plate-shape control: the app shows only the circle (§0, 2026-10-28).

**Plate frame (shell side):** `.plate-figure` is a square box, and the plate inside it is always a circle: `border-radius: 50%`, `overflow: clip`, `box-shadow: var(--shadow-plate)`. Inside it are the canvas wrapper and the gate. The SSR poster (§11) is the same size, so there's no layout shift.

---

## 6. Attribution

### 6.1 On the card (always visible)

**Captioned mode (two lines):**
```
PHOTO  Jane Doe · CC BY-SA 4.0 · Wikimedia Commons ↗
SONG   Rafael Roe · CC BY 4.0 · xeno-canto XC123456 ↗          All credits
```
- The labels "Photo" and "Song" are Martian Mono 11px UPPERCASE `--ink-3`. Values are Martian Mono 11px/1.6 `--ink-2`.
- Author → `credits.photo.source` (the work's page), license → `licenseUrl`, and the source label is derived from the URL hostname (`commons.wikimedia.org` → "Wikimedia Commons", `xeno-canto.org` → "xeno-canto" + the XC number if present).
- Links have a dotted underline (`text-decoration-style: dotted; text-underline-offset: 3px; text-decoration-thickness: from-font`). On hover the line turns solid and the text turns `--ink`. They open in a new tab, so the song keeps playing (`target="_blank" rel="noopener"`), with a 10px ↗ SVG and sr text "(opens in a new tab)".
- "All credits" → `/credits?bird=<slug>#<slug>`.

**Overlay mode (one line, compact):**
`Photo Jane Doe (CC BY-SA) · Song Rafael Roe (CC BY)`. Author names link to the source and license codes link to the license deed. Long names truncate with an ellipsis at 18ch each, and the full text is in Details and on /credits. Inline links in text qualify for the inline-target exception (WCAG 2.5.8). Details and /credits provide 44px targets.

### 6.2 Details sheet (Overlay mode) and About

The Details sheet (a Radix dialog, styled as a bottom sheet in Field and a centered 560px dialog elsewhere) has these sections, in order:
1. Common name (h2), scientific name, local names, IUCN scale strip.
2. "Traits": all traits.
3. "Song": the full song description, song facts.
4. "Where it lives": region and habitat.
5. "Credits": a full two-line credit block with 44px-tall rows, each link as a full-width row.

### 6.3 `/credits` route

Server-rendered with one `<h1>`. Each bird is an `<article id={slug}>` (`scroll-margin-top: 80px`). When `?bird` is present, that article gets a `--signal` 2px inline-start rule and is scrolled into view.

```
Credits
Every photo and recording here is shared under a Creative Commons license. Thank you to the people who made them.

[thumb 96px]  Gray Antwren  Myrmotherula snowi
              Photo   Jane Doe          CC BY-SA 4.0     Wikimedia Commons ↗
                      Changes: cropped, resized, and converted to WebP.
              Song    Rafael Roe        CC BY 4.0        xeno-canto XC123456 ↗
                      Changes: trimmed to a seamless loop and re-encoded as AAC.
…
Typefaces   Archivo by Omnibus-Type · Martian Mono by Evil Martians · SIL Open Font License 1.1
Software    Three.js, React, TanStack, Radix UI, shadcn/ui, Tailwind CSS … · MIT; class-variance-authority · Apache 2.0; Lucide · ISC
← Back to the birds
```

- On ≥ 48rem, each credit row is a 4-column grid (`7ch 1fr auto auto`); on narrow screens it stacks.
- The "Changes" lines are required by CC BY-SA ("indicate if changes were made"). **The builder must match them to the actual asset pipeline.**
- `<table>` is not used; this is a list of works, not tabular data.
- "Back to the birds" → `/?bird=<slug>` (keeps the selection).
- `head()`: title "Credits · Kyma Birds", `robots: index`.
- JSON-LD (should): one `ImageObject` per photo with `creator`, `license`, `acquireLicensePage`, `creditText`.

The audio provider lives at the root (§9.2), so a song keeps playing on /credits. The masthead there shows a compact now-playing control: `[‖] Gray Antwren` (button, `aria-label="Pause song"`). Below 30rem the control drops the name and keeps only its disc, so About and Credits stay on screen; the button's label still names the bird.

---

## 7. Visual system

### 7.1 Color tokens (OKLCH; contrast measured on the default ground)

```css
@layer tokens {
  :root {
    color-scheme: dark;

    /* Ink: warm sand-white, hue 95 */
    --ink:    oklch(0.955 0.008 95);   /* #f2f0ea  16.2:1 on ground */
    --ink-2:  oklch(0.82 0.01 95);     /* #c6c4bd  10.6:1 */
    --ink-3:  oklch(0.70 0.012 95);    /* #a19e96   6.9:1 (6.3:1 on raised) */
    --ink-4:  oklch(0.56 0.012 95);    /* #76746d   4.0:1, disabled and decoration only, never body text */
    --line:   oklch(0.955 0.008 95 / 0.12);
    --line-2: oklch(0.955 0.008 95 / 0.24);

    /* Bird-driven (defaults = habitat green; overridden inline per bird, §4.7) */
    --ground:        oklch(0.19 0.014 150);   /* #0f1610 */
    --ground-raised: oklch(0.23 0.014 150);   /* #181f19 */
    --ground-sunken: oklch(0.155 0.012 150);  /* #090e0a */
    --scrim:         oklch(0.14 0.012 150);
    --signal:        oklch(0.80 0.11 150);
    --on-signal:     oklch(0.18 0.015 60);    /* ≥ 8.4:1 on any clamped accent */

    /* Plate (shell poster and fallback only; the renderer owns the real surface) */
    --plate-surface: oklch(0.13 0.004 150);   /* #060807 */
    --plate-rim:     oklch(0.90 0.006 95);

    /* IUCN Red List: hues follow IUCN convention; dark text on all chips */
    --on-status: oklch(0.18 0.015 60);
    --iucn-lc: oklch(0.74 0.15 145);  /* 8.6:1 with on-status */
    --iucn-nt: oklch(0.84 0.15 120);  /* 11.9:1 */
    --iucn-vu: oklch(0.87 0.16 98);   /* 12.8:1 */
    --iucn-en: oklch(0.75 0.15 55);   /* 8.1:1 */
    --iucn-cr: oklch(0.66 0.19 28);   /* 5.6:1 */
    --iucn-ew: oklch(0.62 0.11 330);  /* 4.9:1 */
    --iucn-ex: oklch(0.82 0 0);       /* 10.8:1 */
    --iucn-dd: oklch(0.78 0.01 95);   /* 9.4:1 (also NE) */

    /* Focus: neutral, never the accent */
    --focus: var(--ink);
    --focus-halo: oklch(0.12 0.01 150);
  }

  @media (prefers-contrast: more) {
    :root { --ink-3: var(--ink-2); --line: oklch(0.955 0.008 95 / 0.32); --line-2: oklch(0.955 0.008 95 / 0.5); }
    .bird-card { --scrim-a: 0.9; }
  }
}
```

Color strategy: **Committed via the photo.** The photograph and the habitat-tinted ground own most of the surface. The chrome is neutral ink, and the accent is a thin signal thread.

### 7.2 Typography

Install `@fontsource-variable/archivo` and `@fontsource-variable/martian-mono` (both 5.3.0).

```css
@import "@fontsource-variable/archivo/wdth.css";          /* family "Archivo Variable", stretch 62–125%, wght 100–900 */
@import "@fontsource-variable/archivo/wdth-italic.css";   /* italic: scientific names in prose */
@import "@fontsource-variable/martian-mono/wdth.css";     /* family "Martian Mono Variable", stretch 75–112.5%, wght 100–800 */

:root {
  --font-sans: "Archivo Variable", "Archivo", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Martian Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
html { font-family: var(--font-sans); font-size: 100%; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
       text-rendering: optimizeLegibility; font-optical-sizing: auto; }
```

Preload only the Latin Archivo file in `__root` `head().links`:
`import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url'` → `{ rel: 'preload', href: archivoLatin, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' }`.
Arrows (→ ↗) are inline SVGs, because U+2192 isn't in Archivo's Latin subset.

| Token / role | Family | Weight | Stretch | Size / line-height | Tracking | Notes |
|---|---|---|---|---|---|---|
| `wordmark` | Archivo | 650 | 125% | 14px / 1 | 0.14em | UPPERCASE via CSS, preceded by a 16px Chladni glyph (circle with two nodal diameters) |
| `display` (bird name) | Archivo | 620 | 88% | `clamp(1.75rem, 6.4cqi, 3.5rem)` / 1.02 | −0.02em | `text-wrap: balance` |
| `title` (dialog, credits h1) | Archivo | 600 | 100% | 28px / 1.15 | −0.01em | |
| `sci-label` | Archivo | 640 | 112% | 13px / 1.2 | 0.07em | UPPERCASE via CSS (reference 2) |
| `body` | Archivo | 400 | 100% | 15px / 1.5 (16px on /credits and dialogs) | 0 | `max-width: 52–65ch`, `text-wrap: pretty` |
| `trait` | Archivo | 450 | 100% | 14px / 1.32 | 0 | one per line |
| `ui` (buttons) | Archivo | 550 | 100% | 14px / 1 | 0.01em | |
| `mono-label` | Martian Mono | 500 | 100% | 11px / 1.2 | 0.06em | UPPERCASE via CSS: zone labels, fact labels, state text |
| `mono-data` | Martian Mono | 400 | 100% | 11–12px / 1.6 | 0 | credits, facts, counter |
| `readout` | Martian Mono | 450 | 87.5% | 24px / 1 (15px in strip) | −0.01em | `tabular-nums` |

Rules: copy is stored in natural case and UPPERCASE comes from `text-transform`; nothing is below 11px; `font-variant-numeric: tabular-nums` on every changing number; ranges use an en dash (2.1–4.6 kHz); there's a non-breaking space before units; scientific names are italic inside prose (`<i>` in Details and /credits) and roman UPPERCASE in the field label.

### 7.3 Space, radii, shadows, z-index

```css
@theme {
  --spacing: 4px;       /* p-1 = 4px … p-16 = 64px */

  --radius-xs: 2px;
  --radius-sm: 3px;     /* chips, ticks */
  --radius-md: 6px;     /* rectangular buttons */
  --radius-lg: 10px;    /* inputs, small panels */
  --radius-xl: 14px;    /* card / track (0 in Field: full-bleed) */
  --radius-2xl: 18px;   /* sheet top corners, dialogs */

  --shadow-plate: 0 40px 80px -24px oklch(0 0 0 / 0.7), 0 12px 24px -12px oklch(0 0 0 / 0.5);
  --shadow-sheet: 0 -24px 48px -12px oklch(0 0 0 / 0.6);
  --shadow-dialog: 0 32px 64px -16px oklch(0 0 0 / 0.65);
}
/* Pills are rounded-full; hairlines are inset-ring inset-ring-line. Stacking: z-2 song overlay,
   z-3 plate gate, z-10 masthead, z-50 the Radix portals (dialogs, tooltips). */
```

Concentric radii: the photo inside the captioned card shares the card's top radius (14px) with no inset. Separators are hairlines (`--line`); there are no shadows on UI chrome. Only the plate and the sheets cast shadows.

### 7.4 Motion

```css
:root {
  --ease-out:    cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-in:     cubic-bezier(0.55, 0, 1, 0.45);
  --ease-sheet:  cubic-bezier(0.32, 0.72, 0, 1);
  --dur-1: 120ms;  /* press scale, hover color */
  --dur-2: 200ms;  /* toggles, chips, focus */
  --dur-3: 320ms;  /* gate exit, sheet enter, dialog */
  --dur-4: 480ms;  /* theme shift, band bracket tween, image fade */
  --dur-5: 700ms;  /* reserved: never for UI chrome */
}
```

| Moment | Motion |
|---|---|
| Bird change | Native scroll is the transition. The theme crossfades over `--dur-4`. No text animation. |
| Long jump (rail, distance > 2) | Track opacity dips 1 → 0 → 1 (100ms out, 160ms in) around an instant scroll |
| Button press | `scale: 0.96` over `--dur-1` `--ease-out` on `:active`. Never on the rail ticks. |
| Gate exit | Opacity only over `--dur-5` `--ease-out` while the sand wakes under it, inert while it fades, then unmount |
| Sheet / dialog | Enter: `translate: 0 100%` → 0 over `--dur-3` `--ease-sheet` (sheet), or opacity + `scale: 0.98` (dialog), as tw-animate-css enter/exit animations (Radix keeps the dialog mounted until the exit ends). Exit over 200ms `--ease-out`. |
| Readouts | None. Numbers change in place. |

**Reduced motion** (`prefers-reduced-motion: reduce`):
- Programmatic carousel moves are instant with no opacity dip, and `scroll-behavior` is `auto`.
- No parallax, no moving gate breath (the pool stays still), and no sheet slide (opacity only, 150ms).
- Color and theme crossfades stay, shortened to 200ms.
- The loading spinner becomes a static dashed ring plus the text "Loading".
- The plate gets `reducedMotion` (the renderer calms grain jitter and resettles with a fade). The spectrum still updates (it's information) but at 15 fps with no smoothing trails.

---

## 8. Accessibility

### 8.1 Document structure

```html
<body>
  <a class="skip-link" href="#birds">Skip to the birds</a>
  <div class="app" style="--signal:…">
    <header class="masthead">
      <a href="/" class="wordmark" aria-label="Kyma Birds, home">…</a>
      <nav aria-label="Site"><button type="button">About</button> <a href="/credits">Credits</a></nav>
    </header>
    <main id="main" class="instrument">
      <h1 class="sr-only">Kyma Birds: bird song made visible</h1>
      <section id="birds" class="zone zone--bird" aria-labelledby="zone-bird" tabindex="-1">…</section>
      <section class="zone zone--song"  aria-labelledby="zone-song">…</section>
      <section class="zone zone--plate" aria-labelledby="zone-plate">…</section>
    </main>
  </div>
  <p id="sr-status" class="sr-only" role="status" aria-live="polite"></p>   <!-- rendered empty at SSR -->
</body>
```

Heading outline: h1 (sr-only) → h2 "Bird" / "Song" / "Plate" (in Field the visible zone labels are hidden but the headings stay as `.sr-only` twins) → h3 per bird name.

### 8.2 Picker semantics

- The carousel region uses `aria-roledescription="carousel"` and `aria-label="Birds"`.
- Slides are `role="tabpanel"` with `aria-roledescription="slide"`, labelled by their tab (the bird name) and described by "3 of 12".
- Non-active slides are `inert`, which removes them from tab order and the a11y tree but leaves them in the HTML for SEO. The SSR output marks every slide except the committed one as inert.
- The rail is the APG tabs pattern with **automatic activation** (focusing a tab selects it and scrolls there). The 250ms commit dwell stops audio from thrashing while arrowing.
- Prev/next are `<button aria-controls="bird-track">` labelled "Previous bird" / "Next bird".
- The carousel never auto-advances.

### 8.3 Keyboard map

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Everywhere | Skip link → wordmark → About → Credits → active card's links and Details → rail (one stop) → pager → play/pause → mute → volume → Hold → Scatter sand → Describe pattern (appears on focus) |
| ← / → | Rail | Previous/next tab (no wrap) |
| Home / End | Rail | First/last bird |
| ← / → / Home / End | Focus on `<body>`, `<main>`, a zone, or inside the track (not on a range, radio, tab or text field) | `goTo(i ± 1)` / first / last; `preventDefault` on native track scrolling |
| Space | Focus on a non-interactive target (body, main, zone, slide) | Toggle play (first press = Listen) |
| M | Same as Space (no modifiers) | Toggle mute |
| Enter / Space | Any button | Native activation |
| Esc | Dialog or sheet | Close (Radix handles Esc); focus returns to the trigger (`Sheet` restores it) |

The global handler lives in `lib/keyboard.ts` and ignores events with `metaKey`, `ctrlKey` or `altKey`, and any target matching `input, textarea, select, [role=tab], [role=slider], [role=radio], [contenteditable], [role=dialog]`; while a dialog is open (`[role=dialog][data-state=open]`) it ignores every key. On `button, a, summary` it ignores only Space, which keeps its native activation; ← / → / Home / End and M have no native action there, so they still work (Chrome and Firefox focus a button on mouse click, so excluding buttons would break the arrows right after Listen or a pager click).

### 8.4 Announcements (one polite region, `#sr-status`)

| Trigger | Message | Not announced when |
|---|---|---|
| Bird committed | "3 of 12: Gray Antwren, Myrmotherula snowi. Critically endangered." | The source is the rail (the focused tab already announces it) |
| Song failed | "The song for Gray Antwren didn't load." | |
| Describe pattern pressed | "Mode (3, 2): 3 nodal diameters and 2 nodal circles. Following the song at 2.84 kHz." | |

The transport's own `role="status"` announces "Loading", "Playing" and "Paused". Live Hz and mode values are **never** live regions (they change about 8 times per second). They're plain text, readable on demand.

To clear and re-set the same message, write `''`, then set the text on the next rAF.

### 8.5 Plate for screen readers

```tsx
<figure className="plate-figure" aria-labelledby="plate-caption">
  <div className="plate-canvas" role="img"
       aria-label={`Sand on a circular plate, moved by the ${bird.commonName}'s song`}
       aria-describedby="plate-desc">
    <ClientOnly fallback={<PlatePoster />}><LazyCymaticsPlate plateShape="circle" … /></ClientOnly>
  </div>
  {status === 'idle' && <ListenGate … />}                      {/* sibling of role=img, never inside it */}
  <figcaption id="plate-caption" className="plate-caption">{captionText}</figcaption>
  <p id="plate-desc" className="sr-only">
    Sand collects on the lines of the plate that stay still. As the song rises and falls, the pattern shifts between modes.
    Use Describe pattern to hear the current mode.
  </p>
</figure>
```

### 8.6 Focus, targets, contrast and zoom

- **Focus ring:** a double ring that is legible on photos, ink and ground alike:
  ```css
  :focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; box-shadow: 0 0 0 2px var(--focus-halo); }
  .rail-tab:focus-visible { outline-offset: -2px; }   /* stays inside its own 24px hit area */
  @media (forced-colors: active) { :focus-visible { outline-color: Highlight; box-shadow: none; } }
  ```
- **Targets:** at least 24×24 everywhere. The touch-context controls (pager, play, mute, Hold, Scatter sand, Details) are 44×44 on `(pointer: coarse)` and 40×40 on `(pointer: fine)`. Extended hit areas use `::after { inset: -6px }` and must never overlap neighbors.
- **Contrast:** all text tokens meet AA as measured above. `--ink-4` is never used for meaningful text. Text over photos relies on the scrims in §4.3, and the builder verifies the worst photo in dev with a debug overlay that samples the label box luminance.
- **Forced colors:** chips get `border: 1px solid CanvasText`; the spectrum canvas is hidden (`forced-color-adjust: auto` and `display: none`) while the numeric readouts remain; icons use `fill: currentColor`.
- **Zoom and reflow:** 200% zoom moves to Stacked or Field, and at 320px CSS width there's no horizontal page scroll. Text containers use `min-height`, never fixed `height`. The viewport never sets `maximum-scale` or `user-scalable=no`.
- **Language:** `<html lang="en">`; local names carry `lang="pt-BR"` or `lang="es"`.
- **Motion:** §7.4. **Audio:** never autoplays, and pause is always visible (WCAG 1.4.2).

---

## 9. Components, files, state, routing

### 9.1 File list

```
src/
  router.tsx                          getRouter(): createRouter({ routeTree, scrollRestoration: true, defaultPreload: 'intent' })
  routes/
    __root.tsx                        <html lang="en">, global head (fonts, app.css, defaults), html.js script,
                                      <AudioProvider>, <SrStatus>, skip link, <Outlet/>, 404 component
    index.tsx                         The instrument: validateSearch, loader, head (per bird), <Instrument/>
    credits.tsx                       /credits: validateSearch {bird?}, loader, head, <CreditsPage/>
  components/
    shell/
      Masthead.tsx                    { variant: 'instrument' | 'page'; nowPlaying?: boolean; onAbout(): void }
                                      ('instrument' is a bar in Split/Stacked and overlays the photo in Field, purely in CSS;
                                       'page' is always a bar, used on /credits and 404)
      Wordmark.tsx                    { bird?: string; className?: string }
      AboutDialog.tsx                 { open: boolean; onClose(): void }
      Sheet.tsx                       modal sheet/dialog on shadcn's Dialog { open; onClose; variant: 'sheet' | 'dialog' },
                                      SheetTitle, SheetCloseButton, SheetClose
      IconButton.tsx                  { label: string; icon: IconName; pressed?: boolean; size?: 'sm' | 'md' | 'lg';
                                        shortcut?: { keys; spoken } } & ButtonHTMLAttributes (shortcut adds a tooltip)
      Icon.tsx                        Lucide icons by name at stroke 1.8, currentColor: play, pause, retry, volume, muted,
                                      chevron-left, chevron-right, external, arrow-right, arrow-left, close
      AppShell.tsx  SkipLink.tsx  Zone.tsx   .app (theme + portal container), skip link, ZoneHead / ZoneTag
      page.ts                         the /credits and 404 column, title and back-link classes
    ui/                               shadcn/ui (new-york v4) with the Kyma variants: button, toggle, slider, dialog,
                                      tooltip, badge, kbd, separator; plus portal.tsx (portal container),
                                      external-link.tsx and text-link.ts
      SrStatus.tsx                    the #sr-status region + useAnnounce(): (msg: string) => void
    bird/
      BirdZone.tsx                    { birds: Bird[]; committedIndex: number; viewIndex: number;
                                        onViewIndex(i: number): void; onCommit(slug: string, source: NavSource): void }
      BirdCarousel.tsx                forwardRef<{ goTo(i: number, o?: { source: NavSource }): void }>, { birds; committedIndex; viewIndex; … }
      BirdCard.tsx                    { bird: Bird; index: number; total: number; inert: boolean; initial: boolean;
                                        priority: 'high' | 'auto' | 'lazy'; onDetails(): void }
      BirdPhoto.tsx                   { bird: Bird; priority }
      FieldLabel.tsx                  { bird: Bird }
      IucnStatus.tsx                  StatusNote { code; label } (a threatened bird's status in words), IucnScale { code } (Details)
      IucnScale.tsx                   { code: IucnCode }
      SongFacts.tsx                   { character: string; band: { p10: number; p50: number; p90: number }; peakHz: number; durationSec: number }
      CreditLine.tsx                  { credits: Bird['credits']; slug: string; variant: 'full' | 'compact' }
      BirdDetails.tsx                 { bird: Bird | null; onClose(): void }   (uses Sheet)
      PickerRail.tsx                  { birds: Bird[]; selectedIndex: number; onSelect(i: number): void }
      PickerPager.tsx                 { index: number; total: number; onPrev(): void; onNext(): void }
      useSnapIndex.ts                 §3.4
      useWheelStep.ts                 §3.2
    song/
      SongZone.tsx                    { bird: Bird }   (vertical spine vs horizontal strip is pure CSS; see §9.4)
      PlayButton.tsx                  { size: 48 | 56 }   (reads status from useAudio; draws the loop ring via rAF on an SVG circle)
      VolumeControl.tsx               { showSlider: boolean }
      Spectrum.tsx                    { band: BandHz; peakHz: number; label: string }   (2D canvas, rAF, reads useLiveFeatures ref; axis from CSS --spectrum-axis)
    plate/
      PlateZone.tsx                   { bird: Bird }
      PlateFigure.tsx                 { bird; held: boolean; scatterToken: number }   (passes plateShape="circle")
      PlatePoster.tsx                 { message?: string }   SSR/no-JS/WebGL-fail poster (circular)
      ListenGate.tsx                  { birdName: string; status: AudioStatus; onListen(): void }
      PlateControls.tsx               { held; onHeldChange(b: boolean): void; onScatter(): void; onDescribe(): void }
      PlateErrorLine.tsx              { caption }   (the plate's foot line, for an error only)
      CymaticsPlate.tsx               (owned by the plate workstream; lazy-imported)
    credits/
      CreditsPage.tsx                 { birds: Bird[]; highlight?: string }
      CreditEntry.tsx                 { bird: Bird; highlighted: boolean }
  audio/
    AudioProvider.tsx                 creates the engine adapter lazily; context + external store
    useAudio.ts                       useSyncExternalStore selectors: status, muted, volume, slug, error
    useLiveFeatures.ts                returns a ref to the latest LiveFeatures (rAF) + useThrottledFeatures(hz = 8)
    mediaSession.ts
  lib/
    manifest.ts                       types + getBirds(): Bird[] (static import of birds.json, slug fill-in, sort by p50),
                                      DEFAULT_BIRD_SLUG ('common-nightingale'), committedIndexOf(birds, slug)
    search.ts                         §3.5
    theme.ts                          §4.7 (hexToOklch, fitSrgb, birdTheme, themeColorHex)
    format.ts                         formatHz(1840) → "1.84 kHz", formatHz(860) → "860 Hz", formatBand, formatMode("(3,2)") → "(3, 2)",
                                      formatDuration(24) → "0:24", formatIndex(2, 12) → "03 / 12"
    credits.ts                        sourceLabel(url), xcNumber(url), shortLicense("CC BY-SA 4.0") → "CC BY-SA"
    keyboard.ts                       useGlobalShortcuts(), shortcutFor(), isTypingOrWidgetTarget(), isDialogOpen()
    utils.ts                          cn(): clsx + tailwind-merge taught the Kyma theme scales
    site.ts                           SITE_ORIGIN (from env VITE_SITE_ORIGIN), absoluteUrl(path)
  styles/
    app.css                           the only stylesheet: Tailwind theme (Kyma tokens), custom variants, @utility rules, base layer
  data/
    birds.json                        the manifest (written by the asset pipeline)
public/
  birds/<slug>/photo-1600.webp, photo-800.webp, song.m4a
  _headers                            /birds/*  Cache-Control: public, max-age=31536000, immutable
```

`NavSource = 'scroll' | 'button' | 'rail' | 'key' | 'wheel' | 'media' | 'url'`.

### 9.2 State ownership

| State | Lives in | Persistence | Notes |
|---|---|---|---|
| Committed bird | URL `?bird` (`Route.useSearch()`) | URL | `committedIndex = committedIndexOf(birds, search.bird)`: the slug's index, else the default bird (Common Nightingale) |
| `viewIndex` | `Instrument` `useState`, set by `useSnapIndex` | none | Drives the theme on `.app`, the counter, rail, `inert`, and image priority |
| Plate shape | Fixed: `PlateFigure` passes `plateShape="circle"` | none | No toggle and no `?plate` (§0, 2026-10-28) |
| `held` | `PlateZone` `useState` | none | |
| `scatterToken` | `PlateZone` `useState<number>` | none | Incremented by Scatter sand |
| Audio status, volume, muted | `AudioProvider` external store | `localStorage` `kyma:audio` (volume, muted) | Read with `useSyncExternalStore` |
| Live features | Engine; read through a ref in rAF | none | **Never React state at 60fps.** Readouts subscribe to an 8 Hz throttled snapshot |
| About open, Details bird | Local `useState` in `Instrument` | none | |
| Hovered rail tick | `PickerRail` local | none | |

`AudioProvider` sits in `__root` so audio survives the move to /credits. It calls `audio.select(bird)` from an effect in `Instrument` that keys on the committed slug.

### 9.3 Contracts the shell expects

```ts
// audio/AudioProvider.tsx: adapter over the provided AudioEngine
export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export interface AudioSnapshot { status: AudioStatus; slug: string | null; muted: boolean; volume: number; error?: string }
export interface LiveFeatures {
  loudness: number               // 0..1, smoothed
  dominantHz: number | null      // null when below the silence gate
  modeLabel: string | null       // e.g. "(3,2)"
  spectrum: Float32Array | null  // magnitudes, linear bins; the Spectrum component remaps to a log axis
  sampleRate: number
  loopPosition: number           // 0..1 within the current loop
}
export interface AudioApi {
  getSnapshot(): AudioSnapshot
  subscribe(cb: () => void): () => void
  listen(): Promise<void>        // MUST be called synchronously inside a user-gesture handler
  select(bird: Bird): void       // commit target; crossfades if playing, loads silently otherwise
  toggle(): void; play(): void; pause(): void
  setVolume(v: number): void; setMuted(m: boolean): void
  prefetch(src: string): void
  features(): LiveFeatures       // cheap; called from rAF loops
}

// plate/CymaticsPlate.tsx: props the shell passes (the plate team confirms the exact names)
export interface CymaticsPlateProps {
  shape: 'circle' | 'square'      // built as `plateShape`; the app always passes 'circle' (square is for the plate lab)
  features: () => LiveFeatures   // the same getter; the plate never subscribes to React state
  active: boolean                // false while idle or paused: the sand rests
  held: boolean
  scatterToken: number
  reducedMotion: boolean
  onReady?(): void
  onError?(e: Error): void       // WebGL unavailable or context lost → the shell shows the poster + message
}
export function describeMode(shape: 'circle' | 'square', label: string): string   // exported by the plate module
```

### 9.4 Route: `/` (sketch)

```tsx
// src/routes/index.tsx
export const Route = createFileRoute('/')({
  validateSearch: validateBirdSearch,
  loader: () => ({ birds: getBirds() }),     // sync static import; SSR renders all 12 cards for SEO
  staleTime: Infinity,                        // search changes never reload the manifest
  head: ({ loaderData, match }) => birdHead(loaderData!.birds, match.search.bird),
  component: Instrument,
})

function Instrument() {
  const { birds } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const committedIndex = committedIndexOf(birds, search.bird)   // absent or unknown → the default bird
  const [viewIndex, setViewIndex] = useState(committedIndex)
  const committed = birds[committedIndex]
  const audio = useAudioApi()
  const announce = useAnnounce()

  useEffect(() => { audio.select(committed) }, [committed.slug])

  const commit = useCallback((slug: string, source: NavSource) => {
    if (slug === committed.slug) return
    navigate({ to: '/', search: p => ({ ...p, bird: slug }), replace: true, resetScroll: false })
    if (source !== 'rail') {
      const b = birds.find(x => x.slug === slug)!
      announce(`${birds.indexOf(b) + 1} of ${birds.length}: ${b.commonName}, ${b.scientificName}. ${b.iucnStatus.label}.`)
    }
  }, [committed.slug])

  return (
    <div className="app" style={birdTheme(birds[viewIndex])}>
      <Masthead variant="instrument" onAbout={…} />
      <main id="main" className="instrument">
        <h1 className="sr-only">Kyma Birds: bird song made visible</h1>
        <BirdZone birds={birds} committedIndex={committedIndex} viewIndex={viewIndex}
                  onViewIndex={setViewIndex} onCommit={commit} />
        <SongZone bird={committed} />
        <PlateZone bird={committed} />
      </main>
      <BirdDetails … /> <AboutDialog … />
    </div>
  )
}
```

The Spectrum orientation is chosen in CSS, not JS: the canvas reads its own `getComputedStyle(el).getPropertyValue('--spectrum-axis')`, which is set to `y` in Split and `x` elsewhere, on resize. That avoids a hydration mismatch from `matchMedia`.

### 9.5 Manifest delivery

- The manifest is a static JSON import in `lib/manifest.ts`. `getBirds()` fills in missing slugs, sorts by `audio.bandHz.p50`, and freezes the result. The loader returns it; the expected cost is about 10 KB gzipped, including LQIPs.
- SSR renders every card's text (names, traits, song descriptions, credits) into HTML. Non-active slides are `inert` but present, so crawlers index all 12 birds on `/` and each `?bird=` URL canonicalizes to itself.

### 9.6 `head()` per bird

```ts
export function birdHead(birds: Bird[], slug?: string) {
  const b = birds[committedIndexOf(birds, slug)]                   // absent or unknown → the default bird
  const url = absoluteUrl(slug ? `/?bird=${b.slug}` : '/')
  const description = truncate(`${b.commonName} (${b.scientificName}). ${b.songDescription}`, 158)
  return {
    meta: [
      { title: slug ? `${b.commonName} · Kyma Birds` : 'Kyma Birds: bird song, made visible' },
      { name: 'description', content: description },
      { name: 'theme-color', content: themeColorHex(b) },              // tinted ground as hex
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Kyma Birds' },
      { property: 'og:title', content: `${b.commonName} · Kyma Birds` },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: absoluteUrl(b.photo.src) },
      { property: 'og:image:width', content: String(b.photo.width) },
      { property: 'og:image:height', content: String(b.photo.height) },
      { property: 'og:image:alt', content: b.photo.alt ?? b.commonName },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
    links: [
      { rel: 'canonical', href: url },
      { rel: 'preload', as: 'image', href: b.photo.srcSm,
        imageSrcSet: `${b.photo.srcSm} 800w, ${b.photo.src} 1600w`, imageSizes: '(min-width: 64rem) 680px, 100vw',
        fetchPriority: 'high' },
    ],
  }
}
```

`og:image` points at the 1600px WebP. If the pipeline later emits a 1200×630 JPEG (`photo.og`), prefer it. `SITE_ORIGIN` comes from `VITE_SITE_ORIGIN` (wrangler `vars`). This is an open decision: the production domain.

### 9.7 Root

`__root.tsx` `head()` provides: charset, viewport (§2.2), color-scheme, default title and description, `app.css?url` stylesheet, the Archivo font preload, and a favicon (`/favicon.svg`, the Chladni glyph). The component renders `<html lang="en"><head><HeadContent/></head><body><script>document.documentElement.classList.add('js')</script>…<Scripts/></body></html>`.

---

## 10. Copy deck

Everything is in sentence case. Bird names keep the manifest's capitalization (IOC style). Store copy in natural case and apply UPPERCASE in CSS.

### 10.1 Global
| Key | String |
|---|---|
| `site.name` | Kyma Birds |
| `site.tagline` | Bird song, made visible. |
| `site.description` | Listen to twelve birds and watch each song shape sand on a vibrating plate. |
| `site.h1` | Kyma Birds: bird song made visible |
| `skip` | Skip to the birds |
| `nav.about` | About |
| `nav.credits` | Credits |
| `nav.home.aria` | Kyma Birds, home |
| `hint.keys` (Split, fine pointer only) | Space to play · ← → to change bird |
| `zone.bird` / `zone.song` / `zone.plate` | Bird / Song / Plate (numerals 01 02 03 are `aria-hidden`) |

### 10.2 Picker and card
| Key | String |
|---|---|
| `carousel.label` | Birds |
| `pager.prev` / `pager.next` | Previous bird / Next bird |
| `slide.position` | {n} of {total} |
| `rail.label` | Choose a bird |
| `rail.desc` (sr) | Birds are ordered from lowest to highest voice. |
| `rail.low` / `rail.high` | Low / High |
| `rail.hover` | {commonName} · {p50} |
| `status.prefix` (sr) | IUCN status: |
| `facts.band` / `facts.peak` / `facts.loop` | Band / Peak / Loop |
| `details.button` | Details |
| `details.traits` / `details.song` / `details.where` / `details.credits` | Traits / Song / Where it lives / Credits |
| `details.close` | Close |
| `photo.alt.fallback` | {commonName}. {trait1} {trait2} |

### 10.3 Listening and transport
| Key | String |
|---|---|
| `gate.button` | Listen |
| `gate.aria` | Listen to the {commonName} |
| `gate.sub` | Sound on. Watch the sand follow the song. |
| `gate.loading` | Loading… |
| `play.aria` / `pause.aria` | Play song / Pause song |
| `state.ready` / `state.loading` / `state.playing` / `state.paused` / `state.muted` / `state.error` | Ready / Loading / Playing / Paused / Muted / Can't play |
| `error.inline` | This song didn't load. |
| `error.retry` | Try again |
| `mute.aria` | Mute |
| `volume.aria` | Volume |
| `volume.valuetext` | {n}% |
| `spectrum.aria` | Live spectrum. Song band {p10} to {p90}, peak {peak}. |
| `noscript.audio` | Play the song |
| `nowplaying.aria` | Pause {commonName} |

### 10.4 Plate
| Key | String |
|---|---|
| `plate.aria` | Sand on a circular plate, moved by the {commonName}'s song |
| `plate.desc` (sr) | Sand collects on the lines of the plate that stay still. As the song rises and falls, the pattern shifts between modes. Use Describe pattern to hear the current mode. |
| `plate.caption.idle` | Waiting for sound |
| `plate.caption.live` | Mode {mode} |
| `plate.caption.held` | Held · mode {mode} |
| `plate.caption.error` | No sound |
| `hold` | Hold |
| `scatter` | Scatter sand |
| `describe` | Describe pattern |
| `describe.say` | Mode {mode}: {modeDescription}. Following the song at {hz}. |
| `plate.fallback.webgl` | This browser can't draw the plate. The song still plays. |
| `plate.fallback.nojs` | The plate needs JavaScript. You can still listen to the song. |

### 10.5 Announcements
| Key | String |
|---|---|
| `announce.bird` | {n} of {total}: {commonName}, {scientificName}. {iucnLabel}. |
| `announce.error` | The song for {commonName} didn't load. |

### 10.6 About dialog
- **Title:** About Kyma Birds
- **Kyma line:** Kyma (κῦμα) is Greek for wave. It's the root of the word cymatics.
- **Heading:** What you're seeing
- **About cymatics:** Cymatics is the study of sound made visible. A thin plate vibrating at one of its resonant frequencies divides into areas that move and lines that stay still, called nodal lines; sand bounces off the moving areas and settles on the still ones, drawing the shape of the vibration. Ernst Chladni published the first of these figures in 1787.
- **Heading:** How it works here
- **Body:** The plate on this page is simulated. As each song loops, we follow its strongest frequency in real time and drive the plate at a matching resonant mode, so the sand reorganizes as the bird's voice rises and falls. Mode numbers like (3, 2) count the nodal lines in the pattern. *(Builder: confirm "a matching resonant mode" against the plate's actual mapping.)*
- **Heading:** Keyboard
- **List:** Space: play or pause · ← →: previous or next bird · Home, End: first or last bird · M: mute
- **Footer link:** Photo and sound credits
- **Close button:** Close

### 10.7 Credits page and errors
| Key | String |
|---|---|
| `credits.title` | Credits |
| `credits.intro` | Every photo and recording here is shared under a Creative Commons license. Thank you to the people who made them. |
| `credits.photo` / `credits.song` | Photo / Song |
| `credits.changes.photo` | Changes: cropped, resized, and converted to WebP. *(confirm with the pipeline)* |
| `credits.changes.song` | Changes: trimmed to a seamless loop and re-encoded as AAC. *(confirm with the pipeline)* |
| `credits.fonts` | Typefaces: Archivo by Omnibus-Type and Martian Mono by Evil Martians, both under the SIL Open Font License 1.1. |
| `credits.software` | Software: Three.js, React, TanStack, Radix UI, shadcn/ui, Tailwind CSS, tw-animate-css, clsx and tailwind-merge, under the MIT License; class-variance-authority, under the Apache License 2.0; icons by Lucide, under the ISC License. |
| `credits.back` | Back to the birds |
| `credits.all` (card link) | All credits |
| `link.newtab.sr` | (opens in a new tab) |
| `notfound.title` | This page doesn't exist. |
| `notfound.link` | Back to the birds |

---

## 11. States and edge cases

| Case | Behavior |
|---|---|
| No JS | The full SSR page renders: the deep-linked card is visible and the track scrolls natively (swipe and scrollbar-free trackpad still work), the plate shows `PlatePoster` with `plate.fallback.nojs`, and the Song zone shows a native `<audio controls loop>`. |
| Before hydration | Same as no JS. No layout shift on hydration: the poster and canvas share the box, and the readouts reserve width (`min-width: 7ch`). |
| WebGL unavailable or context lost | `onError` → the poster plus `plate.fallback.webgl`. Audio, spectrum and readouts keep working. |
| Slow network | The LQIP is visible at once, the committed photo is preloaded, and the gate shows "Loading…" if the song bytes aren't there yet when Listen is pressed. |
| Audio fetch or decode fails | `error` state, inline "This song didn't load." with "Try again". Changing bird clears the error and loads the next song. |
| Unknown `?bird` | The default bird (Common Nightingale), no error, and the unknown param is removed from the URL (replace) on mount. |
| Rapid swiping | Only the bird that settles for 250ms is committed. In-flight fetches are aborted, and the theme follows `viewIndex` live. |
| Resize or rotate | Native re-snap, with the `ResizeObserver` fallback (§3.4). The layout mode switches purely in CSS. |
| Route to /credits and back | Audio keeps playing (root provider). Returning with `?bird` restores the slide via the inline script plus initial target. |
| Save-Data | No neighbor audio prefetch; image eager-loading is limited to ±1. |
| Tab hidden | Audio continues; the plate and spectrum rAF loops stop on their own. |

---

## 12. Acceptance checklist

1. At 1440×900, all three zones with their head and foot rows are visible with no page scroll. The plate is 684px across. `01 Bird`, `02 Song` and `03 Plate` sit on one baseline.
2. At 390×844 (iOS Safari), the photo, song strip, plate and plate foot fit within the visible viewport, and there is no horizontal page scroll at 320px width.
3. One swipe or flick moves exactly one bird. A vertical wheel step in Split moves one bird. Left and Right arrows, Home and End work from the body and the rail.
4. Loading `/?bird=<slug>` shows that bird on first paint with no visible jump.
5. Audio switches only after the scroll has settled for 250ms, and the URL is replaced, so Back leaves the site.
6. No sound plays before a user gesture. Listen moves focus to Pause when it was focused.
7. Every card shows the photo author, license and source, and the song recordist, license and source, as working links. `/credits` lists all of them, with change notes.
8. A screen reader hears "3 of 12: …" once per committed bird (not when moving through the rail). Live Hz and mode values are never announced automatically.
9. Every focusable control shows the double focus ring. With keyboard alone you can listen, pause, mute, change birds, hold, scatter and open both dialogs.
10. Under reduced motion there's no smooth scroll, parallax or moving gate breath, while the color crossfade and the spectrum updates remain.
11. Lighthouse on `/` (mobile): LCP element = the committed photo, CLS < 0.05. Three.js isn't in the initial JS chunk.
12. The design avoids every listed anti-pattern: no gradients except the photo scrims, no backdrop blur, no emoji, no neon glow, and the accent only on signal elements.

---

## 13. Open decisions (the builder must not invent these)

1. The production origin for `SITE_ORIGIN` (used by og:image and canonical URLs).
2. The exact `CymaticsPlate` prop names and `describeMode()` wording. This depends on the plate's mode convention (circle: nodal diameters × nodal circles; square: nodal lines along each axis).
3. The pipeline's actual photo and audio modifications, for the "Changes" lines on /credits.
4. Whether `photo.alt`, `photo.labelSide` and `photo.scrim` get generated offline (recommended). The fallbacks in §4.3 and §4.6 work without them.
5. The About dialog's "a matching resonant mode" sentence must match how the plate maps frequency to mode.
