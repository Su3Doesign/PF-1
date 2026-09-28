import {
  LoadingManager, TextureLoader, Texture, RepeatWrapping, SRGBColorSpace, LinearMipmapLinearFilter,
  Group, WebGLRenderer
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const BASE = './assets/';

export const TEXTURES = {
  moss: 'tex/moss_albedo.webp',
  mossN: 'tex/moss_normal.webp',
  concrete: 'tex/concrete_albedo.webp',
  concreteN: 'tex/concrete_normal.webp',
  stone: 'tex/stone_albedo.webp',
  stoneN: 'tex/stone_normal.webp',
  lacquer: 'tex/lacquer_albedo.webp',
  lacquerN: 'tex/lacquer_normal.webp',
  bark: 'tex/bark_albedo.webp',
  barkN: 'tex/bark_normal.webp',
  metal: 'tex/metal_albedo.webp',
  metalN: 'tex/metal_normal.webp',
  ground: 'tex/ground_albedo.webp',
  groundN: 'tex/ground_normal.webp',
  fern: 'tex/fern.webp',
  fern2: 'tex/fern2.webp',
  hangingMoss: 'tex/hanging_moss.webp',
  waterN: 'tex/water_normal.webp',
  conifer: 'tex/leaves_conifer.webp',
  broad: 'tex/leaves_broad.webp',
  bushLeaves: 'tex/leaves_bush.webp',
  tuft: 'tex/grass_tuft.webp',
  blossom: 'tex/blossom.webp',
  rose: 'tex/rose.webp',
  wisteria: 'tex/wisteria.webp',
  ivy: 'tex/ivy.webp',
  lilypad: 'tex/lilypad.webp',
  fresco: 'tex/fresco.webp',
  plaster: 'tex/plaster_albedo.webp',
  plasterN: 'tex/plaster_normal.webp',
  sand: 'tex/sand_albedo.webp',
  sandN: 'tex/sand_normal.webp',
  noise: 'tex/noise.png',
  aoLetters: '3d/ao_letters.webp',
  aoTorii: '3d/ao_torii_body.webp',
  aoKasagi: '3d/ao_torii_kasagi.webp',
  aoToro: '3d/ao_toro.webp',
  aoMonolith: '3d/ao_monolith.webp',
  aoRack: '3d/ao_rack.webp',
  aoRocks: '3d/ao_rocks.webp',
  aoDesk: '3d/ao_desk_crt.webp',
  clientsAtlas: 'thumbs/clients-atlas.webp',
  studiesAtlas: 'thumbs/studies-atlas.webp',
  worldA: 'thumbs/screens/roman-no-yoake.webp',
  worldB: 'thumbs/screens/fudo-myo-o.webp',
  worldC: 'thumbs/screens/koi-pond.webp'
} as const;

export const MODELS = {
  letters: '3d/letters.min.glb',
  torii: '3d/torii.min.glb',
  toro: '3d/toro.min.glb',
  monolith: '3d/monolith.min.glb',
  rack: '3d/rack.min.glb',
  rocks: '3d/rocks.min.glb',
  desk: '3d/desk_crt.min.glb'
} as const;

export type TexKey = keyof typeof TEXTURES;
export type ModelKey = keyof typeof MODELS;

const COLOR_TEX = new Set<TexKey>(['moss', 'concrete', 'stone', 'lacquer', 'bark', 'metal', 'ground', 'fern', 'fern2', 'hangingMoss', 'clientsAtlas', 'studiesAtlas', 'worldA', 'worldB', 'worldC',
  'conifer', 'broad', 'bushLeaves', 'tuft', 'blossom', 'rose', 'wisteria', 'ivy', 'lilypad', 'fresco', 'plaster', 'sand']);

export interface Assets {
  tex: Record<TexKey, Texture>;
  models: Record<ModelKey, Group>;
}

export async function loadAssets(renderer: WebGLRenderer, onProgress: (p: number) => void): Promise<Assets> {
  const manager = new LoadingManager();
  let loaded = 0;
  const total = Object.keys(TEXTURES).length + Object.keys(MODELS).length;
  const bump = () => { loaded += 1; onProgress(loaded / total); };
  const tl = new TextureLoader(manager);
  const gl = new GLTFLoader(manager);
  gl.setMeshoptDecoder(MeshoptDecoder);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tex = {} as Record<TexKey, Texture>;
  const models = {} as Record<ModelKey, Group>;

  const texJobs = (Object.keys(TEXTURES) as TexKey[]).map((k) =>
    tl.loadAsync(BASE + TEXTURES[k]).then((t) => {
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = aniso;
      t.minFilter = LinearMipmapLinearFilter;
      if (COLOR_TEX.has(k)) t.colorSpace = SRGBColorSpace;
      if (k.startsWith('ao')) t.flipY = false; // glTF UV convention
      tex[k] = t;
      bump();
    })
  );
  const modelJobs = (Object.keys(MODELS) as ModelKey[]).map((k) =>
    gl.loadAsync(BASE + MODELS[k]).then((g) => {
      models[k] = g.scene;
      bump();
    })
  );
  await Promise.all([...texJobs, ...modelJobs]);
  return { tex, models };
}
