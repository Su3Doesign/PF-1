"""
Builds src/data/content.json and the thumbnails / atlases the 3D world uses.

    python tools/build_content.py

Add a new piece of work by adding its file to public/assets/images (WebP) or
public/assets/videos (H.264 MP4), listing it below, and running this script.
Video posters are extracted automatically when ffmpeg is available
(pip install imageio-ffmpeg).
"""
import json
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / "public"
IMG = "assets/images/"
VID = "assets/videos/"
POS = "assets/posters/"
THUMB = PUB / "assets" / "thumbs"


def seq(prefix, a, b, suffix=".webp", pad=False):
    return [f"{prefix}{(str(i).zfill(2) if pad else str(i))}{suffix}" for i in range(a, b + 1)]


WORLDS = [
    {
        "id": "roman-no-yoake",
        "title": "Rōman no Yoake",
        "jp": "浪漫の夜明け",
        "sub": "Pagoda, first light, and a sea that has not started talking yet",
        "year": "2025",
        "note": "The hour before anything is awake. I wanted the fog to do the modelling — the pagoda barely earns its silhouette, the treeline dissolves, and the only hard edge in the frame is the sun clearing the ridge. Five renders, one sunrise, roughly four hundred rejected sun angles.",
        "tags": ["Maya", "Arnold", "Substance", "After Effects", "Fog volumes", "5 renders"],
        "plate": IMG + "japa-render-1.webp",
        "alt": "A pagoda above a misty treeline at sunrise",
        "shots": [
            [IMG + "japa-render-3.webp", "Pink hour"],
            [IMG + "japa-render-5.webp", "Eclipse"],
            [VID + "Japa-Turntable-1.mp4", "Turntable"],
            [VID + "Japa-Panningshot-2.mp4", "Panning shot"],
            [IMG + "japa-render-2.webp", "Tower, night sea"],
            [IMG + "japa-render-4.webp", "Grass, moon"],
        ],
    },
    {
        "id": "fudo-myo-o",
        "title": "Fudō Myō-ō",
        "jp": "不動明王",
        "sub": "A forest shrine at the hour the candles take over from the sun",
        "year": "2025",
        "note": "Built around a single practical light. Everything else in the scene is either reflecting that candle or hiding from it. The foxes have stopped expecting visitors but they still keep watch, and the moss has opinions about where the water goes.",
        "tags": ["Maya", "ZBrush", "Arnold", "Substance", "Practical light", "Turntable"],
        "plate": IMG + "fudomyo-render-1.webp",
        "alt": "A forest shrine lit by candlelight through the trees",
        "shots": [
            [VID + "Fudomyo-Turntable-1.mp4", "Turntable"],
            [IMG + "fudomyo-render-mobile-1.webp", "Vertical cut"],
            [IMG + "fudomyo-render-2.webp", "Approach"],
        ],
    },
    {
        "id": "koi-pond",
        "title": "Koi Pond",
        "jp": "錦鯉の池",
        "sub": "Bioluminescence, autumn, and light that comes from under the water",
        "year": "2024",
        "note": "The rule for this one: no light from above. Everything is lit from inside the water, so the caustics run the wrong way up the rocks and the leaves get their colour from below. Rendered twice — once in high summer, once after the maples turned.",
        "tags": ["Maya", "Arnold", "Substance", "Photoshop", "Caustics", "Two seasons"],
        "plate": IMG + "koipond-render-2.webp",
        "alt": "A glowing teal pond surrounded by rocks and palms at night",
        "shots": [
            [IMG + "koipond-render-1.webp", "Shallows"],
            [IMG + "koipond-render-4.webp", "Overgrowth"],
            [IMG + "koipond-render-5.webp", "Wide, night"],
            [IMG + "koipond-render-3.webp", "Autumn pass"],
            [IMG + "koipond-render-6.webp", "Last light"],
        ],
    },
]

STEPS = [
    ["Reference", "Look at the real thing for longer than is comfortable. Then keep looking."],
    ["Blockout", "Grey boxes, honest proportions. If it is boring in clay it will be boring in colour."],
    ["Hard-surface", "Edges that hold a highlight. Bevels you could run a thumb along."],
    ["Sculpt", "Wear where hands have been. Nothing in a lived world is factory-new."],
    ["Texture", "A working life: dust settles, paint chips, water always stains downward."],
    ["Light", "One key that tells the truth. Everything after it is support and flattery."],
    ["Comp", "Grade it, then remove half of what you just added."],
]

