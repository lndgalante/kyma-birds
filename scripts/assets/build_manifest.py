#!/usr/bin/env python3
"""Merge curated bird text + photo meta + audio stats into birds.json and CREDITS.md.

python3 -I build_manifest.py SCRATCHPAD
"""
import json
import os
import sys
import urllib.parse

SP = sys.argv[1]
OUT = os.path.join(SP, 'assets-out')

IUCN = {'LC': 'Least concern', 'NT': 'Near threatened', 'VU': 'Vulnerable', 'EN': 'Endangered',
        'CR': 'Critically endangered'}
LIC = {
    'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
    'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
    'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/',
    'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
}
C = 'https://commons.wikimedia.org/wiki/'

# Carousel order. Text is curated from the finder candidates, with recording-specific
# details rewritten to describe the bird (the loop is an excerpt).
BIRDS = [
    dict(slug='tui', commonName='Tūī', scientificName='Prosthemadera novaeseelandiae', family='Meliphagidae',
         iucn='LC', localNames={'pt': 'Papa-mel-tui', 'es': 'Mielero tui', 'mi': 'Tūī'},
         region='New Zealand', habitat='Native forest, forest edges, parks and gardens',
         traits=['Iridescent blue-green plumage.', 'White throat tufts (poi).', 'Nectar-feeding honeyeater.',
                 'Pollinates flax and kōwhai.', 'Endemic to New Zealand.'],
         songDescription='Ringing, bell-like tolls and liquid notes mixed with clicks, cackles, creaks and wheezes, in phrases repeated every few seconds.',
         songCharacter='metallic bell-like notes + clicks',
         fingerprint='Bell tones locked on ~2.2 kHz with clean harmonics at 4.4 and 6.6 kHz, led in by dry clicks and low ~1 kHz notes; ends in a buzzy harmonic rattle.',
         alt='A tūī singing with its bill open, perched on a flax flower stalk. Its plumage shines blue, green and bronze, with two white tufts at the throat.',
         photo=dict(title='Tui (Prosthemadera novaeseelandiae) Tiritiri Matangi.jpg', author='Charles J. Sharp', license='CC BY-SA 4.0'),
         audio=dict(title='Tui-song-50.wav', author='Department of Conservation (NZ), © Crown Copyright', license='CC BY 4.0',
                    catalog='DOC NZ bird song library, “Male territorial calls”')),
    dict(slug='musician-wren', commonName='Musician Wren', scientificName='Cyphorhinus arada', family='Troglodytidae',
         iucn='LC', localNames={'pt': 'Uirapuru-verdadeiro', 'es': 'Cucarachero musical'},
         region='Amazon basin (Brazil, Guianas, Venezuela, Colombia, Ecuador, Peru, Bolivia)',
         habitat='Lower levels of humid lowland forest, including várzea',
         traits=['Rufous-orange face and throat.', 'Black-and-white streaked collar.', 'Finely barred brown wings.',
                 'Amazon forest floor.', 'The legendary uirapuru.'],
         songDescription='Clear, haunting, flute-like whistles that jump between pitches like a played melody. Phrases of 4–8 pure tonal notes fall between about 1 and 2.5 kHz and come every 5–7 s, with soft churring notes mixed in.',
         songCharacter='pure fluting whistles in musical intervals',
         fingerprint='Near-sine whistled notes stepping between 1.2 and 2.4 kHz in short melodic phrases every 6–10 s; long rests over a steady forest hiss.',
         alt='A musician wren singing with its bill open on a pale log. Rufous face, black-and-white streaked collar and barred brown wings against soft green foliage.',
         photo=dict(title='UIRAPURU.jpg', author='Lindolfo Souto', license='CC BY-SA 4.0'),
         audio=dict(title='Cyphorhinus arada - Musician Wren XC242524.mp3', author='Niels Krabbe', license='CC BY-SA 4.0',
                    catalog='xeno-canto XC242524 (C. a. salvini, Ecuador)')),
    dict(slug='common-nightingale', commonName='Common Nightingale', scientificName='Luscinia megarhynchos', family='Muscicapidae',
         iucn='LC', localNames={'pt': 'Rouxinol', 'es': 'Ruiseñor común', 'fr': 'Rossignol philomèle', 'de': 'Nachtigall'},
         region='Europe, North Africa and western Asia (winters in sub-Saharan Africa)',
         habitat='Dense thickets, scrub and woodland edges, often near water',
         traits=['Plain russet-brown plumage.', 'Rufous, rounded tail.', 'Sings by night and by day.'],
         songDescription='Loud virtuoso song in short, varied phrases: slow swelling “piu piu piu” crescendo whistles, explosive rapid trills, rattles and gurgles, separated by dramatic pauses.',
         songCharacter='complex virtuoso: crescendo whistles + rapid trills',
         fingerprint='A swelling “piu” whistle series held on ~3.1 kHz, then a broadband machine-gun trill (1.5–12 kHz) and quick ornamented phrases.',
         alt='A common nightingale singing with its bill open, perched on a lichen-covered branch against a soft pale-yellow background.',
         photo=dict(title='Nachtigall (April 2025) 1.jpg', author='Romzig', license='CC0 1.0'),
         audio=dict(title='Common Nightingale (Luscinia megarhynchos) (W1CDR0001376 BD18).ogg', author='Lawrence Shove / The British Library',
                    license='CC BY-SA 4.0', catalog='British Library W1CDR0001376 BD18, Teign Valley, Devon, 1961')),
    dict(slug='jocotoco-antpitta', commonName='Jocotoco Antpitta', scientificName='Grallaria ridgelyi', family='Grallariidae',
         iucn='EN', localNames={'pt': 'Torom-jocotoco', 'es': 'Tororoí jocotoco'},
         region='Southeastern Ecuador (Zamora-Chinchipe) and adjacent northern Peru',
         habitat='Steep, wet, mossy montane forest with Chusquea bamboo, about 2,300–2,650 m',
         traits=['Black crown, white cheek patch.', 'One of the largest antpittas.', 'Discovered in 1997.',
                 'Mossy bamboo cloud forest.', 'Hollow, hooting song.', 'Named for its call.'],
         songDescription='A slow, steady series of identical, low, hollow “hoo” notes, likened to a distant dog bark or a soft moo: about one a second near 0.6 kHz, with a faint second harmonic. A bird can keep it up for minutes while the pitch creeps upward.',
         songCharacter='low hollow hoots (pure low tone, ~0.5–0.75 kHz)',
         fingerprint='Metronomic hollow hoots on ~0.63 kHz (second harmonic ~1.3 kHz), one every ~0.93 s: the lowest, steadiest pure tone of the songbirds here.',
         alt='A plump jocotoco antpitta standing on a mossy stump. Black crown, bold white cheek patch, gray breast and chestnut wings against deep green foliage.',
         photo=dict(title='Jocotoco Antpitta.jpg', author='Supreet Sahoo', license='CC BY-SA 4.0'),
         audio=dict(title='Grallaria ridgelyi - Jocotoco Antpitta XC250396.mp3', author='Niels Krabbe', license='CC BY-SA 4.0',
                    catalog='xeno-canto XC250396, Tapichalaca, Ecuador')),
    dict(slug='white-browed-robin-chat', commonName='White-browed Robin-Chat', scientificName='Cossypha heuglini', family='Muscicapidae',
         iucn='LC', localNames={'pt': 'Pisco-de-heuglin', 'es': 'Cosifa de Heuglin', 'fr': 'Cossyphe de Heuglin'},
         region='East, central and southern Africa', habitat='Riverine forest, thickets and well-wooded gardens',
         traits=['Black head, bold white brow.', 'Bright orange underparts.', 'Gray wings, rufous tail.',
                 'Riverine thickets and gardens.', 'Rising crescendo dawn song.'],
         songDescription='Rich whistled phrases repeated over and over, each repetition louder and faster, building to a ringing climax and then starting again. Often sung as a duet and at dawn.',
         songCharacter='crescendo of rich repeated whistles',
         fingerprint='Rich whistles at 1.5–3.5 kHz repeated faster and louder in ~6 s crescendos that peak and collapse, three waves per loop.',
         alt='A white-browed robin-chat on a diagonal branch: black mask with a white brow, slate wings and glowing orange underparts against dark green forest.',
         photo=dict(title='Cossypha heuglini.jpg', author='Hobbyfotowiki', license='CC0 1.0'),
         audio=dict(title='White-browed Robin Chat (Cossypha heuglini) (022A-WA03044X0023-0007M0).ogg',
                    author='A.R. Gregory / The British Library', license='CC BY 4.0',
                    catalog='British Library W1CDR0001419 BD20, Chepareria, Kenya, 1974')),
    dict(slug='screaming-piha', commonName='Screaming Piha', scientificName='Lipaugus vociferans', family='Cotingidae',
         iucn='LC', localNames={'pt': 'Cricrió', 'es': 'Guardabosques gritón'},
         region='Amazon basin, plus a disjunct Atlantic Forest population (Pernambuco and Bahia)',
         habitat='Lowland evergreen forest, mainly terra firme, mid-story',
         traits=['Plain gray plumage.', 'Males call from leks.', 'Among the loudest birds alive.',
                 'Amazon and Atlantic Forest.', 'Signature “qui-qui-yo” whistle.'],
         songDescription='The sound of the Amazon: an explosive, whip-like “pi-pi-YO” (qui-qui-yo) of sharply up-slurred whistles that sweep from about 1.5 to 5 kHz. Several lekking males answer each other, so a song comes every few seconds. It is over 110 dB at 1 m.',
         songCharacter='explosive whistled sweeps (pure tone, wide glissando)',
         fingerprint='Explosive whistles sweeping ~1.5 → 5 kHz in under a second; two close, loud songs per loop with distant males answering in between.',
         alt='A plain gray screaming piha perched on a lichen-covered branch, with pink fig berries and glossy leaves in the lower left.',
         photo=dict(title='Lipaugus vociferans - Screaming Piha; Manaus, Amazonas, Brazil.jpg', author='Hector Bottai', license='CC BY-SA 4.0'),
         audio=dict(title='Lipaugus vociferans - Screaming Piha XC249181.mp3', author='Niels Krabbe', license='CC BY-SA 4.0',
                    catalog='xeno-canto XC249181, Orellana, Ecuador')),
    dict(slug='white-rumped-shama', commonName='White-rumped Shama', scientificName='Copsychus malabaricus', family='Muscicapidae',
         iucn='LC', localNames={'pt': 'Shama-malabar', 'es': 'Shama culiblanco', 'hi': 'शामा'},
         region='South and Southeast Asia (Indian subcontinent to Indonesia)',
         habitat='Dense undergrowth of lowland forest and bamboo',
         traits=['Glossy blue-black upperparts.', 'Rich chestnut belly.', 'Long tail edged in white.',
                 'White rump patch.', 'Dense forest undergrowth.'],
         songDescription='Loud, rich and melodious phrases of clear fluty whistles, swoops and quick flourishes. Long prized as one of Asia’s finest songsters.',
         songCharacter='rich melodious fluty whistles',
         fingerprint='Two long phrases of bending fluty whistles and quick flourishes at 1–3.5 kHz, with a ~3 s rest between them.',
         alt='A male white-rumped shama on a thick curved branch: glossy blue-black head and back, chestnut belly and a long black tail sweeping down to the right.',
         photo=dict(title='Copsychus malabaricus male - Khao Yai.jpg', author='JJ Harrison', license='CC BY-SA 3.0'),
         audio=dict(title='White-rumped shama song recorded in June 2014 at Netravali, Goa.wav', author='Sharadapte', license='CC BY-SA 4.0',
                    catalog='Netravali, Goa, India, June 2014')),
    dict(slug='kakapo', commonName='Kākāpō', scientificName='Strigops habroptilus', family='Strigopidae',
         iucn='CR', localNames={'pt': 'Kakapo', 'es': 'Kakapo', 'mi': 'Kākāpō'},
         region='New Zealand (predator-free offshore islands)', habitat='Podocarp forest and scrub on predator-free islands',
         traits=['Moss-green mottled plumage.', 'Owl-like facial disc.', 'World’s only flightless parrot.',
                 'Nocturnal ground-dweller.', 'Only a few hundred birds left.'],
         songDescription='On lek nights the male inflates air sacs in his chest and gives deep, resonant booms (around 100 Hz) in rhythmic series every couple of seconds for hours, audible kilometers away. The booms are interspersed with metallic “ching” calls.',
         songCharacter='deep resonant sub-bass booming',
         fingerprint='Sub-bass booms every ~1.65 s: fundamental ~102 Hz carries 97% of the energy; band figures are measured above 150 Hz, where the ~203 and ~305 Hz harmonics carry the pitch.',
         alt='A kākāpō nestled among broad green lily leaves at night: moss-green mottled plumage, owl-like face and a pale gray beak.',
         photo=dict(title='Kakapo Sirocco 1.jpg', author='Chris Birmingham / Department of Conservation (NZ)', license='CC BY 2.0'),
         audio=dict(title='Kakapo-18.wav', author='Department of Conservation (NZ), © Crown Copyright', license='CC BY 4.0',
                    catalog='DOC NZ bird song library, “Adult male booming”')),
    dict(slug='chalk-browed-mockingbird', commonName='Chalk-browed Mockingbird', scientificName='Mimus saturninus', family='Mimidae',
         iucn='LC', localNames={'pt': 'Sabiá-do-campo', 'es': 'Calandria grande'},
         region='Brazil, Bolivia, Paraguay, Uruguay, Argentina and southern Suriname',
         habitat='Savanna, cerrado, forest edge, pastures with scattered trees, gardens',
         traits=['Bold white eyebrow.', 'Long white-tipped tail.', 'Mimics other birds.',
                 'Open country and gardens.', 'Loud, varied song.'],
         songDescription='A loud, restless medley of whistles, rising slurs, buzzy rattles, chatters and trills, many borrowed from other species. Phrases change every second or two across 2–5 kHz, with buzzy broadband passages reaching higher.',
         songCharacter='mimicry / complex varied warbling',
         fingerprint='Restless medley at 2–7 kHz: slurred whistles, rapid repeats and a 4 s buzzy rattle reaching 12 kHz; a background bird adds 9 kHz down-slurs.',
         alt='A chalk-browed mockingbird standing on a sawn stump in golden evening light, its white eyebrow glowing against a warm orange background.',
         photo=dict(title='192 Chalk-browed mockingbird in Chapada dos Guimarães National Park Photo by Giles Laurent.jpg',
                    author='Giles Laurent', license='CC BY-SA 4.0'),
         audio=dict(title='Mimus saturninus - Chalk-browed Mockingbird XC204967.mp3', author='Gabriele Magurno', license='CC BY-SA 4.0',
                    catalog='xeno-canto XC204967, Ezeiza, Buenos Aires, Argentina')),
    dict(slug='andean-solitaire', commonName='Andean Solitaire', scientificName='Myadestes ralloides', family='Turdidae',
         iucn='LC', localNames={'pt': 'Solitário-andino', 'es': 'Solitario andino'},
         region='Andes from Venezuela to Bolivia',
         habitat='Humid montane and cloud forest, about 900–2,800 m; favors ravines and mountain streams',
         traits=['Gray head and breast.', 'Rufous-brown back and wings.', 'Andean cloud forest.',
                 'Sings at dawn and dusk.', 'Ethereal, flute-like song.'],
         songDescription='A leisurely, ringing, lilting series of well-spaced phrases of pure, liquid, flute-like notes, sometimes with thin squeaky or gurgling ones, mostly between 2.5 and 5.5 kHz with pauses between.',
         songCharacter='ethereal fluting with ringing, squeaky notes (high-register)',
         fingerprint='Sparse, ringing flute chords at 2.8–5.5 kHz in pairs about 2.5 s apart, plus held ~5.3 kHz whistles; the highest voice in the set.',
         alt='An Andean solitaire on a moss-draped branch in a cloud forest: gray head and breast, rufous-brown back and wings, luminous green background.',
         photo=dict(title='Myadestes ralloides 75757649.jpg', author='thibaudaronson', license='CC BY-SA 4.0'),
         audio=dict(title='Myadestes ralloides - Andean Solitaire XC242840.mp3', author='Niels Krabbe', license='CC BY-SA 4.0',
                    catalog='xeno-canto XC242840, El Placer, Esmeraldas, Ecuador')),
    dict(slug='common-loon', commonName='Common Loon', scientificName='Gavia immer', family='Gaviidae',
         iucn='LC', localNames={'pt': 'Mobelha-grande', 'es': 'Colimbo grande', 'fr': 'Plongeon huard'},
         region='North America (breeds in Canada and the northern US; also Greenland and Iceland); winters on coasts, including Atlantic Europe',
         habitat='Clear northern lakes in summer; coastal waters in winter',
         traits=['Velvet-black head, red eyes.', 'Checkered black-and-white back.', 'Dives deep for fish.',
                 'Northern lakes of North America.', 'Haunting calls carry across water.'],
         songDescription='The male’s territorial yodel: a rising wail that breaks into repeated, undulating tonal phrases. It is low, pure and echoing, and carries for kilometers over still lakes.',
         songCharacter='haunting low tonal yodel / wail',
         fingerprint='Two yodels: a rising wail into tremolo “wee-oo” phrases at 1.3–1.9 kHz with clear harmonics, then a softer answer from a second loon.',
         alt='A common loon in breeding plumage gliding on dark green water with a fluffy chick beside it: black head, red eye, striped collar and white-spotted back.',
         photo=dict(title='Gavia immer1 BS.jpg', author='Cephas', license='CC BY-SA 3.0'),
         audio=dict(title='Gavia immer - Great Northern Loon XC139387.ogg', author='Jonathon Jongsma', license='CC BY-SA 3.0',
                    catalog='xeno-canto XC139387, Lake Superior, Wisconsin')),
    dict(slug='rufous-bellied-thrush', commonName='Rufous-bellied Thrush', scientificName='Turdus rufiventris', family='Turdidae',
         iucn='LC', localNames={'pt': 'Sabiá-laranjeira', 'es': 'Zorzal colorado'},
         region='Eastern and southeastern Brazil, Bolivia, Paraguay, Uruguay and central Argentina',
         habitat='Forest, woodland edge, parks and wooded urban areas',
         traits=['Rufous-orange belly.', 'Gray-brown upperparts.', 'Yellow bill and eye-ring.',
                 'National bird of Brazil.', 'Sings through spring nights.'],
         songDescription='Unhurried, rich caroling: liquid, slurred phrases of 4–10 notes, mostly 1.8–2.7 kHz, repeated every few seconds with each phrase a little different. The classic sabiá dawn song.',
         songCharacter='rich warbling / fluty caroling phrases',
         fingerprint='Liquid slurred notes at 2.0–2.7 kHz in 4–6 s caroling phrases with squeaky down-slurs to ~6 kHz; a faint insect line sits at 4 kHz.',
         alt='A rufous-bellied thrush standing on a lichen-spotted rock: gray-brown back, rufous-orange belly and yellow bill against bright green grass.',
         photo=dict(title='Rufous-bellied thrush (Turdus rufiventris) Colonia.jpg', author='Charles J. Sharp', license='CC BY-SA 4.0'),
         audio=dict(title='Turdus rufiventris - Rufous-bellied Thrush XC112745.mp3', author='Niels Krabbe', license='CC BY-SA 3.0',
                    catalog='xeno-canto XC112745, Vaqueros, Salta, Argentina')),
]


