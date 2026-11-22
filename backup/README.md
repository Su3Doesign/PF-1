# thesumanth.com — 苔の経蔵, the overgrown archive

Portfolio of **Amidyala Sai Sumanth**, 3D environment artist and visual designer.

The site is a night walk through an overgrown neon forest that ends at the sea at dawn, rendered live in the browser with three.js:

- **The pond:** monumental moss-covered `SUMANTH` letters stand in a mirror-still pond, outlined in teal neon, with a vermilion neon torii behind them. Red and gold maple limbs reach over the water from behind the camera, washi lanterns drift on the pond, reeds, cattails and lotus crowd the banks, a glowing willow weeps on the left and a bamboo grove rises on the right.
- **Worlds (世界):** three concrete monoliths in a clearing play the personal worlds. Clicking a screen opens its case study.
- **Method (七手):** seven stone lanterns line the path and light one by one as you read the seven steps.
- **Clients (顧客):** a mossy rack of 16 CRT monitors, one per client, each opening that client's gallery.
- **Library (書庫):** a ring of 39 glowing studies orbits the oldest tree in the forest, under its golden crown. Drag the ring to spin it.
- **Commissions (絵馬):** three ema plaques hang on a lit rope in front of the cliff where the forest ends.
- **About (洞):** a flooded cave. You float down its channel under a ceiling of glowworms, past crystals and bioluminescent flora that unfurl as you approach, with moonlight falling through holes in the roof.
- **Archive (経蔵):** the cave opens into an overgrown baroque hall inside the mountain. There is a painted sky in a gilded vault, wisteria pouring from the cornice, roses and ivy, chandeliers, and a clear koi pool with lilies. Sixteen pieces of the work hang in gold frames, and each one opens full screen.
- **Contact (手紙):** the hall's door opens onto a terrace over the sea in the blue hour before dawn. The moon sets inside a vermilion gate offshore, and paper cranes fly out toward it. A stone desk under a SAY HELLO sign plays the desk video on a CRT. The sea is a sum of Gerstner waves: long swells that steepen and break into foam on the sand, a moon glitter path, and plankton that glows cyan where the surf churns.

The forest between the stops is a whole forest rather than a corridor. The valley walls rise on both sides and a band of distant trees carries the canopy to the horizon, so there is no void at the edges. Saplings, stepping stones worn into the path, fallen trunks furred with moss, stumps and half-buried boulders fill the floor.

**Things to find along the way:**

- A broken CRT television lies in the moss by the path, still showing facts through cracked glass. Click it for the next one.
- A film projector on a tripod throws a reel onto a sheet strung between bamboo poles. Click the sheet to watch the film.
- Seven kodama hide on mossy boulders through the forest. They rattle their heads and turn to watch you pass. Click one and it folds away into the moss; a counter in the top bar keeps score.
- A spirit deer stands in the mist near the method stop and dissolves if you walk too close.
- At the sea, a whale of light crosses the sky every seventy seconds.

Scrolling walks the camera along a rail and pauses at each stop. Every stop has a glass panel of real HTML with the same content, so nothing is locked inside the 3D. `work.html` is a fast, WebGL-free version of the whole portfolio. It is linked from the top bar and the loader, and it is the automatic fallback when WebGL2 is unavailable.

## Run it

