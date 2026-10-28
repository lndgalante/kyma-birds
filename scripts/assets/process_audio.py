#!/usr/bin/env python3
"""Kyma Birds song-loop pipeline (numpy + Pillow, no scipy, no ffmpeg).

Run with:  uv run --with numpy --with pillow python -I process_audio.py <command> [options]

Commands
  analyze  Decode the source, render a full-recording spectrogram (rows of 60 s, with a
           song-band energy strip under each row) and print the best-scoring loop windows.
  render   Cut a loop window, filter, snap the seam to quiet gaps, bake an equal-power
           crossfade so end->start is sample-continuous, normalise loudness, encode AAC
           (.m4a), decode it back to verify, render the loop spectrogram, write stats JSON.

Decoding uses `afconvert -f WAVE -d LEI16`; encoding uses `afconvert -f m4af -d aac`.
"""
import argparse
import json
import os
import re
import struct
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# ----------------------------------------------------------------------------- WAV I/O


def read_wav(path):
    """Minimal RIFF reader (PCM16/24/32 int and float32), tolerant of extra chunks."""
    with open(path, 'rb') as f:
        data = f.read()
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise ValueError(f'not a WAVE file: {path}')
    pos, fmt, raw = 12, None, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack('<I', data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b'fmt ':
            tag, ch, sr, _, _, bits = struct.unpack('<HHIIHH', body[:16])
            if tag == 0xFFFE and len(body) >= 26:
                tag = struct.unpack('<H', body[24:26])[0]
            fmt = (tag, ch, sr, bits)
        elif cid == b'data':
            raw = body
        pos += 8 + size + (size & 1)
    tag, ch, sr, bits = fmt
    if tag == 3 and bits == 32:
        x = np.frombuffer(raw, dtype='<f4').astype(np.float64)
    elif tag == 1 and bits == 16:
        x = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768.0
    elif tag == 1 and bits == 24:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        x = v.astype(np.float64) / float(1 << 23)
    elif tag == 1 and bits == 32:
        x = np.frombuffer(raw, dtype='<i4').astype(np.float64) / 2147483648.0
    else:
        raise ValueError(f'unsupported WAVE format tag={tag} bits={bits}')
    n = len(x) // ch
    return x[:n * ch].reshape(n, ch), sr


def write_wav_f32(path, x, sr):
    x = np.asarray(x, dtype='<f4')
    raw = x.tobytes()
    fmt = struct.pack('<HHIIHHH', 3, 1, sr, sr * 4, 4, 32, 0)
    fact = struct.pack('<I', len(x))
    body = (b'WAVE' + b'fmt ' + struct.pack('<I', len(fmt)) + fmt
            + b'fact' + struct.pack('<I', 4) + fact
            + b'data' + struct.pack('<I', len(raw)) + raw)
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', len(body)) + body)


def decode(src, wav_path):
    if not os.path.exists(wav_path) or os.path.getmtime(wav_path) < os.path.getmtime(src):
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', src, wav_path], check=True)
    x, sr = read_wav(wav_path)
    return x, sr


def to_mono(x):
    if x.shape[1] == 1:
        return x[:, 0].copy(), 'mono source'
    l, r = x[:, 0], x[:, 1]
    el, er = np.sqrt(np.mean(l ** 2)) + 1e-12, np.sqrt(np.mean(r ** 2)) + 1e-12
    corr = float(np.dot(l, r) / (np.sqrt(np.dot(l, l) * np.dot(r, r)) + 1e-12))
    note = f'stereo->mono (L/R level {20*np.log10(el/er):+.1f} dB, corr {corr:.2f})'
    if corr < 0.2 or abs(20 * np.log10(el / er)) > 10:
        # out-of-phase or one-sided recording: keep the louder channel rather than averaging
        return (l if el >= er else r).copy(), note + ', kept louder channel'
    return 0.5 * (l + r), note + ', averaged'


def resample_fft(x, sr_in, sr_out):
    n_out = int(round(len(x) * sr_out / sr_in))
    X = np.fft.rfft(x)
    Y = np.zeros(n_out // 2 + 1, dtype=complex)
    m = min(len(X), len(Y))
    Y[:m] = X[:m]
    return np.fft.irfft(Y, n_out) * (n_out / len(x))

# ----------------------------------------------------------------------------- DSP


def zero_phase_filter(x, sr, hp=0.0, hp_order=2, lp=0.0, lp_order=4):
    """Zero-phase Butterworth-magnitude filtering in the FFT domain (reflect-padded)."""
    if hp <= 0 and lp <= 0:
        return x.copy()
    pad = min(len(x) - 1, int(0.5 * sr))
    xp = np.concatenate([x[pad:0:-1], x, x[-2:-pad - 2:-1]])
    n = 1 << int(np.ceil(np.log2(len(xp))))
    X = np.fft.rfft(xp, n)
    f = np.fft.rfftfreq(n, 1.0 / sr)
    H = np.ones_like(f)
    if hp > 0:
        with np.errstate(divide='ignore'):
            H *= 1.0 / np.sqrt(1.0 + (hp / np.maximum(f, 1e-9)) ** (2 * hp_order))
        H[0] = 0.0
    if lp > 0:
        H *= 1.0 / np.sqrt(1.0 + (f / lp) ** (2 * lp_order))
    y = np.fft.irfft(X * H, n)[:len(xp)]
    return y[pad:pad + len(x)]


def stft_power(x, sr, nfft=2048, hop=512):
    win = np.hanning(nfft).astype(np.float32)
    n = 1 + max(0, (len(x) - nfft) // hop)
    out = np.empty((n, nfft // 2 + 1), dtype=np.float32)
    xs = x.astype(np.float32)
    step = 1024
    for i in range(0, n, step):
        j = min(n, i + step)
        idx = np.arange(nfft)[None, :] + hop * np.arange(i, j)[:, None]
        fr = xs[idx] * win
        out[i:j] = (np.abs(np.fft.rfft(fr, axis=1)) ** 2).astype(np.float32)
    return out


def band_energy_db(P, sr, nfft, lo, hi):
    f = np.arange(P.shape[1]) * sr / nfft
    m = (f >= lo) & (f <= hi)
    return 10 * np.log10(P[:, m].sum(axis=1) + 1e-12)


def smooth(v, k):
    if k <= 1:
        return v
    ker = np.ones(k) / k
    return np.convolve(np.pad(v, (k // 2, k - 1 - k // 2), mode='edge'), ker, mode='valid')

# ----------------------------------------------------------------------------- spectrogram image

_CMAP = np.array([[0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
                  [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191]], dtype=np.float64)


def colormap(v):
    v = np.clip(v, 0, 1) * (len(_CMAP) - 1)
    i = np.minimum(v.astype(int), len(_CMAP) - 2)
    t = (v - i)[..., None]
    return (_CMAP[i] * (1 - t) + _CMAP[i + 1] * t).astype(np.uint8)


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def spec_rows_image(x, sr, title, fmax=12000, row_sec=60.0, px_per_sec=20, row_h=256,
                    band=None, marks=None, nfft=2048):
    """Spectrogram split into rows; optional song-band energy strip and vertical marks."""
    hop = max(64, int(sr / px_per_sec / 2))
    P = stft_power(x, sr, nfft, hop)
    db = 10 * np.log10(P + 1e-12)
    kmax = int(fmax * nfft / sr)
    db = db[:, :kmax]
    hi = np.percentile(db, 99.8)
    lo = max(hi - 80, np.percentile(db, 3))
    norm = (db - lo) / (hi - lo)
    fps = sr / hop
    dur = len(x) / sr
    nrows = int(np.ceil(dur / row_sec))
    strip_h = 44 if band else 0
    lab_w, gap = 44, 22
    W = lab_w + int(row_sec * px_per_sec) + 8
    H = 28 + nrows * (row_h + strip_h + gap)
    img = Image.new('RGB', (W, H), (14, 14, 16))
    d = ImageDraw.Draw(img)
    fnt, fsm = font(13), font(11)
    d.text((6, 6), title, fill=(235, 235, 235), font=fnt)
    if band:
        e = band_energy_db(P, sr, nfft, band[0], band[1])
        e = smooth(e, max(1, int(fps * 0.05)))
        efl = np.percentile(e, 10)
        ehi = np.percentile(e, 99.5)
    for r in range(nrows):
        t0, t1 = r * row_sec, min(dur, (r + 1) * row_sec)
        f0, f1 = int(t0 * fps), min(norm.shape[0], int(t1 * fps))
        if f1 <= f0:
            continue
        seg = norm[f0:f1]
        cols = max(1, int((t1 - t0) * px_per_sec))
        # max-pool frames into columns, bins into rows
        ci = (np.arange(seg.shape[0]) * cols / seg.shape[0]).astype(int)
        colimg = np.full((cols, seg.shape[1]), -1.0)
        np.maximum.at(colimg, ci, seg)
        ri = (np.arange(seg.shape[1]) * row_h / seg.shape[1]).astype(int)
        im = np.full((cols, row_h), -1.0)
        np.maximum.at(im.T, ri, colimg.T)
        rgb = colormap(im.T[::-1])
        y0 = 28 + r * (row_h + strip_h + gap)
        img.paste(Image.fromarray(rgb), (lab_w, y0))
        for fk in (1000, 2000, 4000, 8000, 12000):
            if fk > fmax:
                continue
            yy = y0 + row_h - int(fk / fmax * row_h)
            d.line([(lab_w - 5, yy), (lab_w - 1, yy)], fill=(200, 200, 200))
            d.text((4, yy - 6), f'{fk // 1000}k', fill=(200, 200, 200), font=fsm)
        for s in range(int(np.ceil(t0)), int(t1) + 1):
            xx = lab_w + int((s - t0) * px_per_sec)
            big = s % 5 == 0
            d.line([(xx, y0 + row_h), (xx, y0 + row_h + (6 if big else 3))], fill=(200, 200, 200))
            if big:
                d.text((xx + 2, y0 + row_h + strip_h + 2), f'{s}s', fill=(220, 220, 220), font=fsm)
        if band:
            ys = y0 + row_h + 6
            ee = e[f0:f1]
            pts = []
            for k in range(cols):
                a, b = int(k * len(ee) / cols), max(int(k * len(ee) / cols) + 1, int((k + 1) * len(ee) / cols))
                v = (ee[a:b].max() - efl) / max(1e-6, (ehi - efl))
                pts.append((lab_w + k, ys + strip_h - 8 - int(np.clip(v, 0, 1) * (strip_h - 10))))
            d.line([(lab_w, ys + strip_h - 8), (lab_w + cols, ys + strip_h - 8)], fill=(60, 60, 60))
            d.line(pts, fill=(120, 220, 255))
        if marks:
            for (tm, colr) in marks:
                if t0 <= tm <= t1:
                    xx = lab_w + int((tm - t0) * px_per_sec)
                    d.line([(xx, y0), (xx, y0 + row_h + strip_h)], fill=colr, width=1)
    return img

# ----------------------------------------------------------------------------- analysis


def score_windows(x, sr, band, win_len, step=0.5, top=6):
    nfft, hop = 2048, 441
    P = stft_power(x, sr, nfft, hop)
    fps = sr / hop
    e = band_energy_db(P, sr, nfft, band[0], band[1])
    low = band_energy_db(P, sr, nfft, 20, 250)
    floor = np.percentile(e, 10)
    snr = np.clip(e - floor, 0, 40)
    active = (e > floor + 8).astype(float)
    bumps = (low > np.median(low) + 15).astype(float)
    clipped = np.abs(x) > 0.995
    L = int(win_len * fps)
    res = []
    t = 0.0
    while (t + win_len) * fps <= len(e):
        a = int(t * fps)
        sl = slice(a, a + L)
        clip_n = int(clipped[int(t * sr):int((t + win_len) * sr)].sum())
        s = snr[sl].mean() * (0.5 + 0.5 * active[sl].mean()) - 30 * bumps[sl].mean() - 0.5 * clip_n
        res.append((s, t, snr[sl].mean(), active[sl].mean(), bumps[sl].mean(), clip_n))
        t += step
    res.sort(reverse=True)
    picked = []
    for r in res:
        if all(abs(r[1] - p[1]) >= win_len * 0.6 for p in picked):
            picked.append(r)
        if len(picked) >= top:
            break
    return picked, floor


def cmd_analyze(a):
    os.makedirs(a.work, exist_ok=True)
    x, sr = decode(a.src, os.path.join(a.work, 'src.wav'))
    m, note = to_mono(x)
    print(f'{a.slug}: {len(m)/sr:.2f} s @ {sr} Hz, {note}; peak {20*np.log10(np.abs(m).max()+1e-12):.1f} dBFS')
    band = tuple(float(v) for v in a.band.split(','))
    view = zero_phase_filter(m, sr, hp=a.hp, lp=a.lp) if (a.hp > 0 or a.lp > 0) else m
    t0 = a.t0
    t1 = a.t1 if a.t1 > 0 else len(view) / sr
    vv = view[int(t0 * sr):int(t1 * sr)]
    img = spec_rows_image(vv, sr, f'{a.slug} - {t0:.0f}-{t1:.0f} s (hp {a.hp:.0f} Hz{", lp %.0f" % a.lp if a.lp else ""}), band strip {band[0]:.0f}-{band[1]:.0f} Hz, time axis from {t0:.0f} s',
                          band=band, fmax=a.fmax, row_sec=a.row_sec, px_per_sec=a.pps)
    out = os.path.join(a.work, 'full.png' if (t0 == 0 and a.t1 <= 0) else f'zoom_{t0:.0f}_{t1:.0f}.png')
    img.save(out)
    print('spectrogram:', out)
    if a.t1 > 0 or t0 > 0:
        return
    for w in [float(v) for v in a.win.split(',')]:
        picked, floor = score_windows(view, sr, band, w)
        print(f'  best {w:.0f}s windows (band floor {floor:.1f} dB):')
        for s, t, snr, act, bump, clip_n in picked:
            print(f'    start {t:6.1f}s  score {s:5.1f}  meanSNR {snr:4.1f} dB  active {act:4.2f}  bumps {bump:4.2f}  clipped {clip_n}')

# ----------------------------------------------------------------------------- render


def find_quiet(env, fps, center, search, xfade, lo_bound, hi_bound):
    """Return time t in [center-search, center+search] minimising mean env over [t, t+xfade]."""
    k = max(1, int(xfade * fps))
    lin = 10 ** (env / 10)
    cs = np.concatenate([[0], np.cumsum(lin)])
    best, bt = None, center
    a = max(lo_bound, center - search)
    b = min(hi_bound, center + search)
    t = a
    while t <= b:
        i = int(t * fps)
        if i + k < len(cs):
            v = (cs[i + k] - cs[i]) / k
            if best is None or v < best:
                best, bt = v, t
        t += 1.0 / fps
    return bt, 10 * np.log10(best + 1e-20) if best is not None else None


def active_mask(x, sr, block=0.05):
    n = int(block * sr)
    nb = len(x) // n
    r = np.sqrt(np.mean(x[:nb * n].reshape(nb, n) ** 2, axis=1) + 1e-20)
    db = 20 * np.log10(r)
    floor = np.percentile(db, 10)
    top = np.percentile(db, 99)
    thr = max(floor + 8, top - 30)
    return db, db > thr, n


def active_rms_db(x, sr):
    db, act, n = active_mask(x, sr)
    if act.sum() == 0:
        return float(20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-20)), 0.0
    nb = len(db)
    blocks = x[:nb * n].reshape(nb, n)[act]
    return float(10 * np.log10(np.mean(blocks ** 2) + 1e-20)), float(act.mean())


def kweight_mag(f):
    """|H(f)| of the ITU-R BS.1770 K-weighting curve (high shelf + RLB high-pass), analog prototype."""
    f = np.maximum(np.asarray(f, dtype=np.float64), 1e-9)
    vh = 10 ** (3.999843853973347 / 20)
    vb = vh ** 0.4996667741545416
    s = 1j * f / 1681.974450955533
    q = 0.7071752369554196
    shelf = (vh * s ** 2 + vb * s / q + 1) / (s ** 2 + s / q + 1)
    s2 = 1j * f / 38.13547087602444
    hp = s2 ** 2 / (s2 ** 2 + s2 / 0.5003270373238773 + 1)
    return np.abs(shelf * hp)


def k_active_db(x, sr):
    """K-weighted RMS (dB) over the same active blocks as active_rms_db (loop treated as periodic)."""
    X = np.fft.rfft(x)
    y = np.fft.irfft(X * kweight_mag(np.fft.rfftfreq(len(x), 1.0 / sr)), len(x))
    db, act, n = active_mask(x, sr)
    nb = len(db)
    blocks = y[:nb * n].reshape(nb, n)[act] if act.any() else y[:nb * n].reshape(nb, n)
    return float(10 * np.log10(np.mean(blocks ** 2) + 1e-20))


def true_peak_db(x, os_factor=4):
    """Periodic (loop) 4x FFT oversampling - exact for a loop that wraps."""
    n = len(x)
    X = np.fft.rfft(x)
    Y = np.zeros(n * os_factor // 2 + 1, dtype=complex)
    Y[:len(X)] = X
    y = np.fft.irfft(Y, n * os_factor) * os_factor
    return float(20 * np.log10(np.abs(y).max() + 1e-20))


def spectral_stats(x, sr, lo, hi):
    """Song band of a loop.

    bandHz p10/p50/p90: loudness-weighted percentiles of the per-frame dominant frequency (sub-bin, parabolic)
    of the noise-floor-subtracted spectrum, over active frames - i.e. where the song's pitch lives.
    peakHz: argmax of the summed denoised spectrum (the signature note), parabolic-refined.
    Same front end as the app's analyser: N=2048 Hann, 10 ms hop, per-bin 20th-percentile floor + 6 dB,
    active = in-band level above P10 + 0.30 * (P95 - P10), loop treated as circular."""
    nfft, hop = 2048, int(round(sr / 100))
    xp = np.concatenate([x[-nfft:], x])
    P = stft_power(xp, sr, nfft, hop).astype(np.float64)
    binhz = sr / nfft
    f = np.arange(P.shape[1]) * binhz
    m = (f >= lo) & (f <= min(hi, 0.45 * sr))
    Pb = P[:, m]
    fb = f[m]
    floor = np.percentile(Pb, 20, axis=0)
    S = np.maximum(Pb - 4 * floor, 0)
    e = 10 * np.log10(Pb.sum(axis=1) + 1e-20)
    p10, p95 = np.percentile(e, 10), np.percentile(e, 95)
    loud = (e - p10) / max(1e-6, p95 - p10)
    act = loud > 0.30
    Sa = S[act]

    def refine(row, k):
        if 0 < k < len(row) - 1 and row[k] > 0:
            al, be, ga = (10 * np.log10(row[k - 1:k + 2] + 1e-20))
            den = al - 2 * be + ga
            return fb[k] + (0.5 * (al - ga) / den if den != 0 else 0.0) * binhz
        return fb[k]

    ks = np.argmax(Sa, axis=1)
    pk = np.array([refine(Sa[i], k) for i, k in enumerate(ks)])
    w = np.clip(loud[act], 0, 1.2)
    o = np.argsort(pk)
    cw = np.cumsum(w[o]) / w.sum()

    def wpct(q):
        return float(pk[o][min(len(o) - 1, np.searchsorted(cw, q))])

    b10, b50, b90 = wpct(0.10), wpct(0.50), wpct(0.90)
    spec = Sa.sum(axis=0)
    peak = float(refine(spec, int(np.argmax(spec))))
    # the signature note must sit inside the band; allow one-bin quantisation slack
    if peak < b10 and b10 - peak <= binhz:
        b10 = peak
    if peak > b90 and peak - b90 <= binhz:
        b90 = peak
    crest = np.median((Sa + 1e-20).max(axis=1) / (Sa + 1e-20).mean(axis=1))
    return {'p10': round(b10), 'p50': round(b50), 'p90': round(b90), 'peakHz': round(peak),
            'activeFrac': round(float(act.mean()), 3), 'medianCrestDb': round(float(10 * np.log10(crest)), 1),
            'peakInBand': bool(b10 <= peak <= b90)}


def afinfo(path):
    out = subprocess.run(['afinfo', path], capture_output=True, text=True, check=True).stdout
    info = {'raw': out}
    m = re.search(r'(\d+) valid frames \+ (\d+) priming \+ (\d+) remainder', out)
    if m:
        info['validFrames'], info['primingFrames'], info['remainderFrames'] = map(int, m.groups())
    m = re.search(r'Data format:\s+(\d+) ch,\s+(\d+) Hz', out)
    if m:
        info['channels'], info['sampleRate'] = int(m.group(1)), int(m.group(2))
    m = re.search(r'estimated duration: ([\d.]+)', out)
    if m:
        info['duration'] = float(m.group(1))
    m = re.search(r'bit rate: (\d+)', out)
    if m:
        info['bitRate'] = int(m.group(1))
    return info


def cmd_render(a):
    os.makedirs(a.work, exist_ok=True)
    x, sr0 = decode(a.src, os.path.join(a.work, 'src.wav'))
    m, mono_note = to_mono(x)
    sr = sr0
    if sr0 not in (44100, 48000):
        m = resample_fft(m, sr0, 48000)
        sr = 48000
    dur_all = len(m) / sr
    band = tuple(float(v) for v in a.band.split(','))
    X = a.xfade
    # filter a region with margins (zero-phase, so no delay)
    r0 = max(0.0, a.start - a.search - 3.0)
    r1 = min(dur_all, a.start + a.dur + a.search + X + 3.0)
    seg = zero_phase_filter(m[int(r0 * sr):int(r1 * sr)], sr, hp=a.hp, lp=a.lp)
    if a.nr > 0:
        seg = spectral_denoise(seg, sr, a.nr)
    # song-band envelope for seam snapping
    nfft, hop = 1024, int(sr / 200)
    P = stft_power(seg, sr, nfft, hop)
    fps = sr / hop
    env = band_energy_db(P, sr, nfft, band[0], band[1])
    env = smooth(env, max(1, int(0.02 * fps)))
    seg_dur = len(seg) / sr
    if a.no_snap:
        s_rel, e_rel = a.start - r0, a.start + a.dur - r0
        sq = eq = None
    else:
        s_rel, sq = find_quiet(env, fps, a.start - r0, a.search, X, max(0.0, a.min_start - r0), seg_dur - X)
        e_lo = s_rel + a.min_dur
        e_hi = min(s_rel + a.max_dur, seg_dur - X - 0.01)
        tgt = min(max(a.start + a.dur - r0, e_lo), e_hi)
        e_rel, eq = find_quiet(env, fps, tgt, a.search, X, e_lo, e_hi)
    s, e = int(round(s_rel * sr)), int(round(e_rel * sr))
    k = int(round(X * sr))
    if e + k > len(seg):
        raise SystemExit('not enough material after the window end for the crossfade')
    loop = seg[s:e].copy()
    t = (np.arange(k) + 0.5) / k
    fin, fout = np.sin(0.5 * np.pi * t), np.cos(0.5 * np.pi * t)
    loop[:k] = seg[s:s + k] * fin + seg[e:e + k] * fout
    n = len(loop)
    # loudness: active-RMS target, true-peak ceiling (reduce gain rather than clip)
    rms_db, act_frac = active_rms_db(loop, sr)
    k_db = k_active_db(loop, sr)
    tp_db = true_peak_db(loop)
    # K-weighted target: a.target (flat dBFS) + 3.2 dB is the K-vs-flat offset typical of 2-4 kHz songbirds,
    # so songbirds land at ~-20 dBFS flat RMS while low voices (booms, hoots) are not left sounding quieter.
    gain_db = (a.target + a.k_offset) - k_db if a.weighting == 'k' else a.target - rms_db
    limited = False
    if tp_db + gain_db > a.tp:
        gain_db = a.tp - tp_db
        limited = True
    loop *= 10 ** (gain_db / 20)
    out_rms, _ = active_rms_db(loop, sr)
    out_k = k_active_db(loop, sr)
    out_tp = true_peak_db(loop)
    # seam continuity (end -> start) relative to typical sample steps
    steps = np.abs(np.diff(loop))
    seam_step = abs(loop[0] - loop[-1])
    seam_ratio = seam_step / (np.percentile(steps, 99) + 1e-12)
    # write + encode
    wav_out = os.path.join(a.work, 'loop.wav')
    write_wav_f32(wav_out, loop, sr)
    out_dir = os.path.join(a.out, a.slug)
    os.makedirs(out_dir, exist_ok=True)
    m4a = os.path.join(out_dir, 'song.m4a')
    if os.path.exists(m4a):
        os.remove(m4a)
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(a.bitrate), '-q', '127',
                    '-s', '0', wav_out, m4a], check=True)
    info = afinfo(m4a)
    # decode back and verify
    chk = os.path.join(a.work, 'check.wav')
    if os.path.exists(chk):
        os.remove(chk)
    subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEF32', m4a, chk], check=True)
    dx, dsr = read_wav(chk)
    dm = dx[:, 0]
    w = 2048
    head_rms = 20 * np.log10(np.sqrt(np.mean(dm[:w] ** 2)) + 1e-20)
    tail_rms = 20 * np.log10(np.sqrt(np.mean(dm[-w:] ** 2)) + 1e-20)
    head_zero = int(np.argmax(np.abs(dm) > 1e-5))     # leading digital-silence samples
    tail_zero = int(np.argmax(np.abs(dm[::-1]) > 1e-5))
    # alignment of decoded vs source (cross-correlate first 1 s)
    L = min(len(dm), len(loop), sr)
    best_off, best_c = 0, -1
    for off in range(-3000, 3001):
        a0 = max(0, off)
        b0 = max(0, -off)
        ln = L - abs(off)
        c = np.dot(dm[a0:a0 + ln], loop[b0:b0 + ln])
        if c > best_c:
            best_c, best_off = c, off
    dec_rms, _ = active_rms_db(dm[:n] if len(dm) >= n else dm, dsr)
    dec_peak = 20 * np.log10(np.abs(dm).max() + 1e-20)
    dec_seam = abs(dm[0] - dm[-1]) / (np.percentile(np.abs(np.diff(dm)), 99) + 1e-12)
    # spectrogram of the final loop (shown twice side by side would hide nothing; one pass + seam mark)
    spec_png = os.path.join(a.specdir, f'{a.slug}.png')
    os.makedirs(a.specdir, exist_ok=True)
    img = spec_rows_image(loop, sr, f'{a.slug} - final loop {n/sr:.2f} s (src {r0+s_rel:.2f}-{r0+e_rel:.2f} s, '
                          f'hp {a.hp:.0f}{", lp %.0f" % a.lp if a.lp else ""}{", nr %.0f dB" % a.nr if a.nr else ""}, xfade {X:.2f} s)',
                          row_sec=max(30.0, np.ceil(n / sr)), px_per_sec=36, row_h=300, band=band,
                          marks=[(X, (90, 200, 255))])
    img.save(spec_png)
    stats_lo = a.stats_lo
    st = spectral_stats(loop, sr, stats_lo, 12000)
    res = {
        'slug': a.slug, 'source': os.path.basename(a.src), 'monoNote': mono_note,
        'sourceSampleRate': sr0, 'sampleRate': sr,
        'srcStartSec': round(r0 + s_rel, 3), 'srcEndSec': round(r0 + e_rel, 3),
        'seamQuietDb': [None if sq is None else round(sq, 1), None if eq is None else round(eq, 1)],
        'envFloorDb': round(float(np.percentile(env, 10)), 1), 'envP90Db': round(float(np.percentile(env, 90)), 1),
        'loopSamples': n, 'loopSec': round(n / sr, 4), 'xfadeSec': X, 'hpHz': a.hp, 'lpHz': a.lp, 'nrDb': a.nr,
        'gainDb': round(gain_db, 2), 'peakLimited': limited, 'activeFrac': round(act_frac, 3),
        'activeRmsDb': round(out_rms, 2), 'kActiveDb': round(out_k, 2), 'weighting': a.weighting,
        'truePeakDb': round(out_tp, 2),
        'seamStepRatio': round(float(seam_ratio), 3),
        'm4a': {k2: v for k2, v in info.items() if k2 != 'raw'}, 'm4aBytes': os.path.getsize(m4a),
        'decoded': {'samples': len(dm), 'sampleRate': dsr, 'offsetVsSource': best_off,
                    'headRmsDb': round(float(head_rms), 1), 'tailRmsDb': round(float(tail_rms), 1),
                    'leadingZeroSamples': head_zero, 'trailingZeroSamples': tail_zero,
                    'activeRmsDb': round(dec_rms, 2), 'peakDb': round(float(dec_peak), 2),
                    'seamStepRatio': round(float(dec_seam), 3)},
        'statsLoHz': stats_lo, 'band': st,
    }
    with open(os.path.join(a.work, 'stats.json'), 'w') as f:
        json.dump(res, f, indent=2)
    print(json.dumps(res, indent=2))


def spectral_denoise(x, sr, max_db, nfft=2048, hop=512):
    """Gentle stationary-noise reduction (per-bin 20th-percentile profile), capped at max_db."""
    win = np.sqrt(np.hanning(nfft + 1)[:nfft])
    pad = nfft
    xp = np.concatenate([np.zeros(pad), x, np.zeros(pad + hop)])
    nfr = 1 + (len(xp) - nfft) // hop
    idx = np.arange(nfft)[None, :] + hop * np.arange(nfr)[:, None]
    F = np.fft.rfft(xp[idx] * win, axis=1)
    mag = np.abs(F)
    noise = np.percentile(mag, 20, axis=0)
    floor_g = 10 ** (-max_db / 20)
    g = np.clip(1 - 1.5 * (noise / (mag + 1e-12)) ** 2, 0, 1)
    g = np.sqrt(g)
    g = np.maximum(g, floor_g)
    # temporal + spectral smoothing of the gain to avoid musical noise
    kt = 5
    g = np.apply_along_axis(lambda v: smooth(v, kt), 0, g)
    g = np.apply_along_axis(lambda v: smooth(v, 3), 1, g)
    Y = np.fft.irfft(F * g, nfft, axis=1) * win
    y = np.zeros(len(xp))
    wsum = np.zeros(len(xp))
    for i in range(nfr):
        y[i * hop:i * hop + nfft] += Y[i]
        wsum[i * hop:i * hop + nfft] += win ** 2
    y /= np.maximum(wsum, 1e-8)
    return y[pad:pad + len(x)]


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    an = sub.add_parser('analyze')
    an.add_argument('--slug', required=True)
    an.add_argument('--src', required=True)
    an.add_argument('--work', required=True)
    an.add_argument('--band', default='1000,10000')
    an.add_argument('--hp', type=float, default=250)
    an.add_argument('--fmax', type=float, default=12000)
    an.add_argument('--win', default='20,26')
    an.add_argument('--t0', type=float, default=0.0)
    an.add_argument('--t1', type=float, default=0.0)
    an.add_argument('--row-sec', type=float, default=60.0)
    an.add_argument('--pps', type=float, default=20)
    an.add_argument('--lp', type=float, default=0)
    rn = sub.add_parser('render')
    rn.add_argument('--slug', required=True)
    rn.add_argument('--src', required=True)
    rn.add_argument('--work', required=True)
    rn.add_argument('--out', required=True, help='public/birds directory')
    rn.add_argument('--specdir', required=True)
    rn.add_argument('--start', type=float, required=True)
    rn.add_argument('--dur', type=float, required=True)
    rn.add_argument('--search', type=float, default=1.0)
    rn.add_argument('--min-dur', type=float, default=16.0)
    rn.add_argument('--max-dur', type=float, default=28.0)
    rn.add_argument('--no-snap', action='store_true')
    rn.add_argument('--min-start', type=float, default=0.5, help='never start the loop before this source time (fade-ins)')
    rn.add_argument('--band', default='1000,10000')
    rn.add_argument('--hp', type=float, default=250)
    rn.add_argument('--lp', type=float, default=0)
    rn.add_argument('--nr', type=float, default=0, help='max stationary noise reduction in dB (0 = off)')
    rn.add_argument('--xfade', type=float, default=0.6)
    rn.add_argument('--target', type=float, default=-20.0)
    rn.add_argument('--tp', type=float, default=-1.0)
    rn.add_argument('--weighting', choices=['k', 'flat'], default='k')
    rn.add_argument('--k-offset', type=float, default=3.2)
    rn.add_argument('--bitrate', type=int, default=128000)
    rn.add_argument('--stats-lo', type=float, default=300)
    a = p.parse_args()
    {'analyze': cmd_analyze, 'render': cmd_render}[a.cmd](a)


if __name__ == '__main__':
    main()
