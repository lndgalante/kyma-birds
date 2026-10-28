#!/usr/bin/env python3
"""Kyma Birds photo pipeline: sRGB-normalised WebP (1600/800), LQIP, theme colours, scrim.

uv run --with numpy --with pillow python -I process_photos.py RAW_DIR OUT_PUBLIC_BIRDS CONFIG.json META_OUT.json REVIEW.png [slug...]
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image, ImageCms, ImageDraw, ImageFilter, ImageOps

SRGB = ImageCms.createProfile('sRGB')


def load_srgb(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im)
    icc = im.info.get('icc_profile')
    note = 'no ICC (assumed sRGB)'
    if icc:
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        desc = ImageCms.getProfileDescription(src).strip()
        note = f'ICC "{desc}"'
        if 'srgb' not in desc.lower() and desc.lower() not in ('c2', 'c2ci'):
            im = ImageCms.profileToProfile(im.convert('RGB'), src, SRGB, renderingIntent=0, outputMode='RGB')
            note += ' -> converted to sRGB'
    return im.convert('RGB'), note


def resize_long(im, long_edge):
    w, h = im.size
    s = long_edge / max(w, h)
    if s >= 1:
        return im.copy()
    return im.resize((round(w * s), round(h * s)), Image.LANCZOS)

# ---------------------------------------------------------------- colour science


def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055) * 255


def rgb_to_oklab(rgb):
    l = srgb_to_linear(rgb.astype(np.float64))
    M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                   [0.2119034982, 0.6806995451, 0.1073969566],
                   [0.0883024619, 0.2817188376, 0.6299787005]])
    M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                   [1.9779984951, -2.4285922050, 0.4505937099],
                   [0.0259040371, 0.7827717662, -0.8086757660]])
    lms = np.cbrt(l @ M1.T)
    return lms @ M2.T


def oklab_to_rgb(lab):
    M2i = np.array([[1.0, 0.3963377774, 0.2158037573],
                    [1.0, -0.1055613458, -0.0638541728],
                    [1.0, -0.0894841775, -1.2914855480]])
    M1i = np.array([[4.0767416621, -3.3077115913, 0.2309699292],
                    [-1.2684380046, 2.6097574011, -0.3413193965],
                    [-0.0041960863, -0.7034186147, 1.7076147010]])
    lms = (lab @ M2i.T) ** 3
    return linear_to_srgb(lms @ M1i.T)


def hexc(rgb):
    r, g, b = [int(round(float(v))) for v in np.clip(rgb, 0, 255)]
    return f'#{r:02x}{g:02x}{b:02x}'


def kmeans(X, k, iters=30, seed=7):
    rng = np.random.default_rng(seed)
    C = [X[rng.integers(len(X))]]
    for _ in range(1, k):
        d = np.min(((X[:, None, :] - np.array(C)[None]) ** 2).sum(-1), axis=1)
        C.append(X[rng.choice(len(X), p=d / d.sum())])
    C = np.array(C)
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        for j in range(k):
            if (lab == j).any():
                C[j] = X[lab == j].mean(0)
    lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
    w = np.bincount(lab, minlength=k) / len(X)
    return C, w, lab


def theme_colors(im, bird):
    """dominantColor = largest OKLab cluster outside the bird box; accentColor = most vivid
    sizeable cluster inside the bird box that differs from the background."""
    small = im.resize((160, round(160 * im.height / im.width)), Image.BILINEAR)
    a = np.asarray(small).reshape(-1, 3).astype(np.float64)
    H, W = small.height, small.width
    yy, xx = np.mgrid[0:H, 0:W]
    u, v = (xx + 0.5) / W, (yy + 0.5) / H
    x0, y0, x1, y1 = bird
    inside = ((u >= x0) & (u <= x1) & (v >= y0) & (v <= y1)).reshape(-1)
    lab = rgb_to_oklab(a)
    bgC, bgW, _ = kmeans(lab[~inside], 5)
    bg = bgC[np.argmax(bgW)]
    # birds: tighter ellipse inside the box to reduce background leakage
    cx, cy, rx, ry = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    ell = ((((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2) <= 0.85).reshape(-1)
    bl = lab[ell]
    C, w, _ = kmeans(bl, 7)
    best, bscore = None, -1
    for j in range(len(C)):
        if w[j] < 0.03:
            continue
        chroma = np.hypot(C[j, 1], C[j, 2])
        dist_bg = min(np.linalg.norm(C[j] - b) for b in bgC[bgW > 0.12])
        if dist_bg < 0.06:
            continue
        score = chroma * np.sqrt(w[j]) * (0.6 + C[j, 0])
        if score > bscore:
            best, bscore = j, score
    if best is None:
        best = int(np.argmax(np.hypot(C[:, 1], C[:, 2])))
    acc = C[best]
    # nudge accent towards a vivid representative: use the 80th-percentile-chroma pixel of that cluster
    lab_all = np.argmin(((bl[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
    members = bl[lab_all == best]
    ch = np.hypot(members[:, 1], members[:, 2])
    rep = members[np.argsort(ch)[int(0.8 * (len(ch) - 1))]]
    acc = 0.5 * acc + 0.5 * rep
    return hexc(oklab_to_rgb(bg[None])[0]), hexc(oklab_to_rgb(acc[None])[0]), {
        'bgWeights': [round(float(x), 3) for x in sorted(bgW, reverse=True)],
        'accentChroma': round(float(np.hypot(acc[1], acc[2])), 3), 'accentL': round(float(acc[0]), 3),
        'bgL': round(float(bg[0]), 3), 'bgChroma': round(float(np.hypot(bg[1], bg[2])), 3)}


def accent_from_box(im, box, pct=70):
    """Vivid plumage colour: mean OKLab of the most chromatic 30% of pixels inside a hand-placed
    box on the bird's most characteristic colour patch."""
    W, H = im.size
    x0, y0, x1, y1 = box
    crop = np.asarray(im.crop((int(x0 * W), int(y0 * H), max(int(x0 * W) + 2, int(x1 * W)),
                               max(int(y0 * H) + 2, int(y1 * H))))).reshape(-1, 3).astype(np.float64)
    lab = rgb_to_oklab(crop)
    ch = np.hypot(lab[:, 1], lab[:, 2])
    sel = lab[ch >= np.percentile(ch, pct)]
    m = np.median(sel, axis=0)
    return hexc(oklab_to_rgb(m[None])[0]), {'accentL': round(float(m[0]), 3), 'accentChroma': round(float(np.hypot(m[1], m[2])), 3),
                                            'accentHue': round(float(np.degrees(np.arctan2(m[2], m[1])) % 360), 1)}


