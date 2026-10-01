// Regenerates the PNG icons from app/icon.svg. Run: node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../app/icon.svg', import.meta.url));
const out = (n) => new URL(`../public/${n}`, import.meta.url);
const BG = '#10142a';

async function plain(size, name) {
  await writeFile(out(name), await sharp(svg, { density: 768 }).resize(size, size).png().toBuffer());
}
// Maskable: full-bleed background, artwork kept inside the 80% safe zone.
async function maskable(size, name) {
  const inner = Math.round(size * 0.68);
  const art = await sharp(svg, { density: 768 }).resize(inner, inner).png().toBuffer();
  await writeFile(out(name), await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'center' }]).png().toBuffer());
}
await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await maskable(512, 'icon-maskable-512.png');
await maskable(180, 'apple-touch-icon.png'); // iOS rounds corners itself; opaque bg required
