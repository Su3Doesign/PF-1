// Compresses the GLBs exported by tools/blender/build_props.py (meshopt +
// quantisation) and converts the baked AO maps to WebP with a light blur to
// hide Cycles sampling noise.
//
//   node tools/pack_3d.mjs
import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/3d');

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({
  'meshopt.encoder': MeshoptEncoder
});

const files = await readdir(dir);

for (const f of files.filter((f) => f.endsWith('.glb') && !f.endsWith('.min.glb'))) {
  const src = path.join(dir, f);
  const out = path.join(dir, f.replace('.glb', '.min.glb'));
  const doc = await io.read(src);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' })
  );
  await io.write(out, doc);
  const a = (await stat(src)).size, b = (await stat(out)).size;
  console.log(`${f.padEnd(16)} ${(a / 1024).toFixed(0).padStart(6)} KB → ${(b / 1024).toFixed(0).padStart(5)} KB`);
  await rm(src);
}

for (const f of files.filter((f) => f.startsWith('ao_') && f.endsWith('.png'))) {
  const src = path.join(dir, f);
  const out = path.join(dir, f.replace('.png', '.webp'));
  const meta = await sharp(src).metadata();
  const size = Math.min(meta.width, f.includes('letters') || f.includes('rack') ? 1536 : 1024);
  await sharp(src).blur(1.1).resize(size, size).greyscale().webp({ quality: 78 }).toFile(out);
  console.log(`${f.padEnd(22)} → ${path.basename(out)} ${((await stat(out)).size / 1024).toFixed(0)} KB`);
  await rm(src);
}
