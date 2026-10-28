import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav
x, sr = read_wav(sys.argv[2]); x = x[:,0]
w = int(0.01*sr)
def show(a, b, label):
    print(label)
    for i in range(a, b, w):
        seg = x[i:i+w]
        print(f'  {i/sr:7.3f}s rms {20*np.log10(np.sqrt(np.mean(seg**2))+1e-12):6.1f}  pk {20*np.log10(np.abs(seg).max()+1e-12):6.1f}')
t0=float(sys.argv[3]); t1=float(sys.argv[4])
show(int(t0*sr), int(t1*sr), sys.argv[2].split('/')[-3])
