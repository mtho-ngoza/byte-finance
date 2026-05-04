import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0); ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB

  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.42;
  const ringO = size * 0.28, ringI = size * 0.16;
  const stemW = size * 0.055;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const inSquare = Math.abs(dx) < outerR && Math.abs(dy) < outerR;

      let pr, pg, pb;
      if (!inSquare) {
        pr = 10; pg = 10; pb = 10; // dark outside
      } else {
        pr = 34; pg = 197; pb = 94; // #22c55e green bg
        // Draw ₿ symbol: vertical stem + two half-rings
        const inStem = Math.abs(dx) < stemW && Math.abs(dy) < outerR * 0.65;
        const inTopRing = r < ringO && dy < outerR * 0.1 && r > ringI;
        const inBotRing = r < ringO * 0.82 && dy > -outerR * 0.1 && r > ringI * 0.82;
        if (inStem || inTopRing || inBotRing) { pr = 255; pg = 255; pb = 255; }
      }
      row[1 + x * 3] = pr; row[1 + x * 3 + 1] = pg; row[1 + x * 3 + 2] = pb;
    }
    rows.push(row);
  }

  const compressed = zlib.deflateSync(Buffer.concat(rows), { level: 6 });
  return Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(iconsDir, { recursive: true });
fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), makePNG(192));
console.log('✓ icon-192.png');
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), makePNG(512));
console.log('✓ icon-512.png');
console.log('Done — valid PNG icons generated in public/icons/');
