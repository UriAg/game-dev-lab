// Comprime el material del piso a KTX2. Se usan color, normal y rugosidad.
// Uso: node scripts/build-floor.mjs color.jpg normal.png roughness.jpg
import fs from 'node:fs';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const [color, normal, rough] = process.argv.slice(2);
if (!rough) throw new Error('Faltan las rutas de color, normal y rugosidad');
const imageDecoder = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8Array(data), width: info.width, height: info.height }; };

// KTX2 no puede invertirse al cargar: se invierte acá para que la normal conserve su orientación.
const encode = async (src, out, options) => {
  const png = await sharp(src).resize(1024, 1024).flip().toColourspace('srgb').png().toBuffer();
  const ktx = await encodeToKTX2(new Uint8Array(png), { generateMipmap: true, imageDecoder, ...options });
  fs.writeFileSync(`public/assets/${out}`, ktx);
  console.log(`${out}: ${ktx.length} bytes`);
};
await encode(color, 'floor.ktx2', { isUASTC: false, qualityLevel: 180, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true });
await encode(normal, 'floor.normal.ktx2', { isUASTC: true, isNormalMap: true, isSetKTX2SRGBTransferFunc: false, needSupercompression: true });
await encode(rough, 'floor.rough.ktx2', { isUASTC: false, qualityLevel: 150, compressionLevel: 2, isSetKTX2SRGBTransferFunc: false });
