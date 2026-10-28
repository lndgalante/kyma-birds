**Kyma Birds assets: 12 birds selected and processed**

All 12 birds are done and every manifest entry was checked against its files. Every song loops seamlessly in my checks of the decoded AAC. I made one swap: the Barred Antshrike recording is badly clipped, so the Andean Solitaire replaces it.

**Carousel order** (IUCN status · sound · band p10/p50/p90 Hz · peak · loop length)
1. tui · LC · bell tones plus clicks · 944/2131/2576 · 2224 · 27.22 s
2. musician-wren · LC · pure fluting whistles · 1156/1690/2371 · 2371 · 27.86 s
3. common-nightingale · LC · "piu" crescendo whistles then a machine-gun trill · 2346/3223/4196 · 3142 · 26.99 s
4. jocotoco-antpitta · EN · low hollow hoots, about one per 0.93 s · 576/630/698 · 629 · 24.99 s
5. white-browed-robin-chat · LC · whistles that build in crescendos (3 per loop) · 1825/2273/2775 · 2284 · 22.49 s
6. screaming-piha · LC · explosive sweeps from 1.5 to 5 kHz · 1445/1818/4591 · 1458 · 25.32 s
7. white-rumped-shama · LC · rich fluty phrases · 1129/1888/2367 · 2184 · 16.50 s (the whole source is only 18 s)
8. kakapo · CR · deep booms, base note 102 Hz · 203/305/307 (measured above 150 Hz) · 305 · 23.17 s
9. chalk-browed-mockingbird · LC · mimicry medley with a buzzy rattle · 2413/3520/4173 · 3940 · 27.16 s
10. andean-solitaire · LC · high ringing flute notes · 2810/3965/4836 · 4095 · 26.79 s
11. common-loon · LC · two yodels with clear overtones · 1145/1754/1854 · 1849 · 22.40 s
12. rufous-bellied-thrush · LC · fluty caroling · 1933/2320/3212 · 2598 · 25.06 s

- **Regions:** 6 Neotropical, alternating with New Zealand, Europe, Africa, Asia and North America.
- **Opener:** the Tūī has the strongest photo, and its ringing 2.2 kHz notes should give a clean first plate figure.

**Total size:** 7.77 MB in `public/`. That is 2.38 MB of 1600px photos, 0.54 MB of 800px photos and 4.84 MB of songs. `birds.json` is 39.7 KB, including the image placeholders.

**Swaps and exclusions**
- **Barred Antshrike out, Andean Solitaire in:** the antshrike file hits full scale thousands of times per second from 11 s onward, and one of its channels is silent. The solitaire adds the high register and keeps the Neotropics at 6.
- **Bearded Bellbird not picked:** its 25 s phone recording is two clangs over hiss, and the Tūī already covers the bell sound.
- **Also not picked:**
  - Chestnut-crowned Antpitta: its whistles overlap the Musician Wren and it looks like the Jocotoco.
  - Superb Lyrebird: the mockingbird covers mimicry, and it would be a third bird from Oceania.
  - Skylark and Wood Thrush: they overlap with birds already in the set.
- **Two facts softened:**
  - "Largest of all antpittas" became "One of the largest antpittas", because the Giant Antpitta is bigger.
  - The Kākāpō's "About 325 birds left (2026)" became "Only a few hundred birds left", because I couldn't verify the number.
- **Other text changes:** song descriptions that described the source file now describe the bird. Status labels use sentence case to match the UI spec. Spelling is US.

**What a developer must know**
- **Audio format:**
  - Every song is AAC mono at 128 kbps CBR and 44.1 kHz. There are no 48 kHz files.
  - The encoder adds 2112 priming frames at the start of every file. Each `audio` entry carries `validFrames`, `primingFrames` and `fileSampleRate`, which the engine's loop-trim function needs.
  - When decoded back on this machine, every file's length equals `validFrames` exactly, starts with no offset and has no silent samples at either end.