CLIENTS = [
    {"name": "Classic Partnership", "group": "Agency", "role": "Calendar campaigns · visual design", "files": seq(IMG + "tcp-calendarposts-", 1, 13)},
    {"name": "Midea Canada", "group": "Agency", "role": "Social overlays · PWHL · Pelonis", "files": seq(IMG + "midea-posts-", 1, 6) + seq(VID + "midea-overlays-", 1, 8, ".mp4") + [IMG + "midea-PWHL-banner.webp", IMG + "midea-pelonis-banner-1.webp"]},
    {"name": "Eureka", "group": "Agency", "role": "Product social · reels", "files": seq(IMG + "midea-eureka-overlays-", 1, 4) + seq(VID + "midea-eureka-", 1, 3, ".mp4")},
    {"name": "Comfee", "group": "Agency", "role": "Social campaign", "files": [IMG + "midea-comfee-post-01.webp", IMG + "midea-comfee-post-02.webp"] + seq(VID + "midea-comfee-social-", 1, 2, ".mp4")},
    {"name": "Home Depot Canada", "group": "Agency", "role": "RAC advertisements", "files": seq(IMG + "midea-rac-advertisements-", 1, 8, ".webp", True)},
    {"name": "KD Displays", "group": "Agency", "role": "Retail display content", "files": seq(IMG + "kddisplays-posts-", 1, 10) + [VID + "kddisplays-posts-1.mp4"]},
    {"name": "GC Burger", "group": "Agency", "role": "Campaign · five locations", "files": seq(IMG + "gcburger-campaign-", 1, 28)},
    {"name": "Investohome PR", "group": "Agency", "role": "Google ads · social · web", "files": seq(IMG + "investohome-googleads-banners-", 1, 5) + seq(IMG + "investohome-socialads-banners-", 1, 5) + seq(IMG + "investohome-websitebanner-", 1, 4) + [VID + "investohome-outro-1.mp4"]},
    {"name": "Amaya Restaurant", "group": "Agency", "role": "Calendar posts · reel", "files": seq(IMG + "amayarestaurant-calendarposts-", 1, 5) + [VID + "amayarestaurant-reel-1.mp4"]},
    {"name": "VS Design Studio", "group": "Studio", "role": "Event & brand posts", "files": seq(IMG + "vsdesignstudio-posts-", 1, 4) + [VID + "vsdesignstudio-event-1.mp4"]},
    {"name": "nxtwave", "group": "Freelance", "role": "Slide system", "files": seq(IMG + "nxtwave-slide-", 1, 7)},
    {"name": "Tamada Media", "group": "Freelance", "role": "Branding", "files": [IMG + "tamadamedia-branding-1.webp", VID + "tamadamedia-branding-2.mp4"]},
    {"name": "Lakshmi Bakers", "group": "Freelance", "role": "Identity · via Tamada Media", "files": seq(IMG + "tamadamedia-laxmibakery-", 1, 3)},
    {"name": "Inertia Productions", "group": "Freelance", "role": "Motion graphics", "files": [VID + "motiongraphicsmozilla-3.mp4", VID + "motiongraphicsnews-1.mp4", VID + "motiongraphicsnews-2.mp4"]},
    {"name": "LLT Overseas", "group": "Freelance", "role": "Illustration", "files": [IMG + "overseas-illustration-1.webp"]},
    {"name": "AZ Coffee", "group": "Freelance", "role": "Via Coalition Technologies · under NDA", "files": []},
]

