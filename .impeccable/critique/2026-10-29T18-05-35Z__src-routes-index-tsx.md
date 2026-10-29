---
target: whole Kyma Birds app (main instrument, About, Details, credits)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-10-29T18-05-35Z
slug: src-routes-index-tsx
---
Method: dual-agent (A: a09a103ef6ead9387 · B: aa1135929d13c917e), plus three lenses whose findings were each checked by a skeptic: better-ui polish (a1c3580ccd322e6e1, checked by ad9ec0ac7d8756641), distill inventory (a7bbf0e88ae67be16, checked by a701b73ff4699873e), atmosphere and breathing (af1a013da9217a152, checked by afcbbf1f828dc98a9).

Brief: "minimal, simple, a feeling of nature, relaxation and breathing."

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Good loop ring, loading arc and announcements. Pausing only swaps a small icon. Under Hold the two mode labels disagree: "Held (6, 1)" vs "(6, 2)". |
| 2 | Match system / real world | 2 | Lab language on the hero: Band, Peak, Loop, a Hz axis, "Mode (0, 4)", an "LC" chip. "Hold" doesn't say what it holds. |
| 3 | User control and freedom | 3 | Esc, pause, mute and Hold all work. The pager dead-ends at 12/12. |
| 4 | Consistency and standards | 3 | Two play controls, the mode in two formats, mixed straight and curly apostrophes. |
| 5 | Error prevention | 3 | Few risky actions. Scatter greys out during Hold with no reason given. |
| 6 | Recognition rather than recall | 3 | The rail ticks are unlabelled until hover. "Low…High" means pitch only in sr-only text. |
| 7 | Flexibility and efficiency | 3 | Strong keyboard, media session, swipe and wheel support. |
| 8 | Aesthetic and minimalist design | 2 | About 11 numeric readouts at rest, 6 underlined credit links, a saturated chip, permanent keycap hints. |
| 9 | Error recovery | 3 | Plain "This song didn't load." with Try again. |
| 10 | Help and documentation | 3 | About explains cymatics well. There's no in-context hint for modes. |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

The plate is authored and the chrome is not. A real Chladni plate driven by each song, with one lit Listen disc, belongs only to Kyma Birds. Around it sits a generic pro-audio kit: machined metal pills, a Hz-axis spectrum, a live kHz readout with a dashed "flow wire", mode indices, a status chip and keycap hints. A synth plugin could reuse all of it unchanged. DESIGN.md's words are engineering words ("machined parts", "two in the morning"). Each bird's colour never reaches the room: five birds measured to the same oklab ground (L 0.141, a/b within ±0.002). So nature lives only inside the photo rectangle.

Deterministic scan: `detect.mjs` on src/components and src/routes found 1 finding in 56 files: broken-image at CreditEntry.tsx:34. It's a false positive: the regex matched "<img>" inside a JSX comment. That leaves 0 real detector findings. The detector couldn't catch any of the issues above, because they are about density and tone, not anti-patterns. There was no browser overlay (see run notes).

## Overall Impression

It's clean, coherent and technically accomplished. Pressing Listen and watching the sand lock into a figure is a real peak. Against this brief, though, it reads as a night-time lab instrument, not a place to breathe. It has too many numbers at rest and too many moving signals while playing (sand, bars, kHz digits at 8 Hz, the mode label twice, the loop ring, a dashed wire). The idle plate looks like TV static inside a near-white rim, and that rim is the brightest object on the page. The biggest opportunity is subtraction plus slowness. Move the measurement layer into Details and About, let photo, plate and sound carry the screen, and give motion and colour a breath-length cadence.

## What's Working

- The plate as hero: huge, centred, product-specific, with exactly one lit primary.
- A restrained system: two weights, one type scale, one light, generous photo framing.
- Unusually thorough accessibility: inert slides, polite announcements, a halo focus ring, a skip link, "Describe pattern", reduced-motion plumbing, mute-then-play.

## Priority Issues

**[P1] The hero is a measurement readout.** Band/Peak/Loop (BirdCard.tsx:88-93), the live two-decimal kHz readout changing 4–8×/s (SignalReadout.tsx), Hz numerals (Spectrum.tsx), the mode shown twice (SignalReadout.tsx:47-55, PlateZone.tsx:91 / ModeReadout) and a zero-padded counter (PickerPager.tsx:44-45). Fix: move the figures into Details, which already shows them. Drop the readout, the wire, the axis numerals and both mode labels (About and Describe pattern still explain modes), and remove the zero padding. → distill

**[P1] Nothing moves at a breathing pace, and the resting plate reads as static.** The plate follows syllables (DRIVE coefAttack 0.08 s, onsetKick 0.8, params.ts). The idle coat is uniform bright pixel noise (LOOK.coat 0.15, grainAlpha 0.25–1.0; params.ts:67-68 itself warns of "TV static"). The rim #DEDBD3 is 89% L. Listen fires a ring every 0.8 s (about 75/min). Changing bird snaps the room colour in 480 ms on a steep quart ease. The flow wire runs a 30 px/s dash. Fix: give the resting sand a dim state that wakes with the song, add a stone hairline rim, and sink the plate into the night. Replace the pulses with one slow signal breath on the plate (≈11 s cycle). Use a 1.4 s sine room fade, a calmer plate response and softer audio fades, and remove the dash. → animate / quieter

