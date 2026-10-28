import sys
from PIL import Image, ImageDraw
out=sys.argv[1]; files=sys.argv[2:]
W=320; H=240; cols=4
rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(cols*W,rows*(H+18)),(20,20,20))
d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im=Image.open(f).convert('RGB'); im.thumbnail((W,H))
    x=(i%cols)*W; y=(i//cols)*(H+18)
    sheet.paste(im,(x+(W-im.width)//2,y))
    d.text((x+4,y+H+2),f.split('/')[-1],fill=(255,255,255))
sheet.save(out)
