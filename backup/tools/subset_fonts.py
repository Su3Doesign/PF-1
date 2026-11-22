"""
Downloads Shippori Mincho B1 subset to exactly the Japanese characters the
site uses (scanned from the HTML, TypeScript and content), so the kanji cost
a few kilobytes instead of megabytes.

    python tools/subset_fonts.py
"""
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

chars = set()
for pat in ["*.html", "src/**/*.ts", "src/data/*.json", "src/**/*.css"]:
    for f in ROOT.glob(pat):
        for ch in f.read_text(encoding="utf-8"):
            if re.match(r"[　-ヿ㐀-鿿＀-￯]", ch):
                chars.add(ch)
text = "".join(sorted(chars)) + "0123456789"
print(len(chars), "japanese characters:", "".join(sorted(chars)))

for w in (500, 800):
    q = urllib.parse.urlencode({"family": f"Shippori Mincho B1:wght@{w}", "text": text, "display": "swap"})
    css = urllib.request.urlopen(urllib.request.Request("https://fonts.googleapis.com/css2?" + q, headers={"User-Agent": UA})).read().decode()
    url = re.search(r"url\((https://[^)]+)\)", css).group(1)
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})).read()
    (OUT / f"shippori-{w}-subset.woff2").write_bytes(data)
    print(f"shippori-{w}-subset.woff2", len(data), "bytes")
