# Kyma Birds

**Bird song, made visible.** Pick one of twelve birds, press Listen, and its song loops while a
vibrating plate (a Chladni plate) gathers sand on the lines that stay still. As the bird's voice
rises and falls, the sand moves between the plate's resonant patterns. _Kyma_ (κῦμα) is Greek for
"wave", and the root of "cymatics".

The page is laid out as three stations in series, **01 Bird → 02 Song → 03 Plate**, so you can
follow the signal from the photo, through the live spectrum, to the sand.

## How it works

1. **Bird.** `src/data/birds.json` holds twelve birds (photo, field label, IUCN status, song
   statistics, credits). The picker sorts them by voice pitch (`audio.bandHz.p50`), so moving
   right means a higher voice. The URL holds the state: `/?bird=<slug>` (history is replaced,
   never pushed). With no `?bird` (or an unknown one), the Common Nightingale is selected, as the
   best-known songbird of the twelve. It sits tenth on the Low → High scale.
2. **Song loop.** Sound never autoplays: the first Listen press (or Space) creates the
   `AudioContext`. Each song is a seamless AAC loop with no padding, decoded once and played by an
   `AudioBufferSourceNode` with `loop = true`. Changing birds waits for the picker to settle
   for 250 ms, then crossfades to the new song (`src/audio/engine/AudioEngine.ts`).
3. **Live analysis.** An `AnalyserNode` taps the signal before the volume control, so mute and
   volume never change the plate. Once per frame, `SongAnalyzer` learns the noise floor, gates on
   signal-to-noise, finds the dominant pitch syllable by syllable, and detects onsets. The result
   is a drive level `D`, one or two spectral lines and an onset pulse (`DriveFrame`). The same
   analysis feeds the spectrum.
4. **Plate modes.** Each plate has a bank of twelve resonant modes. Circles use Bessel modes with a
   free edge, in one of four symmetry families (3 to 6) chosen per bird. The square uses guided
   modes driven from a centre bolt. The app always shows the circle; the square stays in the plate
   module for the plate lab and its tests. A per-bird calibration maps the bird's band
   (p10/peak/p90) onto mode ranks, so its most frequent note lands on the plate's signature
   pattern. Each spectral line excites nearby modes through an in-phase resonance response, and
   `ModeBank` smooths the coefficients (`src/cymatics/physics/`).
5. **Sand.** On the GPU, a field pass renders the plate's acceleration from the mode
   coefficients. Up to 262,144 grains are stored in float textures. Grains lift off where the
   acceleration exceeds their threshold, drift down its gradient and come to rest near the nodal
   lines. Onsets give the sand a kick. When the song pauses, every grain freezes where it is
   (`src/cymatics/gpu/`, three.js 0.186 on WebGL2).

The plate reports its dominant mode back to the page (at most 8 times a second). That mode
appears in the plate header, under the spectrum and in the plate caption, and Describe pattern
reads it out.

**Keyboard:** Space plays or pauses, ← → move to the previous or next bird, Home and End jump to
the first or last, and M mutes. After Listen, H holds or releases the pattern, P takes a photo, and
S scatters sand (unless the pattern is held). The shortcuts keep working after a click on a button or link;
only text fields, sliders, the rail's tabs and open dialogs keep the keys for themselves.

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19, file routes, SSR) on
  **Cloudflare Workers** via `@cloudflare/vite-plugin`. Dev, preview and production all run in
  workerd.
- Vite 8, TypeScript 7 (strict), Vitest 5, Prettier, pnpm 12, Node ≥ 22.12.
- Web Audio API for playback and analysis, with no dependencies.
- three.js (WebGL2 with float render targets), only inside the plate chunk, loaded after the first
  Listen press. About and Details also load on first open. None of these chunks loads during the
  initial page view.
- Tailwind CSS v4 and shadcn/ui (Radix primitives, Lucide icons), themed with the Kyma tokens:
  one stylesheet, with the layout modes and container queries as custom variants. Fonts are
  self-hosted Instrument Sans and Figtree (Fontsource).

