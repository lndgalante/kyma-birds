import sys
from PIL import Image, ImageDraw
out = sys.argv[1]; tiles = []
for spec in sys.argv[2:]:
    path, x0, y0, x1, y1 = spec.split(',')
    im = Image.open(path).convert('RGB'); W, H = im.size
    x0, y0, x1, y1 = float(x0), float(y0), float(x1), float(y1)
    c = im.crop((int(x0*W), int(y0*H), int(x1*W), int(y1*H))).resize((400, int(400*(y1-y0)*H/((x1-x0)*W))))
    d = ImageDraw.Draw(c)
    # grid every 0.01 of the image
    for i in range(int(x0*100), int(x1*100)+1):
        X = (i/100 - x0)/(x1-x0)*c.width
        d.line([(X,0),(X,6 if i%5 else 14)], fill=(255,255,0))
        if i%5==0: d.text((X+2,14), f'{i/100:.2f}', fill=(255,255,0))
    for j in range(int(y0*100), int(y1*100)+1):
        Y = (j/100 - y0)/(y1-y0)*c.height
        d.line([(0,Y),(6 if j%5 else 14,Y)], fill=(0,255,255))
        if j%5==0: d.text((16,Y-6), f'{j/100:.2f}', fill=(0,255,255))
    tiles.append(c)
W = sum(t.width for t in tiles); H = max(t.height for t in tiles)
s = Image.new('RGB', (W, H)); x = 0
for t in tiles: s.paste(t, (x, 0)); x += t.width
s.save(out)
