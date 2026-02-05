import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

function u16(buf, off) { return buf.readUInt16LE(off); }
function u32(buf, off) { return buf.readUInt32LE(off); }

function findEocdOffset(buf) {
  // EOCD is located within the last 64k+22 bytes.
  const maxSearch = Math.min(buf.length, 0xffff + 22);
  for (let i = buf.length - 22; i >= buf.length - maxSearch; i--) {
    if (i < 0) break;
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

export function listZipEntries(zipPath) {
  const buf = readFileSync(zipPath);
  const eocd = findEocdOffset(buf);
  if (eocd < 0) throw new Error('Invalid ZIP: missing EOCD.');

  const totalEntries = u16(buf, eocd + 10);
  const cenSize = u32(buf, eocd + 12);
  const cenOffset = u32(buf, eocd + 16);

  let off = cenOffset;
  const entries = [];
  for (let idx = 0; idx < totalEntries; idx++) {
    if (u32(buf, off) !== SIG_CEN) throw new Error('Invalid ZIP: bad central directory.');

    const gpFlags = u16(buf, off + 8);
    const method = u16(buf, off + 10);
    const compSize = u32(buf, off + 20);
    const uncompSize = u32(buf, off + 24);
    const nameLen = u16(buf, off + 28);
    const extraLen = u16(buf, off + 30);
    const commentLen = u16(buf, off + 32);
    const localHeaderOff = u32(buf, off + 42);

    const nameStart = off + 46;
    const name = buf.slice(nameStart, nameStart + nameLen).toString('utf8');

    entries.push({
      name,
      gpFlags,
      method,
      compSize,
      uncompSize,
      localHeaderOff,
    });

    off = nameStart + nameLen + extraLen + commentLen;
  }

  // Basic consistency check.
  if (cenOffset + cenSize > buf.length) {
    throw new Error('Invalid ZIP: central directory out of bounds.');
  }

  return { buffer: buf, entries };
}

export function readZipEntryBytes(zipInfo, entry, maxBytes = 200 * 1024 * 1024) {
  const buf = zipInfo.buffer;
  if ((entry.gpFlags & 0x1) !== 0) throw new Error('Unsupported ZIP: encrypted entries are not supported.');

  const loc = entry.localHeaderOff;
  if (u32(buf, loc) !== SIG_LOC) throw new Error('Invalid ZIP: bad local header.');

  const nameLen = u16(buf, loc + 26);
  const extraLen = u16(buf, loc + 28);
  const dataStart = loc + 30 + nameLen + extraLen;
  const dataEnd = dataStart + entry.compSize;
  if (dataEnd > buf.length) throw new Error('Invalid ZIP: entry data out of bounds.');

  if (entry.uncompSize > maxBytes) throw new Error('ZIP entry too large for this verifier limit.');

  const compressed = buf.slice(dataStart, dataEnd);
  if (entry.method === 0) {
    // Stored
    return compressed;
  }
  if (entry.method === 8) {
    // Deflate (raw)
    const out = inflateRawSync(compressed);
    if (out.length !== entry.uncompSize) {
      // Some zippers may not fill uncompSize accurately, but we keep this strict.
      // The verifier is allowed to be conservative.
      throw new Error('Invalid ZIP: decompressed size mismatch.');
    }
    return out;
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.method}`);
}
