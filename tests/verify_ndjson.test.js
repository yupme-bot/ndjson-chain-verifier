import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { verifyNdjsonStream } from '../src/verify_ndjson.js';
import { ISSUE } from '../src/errors.js';
import { auditRootHash, gapHash, chainHash } from '../src/audit_chain_v1_2.js';

test('good fixture verifies authentic', async () => {
  const res = await verifyNdjsonStream('./tests/fixtures/good.ndjson', {});
  assert.equal(res.status, 'ok');
  assert.equal(res.is_authentic, true);
  assert.equal(res.verified_chain_records, 1);
  assert.equal(res.run_id, 'run_test_1');
  assert.equal(res.root_ch, auditRootHash('run_test_1'));
  assert.equal(typeof res.last_ch, 'string');
});

test('tampered fixture fails with gap hash mismatch', async () => {
  const res = await verifyNdjsonStream('./tests/fixtures/tampered.ndjson', {});
  assert.equal(res.is_authentic, false);
  assert.equal(res.status, 'invalid');
  assert.equal(res.errors[0].code, ISSUE.E_GAP_HASH_MISMATCH);
});

test('bad json fixture fails with JSON parse error', async () => {
  const res = await verifyNdjsonStream('./tests/fixtures/bad_json.ndjson', {});
  assert.equal(res.is_authentic, false);
  assert.equal(res.status, 'invalid');
  assert.equal(res.errors[0].code, ISSUE.E_JSON_PARSE);
});

test('ordering violation (segment/gap after trace) fails', async () => {
  const good = readFileSync('./tests/fixtures/good.ndjson', 'utf8').trim().split('\n');
  const nd = [good[0], '{"type":"trace","note":"fixture"}', good[1], good[2]].join('\n') + '\n';

  const res = await verifyNdjsonStream(Buffer.from(nd), {});
  assert.equal(res.is_authentic, false);
  assert.equal(res.status, 'invalid');
  assert.equal(res.errors[0].code, ISSUE.E_SEGMENT_AFTER_TRACE);
});

test('unknown gap reason_code fails even if hash matches', async () => {
  const run_id = 'run_test_1';
  const root_ch = auditRootHash(run_id);

  const gapBody = { seg_id_start: 0, seg_id_end: 1, reason_code: 99 };
  const h = gapHash(gapBody);
  const ch = chainHash(root_ch, h);

  const nd = [
    JSON.stringify({ type: 'run', run_id }),
    JSON.stringify({ type: 'gap', ...gapBody, h, ch, reason_text: 'unknown' }),
    JSON.stringify({ type: 'seal', algo: 'sha256', root_ch, terminal_ch: ch }),
    ''
  ].join('\n');

  const res = await verifyNdjsonStream(Buffer.from(nd), {});
  assert.equal(res.is_authentic, false);
  assert.equal(res.status, 'invalid');
  assert.equal(res.errors[0].code, ISSUE.E_GAP_REASON_UNKNOWN);
});

test('unknown record type fails in strict', async () => {
  const nd = [
    JSON.stringify({ type: 'run', run_id: 'run_test_1' }),
    JSON.stringify({ type: 'mystery', hello: 'world' }),
    ''
  ].join('\n');

  const res = await verifyNdjsonStream(Buffer.from(nd), {});
  assert.equal(res.is_authentic, false);
  assert.equal(res.status, 'invalid');
  assert.equal(res.errors[0].code, ISSUE.E_UNKNOWN_TYPE);
});
