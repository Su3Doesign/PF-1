"""
Alpha cards and surfaces for the second half of the walk: tree crowns, bushes,
grass tufts, flowers, wisteria, ivy, lily pads, the painted ceiling of the
archive hall, plaster and beach sand.

    python tools/gen_foliage.py

Like gen_textures.py, everything is drawn from seeded noise and simple shapes,
so the output is reproducible and licence-free. Leaf cards that get tinted per
instance (broadleaf, bush, blossom, rose, wisteria) are drawn in a near-neutral
tone so the same map can become a green beech, a red maple or a white rose.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from gen_textures import OUT, spectral, worley, smooth, ramp, normal_map, blur_wrap, norm01, save_rgb, save_rgba


def rgba(c, a=255):
    return (int(np.clip(c[0], 0, 1) * 255), int(np.clip(c[1], 0, 1) * 255), int(np.clip(c[2], 0, 1) * 255), a)


def rot(pts, a, cx, cy):
    ca, sa = math.cos(a), math.sin(a)
    return [(cx + x * ca - y * sa, cy + x * sa + y * ca) for x, y in pts]


def leaf_poly(L, W, n=10, tip=1.0):
    """Ovate leaf pointing along +x from the origin."""
    up = []
    for j in range(n + 1):
        t = j / n
        w = math.sin(math.pi * t ** 0.85) ** (0.9 * tip) * W * 0.5
        up.append((t * L, w))
    lo = [(x, -y) for x, y in reversed(up)]
    return up + lo[1:]


def maple_poly(R, lobes=7, depth=0.55, seed=0):
    """Palmate leaf (Japanese maple): deep lobes fanning from the petiole."""
    r = np.random.default_rng(seed)
    pts = []
    n = lobes * 8
    for j in range(n + 1):
        a = -math.pi * 0.92 + j / n * math.pi * 1.84
        ph = (j % 8) / 8
        lobe = (1 - abs(2 * ph - 1)) ** 1.6
        rad = R * (1 - depth + depth * lobe) * (0.8 + 0.2 * math.cos(a * 0.6))
        rad *= 1 + (0.05 if j % 2 else -0.03)
        pts.append((math.cos(a - math.pi / 2) * rad, math.sin(a - math.pi / 2) * rad))
    pts.append((0, 0))
    return pts


def finish(img, w, h, name, grow=0):
    img = img.resize((w, h), Image.LANCZOS)
    if grow:
        # bleed colour into transparent texels so mip levels do not halo
        a = img.getchannel("A")
        rgb = img.convert("RGB")
        blur = rgb.filter(ImageFilter.GaussianBlur(grow))
        base = Image.composite(rgb, blur, a)
        img = Image.merge("RGBA", (*base.split(), a))
    save_rgba(img, name)


# ── sugi / cedar clump ───────────────────────────────────────────────────────
def conifer(w=512, h=512, seed=201):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    cx, cy = W * 0.5, H * 0.52
    tufts = []
    for i in range(520):
        a = r.random() * math.tau
        rr = r.random() ** 0.55
        x = cx + math.cos(a) * rr * W * 0.42
        y = cy + math.sin(a) * rr * H * 0.36
        z = (1 - rr) * 0.6 + 0.4 * r.random()
        tufts.append((x, y, math.atan2(y - cy, x - cx) + r.normal(0, 0.7), z))
    tufts.sort(key=lambda t: t[3])
    for (x, y, ang, z) in tufts:
        lit = np.clip(0.5 + 0.5 * (-(x - cx) * 0.45 - (y - cy) * 0.95) / (W * 0.4), 0, 1)
        base = np.array([0.045, 0.075, 0.04]) + np.array([0.12, 0.18, 0.07]) * (0.2 + 0.8 * z) * (0.45 + 0.75 * lit)
        L = (22 + 26 * r.random()) * S
        ex, ey = x + math.cos(ang) * L, y + math.sin(ang) * L
        d.line([(x, y), (ex, ey)], fill=rgba(base * 0.55), width=int(S * 2))
        for m in range(26):
            t = r.random()
            ox, oy = x + (ex - x) * t, y + (ey - y) * t
            side = 1 if m % 2 else -1
            na = ang + side * (0.35 + 0.6 * r.random())
            nl = (6 + 9 * r.random()) * S * (1 - 0.5 * t)
            col = base * (0.75 + 0.6 * r.random())
            d.line([(ox, oy), (ox + math.cos(na) * nl, oy + math.sin(na) * nl)], fill=rgba(col), width=max(1, int(S * 1.6)))
    finish(img, w, h, "leaves_conifer.webp", grow=3)


# ── broadleaf: Japanese maple spray (neutral, tinted per tree) ────────────────
def broadleaf(w=512, h=512, seed=211):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    cx, cy = W * 0.5, H * 0.5
    twigs = []
    for i in range(9):
        a = -math.pi / 2 + (r.random() - 0.5) * 2.6
        L = W * (0.25 + 0.2 * r.random())
        twigs.append((cx + (r.random() - 0.5) * W * 0.1, cy + H * 0.25, a, L))
    leaves = []
    for (sx, sy, a, L) in twigs:
        pts = []
        for k in range(12):
            t = k / 11
            pts.append((sx + math.cos(a + 0.3 * math.sin(t * 3)) * L * t, sy + math.sin(a + 0.3 * math.sin(t * 3)) * L * t))
        d.line(pts, fill=(70, 60, 50, 255), width=int(2.2 * S))
        for k in range(3, 12):
            px, py = pts[k]
            for side in (-1, 1):
                if r.random() < 0.35:
                    continue
                la = a + side * (0.6 + 0.6 * r.random())
                leaves.append((px, py, la, (26 + 18 * r.random()) * S, r.random()))
    for i in range(160):
        a = r.random() * math.tau
        rr = math.sqrt(r.random()) * W * 0.4
        leaves.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.85, r.random() * math.tau, (22 + 20 * r.random()) * S, r.random()))
    leaves.sort(key=lambda l: l[4])
    for (px, py, la, R, z) in leaves:
        lit = np.clip(0.5 + 0.5 * (-(px - cx) * 0.4 - (py - cy) * 0.9) / (W * 0.4), 0, 1)
        v = 0.38 + 0.42 * z * (0.6 + 0.4 * lit) + 0.08 * r.random()
        hue = np.array([1.0, 1.02, 0.94]) * (1 + (r.random() - 0.5) * np.array([0.12, 0.06, 0.12]))
        col = hue * v
        poly = rot(maple_poly(R, lobes=7, depth=0.55 + 0.1 * r.random(), seed=int(r.integers(1 << 30))), la, px, py)
        d.polygon(poly, fill=rgba(col))
        # lit half + veins
        half = [p for p in poly[: len(poly) // 2]] + [(px, py)]
        d.polygon(half, fill=rgba(col * 1.13))
        for k in range(5):
            va = la - math.pi / 2 + (k - 2) * 0.55
            d.line([(px, py), (px + math.cos(va + math.pi / 2) * R * 0.8, py + math.sin(va + math.pi / 2) * R * 0.8)], fill=rgba(col * 0.8), width=max(1, S // 2))
    finish(img, w, h, "leaves_broad.webp", grow=3)


# ── bush: small glossy leaves (azalea, boxwood) ──────────────────────────────
def bush(w=512, h=512, seed=221):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    cx, cy = W * 0.5, H * 0.5
    items = []
    for i in range(2600):
        a = r.random() * math.tau
        rr = (r.random() ** 0.5) * W * 0.46
        x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
        items.append((x, y, r.random() * math.tau, (13 + 12 * r.random()) * S, r.random() * 0.6 + 0.4 * (1 - rr / (W * 0.46))))
    items.sort(key=lambda l: l[4])
    for (x, y, a, L, z) in items:
        lit = np.clip(0.5 + 0.5 * (-(x - cx) * 0.4 - (y - cy) * 0.9) / (W * 0.45), 0, 1)
        v = 0.3 + 0.5 * z * (0.55 + 0.45 * lit) + 0.06 * r.random()
        col = np.array([0.96, 1.0, 0.9]) * v
        poly = rot(leaf_poly(L, L * 0.5), a, x, y)
        d.polygon(poly, fill=rgba(col))
        d.line([poly[0], poly[len(poly) // 2]], fill=rgba(col * 1.25), width=max(1, S // 2))
    finish(img, w, h, "leaves_bush.webp", grow=3)


# ── grass tuft ───────────────────────────────────────────────────────────────
def grass_tuft(w=512, h=512, seed=231):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    blades = []
    for i in range(420):
        x0 = W * (0.5 + r.normal(0, 0.17))
        if not 0.04 * W < x0 < 0.96 * W:
            continue
        hgt = H * (0.35 + 0.6 * r.random() * (1 - abs(x0 / W - 0.5) * 1.2))
        lean = r.normal(0, 0.35) + (x0 / W - 0.5) * 0.9
        blades.append((x0, hgt, lean, r.random()))
    blades.sort(key=lambda b: b[3])
    for (x0, hgt, lean, z) in blades:
        wd = (3.2 + 3.5 * r.random()) * S
        n = 14
        left, right = [], []
        for j in range(n + 1):
            t = j / n
            x = x0 + lean * hgt * 0.45 * t * t
            y = H - hgt * t + hgt * 0.1 * lean * lean * t * t
            ww = wd * (1 - t) ** 0.9 * 0.5 + 0.3
            left.append((x - ww, y))
            right.append((x + ww, y))
        dry = r.random() < 0.1
        tip = np.array([0.62, 0.62, 0.3]) if dry else np.array([0.34, 0.52, 0.16])
        mid = np.array([0.36, 0.34, 0.18]) if dry else np.array([0.16, 0.33, 0.09])
        k = 0.55 + 0.6 * z
        for j in range(n):
            t = (j + 0.5) / n
            col = (mid * (1 - t) + tip * t) * k * (0.35 + 0.65 * min(1, t * 2.5))
            poly = [left[j], left[j + 1], right[j + 1], right[j]]
            d.polygon(poly, fill=rgba(col))
    finish(img, w, h, "grass_tuft.webp", grow=2)


# ── flowers: blossom clusters and rose heads (neutral, tinted per bush) ──────
def blossom(w=256, h=256, seed=241):
    S = 3
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    flowers = []
    for i in range(34):
        a = r.random() * math.tau
        rr = math.sqrt(r.random()) * W * 0.36
        flowers.append((W / 2 + math.cos(a) * rr, H / 2 + math.sin(a) * rr, (16 + 12 * r.random()) * S, r.random()))
    flowers.sort(key=lambda f: f[3])
    for (x, y, R, z) in flowers:
        v = 0.62 + 0.38 * z
        rot0 = r.random() * math.tau
        for p in range(5):
            a = rot0 + p / 5 * math.tau
            petal = rot(leaf_poly(R, R * 0.8, tip=0.5), a, x, y)
            d.polygon(petal, fill=rgba(np.array([1.0, 0.97, 0.98]) * v))
            inner = rot(leaf_poly(R * 0.55, R * 0.45, tip=0.5), a, x, y)
            d.polygon(inner, fill=rgba(np.array([0.86, 0.8, 0.84]) * v))
        d.ellipse([x - R * 0.18, y - R * 0.18, x + R * 0.18, y + R * 0.18], fill=rgba(np.array([0.95, 0.8, 0.35]) * v))
        for k in range(6):
            a = r.random() * math.tau
            d.line([(x, y), (x + math.cos(a) * R * 0.45, y + math.sin(a) * R * 0.45)], fill=rgba(np.array([0.9, 0.75, 0.3]) * v), width=S)
    finish(img, w, h, "blossom.webp", grow=2)


def rose(w=256, h=256, seed=251):
    S = 3
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    heads = [(W * 0.32, H * 0.36, W * 0.22), (W * 0.7, H * 0.42, W * 0.19), (W * 0.46, H * 0.72, W * 0.21), (W * 0.8, H * 0.78, W * 0.12)]
    # leaves behind the heads (these stay green: tint is applied mostly to bright texels in the shader)
    for i in range(26):
        a = r.random() * math.tau
        x, y = W / 2 + math.cos(a) * W * 0.34 * math.sqrt(r.random()), H / 2 + math.sin(a) * H * 0.34 * math.sqrt(r.random())
        L = (40 + 30 * r.random()) * S
        poly = rot(leaf_poly(L, L * 0.55), a, x, y)
        d.polygon(poly, fill=rgba(np.array([0.1, 0.2, 0.08]) * (0.8 + 0.5 * r.random())))
    for (x, y, R) in heads:
        d.ellipse([x - R * 0.85, y - R * 0.8, x + R * 0.85, y + R * 0.8], fill=rgba(np.array([0.62, 0.55, 0.56])))
        for ring in range(9):
            f = 1 - ring / 9
            n = 5 if ring < 4 else 4
            for p in range(n):
                a = p / n * math.tau + ring * 0.9 + r.random() * 0.3
                rr = R * f
                v = 0.5 + 0.5 * (1 - f) * 0.4 + 0.45 * f * (0.6 + 0.4 * math.cos(a + 2.2))
                pet = []
                for j in range(13):
                    t = j / 12
                    aa = a - 0.9 * f + t * 1.8 * f + 0.25
                    pet.append((x + math.cos(aa) * rr * (0.8 + 0.2 * math.sin(t * math.pi)), y + math.sin(aa) * rr * 0.92 * (0.8 + 0.2 * math.sin(t * math.pi))))
                pet.append((x + math.cos(a + 0.25) * rr * 0.25, y + math.sin(a + 0.25) * rr * 0.25))
                d.polygon(pet, fill=rgba(np.array([1.0, 0.94, 0.94]) * v * (0.55 + 0.45 * f)))
                d.line(pet[:13], fill=rgba(np.array([1.0, 0.96, 0.96]) * min(1, v * 1.15)), width=S)
    finish(img, w, h, "rose.webp", grow=2)


def wisteria(w=256, h=1024, seed=261):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    for strand in range(3):
        x0 = W * (0.28 + 0.22 * strand) + r.normal(0, 8 * S)
        L = H * (0.72 + 0.26 * r.random())
        ph = r.random() * 6
        axis = [(x0 + math.sin(ph + t * 2.2) * W * 0.05 * t, t * L) for t in np.linspace(0, 1, 90)]
        d.line(axis, fill=(80, 90, 50, 255), width=2 * S)
        # leaflets at the top of the raceme
        for k in range(10):
            ax, ay = axis[int(r.random() * 10)]
            a = math.pi * (0.1 + 0.8 * r.random())
            d.polygon(rot(leaf_poly(34 * S, 12 * S), a, ax, ay), fill=rgba(np.array([0.2, 0.3, 0.12]) * (0.8 + 0.4 * r.random())))
        florets = []
        for k in range(360):
            t = r.random() ** 0.85
            ax, ay = axis[min(89, int(t * 89))]
            spread = W * 0.3 * (1 - t) ** 0.7 + 7 * S
            florets.append((ax + r.normal(0, 0.45) * spread, ay + r.normal(0, 4 * S), t, r.random()))
        florets.sort(key=lambda f: f[3])
        for (x, y, t, z) in florets:
            R = (7 + 7 * (1 - t)) * S
            v = 0.55 + 0.45 * z
            # lighter toward the tip where buds are still closed
            c = np.array([0.72, 0.62, 0.95]) * (1 - t) + np.array([0.9, 0.86, 0.98]) * t
            d.ellipse([x - R, y - R * 0.7, x + R, y + R * 0.7], fill=rgba(c * v * 0.8))
            d.ellipse([x - R * 0.6, y - R * 0.75, x + R * 0.6, y + R * 0.2], fill=rgba(c * v))
            d.ellipse([x - R * 0.25, y - R * 0.2, x + R * 0.25, y + R * 0.3], fill=rgba(np.array([0.98, 0.95, 0.7]) * v))
    finish(img, w, h, "wisteria.webp", grow=2)


def ivy(w=512, h=512, seed=271):
    S = 2
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    for vine in range(7):
        x, y = W * r.random(), H * (0.9 + 0.1 * r.random())
        a = -math.pi / 2 + r.normal(0, 0.4)
        pts = [(x, y)]
        for k in range(40):
            a += r.normal(0, 0.18)
            x += math.cos(a) * 14 * S
            y += math.sin(a) * 14 * S
            pts.append((x, y))
        d.line(pts, fill=(60, 52, 34, 255), width=2 * S)
        for k in range(1, len(pts), 2):
            px, py = pts[k]
            R = (18 + 14 * r.random()) * S
            la = r.random() * math.tau
            poly = rot(maple_poly(R, lobes=5, depth=0.3, seed=int(r.integers(1 << 30))), la, px, py)
            v = 0.7 + 0.5 * r.random()
            d.polygon(poly, fill=rgba(np.array([0.08, 0.17, 0.06]) * v))
            d.polygon(poly[: len(poly) // 2] + [(px, py)], fill=rgba(np.array([0.12, 0.24, 0.08]) * v))
            for j in range(5):
                va = la + (j - 2) * 0.6
                d.line([(px, py), (px + math.sin(va) * R * 0.75, py - math.cos(va) * R * 0.75)], fill=rgba(np.array([0.3, 0.4, 0.22]) * v), width=max(1, S // 2))
    finish(img, w, h, "ivy.webp", grow=2)


def lilypad(w=256, h=256, seed=281):
    S = 3
    W, H = w * S, h * S
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    cx, cy, R = W / 2, H / 2, W * 0.47
    notch = 0.22
    poly = [(cx, cy)]
    for j in range(121):
        a = notch + j / 120 * (math.tau - 2 * notch)
        rr = R * (1 + 0.015 * math.sin(a * 9))
        poly.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d.polygon(poly, fill=rgba((0.2, 0.34, 0.12)))
    img_a = np.asarray(img, np.float32) / 255
    yy, xx = np.mgrid[0:H, 0:W]
    rr = np.hypot(xx - cx, yy - cy) / R
    ang = np.arctan2(yy - cy, xx - cx)
    veins = np.abs(np.sin(ang * 14)) ** 40
    n = spectral(H, 1.8, seed)
    n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((W, H)), np.float32) / 255
    col = np.stack([0.14 + 0.1 * rr, 0.3 + 0.1 * rr, 0.1 + 0.02 * rr], -1)
    col = col * (0.8 + 0.4 * n[..., None]) + veins[..., None] * 0.05 * (rr[..., None] > 0.1)
    rim = smooth(0.9, 1.0, rr)[..., None]
    col = col * (1 - rim) + rim * np.array([0.35, 0.18, 0.1])
    spot = smooth(0.72, 0.8, n)[..., None]
    col = col * (1 - 0.5 * spot) + 0.5 * spot * np.array([0.45, 0.42, 0.14])
    out = np.concatenate([col, img_a[..., 3:4]], -1)
    img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), "RGBA")
    finish(img, w, h, "lilypad.webp", grow=0)


# ── the painted ceiling: a baroque sky, cranes crossing it, aged and stained ──
def fresco(n=1024, seed=291):
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    rr = np.hypot(xx - 0.5, (yy - 0.5) * 1.0) * 2
    c1 = spectral(n, 3.0, seed)
    c2 = spectral(n, 2.2, seed + 1)
    c3 = spectral(n, 1.4, seed + 2)
    dens = norm01(0.62 * c1 + 0.28 * c2 + 0.1 * c3)
    # clouds ring the opening; the centre breaks into light
    dens = dens * (0.55 + 0.6 * smooth(0.15, 0.9, rr))
    cloud = smooth(0.38, 0.62, dens)
    # light from the centre: sample density a little toward the centre to fake self-shadowing
    # light comes from the bright centre: compare with the density one step toward it
    dirx, diry = 0.5 - xx, 0.5 - yy
    dl = np.hypot(dirx, diry) + 1e-4
    step = 14
    sx = np.clip((np.arange(n)[None, :] + dirx / dl * step).astype(int), 0, n - 1)
    sy = np.clip((np.arange(n)[:, None] + diry / dl * step).astype(int), 0, n - 1)
    shift = dens[sy, sx]
    lit = blur_wrap(np.clip(0.55 + (dens - shift) * 7.0, 0, 1), 1.5)
    sky = ramp(np.clip(rr, 0, 1), [0, 0.35, 1], [(0.98, 0.88, 0.62), (0.62, 0.7, 0.78), (0.36, 0.48, 0.62)])
    ccol = ramp(lit, [0, 0.45, 1], [(0.5, 0.42, 0.5), (0.88, 0.74, 0.66), (1.0, 0.95, 0.84)])
    glow = np.exp(-(rr / 0.35) ** 2)[..., None]
    col = sky * (1 - cloud[..., None]) + ccol * cloud[..., None]
    col = col + glow * np.array([0.35, 0.26, 0.1])
    # painted cranes crossing the sky
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(img, "RGBA")
    r = np.random.default_rng(seed + 3)
    for k in range(11):
        a = r.random() * math.tau
        rad = 0.18 + 0.22 * r.random()
        x, y = n * (0.5 + math.cos(a) * rad), n * (0.5 + math.sin(a) * rad)
        s = n * (0.025 + 0.02 * r.random())
        heading = a + math.pi / 2 + r.normal(0, 0.3)
        flap = r.random() * 0.8 - 0.2
        body = [(-1.1, 0), (1.3, 0.05), (1.3, -0.05)]
        wing_l = [(0.1, 0), (-0.3, -1.4 - flap), (0.4, -1.1 - flap), (0.45, 0)]
        wing_r = [(0.1, 0), (-0.3, 1.4 + flap), (0.4, 1.1 + flap), (0.45, 0)]
        for shape, c in ((wing_l, (250, 244, 232, 235)), (wing_r, (236, 228, 214, 235)), (body, (60, 50, 44, 220))):
            pts = rot([(px * s, py * s) for px, py in shape], heading, x, y)
            d.polygon(pts, fill=c)
        d.ellipse([x + math.cos(heading) * 1.2 * s - s * 0.12, y + math.sin(heading) * 1.2 * s - s * 0.12,
                   x + math.cos(heading) * 1.2 * s + s * 0.12, y + math.sin(heading) * 1.2 * s + s * 0.12], fill=(200, 40, 30, 230))
    col = np.asarray(img, np.float32) / 255
    # brushwork, craquelure, damp and moss creeping in from the rim
    brush = spectral(n, 1.2, seed + 4, aniso=(1, 5))
    col *= (0.93 + 0.1 * brush)[..., None]
    d1, d2 = worley(n, 34, seed + 5)
    crack = smooth(0.012, 0.0, d2 - d1) * smooth(0.45, 0.7, spectral(n, 2.0, seed + 8))
    col *= (1 - 0.16 * crack)[..., None]
    damp = smooth(0.55, 0.9, spectral(n, 2.4, seed + 6) * 0.6 + rr * 0.5)
    col = col * (1 - 0.45 * damp[..., None]) + 0.45 * damp[..., None] * np.array([0.3, 0.3, 0.22]) * col
    moss = smooth(0.75, 0.95, spectral(n, 2.0, seed + 7) * 0.5 + rr * 0.55)
    col = col * (1 - moss[..., None]) + moss[..., None] * np.array([0.16, 0.22, 0.08])
    save_rgb(col, "fresco.webp", 84)


def plaster(n=1024, seed=301):
    low, mid, fine = spectral(n, 2.6, seed), spectral(n, 1.4, seed + 1), spectral(n, 0.4, seed + 2)
    v = 0.74 + 0.08 * (low - 0.5) + 0.05 * (mid - 0.5) + 0.03 * (fine - 0.5)
    col = v[..., None] * np.array([1.0, 0.93, 0.8])
    streak = smooth(0.5, 0.85, spectral(n, 2.0, seed + 3, aniso=(1, 9)))
    col = col * (1 - 0.35 * streak[..., None]) + 0.35 * streak[..., None] * np.array([0.42, 0.36, 0.26])
    ridge = 1 - np.abs(2 * spectral(n, 1.9, seed + 4) - 1)
    crack = smooth(0.975, 0.997, ridge) * smooth(0.4, 0.6, spectral(n, 2.5, seed + 5))
    col *= (1 - 0.14 * crack)[..., None]
    flake = smooth(0.7, 0.74, spectral(n, 1.8, seed + 6))
    col = col * (1 - 0.5 * flake[..., None]) + 0.5 * flake[..., None] * np.array([0.5, 0.42, 0.34])
    h = 0.5 * mid + 0.3 * fine - 0.8 * crack - 0.3 * flake
    save_rgb(col, "plaster_albedo.webp")
    save_rgb(normal_map(norm01(h), 3.5), "plaster_normal.webp", 80)


def sand(n=512, seed=311):
    fine = np.random.default_rng(seed).random((n, n))
    fine = blur_wrap(fine, 0.5)
    ripples = spectral(n, 2.2, seed + 1, aniso=(1, 6))
    low = spectral(n, 2.6, seed + 2)
    v = 0.5 + 0.1 * (low - 0.5) + 0.1 * (fine - 0.5)
    col = v[..., None] * np.array([0.95, 0.86, 0.72])
    d1, _ = worley(n, 30, seed + 3)
    peb = smooth(0.12, 0.05, d1) * (spectral(n, 1.5, seed + 4) > 0.62)
    pc = ramp(spectral(n, 0.8, seed + 5), [0, 0.5, 1], [(0.25, 0.24, 0.23), (0.45, 0.42, 0.38), (0.62, 0.58, 0.52)])
    col = col * (1 - peb[..., None]) + pc * peb[..., None]
    h = 0.4 * ripples + 0.3 * fine + 0.6 * peb
    save_rgb(col, "sand_albedo.webp")
    save_rgb(normal_map(norm01(h), 4.0), "sand_normal.webp", 80)


if __name__ == "__main__":
    conifer()
    broadleaf()
    bush()
    grass_tuft()
    blossom()
    rose()
    wisteria()
    ivy()
    lilypad()
    fresco()
    plaster()
    sand()
