// Prepara un modelo para la web: simplifica la malla, une piezas, texturas KTX2 de 512 y meshopt.
// Uso: node scripts/build-model.mjs entrada.glb salida.glb [triángulos máximos]
import fs from 'node:fs';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, flatten, getTextureColorSpace, join, meshopt as meshoptTransform, metalRough, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';

const [src, out, maxTris = '8000'] = process.argv.slice(2);
if (!out) throw new Error('Uso: entrada.glb salida.glb [triángulos]');
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const count = () => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);

await doc.transform(metalRough(), dedup(), flatten(), join(), weld());
const before = count(), ratio = Math.min(1, Number(maxTris) / before);
if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: Number(process.env.SIMPLIFY_ERROR ?? .02) }));
await doc.transform(prune());

const imageDecoder = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; };
for (const tex of doc.getRoot().listTextures()) {
  const png = await sharp(tex.getImage()).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const srgb = getTextureColorSpace(tex) === 'srgb';
  const ktx = await encodeToKTX2(new Uint8Array(png), { isUASTC: false, qualityLevel: 150, compressionLevel: 2, generateMipmap: true, imageDecoder, isSetKTX2SRGBTransferFunc: srgb });
  tex.setImage(new Uint8Array(ktx)).setMimeType('image/ktx2');
}
if (doc.getRoot().listTextures().length) doc.createExtension(KHRTextureBasisu).setRequired(true);
await doc.transform(meshoptTransform({ encoder: MeshoptEncoder, level: 'medium' }));
fs.writeFileSync(out, await io.writeBinary(doc));
console.log(`RESULT ${out.split('/').pop()}: ${Math.round(before)} -> ${Math.round(count())} tris, ${fs.statSync(src).size} -> ${fs.statSync(out).size} bytes`);