- **Seamless loops:** a 0.6 s crossfade is built into the start of each file, and the loop points sit in quiet gaps. The jump from the last sample to the first is under 6% of a normal step between samples.
- **Loudness:**
  - Songs are matched on perceived loudness (the broadcast K-weighting curve), not raw level, with peaks kept at or below −1 dB.
  - Most birds land at about −20 dBFS raw level. The Kākāpō gets about 4 dB more gain and the Jocotoco about 3 dB more, so their low voices don't sound quiet.
  - The Screaming Piha ends up 2.4 dB quieter than the rest, because I reduced gain to keep its loud whistles under the peak limit rather than compress them.
- **Kākāpō:**
  - 97% of its energy is at 102 Hz, which phone and laptop speakers barely reproduce.
  - Its band sits below the UI spectrum's 500 Hz floor. Part of it is also below the 300 Hz analysis floor in the robust engine design, so the app needs a clamp or a lower floor for this bird.
  - The Jocotoco's band is close to the 500 Hz floor.
- **How the band is measured:** loudness-weighted percentiles of each moment's dominant frequency, using the same settings as the app's analyser. The peak always falls inside p10–p90.
- **Photos:**
  - Photos keep their original aspect ratio, because the UI crops them with the focal point.
  - Tūī and Jocotoco are portrait (1200×1600 and 1067×1600), so the UI spec's `800w/1600w` srcset widths are wrong for them; use the real widths.
  - The originals returned HTTP 429, and Wikimedia's error page says to use standard-size thumbnails. I used the 1920px thumbnails, except the Jocotoco, whose 1200×1800 original I downloaded after the wait.
  - The thrush and Tūī photos were converted from Adobe RGB to sRGB.
  - I added optional photo fields: `alt`, `labelSide`, `scrim` and `birdBox`.
  - Focal points mark each head and were checked with crosshairs on the 800px images. The Piha's accent color is gray, so the UI will use its background hue instead. The Loon's accent is its red eye.
- **Encoder side effect:** at 128 kbps the encoder blanks quiet bands next to loud notes (about 3% of the spectrogram). This is normal; the analyser's noise-floor subtraction handles it.
- **No fallback format:** there is no Opus or MP3 version, because `afconvert` can't write either.
- **Licenses:**
  - 9 recordings are CC BY-SA, so those `song.m4a` files are CC BY-SA adaptations. Tūī, Kākāpō and Robin-Chat audio are CC BY 4.0.
  - Photos: 9 CC BY-SA, Kākāpō CC BY 2.0, Nightingale and Robin-Chat CC0.
  - Authors were checked against Commons metadata in one API call, plus the file pages for the British Library and New Zealand Department of Conservation items. Each credit includes `title`, `catalog` and a `changes` line, since CC licenses require stating changes.
- **Source songs:** I reused the earlier finder's MP3 downloads instead of downloading them again. All of them decoded to the expected length, and the nine with recorded byte sizes match exactly.
- **Per-bird filters:** the high-pass cutoff varies by bird from 40 Hz (Kākāpō) to 800 Hz. Low-pass filters: wren 3.8 kHz, piha 7 kHz, shama 5 kHz. The wren also got up to 10 dB of steady noise reduction because its recording is noisy.

Files are in /private/tmp/claude-501/-Users-leo-Developer-kyma-birds/2ce8f907-233f-45c4-890b-e14123a8a9be/scratchpad:
- assets-out/birds.json
- assets-out/CREDITS.md
- assets-out/public/birds/<slug>/ (photo.webp, photo-sm.webp, song.m4a)
- assets-out/spectrograms/<slug>.png, plus _loop-seams.png showing each loop's wrap point
- tools/process_audio.py (per-bird settings in tools/loops.tsv, run by tools/run_loops.sh)
- tools/process_photos.py and tools/photo-config.json
- tools/build_manifest.py
- assets-raw/<slug>/ (source photo and song)
- work/audio/<slug>/stats.json (full measurements per bird)