def scrim_alpha(im, focal, side, dom_hex):
    """Minimal alpha of the label scrim (L 0.14 in the ground hue) so that the 95th-percentile OKLab L
    under the label box stays <= 0.40, worst case over 4:5 and 1:1 cards (object-fit: cover)."""
    a = np.asarray(im.resize((240, round(240 * im.height / im.width)), Image.BILINEAR)).astype(np.float64)
    H, W = a.shape[:2]
    Ai = W / H
    dom = rgb_to_oklab(np.array([[int(dom_hex[1:3], 16), int(dom_hex[3:5], 16), int(dom_hex[5:7], 16)]], float))[0]
    hue = np.arctan2(dom[2], dom[1])
    c = min(0.03, max(0.006, 0.35 * np.hypot(dom[1], dom[2])))
    scrim_rgb = oklab_to_rgb(np.array([[0.14, c * np.cos(hue), c * np.sin(hue)]]))[0]
    worst = 0.0
    for Ac in (0.8, 1.0):
        if Ai > Ac:
            vw, vh = Ac / Ai, 1.0
        else:
            vw, vh = 1.0, Ai / Ac
        ox, oy = focal[0] * (1 - vw), focal[1] * (1 - vh)
        bx0, bx1 = (0.0, 0.62) if side == 'start' else (0.38, 1.0)
        by0, by1 = 0.03, 0.45
        X0, X1 = int((ox + bx0 * vw) * W), int((ox + bx1 * vw) * W)
        Y0, Y1 = int((oy + by0 * vh) * H), int((oy + by1 * vh) * H)
        box = a[Y0:Y1, X0:X1].reshape(-1, 3)
        for alpha in np.arange(0.0, 0.95, 0.01):
            comp = box * (1 - alpha) + scrim_rgb * alpha
            L = rgb_to_oklab(comp)[:, 0]
            if np.percentile(L, 95) <= 0.40:
                break
        worst = max(worst, float(alpha))
    return round(min(0.9, max(0.5, worst)), 2)


