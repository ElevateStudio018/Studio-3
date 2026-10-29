#!/usr/bin/env python3
"""
Bygger hero-videon (public/assets/video/hero.mp4) av kanalens YouTube-thumbnails.

Snabba klipp, Ken Burns-zoom, RGB-split, blixtar, skakningar och "text slams"
med citat ur avsnitten. Används tills ni kör hero_from_footage.mjs på riktiga
originalfiler från inspelningarna.

Kör:  python3 tools/hero/montage_from_thumbnails.py
Krav: Python 3 + Pillow + numpy, ffmpeg i PATH.
"""
import json, math, os, random, subprocess, sys, urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
OUT_DIR = ROOT / "public" / "assets" / "video"
W, H, FPS = 1280, 720, 30
ORANGE = (241, 148, 79)
random.seed(3)

channel = json.loads((ROOT / "content" / "channel.json").read_text(encoding="utf-8"))
videos = {v["id"]: v for v in channel["videos"]}
FONT_WIDE = str(HERE / "fonts" / "Archivo-ExpandedBlack.woff")
FONT_ITAL = str(HERE / "fonts" / "Archivo-BlackItalic.woff")


def thumb(vid):
    CACHE.mkdir(exist_ok=True)
    p = CACHE / f"{vid}.jpg"
    if not p.exists():
        for name in ("maxresdefault", "hqdefault"):
            try:
                urllib.request.urlretrieve(f"https://i.ytimg.com/vi/{vid}/{name}.jpg", p)
                break
            except Exception:
                continue
    return Image.open(p).convert("RGB").resize((W, H), Image.LANCZOS)


_cache = {}
def img(vid):
    if vid not in _cache:
        _cache[vid] = thumb(vid)
    return _cache[vid]


# ---------- effekter ----------
yy, xx = np.mgrid[0:H, 0:W]
VIGNETTE = (1 - 0.55 * (((xx - W / 2) / (W / 1.6)) ** 2 + ((yy - H / 2) / (H / 1.3)) ** 2)).clip(0.25, 1)[..., None].astype(np.float32)
GRAIN = [np.random.default_rng(i).normal(0, 2.5, (H, W, 1)).astype(np.float32) for i in range(6)]


def grade(arr, frame, dark=1.0):
    a = arr.astype(np.float32) / 255.0
    lum = a.mean(axis=2, keepdims=True)
    a = lum + (a - lum) * 0.82                      # lite avmättat
    a = (a - 0.5) * 1.22 + 0.5                      # kontrast
    a = a + np.array([0.035, 0.0, -0.03]) * lum      # varm ton i högdagrar
    a = a * VIGNETTE * dark
    a = a * 255.0 + GRAIN[frame % len(GRAIN)]
    return a.clip(0, 255).astype(np.uint8)


def ken_burns(im, t, z0, z1, fx, fy, dx=0.0, dy=0.0, shake=0.0):
    z = z0 + (z1 - z0) * (1 - (1 - t) ** 2)
    cw, ch = W / z, H / z
    cx = fx * W + dx * t * W + random.uniform(-shake, shake)
    cy = fy * H + dy * t * H + random.uniform(-shake, shake)
    cx = min(max(cx, cw / 2), W - cw / 2)
    cy = min(max(cy, ch / 2), H - ch / 2)
    return im.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))


def rgb_split(arr, px):
    if px <= 0:
        return arr
    out = arr.copy()
    out[:, px:, 0] = arr[:, :-px, 0]
    out[:, :-px, 2] = arr[:, px:, 2]
    return out


def flash(arr, color, alpha):
    c = np.array(color, np.float32)
    return (arr.astype(np.float32) * (1 - alpha) + c * alpha).astype(np.uint8)


def fit_font(path, text, max_w, size):
    while size > 20:
        f = ImageFont.truetype(path, size)
        if f.getbbox(text)[2] <= max_w:
            return f
        size -= 4
    return ImageFont.truetype(path, size)


def text_layer(text, path, size, color, max_w=1120, scale=1.0, sub=None):
    f = fit_font(path, text, max_w, int(size * scale))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    x, y = (W - tw) / 2 - bb[0], (H - th) / 2 - bb[1] - (24 if sub else 0)
    d.text((x + 6, y + 8), text, font=f, fill=(0, 0, 0, 160))
    d.text((x, y), text, font=f, fill=color)
    if sub:
        fs = ImageFont.truetype(FONT_WIDE, 30)
        sb = d.textbbox((0, 0), sub, font=fs)
        d.text(((W - (sb[2] - sb[0])) / 2, y + th + bb[1] + 34), sub, font=fs, fill=(255, 255, 255, 230))
    return layer


