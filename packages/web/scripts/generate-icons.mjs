/**
 * Generate PNG icons from the SVG source for PWA manifest.
 *
 * Usage:
 *   bun packages/web/scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "public", "icons");

const R = 0x4f;
const G = 0x46;
const B = 0xe5;

function generatePng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(2, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const rowBytes = 1 + size * 3;
  const raw = Buffer.alloc(rowBytes * size);
  const cr = Math.round(size * (64 / 512));

  for (let y = 0; y < size; y++) {
    const ro = y * rowBytes;
    raw[ro] = 0;
    for (let x = 0; x < size; x++) {
      const po = ro + 1 + x * 3;
      const inR = isInRR(x, y, size, size, cr);
      if (!inR) { raw[po]=0xff; raw[po+1]=0xff; raw[po+2]=0xff; }
      else if (isS(x, y, size)) { raw[po]=0xff; raw[po+1]=0xff; raw[po+2]=0xff; }
      else { raw[po]=R; raw[po+1]=G; raw[po+2]=B; }
    }
  }

  const compressed = deflateSync(raw);
  return Buffer.concat([signature, mkC("IHDR", ihdr), mkC("IDAT", compressed), mkC("IEND", Buffer.alloc(0))]);
}

function isInRR(x, y, w, h, r) {
  if (x < r && y < r) return (r-x)**2 + (r-y)**2 <= r**2;
  if (x >= w-r && y < r) return (x-(w-r-1))**2 + (r-y)**2 <= r**2;
  if (x < r && y >= h-r) return (r-x)**2 + (y-(h-r-1))**2 <= r**2;
  if (x >= w-r && y >= h-r) return (x-(w-r-1))**2 + (y-(h-r-1))**2 <= r**2;
  return x >= 0 && x < w && y >= 0 && y < h;
}

function isS(x, y, size) {
  const nx = x/size, ny = y/size;
  const l=0.28, r=0.72, t=0.18, b=0.82, m=(t+b)/2, th=0.09;
  if (nx<l||nx>r||ny<t||ny>b) return false;
  if (ny>=t && ny<t+th && nx>=l && nx<=r) return true;
  if (nx>=l && nx<l+th && ny>=t && ny<m) return true;
  if (ny>=m-th/2 && ny<m+th/2 && nx>=l && nx<=r) return true;
  if (nx>r-th && nx<=r && ny>=m && ny<=b) return true;
  if (ny>b-th && ny<=b && nx>=l && nx<=r) return true;
  return false;
}

function mkC(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const cd = Buffer.concat([tb, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(cd), 0);
  return Buffer.concat([len, tb, data, c]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let j = 0; j < 8; j++) c = (c>>>1) ^ (c&1 ? 0xedb88320 : 0); }
  return (c ^ 0xffffffff) >>> 0;
}

mkdirSync(ICONS_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = generatePng(size);
  const path = join(ICONS_DIR, "icon-" + size + ".png");
  writeFileSync(path, png);
  console.log("Generated " + path + " (" + png.length + " bytes)");
}
console.log("Done.");