STUDIES = [
    ["1.webp", "Magma", "Beverage identity"],
    ["3.webp", "Magma", "Can · product viz"],
    ["2.webp", "Magma", "Strawberry key art"],
    ["10.webp", "Nike Phantom", "Sport campaign"],
    ["12.webp", "Reebok", "Sport campaign"],
    ["7.webp", "Messi × Ronaldo", "Match poster"],
    ["16.webp", "Cloudbank", "Sky study"],
    ["8.webp", "Mustang", "Automotive"],
    ["octavia-night.webp", "Octavia", "Automotive · night"],
    ["octavia-forest.webp", "Octavia", "Automotive · forest"],
    ["car-render-2.webp", "Supra", "Studio viz"],
    ["car-render-1.webp", "Supra", "Three-quarter"],
    ["car-render-3.webp", "Supra", "Rear detail"],
    ["car-render-4.webp", "Supra", "Profile"],
    ["car2-shadowmatte-1.webp", "Ferrari", "Shadow matte"],
    ["11.webp", "Titan", "Product advert"],
    ["op-perfume-1.webp", "Perfume", "Fragrance key art"],
    ["21.webp", "Nipura Luxe", "Jewellery · cool"],
    ["22.webp", "Nipura Luxe", "Jewellery · warm"],
    ["cd.webp", "Nipura", "Seasonal post"],
    ["15.webp", "FittR", "Food packaging"],
    ["4.webp", "Science Focus", "Editorial cover"],
    ["5.webp", "The Alchemist", "Cover · mockup"],
    ["6.webp", "The Alchemist", "Title lockup"],
    ["13.webp", "Yesteryay Land", "Event poster"],
    ["sensei-mugen.webp", "Sensei", "Character"],
    ["manwiththestrawhat-onhead.webp", "Straw hat", "Fan illustration"],
    ["9.webp", "The lamppost", "Illustration"],
    ["14.webp", "Ship, dusk", "Illustration"],
    ["18.webp", "Dead wood", "Matte illustration"],
    ["17.webp", "Late room", "Interior light study"],
    ["conceptdesign-2.webp", "Red tree", "Concept"],
    ["conceptdesign-1.webp", "Moon field", "Concept"],
    ["cylinder-1.webp", "Hard-surface", "Practice"],
    ["cylinder-2.webp", "Hard-surface", "Wear pass"],
    ["cylinder-3.webp", "Extinguisher", "Texture study"],
    ["conceptdesign-3.webp", "Clay pass", "Hard-surface"],
    ["19.webp", "Grey ball", "Lighting primitive"],
    ["carousel_banner_full.webp", "Web carousel", "Banner system"],
]

TIERS = [
    {"n": "01", "name": "One Frame", "for": "Album art, key frames, cover stills.", "items": ["1 hero render", "2 alternate angles", "2 light revisions", "10–14 days"]},
    {"n": "02", "name": "The World", "for": "Editorial, brand campaigns, visual development.", "items": ["4–6 hero renders", "Props, set dressing, full atmosphere", "Turntable or parallax pass", "Light revisions included", "3–5 weeks"], "flag": "Most commissioned"},
    {"n": "03", "name": "The Pipeline", "for": "Studios, agencies, films, product launches.", "items": ["Full visual development", "Animated turntables · pre-viz", "Farm-ready hand-off, named and tidy", "On call two months after delivery", "6–10 weeks"]},
]

PROFILE = {
    "name": "Amidyala Sai Sumanth",
    "short": "Sumanth",
    "role": "3D Environment Artist & Visual Designer",
    "city": "Hyderabad, India",
    "coords": "17.38°N 78.48°E",
    "email": "sumanth.richie25@icloud.com",
    "line": "I build places that don't exist, then decide how the light behaves once it gets there.",
    "about": [
        "Half of my work is quiet — shrines, ponds, pagodas, held at the one hour they actually make sense. The other half ships on a Friday for agencies in Toronto and San Juan: air conditioners, burgers, jewellery, bank ads. Both halves want the same thing from me. A place that looks kept. Light with somewhere to be.",
        "Trained through the agency pipeline, raised on anime frames I paused too long. The two don't argue. They argue with the work, and the work answers.",
    ],
    "tools": {"Core": "Maya · ZBrush · Substance · Arnold", "Also": "Unreal · After Effects · Photoshop · Illustrator", "Works in": "Environments · Product viz · Campaign design"},
    "links": [
        ["Behance", "https://behance.net/sumanthrichie"],
        ["Instagram", "https://instagram.com/sumofDanth"],
        ["Résumé", "https://su3doesign.github.io/Resume/"],
    ],
    "desk": VID + "desk-hero.mp4",
}


def size_of(path):
    p = PUB / path
    if path.endswith(".mp4"):
        p = PUB / (POS + Path(path).stem + ".webp")
    if not p.exists():
        return [16, 9]
    with Image.open(p) as im:
        return list(im.size)


def poster_of(path):
    return POS + Path(path).stem + ".webp" if path.endswith(".mp4") else None


def ensure_posters():
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return
    (PUB / POS).mkdir(parents=True, exist_ok=True)
    for v in sorted((PUB / VID).glob("*.mp4")):
        out = PUB / POS / (v.stem + ".webp")
        if out.exists():
            continue
        subprocess.run([ff, "-v", "error", "-y", "-ss", "0.4", "-i", str(v), "-frames:v", "1",
                        "-vf", "scale=trunc(iw*sar/2)*2:ih,setsar=1,scale='min(1280,iw)':-2",
                        "-c:v", "libwebp", "-quality", "78", str(out)], check=False)


def media(path, label=None):
    w, h = size_of(path)
    m = {"src": path, "w": w, "h": h, "type": "video" if path.endswith(".mp4") else "image"}
    if m["type"] == "video":
        m["poster"] = poster_of(path)
    m["thumb"] = thumb_path(path)
    if label:
        m["label"] = label
    return m