# ---------- segment ----------
frames = []  # varje element: funktion(frame_index) -> np.uint8 HxWx3


def seg_kb(vid, n, z0=1.12, z1=1.32, fx=0.5, fy=0.42, dx=0.0, dy=0.0, shake=2.0, split=3, flash_in=None, dark=1.0):
    im = img(vid)
    for i in range(n):
        def r(fi, i=i):
            t = i / max(n - 1, 1)
            a = np.asarray(ken_burns(im, t, z0, z1, fx, fy, dx, dy, shake))
            a = grade(a, fi, dark)
            if i < split:
                a = rgb_split(a, (split - i) * 7)
            if flash_in and i < 2:
                a = flash(a, flash_in, 0.65 if i == 0 else 0.3)
            return a
        frames.append(r)


def seg_flash(color, n=2):
    for i in range(n):
        frames.append(lambda fi, i=i: np.full((H, W, 3), color, np.uint8) if i == 0 else flash(np.zeros((H, W, 3), np.uint8), color, 0.5))


def seg_slam(text, n, color=ORANGE, bg_vid=None, font=FONT_WIDE, size=170, sub=None):
    bg = None
    if bg_vid:
        bg = img(bg_vid).filter(ImageFilter.GaussianBlur(14))
    for i in range(n):
        def r(fi, i=i):
            scale = 1.0 + max(0, 3 - i) * 0.09
            base = np.asarray(ken_burns(bg, i / n, 1.15, 1.25, 0.5, 0.45)) if bg else np.zeros((H, W, 3), np.uint8)
            base = (base.astype(np.float32) * 0.32).astype(np.uint8)
            canvas = Image.fromarray(base).convert("RGBA")
            canvas.alpha_composite(text_layer(text, font, size, color + (255,), scale=scale, sub=sub))
            a = grade(np.asarray(canvas.convert("RGB")), fi)
            if i < 2:
                a = rgb_split(a, 10 - i * 4)
            ox = random.randint(-6, 6) if i < 4 else 0
            return np.roll(a, ox, axis=1)
        frames.append(r)


def seg_counter(vid, n, target, label):
    im = img(vid)
    for i in range(n):
        def r(fi, i=i):
            t = i / max(n - 1, 1)
            a = np.asarray(ken_burns(im, t, 1.05, 1.22, 0.5, 0.42))
            a = (grade(a, fi).astype(np.float32) * 0.55).astype(np.uint8)
            val = int(target * min(1, (t * 1.25) ** 0.6))
            txt = f"{val:,}".replace(",", " ")
            canvas = Image.fromarray(a).convert("RGBA")
            canvas.alpha_composite(text_layer(txt, FONT_WIDE, 150, ORANGE + (255,), sub=label))
            return np.asarray(canvas.convert("RGB"))
        frames.append(r)


