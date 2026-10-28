import sys, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav
x, sr = read_wav(sys.argv[2]); x = x[:,0]
X = np.abs(np.fft.rfft(x))**2; f = np.fft.rfftfreq(len(x), 1/sr)
for lo, hi in [(40,150),(150,250),(250,400),(400,700),(700,2000)]:
    m = (f>=lo)&(f<hi); k = np.argmax(X[m])
    print(f'{lo}-{hi} Hz: peak {f[m][k]:.1f} Hz, energy share {100*X[m].sum()/X.sum():.1f}%')
