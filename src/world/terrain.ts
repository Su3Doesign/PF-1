import {
  BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial, Texture
} from 'three';
import { heightAt, pathDistance, pondFactor } from './layout';

export interface TerrainTex { ground: Texture; groundN: Texture; moss: Texture; noise: Texture }

/** One ground mesh, denser near the walk, with path and bank tinting in vertex colours. */
export function buildTerrain(t: TerrainTex): Mesh {
  const x0 = -70, x1 = 70, z0 = 34, z1 = -180;
  const nx = 141, nz = 215;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  const col = new Float32Array(nx * nz * 3);
  const c = new Color();
  const soil = new Color(0.62, 0.55, 0.5);
  const path = new Color(0.5, 0.44, 0.38);
  const wet = new Color(0.42, 0.44, 0.40);
  const lush = new Color(0.62, 0.7, 0.58);
  for (let j = 0; j < nz; j += 1) {
    const zt = j / (nz - 1);
    const z = z0 + (z1 - z0) * zt;
    for (let i = 0; i < nx; i += 1) {
      // squeeze columns toward the centre where the camera is
      const u = i / (nx - 1) * 2 - 1;
      const x = Math.sign(u) * Math.pow(Math.abs(u), 1.6) * (x1 - x0) / 2;
      const d = z < -12 ? pathDistance(x, z) : 99;
      const y = heightAt(x, z, d);
      const k = j * nx + i;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = x / 3.2; uv[k * 2 + 1] = z / 3.2;
      c.copy(lush);
      const p = Math.max(0, 1 - d / 1.8);
      if (p > 0) c.lerp(path, p);
      const pf = pondFactor(x, z);
      const bank = Math.max(0, 1 - Math.abs(pf - 1.02) / 0.12);
      if (bank > 0) c.lerp(wet, bank * 0.8);
      if (y < -0.2) c.lerp(soil, 0.6);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let o = 0;
  for (let j = 0; j < nz - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = j * nx + i, b = a + 1, cc = a + nx, dd = cc + 1;
      idx[o++] = a; idx[o++] = cc; idx[o++] = b;
      idx[o++] = b; idx[o++] = cc; idx[o++] = dd;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const m = new MeshStandardMaterial({ map: t.ground, normalMap: t.groundN, roughness: 0.95, vertexColors: true, envMapIntensity: 0.12 });
  const u = { tMoss: { value: t.moss }, tNoise: { value: t.noise } };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tMoss, tNoise;\nvarying vec3 vGW;\nfloat gMoss;')
      .replace('#include <map_fragment>', /* glsl */ `
        vec4 g1 = texture2D(map, vMapUv);
        vec4 g2 = texture2D(map, vMapUv * 0.27 + 0.31);
        float nn = texture2D(tNoise, vGW.xz * 0.018).r;
        vec3 gcol = mix(g1.rgb, g2.rgb, smoothstep(0.35, 0.65, nn) * 0.5);
        float mz = texture2D(tNoise, vGW.xz * 0.045 + 0.5).r;
        gMoss = smoothstep(0.52, 0.72, mz + (texture2D(tNoise, vGW.xz * 0.2).g - 0.5) * 0.3);
        vec3 mcol = texture2D(tMoss, vGW.xz * 0.55).rgb;
        gcol = mix(gcol, mcol * 0.8, gMoss * step(0.0, vGW.y));
        gcol *= mix(0.55, 1.0, smoothstep(-0.6, 0.15, vGW.y));
        diffuseColor.rgb *= gcol;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, smoothstep(0.3, -0.1, vGW.y));');
  };
  const mesh = new Mesh(g, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