def mosaic(cols=10, rows=7):
    ids = [v["id"] for v in channel["videos"] if not v.get("live")]
    tw, th = W // cols * 2, H // rows * 2
    m = Image.new("RGB", (tw * cols, th * rows), (10, 10, 10))
    for k in range(cols * rows):
        t = img(ids[k % len(ids)]).resize((tw - 6, th - 6), Image.LANCZOS)
        m.paste(t, ((k % cols) * tw + 3, (k // cols) * th + 3))
    return m


MOSAIC = None


def seg_mosaic(n, z0, z1, dark0, dark1, blur=0, hold=False):
    global MOSAIC
    if MOSAIC is None:
        MOSAIC = mosaic()
    src = MOSAIC.filter(ImageFilter.GaussianBlur(blur)) if blur else MOSAIC
    MW, MH = src.size
    for i in range(n):
        def r(fi, i=i):
            t = i / max(n - 1, 1)
            e = 1 - (1 - t) ** 3 if not hold else t
            z = z0 + (z1 - z0) * e
            cw, ch = MW / z, MH / z
            cx = min(max(MW * 0.5, cw / 2), MW - cw / 2)
            cy = min(max(MH * 0.48, ch / 2), MH - ch / 2)
            frame = src.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
            dark = dark0 + (dark1 - dark0) * e
            return grade(np.asarray(frame), fi, dark)
        frames.append(r)


# ---------- tidslinje ----------
TOP = ["2D3DJt9OJxo", "R90i6AIv3zw", "dh-BWEvy2wE", "EggtcghwlAA", "qWp6O2RULRI", "VXzihX-9ocM", "yDF-JtVWPl4", "B1IAy3WvnXg"]
DUELS = ["j_U6t12ZSdw", "zFtd14n4lnM", "CdtF8EYBh68", "GewqhtFL_qg", "WsTxXWhVA3E", "oFYNhWQN3qs"]
RAPID = ["wWOaROItj-o", "_ykNB-TMR_s", "lDHvf8fvh5c", "0pEETaommmE", "-R31ScHr8IM", "G_ELomoQJx4", "9NoQo_KYV1E", "7yG501L9zGE",
         "4ipLbWJppIQ", "lEzR_Oyjx_g", "fFhLkJzEVR4", "GX_mlM87AzU", "EgpHYabhyQ8", "SoIG1bYNnOs", "m3Sm3jBB3W0", "-IIbqvriYY8",
         "kFxqT6vClZ8", "t54kzCi0VFM", "1pvFKYqPSDk", "L5LPhi7f_8o"]

seg_mosaic(66, 2.6, 2.2, 0.22, 0.30, blur=6)                 # 0–2.2 s: mörk bakgrund för slogan
seg_flash((255, 255, 255))
for k, vid in enumerate(TOP):                                    # 2.3–7 s: de största avsnitten
    seg_kb(vid, 18, *((1.08, 1.34) if k % 2 == 0 else (1.36, 1.1)), fx=0.5, fy=0.4,
           dx=(0.04 if k % 3 == 0 else -0.03), shake=3, flash_in=ORANGE if k % 2 else None)
seg_slam("1 MOT 20.", 14, bg_vid="2D3DJt9OJxo")
for k, vid in enumerate(DUELS):                                  # dueller
    seg_kb(vid, 11, 1.18, 1.05, 0.5, 0.42, shake=5, split=4, flash_in=(255, 255, 255) if k % 2 == 0 else None)
for k, word in enumerate(["VÄNSTER.", "HÖGER.", "VÄNSTER.", "HÖGER."]):
    seg_slam(word, 7, color=ORANGE if k % 2 == 0 else (255, 255, 255))
    seg_kb(RAPID[k], 5, 1.3, 1.4, 0.5, 0.4, shake=8, split=2)
for vid, quote in [("B1IAy3WvnXg", "”GAPA SVENNEJÄVEL”"), ("-R31ScHr8IM", "”SKICKA BARA UT FOLK!”"), ("nieUt0p7DXA", "”NI HAR SLAKTAT A-KASSAN”")]:
    seg_slam(quote, 17, color=(255, 255, 255), bg_vid=vid, font=FONT_ITAL, size=110)
    seg_kb(vid, 9, 1.25, 1.12, 0.5, 0.4, shake=4, split=3, flash_in=ORANGE)
for k, vid in enumerate(RAPID[4:]):                              # acceleration
    seg_kb(vid, 4 if k < 10 else 3, 1.3, 1.22, 0.5, 0.42, shake=10, split=2)
    if k in (5, 11):
        seg_flash(ORANGE, 2)
seg_slam("INGET MANUS.", 14, color=(255, 255, 255))
seg_slam("INGEN FLYKT.", 14)
seg_counter("2D3DJt9OJxo", 40, 1000000, "VISNINGAR · JAN EMANUEL VS 20 MILJÖPARTISTER")
seg_flash((255, 255, 255))
seg_mosaic(54, 3.4, 1.0, 0.9, 0.5)                               # väggen av debatter
seg_mosaic(70, 1.0, 1.06, 0.5, 0.34, hold=True)                  # håll: här visas slutkortet

# ---------- rendera ----------
OUT_DIR.mkdir(parents=True, exist_ok=True)
out = OUT_DIR / "hero.mp4"
print(f"Renderar {len(frames)} bildrutor ({len(frames) / FPS:.1f} s) -> {out}")
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
       "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-tune", "film", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(out)]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
last = None
for fi, fn in enumerate(frames):
    a = fn(fi)
    proc.stdin.write(np.ascontiguousarray(a).tobytes())
    if fi == len(frames) - 1:
        last = a
proc.stdin.close()
proc.wait()
Image.fromarray(last).save(OUT_DIR / "hero-poster.jpg", quality=82)
# Mobilversion (lägre upplösning och bitrate)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out), "-vf", "scale=854:480", "-c:v", "libx264", "-preset", "slow",
                "-crf", "31", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(OUT_DIR / "hero-mobile.mp4")], check=True)
for f in sorted(OUT_DIR.iterdir()):
    print(f"  {f.name}: {f.stat().st_size / 1e6:.2f} MB")
