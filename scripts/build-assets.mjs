// Pipeline real de assets: geometría + textura crudas → meshopt + KTX2 (Basis Universal).
import fs from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import sharp from 'sharp';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRTextureBasisu, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt as meshoptTransform } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';

const OUT = 'public/assets/';
const SIZE = 1024;

// ---- Textura procedural: paneles metálicos con ruido y remaches ----
const px = Buffer.alloc(SIZE * SIZE * 4);
const rng = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
const smooth = (x, y, f) => {
  const fx = x * f, fy = y * f, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const a = rng(ix, iy), b = rng(ix + 1, iy), c = rng(ix, iy + 1), d = rng(ix + 1, iy + 1);
  const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  const u = x / SIZE, v = y / SIZE;
  let n = smooth(u, v, 6) * .5 + smooth(u, v, 24) * .3 + smooth(u, v, 96) * .2;
  const pu = (u * 8) % 1, pv = (v * 8) % 1;
  const seam = Math.min(pu, 1 - pu, pv, 1 - pv) < .018 ? .45 : 1;
  const rivet = Math.hypot(pu - .1, pv - .1) < .03 ? 1.5 : 1;
  const tint = Math.floor(u * 8) % 3 === 0 && Math.floor(v * 8) % 2 === 0 ? [1, .55, .2] : [.45, .75, .8];
  const l = (70 + n * 150) * seam * rivet;
  const i = (y * SIZE + x) * 4;
  px[i] = Math.min(255, l * tint[0]); px[i + 1] = Math.min(255, l * tint[1]); px[i + 2] = Math.min(255, l * tint[2]); px[i + 3] = 255;
}
const png = await sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
const jpg = await sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } }).jpeg({ quality: 85 }).toBuffer();
fs.writeFileSync(OUT + 'panel.png', png);
const imageDecoder = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; };
const ktx = await encodeToKTX2(new Uint8Array(png), { isUASTC: false, qualityLevel: 180, compressionLevel: 2, generateMipmap: true, imageDecoder });
fs.writeFileSync(OUT + 'panel.ktx2', ktx);

// ---- Robot guía: alto en polígonos a propósito para que la compresión se note ----
const at = (g, x, y, z, rx = 0, rz = 0) => g.rotateX(rx).rotateZ(rz).translate(x, y, z);
const parts = [
  at(new THREE.SphereGeometry(.34, 96, 64), 0, 1.5, 0),
  at(new THREE.CapsuleGeometry(.3, .55, 24, 96), 0, .85, 0),
  at(new THREE.CylinderGeometry(.09, .07, .62, 48, 12), -.43, .92, 0, 0, -.2),
  at(new THREE.CylinderGeometry(.09, .07, .62, 48, 12), .43, .92, 0, 0, .2),
  at(new THREE.CylinderGeometry(.11, .1, .5, 48, 8), -.15, .25, 0),
  at(new THREE.CylinderGeometry(.11, .1, .5, 48, 8), .15, .25, 0),
  at(new THREE.SphereGeometry(.065, 32, 24), -.13, 1.55, .3),
  at(new THREE.SphereGeometry(.065, 32, 24), .13, 1.55, .3),
  at(new THREE.TorusGeometry(.12, .025, 24, 64), 0, 1.92, 0, Math.PI / 2),
].map((g) => g.index ? g.toNonIndexed() : g);
const geo = mergeGeometries(parts);
const pos = new Float32Array(geo.attributes.position.array), nor = new Float32Array(geo.attributes.normal.array), uv = new Float32Array(geo.attributes.uv.array);
const indices = new Uint32Array(pos.length / 3).map((_, i) => i);

function makeDoc(texBytes, mime) {
  const d = new Document(); const b = d.createBuffer();
  const acc = (type, arr) => d.createAccessor().setType(type).setArray(arr).setBuffer(b);
  const tex = d.createTexture('panel').setImage(texBytes).setMimeType(mime);
  const mat = d.createMaterial('metal').setBaseColorTexture(tex).setRoughnessFactor(.45).setMetallicFactor(.6);
  const prim = d.createPrimitive().setMaterial(mat).setIndices(acc('SCALAR', indices))
    .setAttribute('POSITION', acc('VEC3', pos)).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('TEXCOORD_0', acc('VEC2', uv));
  const node = d.createNode('robot').setMesh(d.createMesh('robot').addPrimitive(prim));
  d.createScene('s').addChild(node);
  return d;
}
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRTextureBasisu, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const raw = makeDoc(new Uint8Array(png), 'image/png');
fs.writeFileSync(OUT + 'robot.raw.glb', await io.writeBinary(raw));
const optDoc = makeDoc(new Uint8Array(ktx), 'image/ktx2');
optDoc.createExtension(KHRTextureBasisu).setRequired(true);
await optDoc.transform(meshoptTransform({ encoder: MeshoptEncoder, level: 'high' }));
fs.writeFileSync(OUT + 'robot.opt.glb', await io.writeBinary(optDoc));

const stat = (f) => fs.statSync(OUT + f).size;
const stats = {
  texture: { width: SIZE, height: SIZE, rgba: SIZE * SIZE * 4, png: png.length, jpg: jpg.length, ktx2: ktx.length,
    vramRgba: Math.round(SIZE * SIZE * 4 * 4 / 3), vramBC7: Math.round(SIZE * SIZE * 4 / 3) },
  model: { triangles: indices.length / 3, vertices: pos.length / 3, geometryRaw: pos.byteLength + nor.byteLength + uv.byteLength + indices.byteLength,
    rawGlb: stat('robot.raw.glb'), optGlb: stat('robot.opt.glb'), geometryOpt: stat('robot.opt.glb') - ktx.length },
};
fs.writeFileSync(OUT + 'stats.json', JSON.stringify(stats, null, 2));
console.log(stats);