Needs Node.js 20.19 or newer (22 recommended, as in CI). Older versions cannot run Vite 7.

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
    terrain.ts            forest ground, the valley walls and the bowl around the pond
    landing.ts            the pond's surroundings: maple limbs, reeds, cattails, lotus, the glowing willow, the bamboo grove
    forestfloor.ts        stepping stones, fallen logs, stumps, boulders
    water.ts              one shared planar reflection for every surface at y = 0: pond, channel, pool, sea
    treegen.ts            procedural trees (sugi, maple, keyaki, black pine), bushes, tufts, foliage material
    trees.ts foliage.ts   forest placement (near trees, far canopy band, saplings), library tree, mushrooms; grass, tufts, ferns, bushes in flower
    cave.ts               cliff face, flooded passage, glowworms, crystals, flora that rises as you pass
    hall.ts               the archive hall: vault and fresco, frames, sconces, chandeliers, wisteria, koi pool
    shore.ts              terrace, cove, sea stacks, black pines
    sea.ts                Gerstner swell, shoaling, breaking foam, glitter path, bioluminescent surf
    extras.ts             the television, the projector and its sheet, the kodama, the spirit deer, the whale
    fauna.ts              koi, floating washi lanterns, paper cranes, butterflies
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
python tools/gen_foliage.py             # leaf cards, grass tufts, flowers, bamboo, willow, wisteria, ivy, lily pads, the fresco, plaster, sand
python tools/blender/build_props.py     # Blender (headless): model props, bake AO with Cycles, export GLB
node tools/pack_3d.mjs                  # meshopt + quantisation, AO → WebP
python tools/subset_fonts.py            # re-subset the kanji font after changing Japanese text
```

`build_props.py` models the letters (from the Archivo Expanded Black TTF, placed at `/tmp/work/fonts/`), the torii, the stone lantern, the monolith screen, the 16-CRT rack, the desk CRT and four rocks. It weathers the letters with boolean bites, traces neon outlines from the glyph curves, and bakes ambient occlusion into atlases.

It also models the secrets:

- **The broken television:** a wooden cabinet on splayed legs, with a chrome trim and a bulged glass screen.
- **The film projector:** a 16 mm projector with two reels and a lens, on a tripod.
- **The paper lantern:** a bamboo frame around a washi shade and a candle.
- **The kodama, the deer and the whale:** grown as skin-modifier skeletons, then smoothed with subdivision. The deer is a red stag with branching antlers, and the whale is a humpback with long pectoral fins and flukes.

**Using your own models.** Any prop can be replaced with a model from Maya, ZBrush or Blender, as long as the GLB keeps the same node names:

- `letter_0…6` and `neon_0…6`
- `torii_body` and `torii_kasagi`
- `toro` and `toro_light`
- `monolith` and `monolith_screen`
- `rack` and `screen_00…15`
- `desk_crt` and `desk_screen`
- `rock_0…3`
- `tv_wood`, `tv_trim` and `tv_screen`
- `projector`, `reel_front`, `reel_rear` and `proj_lens`
- `lantern_frame`, `lantern_paper` and `lantern_candle`
- `kodama_head` and `kodama_body`
- `deer_body` and `deer_antlers`
- `whale`

Export it, put it in `public/assets/3d/`, run `node tools/pack_3d.mjs`, and it inherits the moss material automatically. The shader grows moss on up-facing surfaces and near the ground.

## Performance

- Three quality tiers, chosen from the GPU:

  | Tier | Trees (near / far / saplings) | Grass blades / tufts / bushes | Reflection | Shadows | Branch detail |
  |------|-------------------------------|-------------------------------|------------|---------|---------------|
  | High | 240 / 520 / 320 | 42k / 9k / 950 | Half resolution | Yes | Full |
  | Medium | 190 / 380 / 220 | 22k / 6k / 650 | Reduced | No | Low |
  | Low | 140 / 260 / 140 | 8k / 3.4k / 380 | Reduced | No | Low |

  Far trees are a separate level of detail with fewer, larger leaf cards and no branches. They never cast shadows.

  Software renderers are forced to Low.
- A frame governor lowers the pixel ratio when the frame rate drops and raises it again when there is headroom. It resizes before a frame is drawn, never after, so a change of resolution never flashes an empty frame.
- The world is split into zones (forest, cave, hall, shore). Fog, far plane, lights, sky and reflections blend between them as you walk. The far plane is 120 m in the forest and 90 m in the cave, so distant stops cost nothing. It only opens to 1.8 km at the sea.
- Every water surface lies at y = 0, so one mirror render serves the pond, the cave channel, the koi pool and the sea. It is skipped when no water is on screen. In the forest it also ignores water more than 70 m away, which the fog hides anyway, and the mirror only draws the 70 m around the camera.
- The mirror uses an oblique near plane to clip everything below the water, and that projection defeats the renderer's frustum culling. The mirror pass therefore culls against the true frustum itself before drawing. Without this it would redraw the whole world every frame.
- Draw calls measured in a headless browser, including the mirror pass: about 330 at the pond and 350 at the worlds on low, and 400–480 on high with the shadow pass. They fall to about 120 at the sea. The low tier stays around 1.2M triangles.
- Trees, crowns, bushes, tufts, grass, ferns, lanterns, rocks, logs, stumps, stepping stones, mushrooms, flora, crystals, wisteria, lily pads, koi, cranes, kodama and the studies ring are all instanced. Ground cover is batched in 36–70 m chunks, so off-screen chunks are culled. Hall artwork loads only when you reach the cave, and the projector's film only when you reach it.
- Only six point lights exist. Every frame they are handed to the neon sources nearest the camera and fade in and out, so the shaders never recompile.
- Initial download is about 1.1 MB of JavaScript (about 345 KB gzipped), about 5 MB of textures and about 1.3 MB of models and baked AO. Portfolio images load only when opened.

## Accessibility and fallbacks

- No WebGL2: redirect to `work.html`.
- Reduced motion: native scroll, no camera flights, no flicker.
- All work is reachable from real buttons, and dialogs trap focus and close on Esc.
- Sound (synthesised crickets, wind, water, neon hum, UI ticks) stays off until the visitor chooses **Enter with sound** or turns it on in the top bar. The choice is remembered.

## Deploy

`.github/workflows/deploy.yml` builds and publishes `dist/` to GitHub Pages on every push to `main`. `ci.yml` builds every pull request.

One-time setup: **Settings → Pages → Source: GitHub Actions**. For the custom domain, set `www.thesumanth.com` under **Settings → Pages → Custom domain**, or add a `public/CNAME` file containing it. The site uses relative paths, so it also works at `username.github.io/repo/`.

## Notes

- Unreal Engine was not used: nothing in the browser can run it. Blender ran headless, with Cycles on the CPU, to model and bake the props and creatures. Trees, the cave, the hall, the shore and the sea are built procedurally in TypeScript at load time.
- Every texture is generated from seeded noise, so no third-party texture licences apply.
