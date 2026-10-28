import sys, os, json, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav, stft_power
work = sys.argv[2]
for slug in sys.argv[3:]:
    st = json.load(open(os.path.join(work, slug, 'stats.json')))
    lo = st['statsLoHz']; hi = 12000
    x, sr = read_wav(os.path.join(work, slug, 'loop.wav')); x = x[:,0]
    nfft, hop = 2048, int(sr/100)
    P = stft_power(np.concatenate([x[-nfft:], x]), sr, nfft, hop).astype(np.float64)
    f = np.arange(P.shape[1])*sr/nfft; m = (f>=lo)&(f<=hi); Pb = P[:, m]; fb = f[m]
    floor = np.percentile(Pb, 20, axis=0)
    S = np.maximum(Pb - 4*floor, 0)
    e = 10*np.log10(Pb.sum(1)+1e-20); p10, p95 = np.percentile(e,10), np.percentile(e,95)
    loud = (e-p10)/(p95-p10); act = loud > 0.3
    # per-frame peak frequency of the denoised spectrum
    pk = fb[np.argmax(S[act], axis=1)]
    w = np.clip(loud[act], 0, 1.2)
    def wpct(v, w, q):
        o = np.argsort(v); c = np.cumsum(w[o])/w.sum(); return float(v[o][np.searchsorted(c, q)])
    a = [round(wpct(pk, w, q)) for q in (0.1, 0.5, 0.9)]
    # dB-above-floor weighted spectral percentiles
    D = np.maximum(10*np.log10(Pb+1e-20) - 10*np.log10(floor+1e-20) - 6, 0)[act].sum(0)
    c = np.cumsum(D)/D.sum(); b = [round(float(fb[np.searchsorted(c, q)])) for q in (0.1,0.5,0.9)]
    print(f"{slug:26s} energy {st['band']['p10']}/{st['band']['p50']}/{st['band']['p90']}  framePeak {a[0]}/{a[1]}/{a[2]}  dBweighted {b[0]}/{b[1]}/{b[2]}  peakHz {st['band']['peakHz']}")