def thumb_path(path):
    stem = Path(path).stem
    return f"assets/thumbs/640/{stem}.webp"


def make_thumb(path, width=640):
    src = PUB / (poster_of(path) or path)
    out = PUB / thumb_path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and out.stat().st_mtime > src.stat().st_mtime:
        return
    with Image.open(src) as im:
        im = im.convert("RGB")
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(out, "WEBP", quality=74, method=6)


def cover_crop(im, tw, th):
    im = im.convert("RGB")
    s = max(tw / im.width, th / im.height)
    im = im.resize((max(tw, round(im.width * s)), max(th, round(im.height * s))), Image.LANCZOS)
    x = (im.width - tw) // 2
    y = (im.height - th) // 2
    return im.crop((x, y, x + tw, y + th))


def nda_tile(tw, th, name):
    im = Image.new("RGB", (tw, th), (10, 16, 14))
    d = ImageDraw.Draw(im)
    for y in range(0, th, 4):
        d.line([(0, y), (tw, y)], fill=(14, 24, 20))
    try:
        f = ImageFont.truetype("/tmp/work/fonts/archivo-exp-black.ttf", 44)
    except Exception:
        f = ImageFont.load_default()
    d.text((tw / 2, th / 2 - 20), "NDA", fill=(61, 255, 208), font=f, anchor="mm")
    try:
        f2 = ImageFont.truetype("/tmp/work/fonts/archivo-exp-black.ttf", 18)
    except Exception:
        f2 = ImageFont.load_default()
    d.text((tw / 2, th / 2 + 28), name.upper(), fill=(160, 190, 170), font=f2, anchor="mm")
    return im


def atlas(items, cols, rows, tw, th, out):
    sheet = Image.new("RGB", (cols * tw, rows * th), (6, 10, 9))
    for i, it in enumerate(items):
        x, y = (i % cols) * tw, (i // cols) * th
        if it is None:
            continue
        if isinstance(it, Image.Image):
            tile = it
        else:
            with Image.open(PUB / it) as im:
                tile = cover_crop(im, tw, th)
        sheet.paste(tile, (x, y))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, "WEBP", quality=80, method=6)
    return {"src": str(out.relative_to(PUB)), "cols": cols, "rows": rows, "count": len(items)}


def main():
    ensure_posters()
    all_media = []

    worlds = []
    for w in WORLDS:
        ww = {k: v for k, v in w.items() if k not in ("shots",)}
        ww["plate"] = media(w["plate"])
        ww["shots"] = [media(p, l) for p, l in w["shots"]]
        all_media += [ww["plate"]] + ww["shots"]
        # 3D screen texture for the monolith
        with Image.open(PUB / w["plate"]) as im:
            t = cover_crop(im, 1024, 640)
        out = THUMB / "screens" / f"{w['id']}.webp"
        out.parent.mkdir(parents=True, exist_ok=True)
        t.save(out, "WEBP", quality=82, method=6)
        ww["screen"] = str(out.relative_to(PUB))
        worlds.append(ww)

    clients = []
    covers = []
    for c in CLIENTS:
        cc = dict(c)
        cc["files"] = [media(f) for f in c["files"]]
        all_media += cc["files"]
        first_img = next((f for f in c["files"] if f.endswith(".webp")), None)
        cover = first_img or (poster_of(c["files"][0]) if c["files"] else None)
        cc["cover"] = cover
        covers.append(cover if cover else nda_tile(512, 384, c["name"]))
        clients.append(cc)
    clients_atlas = atlas(covers, 4, 4, 512, 384, THUMB / "clients-atlas.webp")

    studies = []
    for f, nm, kind in STUDIES:
        m = media(IMG + f)
        m["name"] = nm
        m["kind"] = kind
        studies.append(m)
        all_media.append(m)
    cols = 8
    rows = -(-len(studies) // cols)
    studies_atlas = atlas([s["src"] for s in studies], cols, rows, 256, 320, THUMB / "studies-atlas.webp")

    for m in all_media:
        make_thumb(m["src"])
    make_thumb(PROFILE["desk"])

    data = {
        "profile": PROFILE,
        "worlds": worlds,
        "steps": STEPS,
        "clients": clients,
        "clientsAtlas": clients_atlas,
        "studies": studies,
        "studiesAtlas": studies_atlas,
        "tiers": TIERS,
    }
    out = ROOT / "src" / "data" / "content.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("content.json:", len(worlds), "worlds,", len(clients), "clients,", len(studies), "studies,", len(all_media), "media")


if __name__ == "__main__":
    main()
