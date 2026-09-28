# thesumanth.com — 苔の経蔵, the overgrown archive

Portfolio of **Amidyala Sai Sumanth**, 3D environment artist and visual designer.

The site is a night walk through an overgrown neon forest that ends at the sea at dawn, rendered live in the browser with three.js:

- **The pond:** monumental moss-covered `SUMANTH` letters stand in a mirror-still pond, outlined in teal neon, with a vermilion neon torii behind them.
- **Worlds (世界):** three concrete monoliths in a clearing play the personal worlds. Clicking a screen opens its case study.
- **Method (七手):** seven stone lanterns line the path and light one by one as you read the seven steps.
- **Clients (顧客):** a mossy rack of 16 CRT monitors, one per client, each opening that client's gallery.
- **Library (書庫):** a ring of 39 glowing studies orbits the oldest tree in the forest, under its golden crown. Drag the ring to spin it.
- **Commissions (絵馬):** three ema plaques hang on a lit rope in front of the cliff where the forest ends.
- **About (洞):** a flooded cave. You float down its channel under a ceiling of glowworms, past crystals and bioluminescent flora that unfurl as you approach, with moonlight falling through holes in the roof.
- **Archive (経蔵):** the cave opens into an overgrown baroque hall inside the mountain. There is a painted sky in a gilded vault, wisteria pouring from the cornice, roses and ivy, chandeliers, and a clear koi pool with lilies. Sixteen pieces of the work hang in gold frames, and each one opens full screen.
- **Contact (手紙):** the hall's door opens onto a terrace over the sea at dawn. The moon sets inside a vermilion gate offshore, and paper cranes fly out toward it. A stone desk under a SAY HELLO sign plays the desk video on a CRT.

Scrolling walks the camera along a rail and pauses at each stop. Every stop has a glass panel of real HTML with the same content, so nothing is locked inside the 3D. `work.html` is a fast, WebGL-free version of the whole portfolio. It is linked from the top bar and the loader, and it is the automatic fallback when WebGL2 is unavailable.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
```

Useful URL flags:

| Flag | What it does |
|------|--------------|
| `?q=high` / `medium` / `low` | Force a quality tier (by default it is picked from the GPU and device) |
| `?skipintro` | Skip the descent-and-ignite intro |
| `?debug` | Expose the world as `window.__world` for inspection |

## Stack

- **Vite + TypeScript**, no framework. Two pages: `index.html` (the forest) and `work.html` (flat).
- **three.js**, plus **postprocessing** for bloom, ACES tone mapping, vignette, grain and chromatic aberration.
- **Lenis** for smooth scrolling. Native scrolling is used when `prefers-reduced-motion` is set.
- **GSAP-free.** Motion is plain requestAnimationFrame, CSS, and the Web Animations API.
- **Fonts:** Archivo (variable width, set expanded for the display type), Martian Mono, and a 13 KB subset of Shippori Mincho B1 holding only the kanji the site uses.

```
index.html, work.html
src/
  main.ts                 boot, loader, scroll → camera, UI wiring
  work.ts                 flat portfolio
  data/content.json       all content (generated — see below)
  world/
    World.ts              renderer, post, lights, light pool, intro, picking
    layout.ts             every placement: pond, path, cave, hall, shore, zones, camera rail
    terrain.ts            forest ground
    water.ts              one shared planar reflection for every surface at y = 0: pond, channel, pool, sea
    treegen.ts            procedural trees (sugi, maple, keyaki, black pine), bushes, tufts, foliage material
    trees.ts foliage.ts   forest placement, library tree, mushrooms; grass, tufts, ferns, bushes in flower
    cave.ts               cliff face, flooded passage, glowworms, crystals, flora that rises as you pass
    hall.ts               the archive hall: vault and fresco, frames, sconces, chandeliers, wisteria, koi pool
    shore.ts              terrace, cove, sea stacks, black pines, surf, the sea
    fauna.ts              koi, floating lanterns, paper cranes, butterflies
    props.ts neon.ts      letters, torii (and the sea gate), lanterns, screens, ring, ema, desk, cables, signs
    materials.ts          triplanar moss-growth material (with flagstone paving), CRT screen shader, wind, growth
    atmosphere.ts         night and dawn sky, zone looks, fireflies, moonlight shafts, mist
    quality.ts            tier detection + adaptive resolution
  ui/                     panels, overlays (case study, galleries, lightbox), sound, cursor
public/assets/
  images videos posters   the work
  thumbs/                 640px thumbnails, screen textures, atlases
  tex/                    procedural textures
  3d/                     GLB props + baked AO
