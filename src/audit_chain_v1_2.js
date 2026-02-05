import { stableStringify } from './stable_stringify.js';
import { sha256Hex } from './hash.js';

// Kernel v1.2 audit-chain parity (domain-separated, stableStringify everywhere).
// NOTE: These are intentionally simple and dependency-free.

export const AUDIT_HASH_ALGO = 'sha256';

export function auditRootHash(run_id) {
  return sha256Hex(stableStringify(['audit_root_v1.2', run_id]));
}

export function canonicalSegmentBody(seg) {
  return {
    run_id: seg.run_id,
    seg_id: seg.seg_id,
    start_ts: seg.start_ts,
    end_ts: seg.end_ts,
    count: seg.count,
    sealed: !!seg.sealed,
    events: seg.events,
  };
}

export function segmentHash(segBody) {
  return sha256Hex(stableStringify(['segment_h_v1.2', segBody]));
}

export function gapHash(gapBody) {
  const b = {
    seg_id_start: gapBody.seg_id_start,
    seg_id_end: gapBody.seg_id_end,
    reason_code: gapBody.reason_code,
  };
  return sha256Hex(stableStringify(['gap_h_v1.2', b]));
}

export function chainHash(prevCh, h) {
  return sha256Hex(stableStringify(['link_v1.2', prevCh, h]));
}