## Getting started

```sh
pnpm install
pnpm dev            # http://localhost:3000
```

| Script                              | What it does                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Dev server with HMR on workerd (port 3000)                                                                                           |
| `pnpm build`                        | Production build into `dist/client` (static assets) and `dist/server` (the Worker)                                                   |
| `pnpm preview`                      | Serves the production build on workerd (port 4173)                                                                                   |
| `pnpm test`                         | All unit tests: engine DSP, plate physics, GPU uniform packing and shell helpers. They run in plain Node                             |
| `pnpm typecheck`                    | `tsc --noEmit` over the whole project                                                                                                |
| `pnpm format` / `pnpm format:check` | Prettier (`docs/` and the generated `CREDITS.md` are ignored)                                                                        |
| `pnpm lab:plate`                    | **Plate lab** at http://localhost:3102: `<CymaticsPlate>` with a synthetic drive (rank, f1, drive, onset, sweeps) or the real engine |
| `pnpm lab:audio`                    | **Audio harness** at http://localhost:3101: the engine alone, with decode checks, rapid switching, transport and analysis traces     |
| `pnpm deploy`                       | Builds, then runs `wrangler deploy` (see below)                                                                                      |
| `pnpm cf-typegen`                   | Regenerates `worker-configuration.d.ts` (runs on `postinstall`)                                                                      |

