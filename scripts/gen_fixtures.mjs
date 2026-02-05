import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { auditRootHash, canonicalSegmentBody, segmentHash, gapHash, chainHash } from '../src/audit_chain_v1_2.js';

function line(obj) {
  return JSON.stringify(obj);
}

function makeSegmentRecord(run_id, seg_id, events, start_ts, end_ts) {
  const body = {
    run_id,
    seg_id,
    start_ts,
    end_ts,
    count: events.length,
    sealed: true,
    events
  };
  const h = segmentHash(body);
  return { body, h };
}

function makeGapRecord(seg_id_start, seg_id_end, reason_code, reason_text) {
  const h = gapHash({ seg_id_start, seg_id_end, reason_code });
  const rec = { type: 'gap', seg_id_start, seg_id_end, reason_code, h, ch: null };
  if (reason_text) rec.reason_text = reason_text;
  return rec;
}

function buildFixtureGood() {
  const run_id = 'run_fixture_good';
  const root_ch = auditRootHash(run_id);

  const segInfo = makeSegmentRecord(
    run_id,
    0,
    [{ ts_ms: 1000, kind: 'example', value: 1 }],
    1000,
    1001
  );
  const seg = { ...segInfo.body, h: segInfo.h, ch: chainHash(root_ch, segInfo.h) };

  const seal = { type: 'seal', algo: 'sha256', root_ch, terminal_ch: seg.ch };

  return [
    { type: 'run', run_id, v: '1.1' },
    { type: 'segment', seg },
    seal
  ].map(line).join('\n') + '\n';
}

function buildFixtureGapMissingSegment() {
  const run_id = 'run_fixture_gap_missing';
  const root_ch = auditRootHash(run_id);

  const gap = makeGapRecord(0, 1, 1, 'missing_segment');
  gap.ch = chainHash(root_ch, gap.h);

  const seal = { type: 'seal', algo: 'sha256', root_ch, terminal_ch: gap.ch };

  return [
    { type: 'run', run_id },
    gap,
    seal
  ].map(line).join('\n') + '\n';
}

function buildFixtureGapHashMismatch() {
  // Start with a valid gap, then tamper a stable field without updating h/ch.
  const run_id = 'run_fixture_gap_mismatch';
  const root_ch = auditRootHash(run_id);

  const validGap = makeGapRecord(0, 1, 1, 'missing_segment');
  validGap.ch = chainHash(root_ch, validGap.h);

  const tampered = { ...validGap, seg_id_end: 2 };

  const seal = { type: 'seal', algo: 'sha256', root_ch, terminal_ch: tampered.ch };

  return [
    { type: 'run', run_id },
    tampered,
    seal
  ].map(line).join('\n') + '\n';
}

function buildFixtureBadJson() {
  const run_id = 'run_fixture_bad_json';
  const root_ch = auditRootHash(run_id);
  const gap = makeGapRecord(0, 1, 1, 'missing_segment');
  gap.ch = chainHash(root_ch, gap.h);

  // Intentionally insert invalid JSON in the middle (non-final).
  return [
    line({ type: 'run', run_id }),
    '{',
    line({ type: 'seal', algo: 'sha256', root_ch, terminal_ch: gap.ch })
  ].join('\n') + '\n';
}

function buildFixtureTamperedLine() {
  // Same as good.ndjson but with a wrong stored ch (h remains correct) => CHAIN_MISMATCH.
  const run_id = 'run_fixture_tampered_line';
  const root_ch = auditRootHash(run_id);

  const segInfo = makeSegmentRecord(
    run_id,
    0,
    [{ ts_ms: 1000, kind: 'example', value: 1 }],
    1000,
    1001
  );
  const correct_ch = chainHash(root_ch, segInfo.h);
  const seg = { ...segInfo.body, h: segInfo.h, ch: '0'.repeat(64) };

  const seal = { type: 'seal', algo: 'sha256', root_ch, terminal_ch: correct_ch };

  return [
    { type: 'run', run_id },
    { type: 'segment', seg },
    seal
  ].map(line).join('\n') + '\n';
}

function buildFixtureReorderedLines() {
  // Build two gaps in a valid chain, then reorder them to break the chain.
  const run_id = 'run_fixture_reordered';
  const root_ch = auditRootHash(run_id);

  const gap1 = makeGapRecord(0, 1, 1, 'missing_segment');
  gap1.ch = chainHash(root_ch, gap1.h);

  const gap2 = makeGapRecord(1, 2, 1, 'missing_segment');
  gap2.ch = chainHash(gap1.ch, gap2.h);

  const seal = { type: 'seal', algo: 'sha256', root_ch, terminal_ch: gap2.ch };

  // Reordered: gap2 before gap1.
  return [
    { type: 'run', run_id },
    gap2,
    gap1,
    seal
  ].map(line).join('\n') + '\n';
}

function buildFixtureTruncatedLine() {
  // Valid chain followed by a truncated final line.
  const run_id = 'run_fixture_truncated';
  const root_ch = auditRootHash(run_id);

  const gap = makeGapRecord(0, 1, 1, 'missing_segment');
  gap.ch = chainHash(root_ch, gap.h);

  const seal = { type: 'seal', algo: 'sha256', root_ch, terminal_ch: gap.ch };

  return [
    line({ type: 'run', run_id }),
    line(gap),
    line(seal),
    '{"type":"trace","note":"incomplete"'
  ].join('\n') + '\n';
}

function buildFixtureMissingSeal() {
  const run_id = 'run_fixture_missing_seal';
  const root_ch = auditRootHash(run_id);
  const gap = makeGapRecord(0, 1, 1, 'missing_segment');
  gap.ch = chainHash(root_ch, gap.h);

  return [
    { type: 'run', run_id },
    gap
  ].map(line).join('\n') + '\n';
}

const outDir = resolve(process.cwd(), 'fixtures');
mkdirSync(outDir, { recursive: true });

const fixtures = [
  { file: 'good.ndjson', contents: buildFixtureGood(), expected: { status: 'PASS' } },
  { file: 'gap_missing_segment.ndjson', contents: buildFixtureGapMissingSegment(), expected: { status: 'PASS' } },
  { file: 'gap_hash_mismatch.ndjson', contents: buildFixtureGapHashMismatch(), expected: { status: 'FAIL', reason_code: 'GAP_HASH_MISMATCH' } },
  { file: 'bad_json.ndjson', contents: buildFixtureBadJson(), expected: { status: 'FAIL', reason_code: 'BAD_JSON' } },
  { file: 'tampered_line.ndjson', contents: buildFixtureTamperedLine(), expected: { status: 'FAIL', reason_code: 'CHAIN_MISMATCH' } },
  { file: 'reordered_lines.ndjson', contents: buildFixtureReorderedLines(), expected: { status: 'FAIL', reason_code: 'CHAIN_MISMATCH' } },
  { file: 'truncated_line.ndjson', contents: buildFixtureTruncatedLine(), expected: { status: 'FAIL', reason_code: 'TRUNCATED_LAST_LINE' } },
  { file: 'missing_seal.ndjson', contents: buildFixtureMissingSeal(), expected: { status: 'FAIL', reason_code: 'MISSING_SEAL' } }
];

for (const f of fixtures) {
  writeFileSync(resolve(outDir, f.file), f.contents, 'utf8');
}

const manifest = fixtures.map(f => ({
  filename: `fixtures/${f.file}`,
  expected: f.expected,
  description: f.file
}));

writeFileSync(resolve(process.cwd(), 'FIXTURES_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`Wrote ${fixtures.length} fixtures + FIXTURES_MANIFEST.json`);
