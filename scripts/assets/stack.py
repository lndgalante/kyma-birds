import sys
from PIL import Image
out=sys.argv[1]; ims=[Image.open(f).convert('RGB') for f in sys.argv[2:]]
W=max(i.width for i in ims); H=sum(i.height for i in ims)
s=Image.new('RGB',(W,H),(0,0,0)); y=0
for i in ims: s.paste(i,(0,y)); y+=i.height
s.save(out)
