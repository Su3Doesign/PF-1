"""
Procedural, tileable textures for the forest: moss, concrete, stone, lacquered
wood, cedar bark, forest floor, ferns, cedar sprays, hanging moss, water
normals and a utility noise map.

    python tools/gen_textures.py

Everything is generated from seeded noise, so the output is reproducible and
carries no third-party licence. Writes WebP files to public/assets/tex/.
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "tex"
OUT.mkdir(parents=True, exist_ok=True)


# ── noise primitives (all periodic, so every map tiles) ─────────────────────
def norm01(a, lo=0.5, hi=99.5):
    p0, p1 = np.percentile(a, [lo, hi])
    return np.clip((a - p0) / (p1 - p0 + 1e-9), 0, 1)


def spectral(n, beta, seed, aniso=(1.0, 1.0), fmin=0.0, fmax=None):
    r = np.random.default_rng(seed)
    F = np.fft.fft2(r.standard_normal((n, n)))
    fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = 1.0 / f ** beta
    if fmin:
        amp *= 1 - np.exp(-(f / fmin) ** 2)
    if fmax:
        amp *= np.exp(-(f / fmax) ** 2)
    F *= amp
    F[0, 0] = 0
    return norm01(np.real(np.fft.ifft2(F)))


def worley(n, cells, seed):
    r = np.random.default_rng(seed)
    pts = r.random((cells, cells, 2))
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32) / n * cells
    cx, cy = np.floor(xs).astype(int), np.floor(ys).astype(int)
    d1 = np.full((n, n), 9.0, np.float32)
    d2 = np.full((n, n), 9.0, np.float32)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            gx, gy = cx + ox, cy + oy
            p = pts[gy % cells, gx % cells]
            d = np.sqrt((xs - gx - p[..., 0]) ** 2 + (ys - gy - p[..., 1]) ** 2)
            d2 = np.where(d < d1, d1, np.minimum(d2, d))
            d1 = np.minimum(d1, d)
    return d1, d2


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ramp(t, stops, cols):
    cols = np.array(cols, np.float32)
    return np.stack([np.interp(t, stops, cols[:, i]) for i in range(3)], -1)


def normal_map(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    gr = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -gx * strength, gr * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5


def blur_wrap(a, radius):
    """Gaussian blur that respects tiling (FFT convolution)."""
    n = a.shape[0]
    f = np.fft.fftfreq(n)
    g = np.exp(-2 * (math.pi * radius) ** 2 * (f[None, :] ** 2 + f[:, None] ** 2))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., i]) * g)) for i in range(a.shape[2])], -1)


def save_rgb(a, name, q=82):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(OUT / name, "WEBP", quality=q, method=6)
    print("wrote", name)


def save_rgba(img, name, q=86):
    img.save(OUT / name, "WEBP", quality=q, method=6)
    print("wrote", name)


# ── moss ─────────────────────────────────────────────────────────────────────
def moss(n=1024):
    fine = spectral(n, 0.35, 3)
    f2 = spectral(n, 0.9, 7)
    mid = spectral(n, 1.6, 4)
    low = spectral(n, 2.8, 5)
    dA, _ = worley(n, 44, 1)
    dB, _ = worley(n, 96, 2)
    dC, _ = worley(n, 17, 8)
    cA = (1 - np.clip(dA / 0.85, 0, 1)) ** 1.1
    cB = 1 - np.clip(dB / 0.85, 0, 1)
    cC = (1 - np.clip(dC / 0.95, 0, 1)) ** 0.8
    w = spectral(n, 2.4, 9)
    cush = cA * (0.35 + 0.65 * w) + 0.8 * cB * (1 - w) + 0.35 * cC
    h = norm01(0.34 * norm01(cush) + 0.36 * fine + 0.18 * f2 + 0.12 * mid)
    t = np.clip(h * 0.8 + 0.2 * fine, 0, 1)
    col = ramp(t, [0, 0.28, 0.6, 0.85, 1],
               [(0.025, 0.035, 0.014), (0.08, 0.12, 0.035), (0.19, 0.27, 0.07), (0.33, 0.42, 0.12), (0.50, 0.57, 0.22)])
    warm = smooth(0.55, 0.9, low)[..., None]
    cool = smooth(0.45, 0.1, low)[..., None]
    col = col * (1 - 0.4 * warm) + 0.4 * warm * col * np.array([1.3, 1.1, 0.72])
    col = col * (1 - 0.3 * cool) + 0.3 * cool * col * np.array([0.72, 1.0, 0.92])
    dead = smooth(0.8, 0.94, spectral(n, 2.2, 6))[..., None]
    col = col * (1 - 0.5 * dead) + 0.5 * dead * np.array([0.28, 0.22, 0.11]) * (0.6 + 0.6 * t[..., None])
    tips = smooth(0.88, 0.98, fine)[..., None] * smooth(0.55, 0.85, h)[..., None]
    col = col + tips * np.array([0.08, 0.10, 0.03])
    save_rgb(col, "moss_albedo.webp", 82)
    save_rgb(normal_map(h, 6.0), "moss_normal.webp", 80)
    small_css = Image.fromarray((np.clip(col * 1.2, 0, 1) * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS)
    small_css.save(OUT / "moss_type.webp", "WEBP", quality=80, method=6)
    print("wrote moss_type.webp")
    return col, h


# ── concrete ─────────────────────────────────────────────────────────────────
def concrete(n=1024):
    low, mid, fine = spectral(n, 2.8, 11), spectral(n, 1.5, 12), spectral(n, 0.35, 13)
    v = 0.47 + 0.11 * (low - 0.5) + 0.06 * (mid - 0.5) + 0.05 * (fine - 0.5)
    streak = spectral(n, 2.0, 14, aniso=(1, 7))
    v -= 0.16 * smooth(0.52, 0.86, streak)
    pits = smooth(0.965, 0.99, spectral(n, 0.15, 15))
    v -= 0.18 * pits
    ridge = 1 - np.abs(2 * spectral(n, 1.9, 16) - 1)
    crack = smooth(0.975, 0.997, ridge) * smooth(0.35, 0.6, spectral(n, 2.5, 17))
    v -= 0.22 * crack
    col = v[..., None] * np.array([1.0, 0.985, 0.95])
    h = 0.45 * mid + 0.35 * fine - 0.9 * pits - 0.7 * crack
    save_rgb(col, "concrete_albedo.webp")
    save_rgb(normal_map(norm01(h), 5.0), "concrete_normal.webp", 80)


# ── stone (lanterns, rocks) ──────────────────────────────────────────────────
def stone(n=1024):
    low, mid = spectral(n, 2.6, 21), spectral(n, 1.3, 22)
    white = np.random.default_rng(23).random((n, n))
    v = 0.38 + 0.12 * (low - 0.5) + 0.07 * (mid - 0.5)
    v -= 0.12 * (white > 0.93)
    v += 0.10 * (white < 0.035)
    v = blur_wrap(v, 0.6)
    col = v[..., None] * np.array([1.0, 0.99, 0.955])
    lich = smooth(0.66, 0.76, spectral(n, 1.7, 24)) * (0.55 + 0.45 * smooth(0.3, 0.7, spectral(n, 0.7, 25)))
    col = col * (1 - 0.7 * lich[..., None]) + 0.7 * lich[..., None] * np.array([0.56, 0.58, 0.46])
    h = 0.5 * mid + 0.25 * low + 0.25 * blur_wrap(white, 0.8) + 0.3 * lich
    save_rgb(col, "stone_albedo.webp")
    save_rgb(normal_map(norm01(h), 6.0), "stone_normal.webp", 80)


# ── lacquered wood (torii) ───────────────────────────────────────────────────
def lacquer(n=1024):
    grain = spectral(n, 1.5, 31, aniso=(1, 12))
    fine = spectral(n, 0.6, 32, aniso=(1, 6))
    wood = ramp(np.clip(0.7 * grain + 0.3 * fine, 0, 1), [0, 0.5, 1],
                [(0.18, 0.16, 0.14), (0.33, 0.30, 0.27), (0.46, 0.43, 0.39)])
    peel = 0.55 * spectral(n, 1.6, 33, fmin=0.01) + 0.3 * spectral(n, 2.4, 37) + 0.15 * spectral(n, 0.9, 34)
    paint = smooth(0.66, 0.62, norm01(peel))
    edge = smooth(0.0, 0.25, paint) * smooth(1.0, 0.75, paint)
    tone = 0.85 + 0.25 * (spectral(n, 2.4, 35) - 0.5)
    red = np.array([0.60, 0.10, 0.05]) * tone[..., None]
    dirt = smooth(0.5, 0.9, spectral(n, 2.0, 36, aniso=(1, 5)))[..., None]
    red = red * (1 - 0.45 * dirt)
    col = wood * (1 - paint[..., None]) + red * paint[..., None]
    col *= (1 - 0.35 * edge[..., None])
    h = 0.35 * paint + 0.4 * grain * (1 - paint) + 0.1 * fine
    save_rgb(col, "lacquer_albedo.webp")
    save_rgb(normal_map(norm01(h), 5.0), "lacquer_normal.webp", 80)


# ── cedar bark ───────────────────────────────────────────────────────────────
def bark(n=1024):
    strips = spectral(n, 1.1, 41, aniso=(1, 16))
    ridges = 1 - np.abs(2 * spectral(n, 1.7, 42, aniso=(1, 9)) - 1)
    breaks = spectral(n, 1.5, 43, aniso=(1, 3))
    h = norm01(0.55 * ridges + 0.35 * strips + 0.1 * breaks)
    col = ramp(h, [0, 0.25, 0.6, 1],
               [(0.05, 0.03, 0.02), (0.16, 0.09, 0.06), (0.30, 0.19, 0.13), (0.44, 0.35, 0.29)])
    grey = smooth(0.55, 0.85, spectral(n, 2.4, 44))[..., None]
    col = col * (1 - 0.5 * grey) + 0.5 * grey * (col.mean(-1, keepdims=True) * np.array([1.05, 1.05, 1.0]))
    lich = smooth(0.68, 0.78, spectral(n, 1.6, 45, aniso=(1, 2))) * (0.5 + 0.5 * smooth(0.3, 0.7, spectral(n, 0.7, 46)))
    col = col * (1 - 0.6 * lich[..., None]) + 0.6 * lich[..., None] * np.array([0.45, 0.52, 0.30])
    save_rgb(col, "bark_albedo.webp")
    save_rgb(normal_map(h, 9.0), "bark_normal.webp", 80)


# ── rusted metal (racks, monitor housings) ───────────────────────────────────
def metal(n=512):
    low, mid, fine = spectral(n, 2.5, 51), spectral(n, 1.4, 52), spectral(n, 0.4, 53)
    base = (0.16 + 0.05 * (mid - 0.5) + 0.03 * (fine - 0.5))[..., None] * np.array([1.0, 1.02, 1.05])
    rust = smooth(0.5, 0.78, 0.45 * low + 0.35 * spectral(n, 1.6, 55, fmin=0.02) + 0.2 * fine)
    streak = smooth(0.55, 0.85, spectral(n, 1.8, 54, aniso=(1, 8)))
    rust = np.clip(rust + 0.5 * streak * rust, 0, 1)[..., None]
    rc = ramp(fine, [0, 0.5, 1], [(0.18, 0.07, 0.03), (0.36, 0.16, 0.06), (0.52, 0.28, 0.11)])
    col = base * (1 - rust) + rc * rust
    h = 0.5 * rust[..., 0] + 0.3 * fine
    save_rgb(col, "metal_albedo.webp")
    save_rgb(normal_map(norm01(h), 4.0), "metal_normal.webp", 86)


# ── forest floor ─────────────────────────────────────────────────────────────
def ground(moss_col, n=1024):
    soil = spectral(n, 2.2, 61)
    col = ramp(soil, [0, 1], [(0.07, 0.05, 0.035), (0.17, 0.12, 0.08)])
    height = 0.3 * soil
    S = 2
    N = n * S
    leaf_rgb = Image.new("RGB", (N, N), (0, 0, 0))
    leaf_a = Image.new("L", (N, N), 0)
    leaf_h = Image.new("L", (N, N), 0)
    dc, da, dh = ImageDraw.Draw(leaf_rgb), ImageDraw.Draw(leaf_a), ImageDraw.Draw(leaf_h)
    r = np.random.default_rng(62)
    palette = [(0.34, 0.20, 0.09), (0.45, 0.27, 0.10), (0.26, 0.15, 0.08), (0.22, 0.20, 0.10), (0.52, 0.33, 0.14), (0.18, 0.14, 0.09)]
    for i in range(2600):
        cx, cy = r.random() * N, r.random() * N
        L = (10 + r.random() * 26) * S
        W = L * (0.32 + r.random() * 0.2)
        a = r.random() * math.tau
        c = palette[r.integers(len(palette))]
        k = 0.7 + r.random() * 0.5
        rgb = tuple(int(min(1, x * k) * 255) for x in c)
        pts = []
        for j in range(14):
            t = j / 13 * math.pi
            x = math.cos(t) * L * 0.5
            y = math.sin(t) * W * 0.5 * (1 - 0.3 * math.cos(t))
            pts.append((x, y))
        pts += [(p[0], -p[1]) for p in reversed(pts)]
        ca, sa = math.cos(a), math.sin(a)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                P = [(cx + ox + x * ca - y * sa, cy + oy + x * sa + y * ca) for x, y in pts]
                if max(p[0] for p in P) < 0 or min(p[0] for p in P) > N or max(p[1] for p in P) < 0 or min(p[1] for p in P) > N:
                    continue
                dc.polygon(P, fill=rgb)
                da.polygon(P, fill=255)
                dh.polygon(P, fill=int(120 + 100 * r.random()))
                dc.line([(cx + ox - L * 0.5 * ca, cy + oy - L * 0.5 * sa), (cx + ox + L * 0.5 * ca, cy + oy + L * 0.5 * sa)],
                        fill=tuple(max(0, v - 30) for v in rgb), width=S)
    for i in range(900):
        cx, cy = r.random() * N, r.random() * N
        L = (8 + r.random() * 16) * S
        a = r.random() * math.tau
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                p0 = (cx + ox, cy + oy)
                p1 = (cx + ox + L * math.cos(a), cy + oy + L * math.sin(a))
                dc.line([p0, p1], fill=(52, 38, 22), width=S)
                da.line([p0, p1], fill=255, width=S)
                dh.line([p0, p1], fill=160, width=S)
    leaf_rgb = np.asarray(leaf_rgb.resize((n, n), Image.LANCZOS), np.float32) / 255
    la = np.asarray(leaf_a.resize((n, n), Image.LANCZOS), np.float32)[..., None] / 255
    lh = np.asarray(leaf_h.resize((n, n), Image.LANCZOS), np.float32) / 255
    shade = 0.75 + 0.5 * spectral(n, 1.2, 63)[..., None]
    col = col * (1 - la) + leaf_rgb * shade * la
    height = height * (1 - la[..., 0]) + (0.3 + 0.5 * lh) * la[..., 0]
    mm = smooth(0.58, 0.75, spectral(n, 2.6, 64))[..., None]
    col = col * (1 - mm) + moss_col * 0.9 * mm
    height = height * (1 - mm[..., 0]) + (0.4 + 0.2 * spectral(n, 0.6, 65)) * mm[..., 0]
    save_rgb(col, "ground_albedo.webp")
    save_rgb(normal_map(norm01(blur_wrap(height, 0.7)), 6.0), "ground_normal.webp", 80)


# ── alpha cards: fern frond, cedar spray, hanging moss ───────────────────────
def fern(w=512, h=1024, seed=71, name="fern.webp"):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    base = np.array([W * 0.5, H * 0.99])
    tip = np.array([W * 0.5 + W * 0.05, H * 0.02])

    def rachis(t):
        p = base + (tip - base) * t
        p[0] += math.sin(t * math.pi) * W * 0.035
        return p

    pairs = 30
    for side in (-1, 1):
        for i in range(pairs):
            t = 0.06 + 0.92 * i / pairs + (0.012 if side > 0 else 0)
            env = math.sin(math.pi * min(1, t * 1.05)) ** 0.75 * (1 - 0.35 * t)
            L = W * 0.46 * env
            if L < 6:
                continue
            p0 = rachis(t)
            ang = math.radians(62 + 18 * t + r.normal(0, 3))
            dirx, diry = side * math.sin(ang), -math.cos(ang)
            segs = 16
            axis = []
            for j in range(segs + 1):
                s = j / segs
                bend = 0.18 * s * s
                ax = p0[0] + dirx * L * s
                ay = p0[1] + diry * L * s + bend * L
                axis.append((ax, ay))
            upper, lower = [], []
            lobes = 7 + int(6 * env)
            for j, (ax, ay) in enumerate(axis):
                s = j / segs
                wd = L * 0.12 * (1 - s) ** 0.55 * (0.62 + 0.38 * abs(math.sin(s * math.pi * lobes)))
                nx, ny = -diry, dirx
                upper.append((ax + nx * wd, ay + ny * wd))
                lower.append((ax - nx * wd, ay - ny * wd))
            poly = upper + list(reversed(lower))
            g = 0.75 + 0.35 * r.random()
            dark = (int(28 * g), int(74 * g), int(22 * g), 255)
            light = (int(70 * g), int(128 * g), int(38 * g), 255)
            d.polygon(poly, fill=dark)
            inner = [(ax + (ux - ax) * 0.55, ay + (uy - ay) * 0.55) for (ax, ay), (ux, uy) in zip(axis, upper)]
            d.polygon(inner + list(reversed(axis)), fill=light)
            d.line(axis, fill=(int(96 * g), int(140 * g), int(50 * g), 255), width=max(1, S))
    pts = [tuple(rachis(t)) for t in np.linspace(0, 1, 60)]
    d.line(pts, fill=(58, 70, 28, 255), width=4 * S)
    img = img.resize((w, h), Image.LANCZOS)
    save_rgba(img, name)


def cedar(w=512, h=512, seed=81):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)

    def spray(x, y, ang, L, depth):
        steps = max(6, int(L / (6 * S)))
        px, py = x, y
        for i in range(steps):
            t = (i + 1) / steps
            a = ang + 0.18 * math.sin(t * 4 + depth * 1.7)
            nx, ny = px + math.cos(a) * L / steps, py + math.sin(a) * L / steps
            g = 0.65 + 0.55 * r.random()
            d.line([(px, py), (nx, ny)], fill=(int(34 * g), int(52 * g), int(24 * g), 255), width=max(1, int(S * (1 + depth * 0.6))))
            taper = (1 - t * 0.6)
            for k in range(6):
                side = 1 if k % 2 else -1
                sa = a + side * (0.75 + 0.5 * r.random())
                sl = (9 + 13 * r.random()) * S * taper * (0.6 + 0.2 * depth)
                c = [(24, 66, 30), (36, 88, 36), (58, 108, 42), (20, 52, 26)][r.integers(4)]
                c = tuple(int(v * g) for v in c) + (255,)
                ox, oy = nx - math.cos(a) * r.random() * L / steps, ny - math.sin(a) * r.random() * L / steps
                d.line([(ox, oy), (ox + math.cos(sa) * sl, oy + math.sin(sa) * sl)], fill=c, width=max(1, int(S * 1.4)))
            if depth > 0 and i % 2 == 1 and t < 0.85:
                side = 1 if r.random() > 0.5 else -1
                spray(nx, ny, a + side * (0.55 + 0.35 * r.random()), L * (0.5 - 0.3 * t), depth - 1)
            px, py = nx, ny

    for k in range(4):
        spray(W * 0.04, H * (0.22 + 0.18 * k) + r.normal(0, 20), -0.12 + 0.08 * k + r.normal(0, 0.05), W * (0.85 + 0.1 * r.random()), 2)
    img = img.resize((w, h), Image.LANCZOS)
    save_rgba(img, "cedar.webp")


def hanging_moss(w=256, h=1024, seed=91):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    for i in range(90):
        x = W * (0.1 + 0.8 * r.random())
        L = H * (0.3 + 0.68 * r.random())
        ph = r.random() * 6
        pts = [(x + math.sin(ph + y / (60 * S)) * 8 * S * (y / L), y) for y in np.linspace(0, L, 60)]
        g = 0.75 + 0.4 * r.random()
        for j in range(len(pts) - 1):
            a = int(255 * (1 - j / len(pts)) ** 0.5)
            d.line([pts[j], pts[j + 1]], fill=(int(92 * g), int(112 * g), int(70 * g), a), width=S)
            if r.random() < 0.18:
                dx = (r.random() - 0.5) * 16 * S
                d.line([pts[j], (pts[j][0] + dx, pts[j][1] + 10 * S)], fill=(int(80 * g), int(100 * g), int(64 * g), a // 2), width=S)
    img = img.resize((w, h), Image.LANCZOS)
    save_rgba(img, "hanging_moss.webp")


# ── water normals + utility noise ────────────────────────────────────────────
def water(n=512):
    h = 0.6 * spectral(n, 2.1, 101, fmin=0.004) + 0.4 * spectral(n, 1.4, 102, aniso=(1, 1.6), fmin=0.01)
    save_rgb(normal_map(norm01(h), 6.0), "water_normal.webp", 90)


def util_noise(n=256):
    a = spectral(n, 2.0, 111)
    b = spectral(n, 1.0, 112)
    d1, _ = worley(n, 8, 113)
    c = norm01(d1)
    w = np.random.default_rng(114).random((n, n))
    arr = np.stack([a, b, c, w], -1)
    Image.fromarray((arr * 255 + 0.5).astype(np.uint8), "RGBA").save(OUT / "noise.png")
    print("wrote noise.png")


if __name__ == "__main__":
    mcol, _ = moss()
    concrete()
    stone()
    lacquer()
    bark()
    metal()
    ground(mcol)
    fern()
    fern(seed=72, name="fern2.webp")
    pass
    hanging_moss()
    water()
    util_noise()
