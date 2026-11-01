// Comprime el personaje de la sala 6: textura a KTX2 de 1024 y geometría con meshopt.
// Uso: node scripts/build-horror.mjs ruta/al/modelo.glb
import fs from 'node:fs';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { meshopt as meshoptTransform } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { encodeToKTX2 } from 'ktx2-encoder';

const [src] = process.argv.slice(2);
if (!src) throw new Error('Falta la ruta del .glb');
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);

const imageDecoder = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; };
for (const tex of doc.getRoot().listTextures()) {
  const png = await sharp(tex.getImage()).resize(1024, 1024, { fit: 'inside' }).png().toBuffer();
  const ktx = await encodeToKTX2(new Uint8Array(png), { isUASTC: false, qualityLevel: 180, compressionLevel: 2, generateMipmap: true, imageDecoder });
  tex.setImage(new Uint8Array(ktx)).setMimeType('image/ktx2');
}
doc.createExtension(KHRTextureBasisu).setRequired(true);
await doc.transform(meshoptTransform({ encoder: MeshoptEncoder, level: 'high' }));
fs.writeFileSync('public/assets/horror.opt.glb', await io.writeBinary(doc));
console.log(`horror.opt.glb: ${fs.statSync('public/assets/horror.opt.glb').size} bytes (original ${fs.statSync(src).size})`);
