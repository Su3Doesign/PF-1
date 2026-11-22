# thesumanth.com — s3.atelier

The portfolio of **Sumanth Richie** (Amidyala Sai Sumanth): 3D, web and identity, from Hyderabad.

**One idea: the mark is made of the work.** The s3.atelier mark is an impossible triangle whose three
faces are windows into three kinds of work: World, Web and Brand. You step through a face to go inside.

- **Home:** the mark is drawn live in WebGL. Your cursor's liquid trail peels each face back to its
  construction drawing, and a contour map drifts behind it.
- **World:** a walk in depth through the places, from daylight into night.
- **Web:** a pinned browser window that reads each site from top to bottom, with a slit transition.
- **Brand:** the Magma can and the Jigri bottle, both modelled and ray-traced in Blender, and a shelf of
  every long brand board. Click a board to read it whole, full screen.
- **About:** experience, brands, education, tools and contact. The menu holds an index of every piece.

## Running it

It is a static site with no build step. Serve the folder with any static server, for example:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. GSAP loads from cdnjs; everything else is in this repository.

## Deploying

Every push to `main` publishes the site to GitHub Pages (`.github/workflows/deploy.yml`). Only the site's own
files are published; `backup/` is not. `CNAME` names `www.thesumanth.com`; the custom domain itself is set
under **Settings → Pages → Custom domain**.

## backup/

Everything this repository held before, the Overgrown Archive site (Vite + three.js), is kept untouched in
`backup/`, including its workflows (inactive there). To bring it back, move its contents to the root again.

## Source

The scenes, board tools and working history live in the `site/` folder of the `test-motion-web-world`
repository (Blender scenes for the can and the bottle, the script that cuts the brand boards, and the frame
compressor).