def src_url(title):
    return C + urllib.parse.quote(title.replace(' ', '_'), safe=":/;,()'!*")


def main():
    pmeta = json.load(open(os.path.join(SP, 'work', 'photo-meta.json')))
    out, credits = [], []
    for b in BIRDS:
        slug = b['slug']
        p = pmeta[slug]
        st = json.load(open(os.path.join(SP, 'work', 'audio', slug, 'stats.json')))
        m4a = st['m4a']
        sr = m4a['sampleRate']
        band = st['band']
        ch_audio = (f"Excerpt {st['srcStartSec']:.2f}–{st['srcEndSec']:.2f} s of the source, mixed to mono, "
                    f"high-pass {st['hpHz']:.0f} Hz" + (f", low-pass {st['lpHz']:.0f} Hz" if st['lpHz'] else '')
                    + (f", up to {st['nrDb']:.0f} dB stationary noise reduction" if st['nrDb'] else '')
                    + f", loudness-normalized, {st['xfadeSec']:.1f} s loop crossfade, AAC 128 kbps.")
        ch_photo = 'Resized and converted to WebP; colors converted to sRGB.' if 'converted' in p['icc'] else 'Resized and converted to WebP.'
        rec = {
            'slug': slug,
            'commonName': b['commonName'],
            'scientificName': b['scientificName'],
            'localNames': b['localNames'],
            'family': b['family'],
            'iucnStatus': {'code': b['iucn'], 'label': IUCN[b['iucn']]},
            'region': b['region'],
            'habitat': b['habitat'],
            'traits': b['traits'],
            'songDescription': b['songDescription'],
            'songCharacter': b['songCharacter'],
            'photo': {
                'src': f'/birds/{slug}/photo.webp',
                'srcSm': f'/birds/{slug}/photo-sm.webp',
                'width': p['width'], 'height': p['height'],
                'focal': p['focal'],
                'lqip': p['lqip'],
                'dominantColor': p['dominantColor'],
                'accentColor': p['accentColor'],
                'alt': b['alt'],
                'labelSide': p['labelSide'],
                'scrim': p['scrim'],
                'birdBox': dict(zip(('x0', 'y0', 'x1', 'y1'), p['birdBox'])),
            },
            'audio': {
                'src': f'/birds/{slug}/song.m4a',
                'durationSec': round(m4a['validFrames'] / sr, 6),
                'sampleRate': sr,
                'fileSampleRate': sr,
                'validFrames': m4a['validFrames'],
                'primingFrames': m4a['primingFrames'],
                'bandHz': {'p10': band['p10'], 'p50': band['p50'], 'p90': band['p90']},
                'peakHz': band['peakHz'],
                'fingerprint': b['fingerprint'],
            },
            'credits': {
                'photo': {'title': b['photo']['title'], 'author': b['photo']['author'], 'license': b['photo']['license'],
                          'licenseUrl': LIC[b['photo']['license']], 'source': src_url('File:' + b['photo']['title']),
                          'changes': ch_photo},
                'audio': {'title': b['audio']['title'], 'author': b['audio']['author'], 'license': b['audio']['license'],
                          'licenseUrl': LIC[b['audio']['license']], 'source': src_url('File:' + b['audio']['title']),
                          'catalog': b['audio']['catalog'], 'changes': ch_audio},
            },
        }
        out.append(rec)
    with open(os.path.join(OUT, 'birds.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write('\n')
    # CREDITS.md
    L = ['# Kyma Birds: credits', '',
         'Every photo and recording below comes from Wikimedia Commons and is used under the license shown.',
         'The files served by the app are adaptations: photos were resized and converted to WebP; songs were cut to a loop',
         'and processed as described. Adaptations of CC BY-SA works are shared under the same license as their source.',
         '']
    for i, r in enumerate(out, 1):
        ph, au = r['credits']['photo'], r['credits']['audio']
        L += [f"## {i}. {r['commonName']} (*{r['scientificName']}*)", '',
              f"- **Photo:** “{ph['title']}” by {ph['author']}, [{ph['license']}]({ph['licenseUrl']}). "
              f"Source: <{ph['source']}>. {ph['changes']}",
              f"- **Song:** “{au['title']}” by {au['author']} ({au['catalog']}), [{au['license']}]({au['licenseUrl']}). "
              f"Source: <{au['source']}>. {au['changes']}",
              '']
    L += ['## Tools', '',
          'Spectrograms, loop windows and loudness were analyzed with numpy and Pillow. Audio was decoded and encoded with',
          'macOS `afconvert` (AAC-LC, 128 kbps, mono, 44.1 kHz).', '']
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(L))
    print(f'wrote {len(out)} birds')


if __name__ == '__main__':
    main()
