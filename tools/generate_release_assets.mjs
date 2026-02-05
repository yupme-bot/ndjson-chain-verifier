import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  auditRootHash,
  canonicalSegmentBody,
  segmentHash,
  gapHash,
  chainHash,
} from '../src/audit_chain_v1_2.js';

function buildEvents(startIdx, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const ts = startIdx + i;
    // Keep event objects tiny but realistic.
    out[i] = { ts_ms: ts, kind: 'demo' };
  }
  return out;
}

function buildNdjson({ run_id, total_events, seg_events, gaps }) {
  const root_ch = auditRootHash(run_id);
  let prev_ch = root_ch;

  const lines = [];
  lines.push(JSON.stringify({ type: 'run', run_id, v: '1.1' }));

  const total_segs = Math.ceil(total_events / seg_events);
  const gapByStart = new Map(gaps.map((g) => [g.seg_id_start, g]));

  for (let seg_id = 0; seg_id < total_segs; ) {
    const g = gapByStart.get(seg_id);
    if (g) {
      const expected_h = gapHash({
        seg_id_start: g.seg_id_start,
        seg_id_end: g.seg_id_end,
        reason_code: g.reason_code,
      });
      const ch = chainHash(prev_ch, expected_h);
      prev_ch = ch;

      const reason_text = g.reason_code === 2 ? 'worker_failure' : 'missing_segment';

      lines.push(
        JSON.stringify({
          type: 'gap',
          seg_id_start: g.seg_id_start,
          seg_id_end: g.seg_id_end,
          reason_code: g.reason_code,
          reason_text,
          h: expected_h,
          ch,
        })
      );

      seg_id = g.seg_id_end;
      continue;
    }

    const start_idx = seg_id * seg_events;
    const count = Math.max(0, Math.min(seg_events, total_events - start_idx));
    const events = buildEvents(start_idx, count);

    const seg = {
      run_id,
      seg_id,
      start_ts: events.length ? events[0].ts_ms : start_idx,
      end_ts: events.length ? events[events.length - 1].ts_ms : start_idx,
      count,
      sealed: true,
      events,
    };

    const segBody = canonicalSegmentBody(seg);
    const expected_h = segmentHash(segBody);
    const ch = chainHash(prev_ch, expected_h);
    prev_ch = ch;

    lines.push(
      JSON.stringify({
        type: 'segment',
        seg: {
          run_id: seg.run_id,
          seg_id: seg.seg_id,
          start_ts: seg.start_ts,
          end_ts: seg.end_ts,
          count: seg.count,
          sealed: seg.sealed,
          events: seg.events,
          h: expected_h,
          ch,
        },
      })
    );

    seg_id++;
  }

  lines.push(
    JSON.stringify({
      type: 'seal',
      algo: 'sha256',
      root_ch,
      terminal_ch: prev_ch,
    })
  );

  return lines.join('\n') + '\n';
}

function writeOut(name, text) {
  const outDir = resolve('release-assets');
  mkdirSync(outDir, { recursive: true });
  const p = resolve(outDir, name);
  writeFileSync(p, text, 'utf8');
  console.log(`Wrote ${p}`);
}

const SEG_EVENTS = 1024;

// Clean 10k
writeOut(
  'demo-big-10k.ndjson',
  buildNdjson({
    run_id: 'demo_big_10k_clean',
    total_events: 10_000,
    seg_events: SEG_EVENTS,
    gaps: [],
  })
);

// Clean 100k
writeOut(
  'demo-big-100k-clean.ndjson',
  buildNdjson({
    run_id: 'demo_big_100k_clean',
    total_events: 100_000,
    seg_events: SEG_EVENTS,
    gaps: [],
  })
);

// 100k with 3 disjoint gaps (scale + complexity)
writeOut(
  'demo-big-100k-multi-gap.ndjson',
  buildNdjson({
    run_id: 'demo_big_100k_multi_gap',
    total_events: 100_000,
    seg_events: SEG_EVENTS,
    gaps: [
      { seg_id_start: 30, seg_id_end: 31, reason_code: 1 }, // missing_segment
      { seg_id_start: 48, seg_id_end: 50, reason_code: 2 }, // worker_failure
      { seg_id_start: 72, seg_id_end: 73, reason_code: 1 }, // missing_segment
    ],
  })
);
