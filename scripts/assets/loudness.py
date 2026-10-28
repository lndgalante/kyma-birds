import sys, os, numpy as np
sys.path.insert(0, sys.argv[1])
from process_audio import read_wav, active_mask
def kweight_mag(f):
    # BS.1770 K-weighting (shelf + RLB high-pass), analog-equivalent magnitudes
    G=3.999843853973347; f0=1681.974450955533; Q=0.7071752369554196
    # high shelf approx via biquad prototype evaluated on jw (pyloudnorm-style digital at 48k ~ analog)
    Vh=10**(G/20); Vb=Vh**0.4996667741545416
    w=f/f0; s=1j*w
    shelf=(Vh*s**2 + Vb*s/Q + 1)/(s**2 + s/Q + 1)
    fh=38.13547087602444; Qh=0.5003270373238773
    s2=1j*(f/fh)
    hp=(s2**2)/(s2**2 + s2/Qh + 1)
    return np.abs(shelf*hp)
def aweight_mag(f):
    f2=f**2
    ra=(12194**2*f2**2)/((f2+20.6**2)*np.sqrt((f2+107.7**2)*(f2+737.9**2))*(f2+12194**2))
    return ra*10**(2.0/20)
for slug in sys.argv[3:]:
    x, sr = read_wav(os.path.join(sys.argv[2], slug, 'loop.wav')); x=x[:,0]
    X=np.fft.rfft(x); f=np.fft.rfftfreq(len(x),1/sr)
    def lvl(H):
        y=np.fft.irfft(X*H, len(x))
        db, act, n = active_mask(x, sr)
        nb=len(db); b=y[:nb*n].reshape(nb,n)[act]
        return 10*np.log10(np.mean(b**2)+1e-20)
    flat=lvl(np.ones_like(f)); k=lvl(kweight_mag(f)); a=lvl(aweight_mag(f))
    P=np.abs(X)**2; low=P[f<150].sum()/P.sum()
    print(f'{slug:26s} flat {flat:6.1f}  K {k:6.1f}  A {a:6.1f}  (K-flat {k-flat:+5.1f}, A-flat {a-flat:+5.1f})  energy<150Hz {100*low:4.1f}%')
