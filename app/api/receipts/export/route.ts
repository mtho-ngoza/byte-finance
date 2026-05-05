import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, PassThrough } from 'stream';

/**
 * GET /api/receipts/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=zip|csv
 *
 * Exports receipts for tax purposes:
 * - format=csv  → CSV summary (default, fast)
 * - format=zip  → ZIP containing all images + CSV summary
 */
export async function GET(request: NextRequest) {
  const auth = await withAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const format = searchParams.get('format') ?? 'csv';

  const db = getAdminDb();

  // Build query
  let query = db
    .collection(`users/${userId}/receipts`)
    .orderBy('capturedAt', 'desc');

  const receipts = (await query.limit(500).get()).docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      vendor: data.vendor ?? '',
      amountInCents: data.amountInCents ?? 0,
      note: data.note ?? '',
      capturedAt: data.capturedAt?.toDate?.()?.toISOString() ?? '',
      imageUrl: data.imageUrl ?? '',
      originalImageUrl: data.originalImageUrl ?? '',
      vatNumber: data.vatNumber ?? '',
      cycleItemId: data.cycleItemId ?? '',
    };
  }).filter((r) => {
    if (!from && !to) return true;
    const date = r.capturedAt.slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });

  const dateLabel = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);

  // ── CSV export ──────────────────────────────────────────────────────────────
  if (format === 'csv') {
    const rows = [
      ['Date', 'Vendor', 'Amount (R)', 'VAT Number', 'Note', 'Linked to Cycle Item', 'Receipt ID'],
      ...receipts.map((r) => [
        r.capturedAt.slice(0, 10),
        escapeCsv(r.vendor),
        (r.amountInCents / 100).toFixed(2),
        escapeCsv(r.vatNumber),
        escapeCsv(r.note),
        r.cycleItemId ? 'Yes' : 'No',
        r.id,
      ]),
    ];
    const csv = rows.map((row) => row.join(',')).join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="receipts-${dateLabel}.csv"`,
      },
    });
  }

  // ── ZIP export ──────────────────────────────────────────────────────────────
  if (format === 'zip') {
    // Build a simple ZIP manually (no external deps needed for basic ZIP)
    // We'll use a streaming approach with the ZIP format
    const bucket = getAdminStorage().bucket();

    // Build CSV content
    const csvRows = [
      ['Date', 'Vendor', 'Amount (R)', 'VAT Number', 'Note', 'Image File', 'Receipt ID'],
      ...receipts.map((r) => [
        r.capturedAt.slice(0, 10),
        escapeCsv(r.vendor),
        (r.amountInCents / 100).toFixed(2),
        escapeCsv(r.vatNumber),
        escapeCsv(r.note),
        `images/${r.id}.jpg`,
        r.id,
      ]),
    ];
    const csvContent = csvRows.map((row) => row.join(',')).join('\n');

    // Download all images
    const imageBuffers: Array<{ name: string; data: Buffer }> = [];
    for (const receipt of receipts) {
      if (!receipt.imageUrl) continue;
      try {
        const match = receipt.imageUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
        if (!match) continue;
        const storagePath = decodeURIComponent(match[1]);
        const [buffer] = await bucket.file(storagePath).download();
        imageBuffers.push({ name: `images/${receipt.id}.jpg`, data: buffer });
      } catch {
        // Skip images that fail to download
      }
    }

    // Build ZIP using raw ZIP format
    const zipBuffer = buildZip([
      { name: 'receipts.csv', data: Buffer.from(csvContent, 'utf-8') },
      ...imageBuffers,
    ]);

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="receipts-${dateLabel}.zip"`,
      },
    });
  }

  return NextResponse.json({ error: 'Invalid format. Use csv or zip.' }, { status: 400 });
}

// ---------------------------------------------------------------------------
// Minimal ZIP builder (no external deps)
// ---------------------------------------------------------------------------

function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf-8');
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);  // signature
    localHeader.writeUInt16LE(20, 4);           // version needed
    localHeader.writeUInt16LE(0, 6);            // flags
    localHeader.writeUInt16LE(0, 8);            // compression (stored)
    localHeader.writeUInt16LE(0, 10);           // mod time
    localHeader.writeUInt16LE(0, 12);           // mod date
    localHeader.writeUInt32LE(crc, 14);         // crc32
    localHeader.writeUInt32LE(size, 18);        // compressed size
    localHeader.writeUInt32LE(size, 22);        // uncompressed size
    localHeader.writeUInt16LE(nameBytes.length, 26); // name length
    localHeader.writeUInt16LE(0, 28);           // extra length
    nameBytes.copy(localHeader, 30);

    // Central directory entry
    const cdEntry = Buffer.alloc(46 + nameBytes.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);  // signature
    cdEntry.writeUInt16LE(20, 4);          // version made by
    cdEntry.writeUInt16LE(20, 6);          // version needed
    cdEntry.writeUInt16LE(0, 8);           // flags
    cdEntry.writeUInt16LE(0, 10);          // compression
    cdEntry.writeUInt16LE(0, 12);          // mod time
    cdEntry.writeUInt16LE(0, 14);          // mod date
    cdEntry.writeUInt32LE(crc, 16);        // crc32
    cdEntry.writeUInt32LE(size, 20);       // compressed size
    cdEntry.writeUInt32LE(size, 24);       // uncompressed size
    cdEntry.writeUInt16LE(nameBytes.length, 28); // name length
    cdEntry.writeUInt16LE(0, 30);          // extra length
    cdEntry.writeUInt16LE(0, 32);          // comment length
    cdEntry.writeUInt16LE(0, 34);          // disk start
    cdEntry.writeUInt16LE(0, 36);          // internal attrs
    cdEntry.writeUInt32LE(0, 38);          // external attrs
    cdEntry.writeUInt32LE(offset, 42);     // local header offset
    nameBytes.copy(cdEntry, 46);

    parts.push(localHeader, file.data);
    centralDir.push(cdEntry);
    offset += localHeader.length + size;
  }

  const cdBuffer = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);          // signature
  eocd.writeUInt16LE(0, 4);                    // disk number
  eocd.writeUInt16LE(0, 6);                    // disk with cd
  eocd.writeUInt16LE(files.length, 8);         // entries on disk
  eocd.writeUInt16LE(files.length, 10);        // total entries
  eocd.writeUInt32LE(cdBuffer.length, 12);     // cd size
  eocd.writeUInt32LE(offset, 16);              // cd offset
  eocd.writeUInt16LE(0, 20);                   // comment length

  return Buffer.concat([...parts, cdBuffer, eocd]);
}

function crc32(buf: Buffer): number {
  const table = makeCrcTable();
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crcTable: Uint32Array | null = null;
function makeCrcTable(): Uint32Array {
  if (_crcTable) return _crcTable;
  _crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    _crcTable[n] = c;
  }
  return _crcTable;
}

function escapeCsv(value: string): string {
  if (!value) return '';
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
