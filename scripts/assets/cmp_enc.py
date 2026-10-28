import sys, os, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav, stft_power, colormap, font
from PIL import Image, ImageDraw
work = sys.argv[2]; out = sys.argv[3]; specs = sys.argv[4:]
rows = []
for sp in specs:
    slug, t0, t1 = sp.split(':'); t0 = float(t0); t1 = float(t1)
    for name in ('loop.wav', 'check.wav'):
        x, sr = read_wav(os.path.join(work, slug, name)); x = x[int(t0*sr):int(t1*sr), 0]
        P = stft_power(x, sr, 1024, 128); db = 10*np.log10(P+1e-12)[:, :int(14000*1024/sr)]
        hi = np.percentile(db, 99.7); lo = hi-80
        im = Image.fromarray(colormap(((db-lo)/(hi-lo)).T[::-1])).resize((600, 200))
        rows.append((f'{slug} {name} {t0}-{t1}s (0-14 kHz)', im))
W = 600; H = len(rows)*(200+16)
s = Image.new('RGB', (W, H), (14,14,16)); d = ImageDraw.Draw(s); y = 0
for lab, im in rows:
    d.text((2, y+1), lab, fill=(230,230,230), font=font(11)); s.paste(im, (0, y+16)); y += 216
s.save(out)