Useful plate lab URLs (the lab still offers the square plate, which the app doesn't show):

- `http://localhost:3102/?shape=square&bird=tui&rank=6.75&playing=1` shows the reference-1 family of
  square patterns.
- `http://localhost:3102/?shape=circle&bird=kakapo&mode=engine` drives the plate from the real song.

In the lab, `debug` turns on the field heat view and `window.__kymaPlate`.

## Project structure

```
src/
  server.ts          the Worker entry: TanStack Start's handler plus security headers
  routes/            __root.tsx (document, fonts, AudioProvider), index.tsx (the instrument), credits.tsx
  components/
    bird/            picker track, rail, pager, card, field label, photo, details sheet
    song/            play button, spectrum, volume
    plate/           plate zone, figure, poster, Listen gate, controls, lazy plate wrapper
    shell/           app shell, masthead, About dialog, sheet, zone heads, icons, skip link, polite status region
    credits/         /credits page
    ui/              shadcn/ui components with the Kyma variants (button, toggle, slider, dialog, tooltip, badge, kbd,
                     separator), plus the portal container and link helpers
  audio/
    AudioProvider.tsx, useAudio.ts, useLiveFeatures.ts, mediaSession.ts   the shell's bridge to the engine
    engine/          the audio engine (playback, loop region, crossfades, SongAnalyzer, dsp/), plus __tests__ and __harness__
  cymatics/
    CymaticsPlate.tsx   the lazy React component (the only React file that imports three)
    physics/         Bessel functions, mode tables and banks, response, calibration, ModeBank, PCG, CPU sand reference
    gpu/             PlateController, field pass, sand sim, grain and plate layers, shaders, tiers, governor
    params.ts        every plate tuning constant
    __tests__/  __harness__/
  lib/               manifest loading and sorting, URL search, theme (OKLCH), copy deck, head tags, credits, keyboard, cn()
  styles/app.css     the only stylesheet: Tailwind theme (Kyma tokens), layout and container variants, base layer
  data/birds.json    the manifest
public/
  birds/<slug>/      photo.webp (1600 px), photo-sm.webp (half size), song.m4a
  _headers           cache headers (and nosniff) for static assets
docs/
  specs/             engine.md (audio engine and plate) and ui.md (app shell): the design specs
  research/          the scaffold report, the asset report and the three engine design drafts
scripts/assets/      the offline asset pipeline
```

## Asset pipeline

The photos and songs were prepared offline with the scripts in `scripts/assets/`. They need macOS
(`afconvert`) and Python with numpy and Pillow, run through `uv`. The process and every decision
behind it are written up in [`docs/research/birds-report.md`](docs/research/birds-report.md).

- **Photos:** `fetch_photos.py` downloads standard-size Wikimedia thumbnails (`photos.tsv`).
  `process_photos.py` then converts them to sRGB and writes `photo.webp` (1600 px on the long side)
  and `photo-sm.webp` (half size). It also computes the LQIP, dominant and accent colours, label
  side and scrim strength, using per-bird focal points from `photo-config.json`. A `scrimMin`
  there sets a floor under the computed scrim: the Common Nightingale uses 0.86 (computed 0.73)
  so its label holds AA on the pale photo.
- **Songs:** `process_audio.py` cuts the loop (per-bird windows and filters are in `loops.tsv`, and
  `run_loops.sh` drives it). It snaps the seam to quiet gaps, bakes in an equal-power crossfade and
  matches loudness (K-weighted). It then encodes AAC-LC mono at 44.1 kHz, 128 kbps, decodes the
  file back to check it, and measures the band (p10/p50/p90) and peak with the app's own analyser
  settings.
- **Manifest:** `build_manifest.py` merges the curated text with the photo and audio statistics
  into `src/data/birds.json` and writes `CREDITS.md`.

The songs are **unpadded seamless loops**: the decoded length equals `audio.validFrames`, and the
2112 encoder priming frames are recorded in the manifest. There is no `loop` field, so the engine
loops the whole buffer.

## Credits

Every photo and recording comes from Wikimedia Commons under a Creative Commons licence (CC BY,
CC BY-SA or CC0), adapted as described. Each card shows its photo and song credits as links. The
[`/credits`](src/routes/credits.tsx) route lists all 24, with titles, catalogue numbers and the
changes made, and [`CREDITS.md`](CREDITS.md) has the same list in Markdown. Adaptations of CC BY-SA
works are shared under the same licence. The code is MIT ([`LICENSE`](LICENSE)).

## Deploying to Cloudflare

```sh
pnpm wrangler login               # once
pnpm deploy                       # build for https://kymabirds.com + wrangler deploy
pnpm wrangler deploy --dry-run    # check the bundle without uploading
```

- The site lives at [kymabirds.com](https://kymabirds.com), a Workers Custom Domain (`routes` in
  `wrangler.jsonc`). The domain is registered with Cloudflare, so its zone is in the same account
  and the deploy creates the DNS record and certificate.
- The build writes `dist/server/wrangler.json`, which wrangler picks up automatically. The Worker
  is `src/server.ts`: TanStack Start's server entry, plus `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` and `X-Frame-Options` on every rendered response.
  `dist/client` is uploaded as static assets. There is no Content-Security-Policy yet: the page's
  inline scripts would each need a per-request nonce.
- `VITE_SITE_ORIGIN` is read **at build time**, so it is not a wrangler var. It defaults to
  `https://kymabirds.com`; set it when deploying to another public origin. Canonical URLs, social
  previews, structured data and crawl files all use that origin, including in a plain `pnpm build`.
- `/robots.txt` advertises `/sitemap.xml`. The Worker serves both without rendering React and
  caches them for an hour. The sitemap derives its 13 canonical URLs from the bird manifest:
  home, eleven other birds and Credits. `?bird=common-nightingale` shares the home canonical.
  Credits links to every bird with ordinary links, including without JavaScript. Each bird page
  includes server-rendered metadata and WebSite, WebPage, photo and recording structured data.
- `public/_headers` caches `/birds/*` for a week with `stale-while-revalidate`, because those
  filenames aren't content-hashed. Hashed `/assets/*` are cached as immutable. Every asset also
  gets `X-Content-Type-Options: nosniff`.
- No bindings, secrets or KV are needed. The Worker renders pages and serves the crawl files.

## Loading performance

The selected song is fetched ahead of Listen to keep playback responsive. Neighbouring songs
prefetch only during playback, and Save-Data disables that prefetch. The picker eagerly loads at
most one photo on either side (none with Save-Data). The main photo stays high priority, and the
two normal Latin fonts preload in production. The plate uses its CSS poster until Listen.

On October 29, 2026, Lighthouse 13.6.0 with Chrome 156 and its default mobile simulation measured
the local production preview at **1,723 KiB**, down from **3,434 KiB** before these changes. The
performance score remained **77**, SEO **100**, and layout shift **0**. Simulated largest paint
remained **6.3 seconds**: these changes chiefly remove work and downloads after the first paint.
The local preview serves uncompressed responses; these are lab comparisons, not measurements of
the deployed Cloudflare site or real users. A live-site audit is still needed for field performance.

## Browser support

The plate needs WebGL2 with `EXT_color_buffer_float`. Without it, the page shows a static poster
and a message, and the song still plays.

The production build (`pnpm preview`) was run end to end with Playwright on an Apple M3: load,
Listen, the sand forming on the plate, switching birds (arrows, Home/End, pager, wheel, swipe),
Pause freezing the sand, Hold, Scatter, Describe pattern, the About and Details dialogs, the
/credits round trip and deep links (`?bird=…`, bad values).

| Browser                            | Viewport       | Result                                                                                                                                                                    |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome 156 (headless, Metal ANGLE) | 1440×900       | All checks pass, no console errors or warnings                                                                                                                            |
| WebKit 27.2 (Safari engine)        | 1440×900       | All checks pass, no console errors. Some runs log WebKit's "preloaded but not used within a few seconds" warning for the Archivo font, although it loads once and is used |
| Firefox 157                        | 1440×900       | All checks pass, no console errors. Leaving for /credits logs one "WebGL context was lost" warning: the plate releases its context on purpose                             |
| WebKit, iPhone 15 emulation        | 393×659, touch | All checks pass, no console errors (same intermittent font-preload warning). The swipe is a scripted snap scroll: WebKit can't inject touches                             |
| Chrome, Pixel 7 emulation          | 412×839, touch | All checks pass including a real touch flick, no console messages                                                                                                         |

The table is from the run after the 2026-10-28 changes (circle only, the Listen disc centred on
the plate, the Nightingale as the default bird), which added checks for them: no shape control, the
Nightingale committed and playing with no `?bird`, the disc's centre within 1px of the plate's
centre (it measured 0), a click at the plate's exact centre starting playback, and an old
`?plate=square` link loading the circle without errors.

Not verified: real iPhones, iPads and Android phones, the Safari app itself (Playwright's WebKit is
close but not identical), real trackpad momentum, low-end GPUs and screen readers.

## Known limitations

- **Very small phones:** at 320×568 (iPhone SE, 1st generation) the plate controls sit about
  55 px below the fold, and landscape screens narrower than 640 px (568×320) fall back to the
  portrait layout, which scrolls.
- **AAC only:** there is no Opus or MP3 fallback, so a browser that can't decode AAC shows the
  "No sound" state.
- **Kākāpō:** 97% of its energy is at about 102 Hz, which laptop and phone speakers barely
  reproduce. The plate follows its ~305 Hz harmonic, which the analysis band (from 150 Hz) can see.
- **The plate is a model, not a measurement.** The modes, calibration and sand dynamics are tuned
  to look like real cymatics and to follow the song legibly. Mode numbers are the dominant term of
  a mix. The constants are in `src/cymatics/params.ts`, and `SIM.gMax` (8, not the spec's 6) sets
  how thin the lines are.
- **Square plate (plate lab only):** the app shows only the circle. In the lab, most birds settle
  on the square's signature (2, 4) pattern, with excursions to neighbouring modes as the pitch
  moves. The circle shows more variety, because each bird gets a symmetry family.
- **Performance:** the GPU tier governor drops quality on slow frames. It has only been measured on
  an M3, where it costs about 0.6 ms per frame at 262k grains.