tools/                    asset pipeline (below)
```

## Adding or changing work

All content lives in `tools/build_content.py` (worlds, method, clients, studies, tiers, profile). To add something:

1. Drop the file into `public/assets/images/` (WebP) or `public/assets/videos/` (H.264 MP4, audio stripped).
2. Add it to the right list in `tools/build_content.py`.
3. Run the script:

```bash
pip install pillow imageio-ffmpeg
python tools/build_content.py
```

This writes `src/data/content.json`, the 640px thumbnails, video posters, the three world screen textures and the client and studies atlases the 3D screens use. If you add a study, the ring grows to fit. If you add a client beyond 16, grow the rack in `tools/blender/build_props.py`.

## The 3D pipeline

Every asset is generated by a script, so the whole world can be rebuilt or restyled.

```bash
pip install numpy pillow bpy==5.2.2 fonttools brotli
python tools/gen_textures.py            # tileable moss, bark, stone, lacquer, concrete, metal, forest floor, ferns, water
python tools/gen_foliage.py             # leaf cards, grass tufts, flowers, wisteria, ivy, lily pads, the fresco, plaster, sand
python tools/blender/build_props.py     # Blender (headless): model props, bake AO with Cycles, export GLB
node tools/pack_3d.mjs                  # meshopt + quantisation, AO → WebP
python tools/subset_fonts.py            # re-subset the kanji font after changing Japanese text
```

`build_props.py` models the letters (from the Archivo Expanded Black TTF, placed at `/tmp/work/fonts/`), the torii, the stone lantern, the monolith screen, the 16-CRT rack, the desk CRT and four rocks. It weathers the letters with boolean bites, traces neon outlines from the glyph curves, and bakes ambient occlusion into atlases.

**Using your own models.** Any prop can be replaced with a model from Maya, ZBrush or Blender, as long as the GLB keeps the same node names:

- `letter_0…6` and `neon_0…6`
- `torii_body` and `torii_kasagi`
- `toro` and `toro_light`
- `monolith` and `monolith_screen`
- `rack` and `screen_00…15`
- `desk_crt` and `desk_screen`
- `rock_0…3`

Export it, put it in `public/assets/3d/`, run `node tools/pack_3d.mjs`, and it inherits the moss material automatically. The shader grows moss on up-facing surfaces and near the ground.

## Performance

- Three quality tiers, chosen from the GPU:

  | Tier | Trees | Grass blades / tufts / bushes | Reflection | Shadows | Branch detail |
  |------|-------|-------------------------------|------------|---------|---------------|
  | High | 240 | 42k / 9k / 950 | Half resolution | Yes | Full |
  | Medium | 190 | 22k / 6k / 650 | Reduced | No | Low |
  | Low | 140 | 8k / 3.4k / 380 | Reduced | No | Low |

  Software renderers are forced to Low.
- A frame governor lowers the pixel ratio when the frame rate drops and raises it again when there is headroom.
- The world is split into zones (forest, cave, hall, shore). Fog, far plane, lights, sky and reflections blend between them as you walk. The far plane is 120 m in the forest and 90 m in the cave, so distant stops cost nothing. It only opens to 1.8 km at the sea.
- Every water surface lies at y = 0, so one mirror render serves the pond, the cave channel, the koi pool and the sea. It is skipped when no water is on screen.
- Draw calls measured in a headless browser: about 370 at the pond on low and 445 on high, including the mirror and shadow passes. They fall to 125–150 at the sea. The low tier stays around 1M triangles.
- Trees, crowns, bushes, tufts, grass, ferns, lanterns, rocks, mushrooms, flora, crystals, wisteria, lily pads, koi, cranes and the studies ring are all instanced. Hall artwork loads only when you reach the cave.
- Only six point lights exist. Every frame they are handed to the neon sources nearest the camera and fade in and out, so the shaders never recompile.
- Initial download is about 1.0 MB of JavaScript (about 300 KB gzipped), about 4 MB of textures and about 1 MB of models. Portfolio images load only when opened.

## Accessibility and fallbacks

- No WebGL2: redirect to `work.html`.
- Reduced motion: native scroll, no camera flights, no flicker.
- All work is reachable from real buttons, and dialogs trap focus and close on Esc.
- Sound (synthesised crickets, wind, water, neon hum, UI ticks) stays off until the visitor chooses **Enter with sound** or turns it on in the top bar. The choice is remembered.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. `ci.yml` builds every pull request.

One-time setup: **Settings → Pages → Source: GitHub Actions**. For the custom domain, set `www.thesumanth.com` under **Settings → Pages → Custom domain**, or add a `public/CNAME` file containing it. The site uses relative paths, so it also works at `username.github.io/repo/`.

## Notes

- Unreal Engine was not used: nothing in the browser can run it. Blender ran headless, with Cycles on the CPU, to model and bake the props. Trees, the cave, the hall and the shore are built procedurally in TypeScript at load time.
- Every texture is generated from seeded noise, so no third-party texture licences apply.
