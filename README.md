# thesumanth.com — BEAUTY PASS

Portfolio for **Amidyala Sai Sumanth**, 3D environment artist & visual designer.
Static site. No build step, no backend, no database.

---

## Deploy

Upload the whole folder to your host, or push it to a GitHub Pages repo.
`CNAME` is already set to `www.thesumanth.com` — point your DNS `CNAME`
record at your Pages host and Pages will pick it up.

Local preview (double-clicking `index.html` will block the WebGL hero because
of file:// security rules, so serve it):

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

---

## The idea

The site behaves like a render, because that is the vocabulary of the work.

- **Middle grey.** The page sits on 18% grey — the value on a lighting
  reference ball — instead of the usual portfolio black. Renders read warmer
  and truer against it.
- **Bucket reveal.** Every image resolves in tiles, scanline order with
  jitter, the way Arnold actually fills a frame. The hero does it in a real
  GLSL shader with sampling noise; the rest do it in cheap DOM tiles.
- **The pass switcher** (bottom left, or keys `1`–`4`) re-renders the entire
  site live:
  - `Beauty` — the finished frame
  - `Clay` — colour stripped, everything shaded grey
  - `Wire` — the site exposed as its own bounding boxes, every block labelled
  - `Z-Depth` — near is bright, far falls into fog, keyed to scroll position
- **Solo.** Clicking a client isolates their work and drops everything else,
  the same way you solo an object in a viewport.

---

## Files

```
index.html      structure and copy
styles.css      design tokens + every component
app.js          data (worlds, clients, studies), rendering, passes, lightbox
hero.js         the Three.js bucket-resolve hero
assets/images   web-sized WebP (2000px renders, 1400px social)
assets/videos   H.264, max 1280px, audio stripped for silent loops
assets/posters  first-frame stills so videos never load until played
tools/          optimize.py — run it on any new artwork
```

### Editing content

Everything lives in the `DATA` block at the top of `app.js`:

- `WORLDS` — the three case studies (plate image, shot list, notes, tags)
- `STEPS` — the seven-move method strip
- `CLIENTS` — name, group, role, file list. Add a client, it appears in the
  solo list and on the wall automatically.
- `STUDIES` — the graphics and product bento. `span` controls grid width,
  `ratio` controls the frame shape.

### Adding new work

```bash
python3 tools/optimize.py ~/Desktop/new-renders
```

Then add the filename to the right array in `app.js`. That is the whole job.

---

## Performance notes

- Total page weight on first view is roughly 2–3 MB: only what is on screen
  loads. Images lazy-load 600px ahead of the viewport.
- Videos are `preload="none"` with poster frames. They fetch and play only
  when scrolled into view, and pause when they leave.
- If the Three.js CDN fails or WebGL is unavailable, the hero falls back to a
  plain cross-fading image. If GSAP fails, everything is still readable and
  scrollable — nothing is animation-gated.
- `prefers-reduced-motion` disables smooth scroll, the bucket reveals, the
  pinned horizontal strip and the hero shot cycle.

## On protecting the work

Anything a browser displays has already been downloaded, so no script can
truly stop copying. What actually helps is already done here: only
web-resolution copies are on the server. Keep the 4K originals offline, and
consider embedding your name in the EXIF/XMP copyright fields of anything you
publish.
