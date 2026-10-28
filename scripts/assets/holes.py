import sys, os, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav, stft_power
a, sr = read_wav(sys.argv[2]); a = a[:,0]
for f in sys.argv[3:]:
    b, _ = read_wav(f); b = b[:,0]; n = min(len(a), len(b))
    Pa = stft_power(a[:n], sr, 1024, 256); Pb = stft_power(b[:n], sr, 1024, 256)
    k0, k1 = int(1000*1024/sr), int(12000*1024/sr)
    Pa, Pb = Pa[:, k0:k1], Pb[:, k0:k1]
    holes = np.mean(10*np.log10(Pb+1e-14) < 10*np.log10(Pa+1e-14) - 15)
    err = 10*np.log10(np.sum((a[:n]-b[:n])**2)/np.sum(a[:n]**2))
    print(f'{os.path.basename(f):28s} holes {100*holes:5.2f}%  SNR-err {err:6.1f} dB  size {os.path.getsize(f.replace(".wav",".m4a"))//1024} KB')
