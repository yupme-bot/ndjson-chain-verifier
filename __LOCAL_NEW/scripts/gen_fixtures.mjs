import { writeFileSync } from 'node:fs';
import { stableStringify } from '../src/stable_stringify.js';
import { canonicalHashBody } from '../src/canonical_hash.js';
import { computeRecordHash } from '../src/hash.js';

function makeRecord(base, prevH) {
  const rec = { ...base };
  rec.p_h = prevH ?? null;
  const bodyJson = stableStringify(canonicalHashBody(rec));
  rec.h = computeRecordHash({ p_h: rec.p_h, canonical_body_json: bodyJson });
  return rec;
}

const records = [];
let prevH = null;
records.push(makeRecord({ ts_ms: 1000, type: 'event', msg: 'hello' }, prevH));
prevH = records.at(-1).h;
records.push(makeRecord({ ts_ms: 1001, type: 'gap', reason_code: 2, reason_text: 'display only' }, prevH));
prevH = records.at(-1).h;
records.push(makeRecord({ ts_ms: 1002, type: 'event', msg: 'world', count: 1 }, prevH));

const ndjson = records.map(r => JSON.stringify(r)).join('\n') + '\n';
writeFileSync(new URL('../tests/fixtures/good.ndjson', import.meta.url), ndjson);

// bad JSON fixture
writeFileSync(new URL('../tests/fixtures/bad_json.ndjson', import.meta.url), '{"a":1\n');

// tampered fixture: take good then change msg
const tampered = records.map((r, i) => {
  if (i === 2) return JSON.stringify({ ...r, msg: 'WORLD' });
  return JSON.stringify(r);
}).join('\n') + '\n';
writeFileSync(new URL('../tests/fixtures/tampered.ndjson', import.meta.url), tampered);
