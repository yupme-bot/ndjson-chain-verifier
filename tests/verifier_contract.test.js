import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verifyNdjsonStream, verifyZipEvidencePack } from '../src/index.js';

const F = {
  good: 'fixtures/good.ndjson',
  gapMissing: 'fixtures/gap_missing_segment.ndjson',
  gapHashMismatch: 'fixtures/gap_hash_mismatch.ndjson',
  badJson: 'fixtures/bad_json.ndjson',
  tamperedLine: 'fixtures/tampered_line.ndjson',
  reorderedLines: 'fixtures/reordered_lines.ndjson',
  truncatedLine: 'fixtures/truncated_line.ndjson',
  missingSeal: 'fixtures/missing_seal.ndjson',
};

async function v(path, opts = {}) {
  return await verifyNdjsonStream(path, opts);
}

function makeZipStoreSingleFile(entryName, entryBytes) {
  const nameBuf = Buffer.from(entryName, 'utf8');
  const dataBuf = Buffer.isBuffer(entryBytes) ? entryBytes : Buffer.from(entryBytes);
  const compSize = dataBuf.length;
  const uncompSize = dataBuf.length;

  // Local file header
  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(0, 8); // method: store
  local.writeUInt16LE(0, 10); // mtime
  local.writeUInt16LE(0, 12); // mdate
  local.writeUInt32LE(0, 14); // crc32 (ignored by our reader)
  local.writeUInt32LE(compSize, 18);
  local.writeUInt32LE(uncompSize, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra len
  nameBuf.copy(local, 30);

  const localHeaderOff = 0;
  const fileDataOff = local.length;

  // Central directory file header
  const cen = Buffer.alloc(46 + nameBuf.length);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4); // version made by
  cen.writeUInt16LE(20, 6); // version needed
  cen.writeUInt16LE(0, 8); // flags
  cen.writeUInt16LE(0, 10); // method
  cen.writeUInt16LE(0, 12); // mtime
  cen.writeUInt16LE(0, 14); // mdate
  cen.writeUInt32LE(0, 16); // crc32
  cen.writeUInt32LE(compSize, 20);
  cen.writeUInt32LE(uncompSize, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30); // extra
  cen.writeUInt16LE(0, 32); // comment
  cen.writeUInt16LE(0, 34); // disk start
  cen.writeUInt16LE(0, 36); // int attrs
  cen.writeUInt32LE(0, 38); // ext attrs
  cen.writeUInt32LE(localHeaderOff, 42);
  nameBuf.copy(cen, 46);

  const centralOffset = local.length + dataBuf.length;
  const centralSize = cen.length;

  // EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // cd disk
  eocd.writeUInt16LE(1, 8); // entries on disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([local, dataBuf, cen, eocd]);
}

// PASS fixtures

test('fixtures/good.ndjson -> PASS', async () => {
  const res = await v(F.good);
  assert.equal(res.status, 'PASS');
  assert.equal(res.reason_code, null);
});

test('fixtures/gap_missing_segment.ndjson -> PASS', async () => {
  const res = await v(F.gapMissing);
  assert.equal(res.status, 'PASS');
  assert.equal(res.reason_code, null);
  assert.equal(res.gaps, 1);
});

// FAIL fixtures

test('fixtures/gap_hash_mismatch.ndjson -> FAIL: GAP_HASH_MISMATCH', async () => {
  const res = await v(F.gapHashMismatch);
  assert.equal(res.status, 'FAIL');
  assert.equal(res.reason_code, 'GAP_HASH_MISMATCH');
});

test('fixtures/bad_json.ndjson -> FAIL: BAD_JSON', async () => {
  const res = await v(F.badJson);
  assert.equal(res.status, 'FAIL');
  assert.equal(res.reason_code, 'BAD_JSON');
});

test('fixtures/tampered_line.ndjson -> FAIL: CHAIN_MISMATCH', async () => {
  const res = await v(F.tamperedLine);
  assert.equal(res.status, 'FAIL');
  assert.equal(res.reason_code, 'CHAIN_MISMATCH');
});

test('fixtures/reordered_lines.ndjson -> FAIL: CHAIN_MISMATCH', async () => {
  const res = await v(F.reorderedLines);
  assert.equal(res.status, 'FAIL');
  assert.equal(res.reason_code, 'CHAIN_MISMATCH');
});

test('fixtures/truncated_line.ndjson -> FAIL unless allowPartial, then PARTIAL', async () => {
  const failRes = await v(F.truncatedLine);
  assert.equal(failRes.status, 'FAIL');
  assert.equal(failRes.reason_code, 'TRUNCATED_LAST_LINE');

  const partialRes = await v(F.truncatedLine, { allowPartial: true });
  assert.equal(partialRes.status, 'PARTIAL');
  assert.equal(partialRes.reason_code, 'TRUNCATED_LAST_LINE');
});

test('fixtures/missing_seal.ndjson -> FAIL unless allowPartial, then PARTIAL', async () => {
  const failRes = await v(F.missingSeal);
  assert.equal(failRes.status, 'FAIL');
  assert.equal(failRes.reason_code, 'MISSING_SEAL');

  const partialRes = await v(F.missingSeal, { allowPartial: true });
  assert.equal(partialRes.status, 'PARTIAL');
  assert.equal(partialRes.reason_code, 'MISSING_SEAL');
});

// ZIP evidence pack support (single NDJSON in ZIP)

test('verifyZipEvidencePack: PASS for ZIP containing one NDJSON', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndjson-chain-zip-'));
  const zipPath = join(dir, 'pack.zip');
  const nd = readFileSync(F.good);
  const zipBuf = makeZipStoreSingleFile('evidence.ndjson', nd);
  writeFileSync(zipPath, zipBuf);

  const res = await verifyZipEvidencePack(zipPath, {});
  assert.equal(res.status, 'PASS');
  assert.equal(res.reason_code, null);
});
