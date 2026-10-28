import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav
x, sr = read_wav(sys.argv[2])
for c in range(x.shape[1]):
    ch = x[:, c]
    print('ch', c, 'peak', np.abs(ch).max())
    for s in range(0, int(len(ch)/sr)+1, 1):
        seg = ch[s*sr:(s+1)*sr]
        if len(seg)==0: break
        n = int((np.abs(seg) > 0.98).sum())
        rms = 20*np.log10(np.sqrt(np.mean(seg**2))+1e-12)
        print(f'  {s:3d}s rms {rms:6.1f} dBFS  peak {20*np.log10(np.abs(seg).max()+1e-12):6.1f}  >0.98: {n}')