def lqip(im):
    w = 24
    t = im.resize((w, max(1, round(w * im.height / im.width))), Image.LANCZOS)
    t = t.filter(ImageFilter.GaussianBlur(0.6))
    buf = io.BytesIO()
    t.save(buf, 'WEBP', quality=40, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def main():
    raw, out, cfgp, metap, reviewp = sys.argv[1:6]
    only = set(sys.argv[6:])
    cfg = json.load(open(cfgp))
    meta = json.load(open(metap)) if os.path.exists(metap) else {}
    tiles = []
    for slug, c in cfg.items():
        if only and slug not in only:
            continue
        im, icc_note = load_srgb(os.path.join(raw, slug, 'photo-src.jpg'))
        big = resize_long(im, 1600)
        sm = resize_long(im, 800)
        od = os.path.join(out, slug)
        os.makedirs(od, exist_ok=True)
        big.save(os.path.join(od, 'photo.webp'), 'WEBP', quality=82, method=6)
        sm.save(os.path.join(od, 'photo-sm.webp'), 'WEBP', quality=80, method=6)
        dom, acc, dbg = theme_colors(sm, c['bird'])
        if c.get('accentBox'):
            acc, adbg = accent_from_box(big, c['accentBox'], c.get('accentPct', 70))
            dbg.update(adbg)
        # same rule as the UI fallback: label opposite the bird's head
        side = c.get('labelSide') or ('end' if c['focal'][0] <= 0.5 else 'start')
        scrim = scrim_alpha(sm, c['focal'], side, dom)
        # a hand-tuned floor where the measured minimum still reads weak in the UI (pale photos)
        scrim = max(scrim, c.get('scrimMin', 0))
        meta[slug] = {
            'width': big.width, 'height': big.height, 'smWidth': sm.width, 'smHeight': sm.height,
            'sourceSize': list(im.size), 'icc': icc_note,
            'focal': {'x': c['focal'][0], 'y': c['focal'][1]}, 'birdBox': c['bird'], 'accentBox': c.get('accentBox'),
            'lqip': lqip(sm), 'dominantColor': dom, 'accentColor': acc, 'labelSide': side, 'scrim': scrim,
            'bytes': {'photo.webp': os.path.getsize(os.path.join(od, 'photo.webp')),
                      'photo-sm.webp': os.path.getsize(os.path.join(od, 'photo-sm.webp'))},
            'debug': dbg,
        }
        # review tile: 800px image with focal crosshair, bird box, label box side, swatches
        t = sm.copy()
        d = ImageDraw.Draw(t)
        fx, fy = c['focal'][0] * t.width, c['focal'][1] * t.height
        d.line([(fx - 22, fy), (fx + 22, fy)], fill=(255, 0, 255), width=3)
        d.line([(fx, fy - 22), (fx, fy + 22)], fill=(255, 0, 255), width=3)
        x0, y0, x1, y1 = c['bird']
        d.rectangle([x0 * t.width, y0 * t.height, x1 * t.width, y1 * t.height], outline=(0, 255, 255), width=2)
        d.rectangle([4, 4, 64, 34], fill=dom, outline=(255, 255, 255))
        d.rectangle([68, 4, 128, 34], fill=acc, outline=(255, 255, 255))
        d.text((134, 8), f'{slug}  dom {dom} acc {acc} side {side} scrim {scrim}', fill=(255, 255, 255))
        if c.get('accentBox'):
            ax0, ay0, ax1, ay1 = c['accentBox']
            d.rectangle([ax0 * t.width, ay0 * t.height, ax1 * t.width, ay1 * t.height], outline=(255, 255, 0), width=2)
        tiles.append(t)
        print(f'{slug:26s} {im.size} -> {big.size} {meta[slug]["bytes"]}  dom {dom} acc {acc} side {side} scrim {scrim}  lqip {len(meta[slug]["lqip"])}B  {icc_note}')
    json.dump(meta, open(metap, 'w'), indent=2)
    if tiles:
        cols = 3
        tw = 400
        ths = [round(tw * t.height / t.width) for t in tiles]
        rows = [tiles[i:i + cols] for i in range(0, len(tiles), cols)]
        rh = [max(round(tw * t.height / t.width) for t in r) for r in rows]
        sheet = Image.new('RGB', (cols * tw, sum(rh)), (10, 10, 10))
        y = 0
        for r, h in zip(rows, rh):
            for i, t in enumerate(r):
                sheet.paste(t.resize((tw, round(tw * t.height / t.width))), (i * tw, y))
            y += h
        sheet.save(reviewp)


if __name__ == '__main__':
    main()
