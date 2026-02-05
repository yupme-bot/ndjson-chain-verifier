import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import yazl from 'yazl';

import { verifyZipEvidencePack } from '../src/verify_zip.js';
import { ISSUE } from '../src/errors.js';

function makeZipWithFiles(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gv_zip_'));
  const outPath = join(dir, 'pack.zip');

  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    for (const [name, buf] of Object.entries(files)) {
      zipfile.addBuffer(Buffer.isBuffer(buf) ? buf : Buffer.from(buf), name);
    }
    zipfile.end();

    const out = [];
    zipfile.outputStream.on('data', (d) => out.push(d));
    zipfile.outputStream.on('error', reject);
    zipfile.outputStream.on('end', () => {
      const zipBuf = Buffer.concat(out);
      writeFileSync(outPath, zipBuf);
      resolve({ outPath, zipBuf });
    });
  });
}

test('zip with good.ndjson verifies authentic', async () => {
  const good = readFileSync('./tests/fixtures/good.ndjson');
  const { outPath } = await makeZipWithFiles({ 'evidence/proof.ndjson': good });

  const res = await verifyZipEvidencePack(outPath, {});
  assert.equal(res.is_authentic, true);
  assert.equal(res.artifacts.length, 1);
  assert.equal(res.artifacts[0].result.is_authentic, true);
});

test('expectedFiles missing fails in strict', async () => {
  const good = readFileSync('./tests/fixtures/good.ndjson');
  const { outPath } = await makeZipWithFiles({ 'evidence/proof.ndjson': good });

  const res = await verifyZipEvidencePack(outPath, { expectedFiles: ['MISSING.txt'] });
  assert.equal(res.is_authentic, false);
  assert.equal(res.errors[0].code, ISSUE.E_ZIP_EXPECTED_MISSING);
});

test('zip limits can fail fast (maxEntries)', async () => {
  const { outPath } = await makeZipWithFiles({
    'a.ndjson': readFileSync('./tests/fixtures/good.ndjson'),
    'b.txt': 'x'
  });

  const res = await verifyZipEvidencePack(outPath, { maxEntries: 1 });
  assert.equal(res.is_authentic, false);
  assert.equal(res.errors[0].code, ISSUE.E_ZIP_LIMIT);
});
