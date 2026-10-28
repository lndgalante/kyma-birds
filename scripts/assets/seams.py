import sys, os, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav, stft_power, colormap, font
from PIL import Image, ImageDraw
work, out = sys.argv[2], sys.argv[3]; slugs = sys.argv[4:]
cw, ch, pps, fmax = 300, 170, 75, 12000
cols = 3; rows = (len(slugs)+cols-1)//cols
sheet = Image.new('RGB', (cols*(cw+10), rows*(ch+22)), (14,14,16)); d = ImageDraw.Draw(sheet)
for i, slug in enumerate(slugs):
    x, sr = read_wav(os.path.join(work, slug, 'check.wav')); x = x[:,0]
    k = int(2*sr); y = np.concatenate([x[-k:], x[:k]])
    nfft, hop = 1024, int(sr/pps/2)
    P = stft_power(y, sr, nfft, hop); db = 10*np.log10(P+1e-12)[:, :int(fmax*nfft/sr)]
    hi = np.percentile(db, 99.7); lo = hi-75
    img = colormap(((db-lo)/(hi-lo)).T[::-1])
    im = Image.fromarray(img).resize((cw, ch))
    X0 = (i%cols)*(cw+10); Y0 = (i//cols)*(ch+22)
    sheet.paste(im, (X0, Y0+18))
    d.line([(X0+cw//2, Y0+18), (X0+cw//2, Y0+18+ch)], fill=(90,200,255))
    jump = abs(x[0]-x[-1]); typ = np.percentile(np.abs(np.diff(x)), 99)
    d.text((X0+2, Y0+2), f'{slug}  wrap |dx| {jump:.4f} (p99 step {typ:.4f})', fill=(230,230,230), font=font(11))
sheet.save(out)
