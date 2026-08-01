#!/usr/bin/env node
// Packs dist/ into a distributable .zip, with no dependencies (same rule as
// gen-icons.mjs). Writing the archive by hand is ~90 lines and keeps the
// release path working on any machine with Node, zip binary or not.
//
//   npm run build && npm run zip   →  insight-tag-checker-<version>.zip
//
// Entries are sorted and stamped with a fixed timestamp, so rebuilding the same
// commit produces a byte-identical archive.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';

// 2020-01-01 00:00:00 in DOS date/time — fixed so the archive is reproducible.
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST);
if (files.length === 0) {
  console.error('dist/ is empty — run `npm run build` first.');
  process.exit(1);
}

const local = [];
const central = [];
let offset = 0;

for (const file of files) {
  // Zip entries always use forward slashes, whatever the host platform uses.
  const name = Buffer.from(relative(DIST, file).split(sep).join('/'));
  const raw = readFileSync(file);
  const deflated = deflateRawSync(raw, { level: 9 });
  // Only compress when it actually helps; otherwise store the bytes verbatim.
  const useDeflate = deflated.length < raw.length;
  const body = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(raw);

  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // flags
  header.writeUInt16LE(method, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(body.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28); // extra field length
  local.push(header, name, body);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0); // central directory header signature
  entry.writeUInt16LE(20, 4); // version made by
  entry.writeUInt16LE(20, 6); // version needed
  entry.writeUInt16LE(0, 8); // flags
  entry.writeUInt16LE(method, 10);
  entry.writeUInt16LE(DOS_TIME, 12);
  entry.writeUInt16LE(DOS_DATE, 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(raw.length, 24);
  entry.writeUInt16LE(name.length, 28);
  entry.writeUInt16LE(0, 30); // extra field length
  entry.writeUInt16LE(0, 32); // file comment length
  entry.writeUInt16LE(0, 34); // disk number start
  entry.writeUInt16LE(0, 36); // internal attributes
  entry.writeUInt32LE(0o644 << 16, 38); // external attributes (unix mode)
  entry.writeUInt32LE(offset, 42);
  central.push(entry, name);

  offset += header.length + name.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
end.writeUInt16LE(0, 4); // this disk
end.writeUInt16LE(0, 6); // disk with central directory
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20); // comment length

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const out = process.argv[2] || `insight-tag-checker-${version}.zip`;
const archive = Buffer.concat([...local, centralBuf, end]);
writeFileSync(out, archive);

console.log(`${out} — ${files.length} files, ${Math.ceil(archive.length / 1024)} KB`);