**[P1] On phones the bird is buried under interface.** At 390×844 the photo carries the masthead, the name, the scientific name, the LC chip, two truncated credit lines, Details and the pager pill. In landscape it carries 11 items. Fix: name (plus Details) on the photo, scrim only on the bottom ~30%, a per-bird focal point, and the pager in the thumb zone. → adapt

**[P2] Attribution occupies the hero.** There are 6 underlined links (two credit rows, Details, All credits) and 3 routes to the same information. Tab order passes 4 external links before Listen, which is stop 17. Fix: one quiet caption line ("Photo Romzig (CC0) · Song Lawrence Shove / The British Library (CC BY-SA) · Details"), still linked. Drop "All credits" from the card. → quieter

**[P2] Nature never reaches the room, and the loudest colour is a status badge.** The ground chroma clamp is 0.006–0.03 at a 16% tint, so every bird sits in the same hue-258 blue. The IUCN "LC" chip (oklch 74% 0.15 145) is the most saturated UI colour, which breaks "the one signal is each bird's own colour". Fix: a tone decision (see questions). The status goes to Details or plain text. → colorize

**[P2] Duplicates split attention.** There are two play controls at first load (the Listen disc and the strip cap). The keyboard is taught three times (masthead keycaps, tooltips, About). Hold, Take photo and Scatter sand do nothing before sound. Fix: reveal the strip and plate controls on the Listen press (latched, slot reserved, focus lands on the cap) and remove the masthead hints. → distill

## Persona Red Flags

- **Jordan (first-timer):** two play affordances with no cue that they're the same. kHz, Peak, Loop and Mode go unexplained. "Hold" is opaque, and Scatter dims silently. "Take photo" beside a bird photograph reads as photographing the bird. The rail ticks are unlabelled until hover.
- **Sam (accessibility):** Listen is tab stop 17 of 20, after 4 external credit links. The rail ticks are 20×40 (below 24px). The volume thumb is 14×22. The canvas axis labels don't reflow on zoom. The Hold mode labels disagree.
- **Casey (mobile):** the photo is covered (name over the nightingale's body). The pager sits at y≈322/844, out of thumb reach. Credit links on the photo are 18px tall. The camera is icon-only beside a photograph.
- **Mara (unwinding at night):** the first image is bright static in a bright rim. While playing, 6–7 things move. Keycap hints show all night. There's no "just the plate" state. Bird changes are a hard cut.

## Minor Observations

- Straight and curly apostrophes are mixed within About (copy.ts:64-65, 84, describeMode.ts:20 vs AboutDialog.tsx:29,37).
- At 1440×900 the description clamps mid-sentence while ~40px of space sits empty below the links.
- Left edges don't share a line across the masthead, photo, 404 and /credits.
- Pausing is a weak state change: only the cap icon changes.
- The 404 is a bare sentence. A still plate with one settled figure would add calm for free.
- /credits repeats full processing notes for every bird. Merge them into one small paragraph, and regenerate from build_manifest.py, not by hand.
- Hold pressed and Scatter disabled look alike at a glance.

## Polish findings (better-ui), after the skeptic's check

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| MEDIUM | surface.ts:9 (PANEL) | `rounded-card` (20px) around a 44px cap inset 10px | `rounded-full`: 32 = 22 + 10 | Concentric radius |
| MEDIUM | button.tsx:23,34,41 · PlayButton.tsx:83 · ListenGate.tsx:58 | `active:translate-y-px` (pill: none) | `active:not-aria-disabled:scale-96` (play disc scales inside its fixed ring) | Scale on press, and one press language (mute already scales) |
| MEDIUM | dialog.tsx:27 | closed `ease-in` (0.55,0,1,0.45) | closed `ease-out`, keeping 200ms | Soft exits |
| LOW | ListenGate.tsx:75 | `translate-x-0.5` on top of a centroid-framed glyph | remove the translate | Optical alignment is applied twice |
| LOW | tooltip.tsx:73 | `rounded-part` around a `rounded-part` Kbd | `rounded-bed has-[kbd]:pe-1.5` | Concentric radius |
| LOW | tokens.css:107,190 | `--line-photo: oklch(93.5% 0.012 85 / .08)` | `oklch(1 0 0 / .1)` (/.32 at more contrast) | Image outline: pure white |
| LOW | SignalReadout.tsx:25,8 | transition on a wrapper whose colour never changes | move it to the VALUE span | Transition what changes (moot if the readout is cut) |
| LOW | PlayButton.tsx:87 · IconButton.tsx:39 · VolumeControl | play/pause and mute glyphs swap instantly | stacked glyphs cross-faded: scale .25→1, opacity, blur 4→0, `--dur-3` | Contextual icon animation |
| LOW | tooltip.tsx:73 | every open replays fade and zoom | `data-[state=instant-open]:animate-none` | Motion restraint |
| LOW | PickerRail.tsx:75 | tick hover 200ms | `before:duration-(--dur-1)` | Motion restraint on hover |
| LOW | Icon.tsx:84-89 · PickerPager.tsx:32,51 | arrow keycaps at a 1.8 stroke at 11–12px | `strokeWidth={2}` | Stroke vs text weight |

Clean: no transition-all, no will-change, one icon library, currentColor states, shadows vs borders, no load-time replays.

## Questions to Consider

- What if, a few seconds into a song, everything but the photo, the plate and pause faded away, and came back on pointer move?
- Does someone unwinding need 3.32 kHz in mode (6, 1), or is the sand already the readout?
- Should the plate follow the bird syllable by syllable, or breathe with it?
- What if each bird's room took on its habitat colour?
- Is machined metal the right material for a nature app?
