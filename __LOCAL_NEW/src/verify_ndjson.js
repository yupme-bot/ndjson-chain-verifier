import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

import { ISSUE, makeIssue } from './errors.js';
import { newVerificationResult, finalizeVerificationResult, addStat, addGapReasonStat } from './result.js';
import { KERNEL_ONLY_PROFILE } from './profiles/kernel_only.js';
import { AUDIT_HASH_ALGO, auditRootHash, canonicalSegmentBody, segmentHash, gapHash, chainHash } from './audit_chain_v1_2.js';

const DEFAULT_ALLOWED_TYPES = Object.freeze([
  'run',
  'segment',
  'gap',
  'seal',
  'trace',
]);

export async function verifyNdjsonStream(input, opts = {}) {
  const mode = opts.mode === 'tolerant' ? 'tolerant' : 'strict';
  const allow_partial = !!opts.allow_partial;
  const maxErrors = Number.isInteger(opts.maxErrors) ? opts.maxErrors : 50;
  const maxLineLength = Number.isInteger(opts.maxLineLength) ? opts.maxLineLength : 4_000_000; // chars

  const profile = resolveProfile(opts.schemaProfile);
  const allowedTypes = Array.isArray(opts.allowedTypes)
    ? opts.allowedTypes
    : (Array.isArray(profile?.allowedTypes) ? profile.allowedTypes : DEFAULT_ALLOWED_TYPES);
  const allowedTypeSet = new Set(allowedTypes.map(t => String(t).toLowerCase()));

  const res = newVerificationResult({ mode });

  const rl = createLineReader(input);
  const iter = rl[Symbol.asyncIterator]();

  let lineNo = 0;

  let root_ch = null;
  let prev_ch = null;
  let last_verified_ch = null;

  let in_traces = false;
  let sealSeen = false;
  let truncated_final_line = false;

  try {
    // --- Read the first non-empty line (must be the run line) ---
    let first;
    while (true) {
      const n = await iter.next();
      if (n.done) break;
      first = n.value;
      lineNo = first.lineNo;
      if (first.line.length === 0) continue;
      break;
    }

    if (!first || typeof first.line !== 'string') {
      res.errors.push(makeIssue({
        code: ISSUE.E_EMPTY_EXPORT,
        line: 0,
        record_index: 0,
        message: 'empty export'
      }));
      res.status = 'invalid';
      return finalizeVerificationResult(res);
    }

    if (first.line.length > maxLineLength) {
      res.errors.push(makeIssue({
        code: ISSUE.E_LINE_TOO_LONG,
        line: lineNo,
        record_index: 0,
        message: 'run line exceeds maxLineLength'
      }));
      res.status = 'invalid';
      return finalizeVerificationResult(res);
    }

    let run;
    try {
      run = JSON.parse(first.line);
    } catch (e) {
      res.errors.push(makeIssue({
        code: ISSUE.E_RUN_LINE_PARSE,
        line: lineNo,
        record_index: 0,
        message: 'failed to parse run line'
      }));
      res.status = 'invalid';
      return finalizeVerificationResult(res);
    }

    if (!run || typeof run !== 'object' || run.type !== 'run') {
      res.errors.push(makeIssue({
        code: ISSUE.E_MISSING_RUN_LINE,
        line: lineNo,
        record_index: 0,
        message: 'missing run line'
      }));
      res.status = 'invalid';
      return finalizeVerificationResult(res);
    }

    if (typeof run.run_id !== 'string' || run.run_id.length === 0) {
      res.errors.push(makeIssue({
        code: ISSUE.E_MISSING_RUN_ID,
        line: lineNo,
        record_index: 0,
        message: 'missing run_id'
      }));
      res.status = 'invalid';
      return finalizeVerificationResult(res);
    }

    // Record stats for run
    res.checked_records += 1;
    addStat(res, 'byType', 'run');

    res.run_id = run.run_id;
    root_ch = auditRootHash(run.run_id);
    prev_ch = root_ch;
    last_verified_ch = prev_ch;
    res.root_ch = root_ch;

    // --- Main loop ---
    while (true) {
      const n = await iter.next();
      if (n.done) break;
      const { line, lineNo: ln } = n.value;
      lineNo = ln;

      if (line.length === 0) continue;

      if (line.length > maxLineLength) {
        res.errors.push(makeIssue({
          code: ISSUE.E_LINE_TOO_LONG,
          line: lineNo,
          record_index: res.checked_records,
          message: 'line exceeds maxLineLength'
        }));
        break;
      }

      let rec;
      try {
        rec = JSON.parse(line);
      } catch (e) {
        if (allow_partial) {
          // Only acceptable if there are no further non-empty lines.
          let hasMore = false;
          while (true) {
            const peek = await iter.next();
            if (peek.done) break;
            const { line: pline } = peek.value;
            if (pline && pline.length > 0) { hasMore = true; }
            // We consumed a line. If it was empty, keep scanning; if it was non-empty, stop.
            if (hasMore) break;
          }

          if (!hasMore) {
            truncated_final_line = true;
            break;
          }
        }

        res.errors.push(makeIssue({
          code: ISSUE.E_JSON_PARSE,
          line: lineNo,
          record_index: res.checked_records,
          message: 'invalid JSON'
        }));
        break;
      }

      const idx = res.checked_records;
      res.checked_records++;

      const typeRaw = (rec && typeof rec === 'object') ? rec.type : undefined;
      const type = (typeof typeRaw === 'string') ? typeRaw : '';
      const typeLower = type.toLowerCase();
      addStat(res, 'byType', typeLower || 'unknown');

      // Strictest policy: unknown record types fail.
      if (!typeLower || !allowedTypeSet.has(typeLower)) {
        const issue = makeIssue({
          code: ISSUE.E_UNKNOWN_TYPE,
          line: lineNo,
          record_index: idx,
          details: { type: typeRaw },
          message: 'unknown record type'
        });
        if (mode === 'tolerant') res.warnings.push({ ...issue, severity: 'warning' });
        else res.errors.push({ ...issue, severity: 'error' });
        if (mode !== 'tolerant') break;
      }

      // Profile validation (extra checks; may be warnings in tolerant).
      const profileIssues = profile?.validateRecord ? profile.validateRecord(rec, { line: lineNo, record_index: idx }) : [];
      for (const issue of profileIssues) {
        if (mode === 'tolerant') res.warnings.push({ ...issue, severity: 'warning' });
        else res.errors.push({ ...issue, severity: 'error' });
        if (res.errors.length >= maxErrors) break;
      }
      if (res.errors.length >= maxErrors) break;

      // After a seal, only traces (or blanks) are allowed.
      if (sealSeen && typeLower !== 'trace') {
        res.errors.push(makeIssue({
          code: ISSUE.E_AFTER_SEAL_NON_TRACE,
          line: lineNo,
          record_index: idx,
          details: { type: typeLower },
          message: 'non-trace record after seal'
        }));
        break;
      }

      if (typeLower === 'trace') {
        in_traces = true;
        continue;
      }

      if (in_traces) {
        // Any non-trace after the first trace is invalid.
        res.errors.push(makeIssue({
          code: ISSUE.E_SEGMENT_AFTER_TRACE,
          line: lineNo,
          record_index: idx,
          details: { type: typeLower },
          message: 'segment/gap/seal after trace'
        }));
        break;
      }

      if (typeLower === 'segment') {
        const seg = rec.seg;
        if (!seg || typeof seg !== 'object' || typeof seg.seg_id !== 'number') {
          res.errors.push(makeIssue({
            code: ISSUE.E_SEGMENT_MISSING_SEG,
            line: lineNo,
            record_index: idx,
            message: 'segment missing seg object'
          }));
          break;
        }

        if (typeof seg.h !== 'string' || typeof seg.ch !== 'string') {
          res.errors.push(makeIssue({
            code: ISSUE.E_SEGMENT_MISSING_HASH_FIELDS,
            line: lineNo,
            record_index: idx,
            message: 'segment missing h/ch'
          }));
          break;
        }

        const segNoHashes = { ...seg };
        delete segNoHashes.h;
        delete segNoHashes.ch;

        const h_calc = segmentHash(canonicalSegmentBody(segNoHashes));
        if (h_calc !== seg.h) {
          res.errors.push(makeIssue({
            code: ISSUE.E_SEGMENT_HASH_MISMATCH,
            line: lineNo,
            record_index: idx,
            h: seg.h,
            details: { computed_h: h_calc },
            message: 'segment hash mismatch'
          }));
          break;
        }

        const ch_calc = chainHash(prev_ch, seg.h);
        if (ch_calc !== seg.ch) {
          res.errors.push(makeIssue({
            code: ISSUE.E_CHAIN_HASH_MISMATCH,
            line: lineNo,
            record_index: idx,
            h: seg.h,
            details: { computed_ch: ch_calc },
            message: 'chain hash mismatch'
          }));
          break;
        }

        prev_ch = seg.ch;
        last_verified_ch = prev_ch;
        res.verified_chain_records++;
        continue;
      }

      if (typeLower === 'gap') {
        if (typeof rec.seg_id_start !== 'number' || typeof rec.seg_id_end !== 'number') {
          res.errors.push(makeIssue({
            code: ISSUE.E_GAP_MISSING_RANGE,
            line: lineNo,
            record_index: idx,
            message: 'gap missing seg_id range'
          }));
          break;
        }

        if (typeof rec.reason_code !== 'number' || !Number.isInteger(rec.reason_code)) {
          res.errors.push(makeIssue({
            code: ISSUE.E_GAP_MISSING_REASON_CODE,
            line: lineNo,
            record_index: idx,
            message: 'gap missing reason_code'
          }));
          break;
        }

        addGapReasonStat(res, rec.reason_code);

        // Locked map for v1.2 (strict): 1=missing_segment, 2=worker_failure.
        if (rec.reason_code !== 1 && rec.reason_code !== 2) {
          res.errors.push(makeIssue({
            code: ISSUE.E_GAP_REASON_UNKNOWN,
            line: lineNo,
            record_index: idx,
            details: { reason_code: rec.reason_code },
            message: 'unknown gap reason_code'
          }));
          break;
        }

        if (typeof rec.h !== 'string' || typeof rec.ch !== 'string') {
          res.errors.push(makeIssue({
            code: ISSUE.E_GAP_MISSING_HASH_FIELDS,
            line: lineNo,
            record_index: idx,
            message: 'gap missing h/ch'
          }));
          break;
        }

        const h_calc = gapHash({
          seg_id_start: rec.seg_id_start,
          seg_id_end: rec.seg_id_end,
          reason_code: rec.reason_code,
        });
        if (h_calc !== rec.h) {
          res.errors.push(makeIssue({
            code: ISSUE.E_GAP_HASH_MISMATCH,
            line: lineNo,
            record_index: idx,
            h: rec.h,
            details: { computed_h: h_calc },
            message: 'gap hash mismatch'
          }));
          break;
        }

        const ch_calc = chainHash(prev_ch, rec.h);
        if (ch_calc !== rec.ch) {
          res.errors.push(makeIssue({
            code: ISSUE.E_CHAIN_HASH_MISMATCH,
            line: lineNo,
            record_index: idx,
            h: rec.h,
            details: { computed_ch: ch_calc },
            message: 'chain hash mismatch'
          }));
          break;
        }

        prev_ch = rec.ch;
        last_verified_ch = prev_ch;
        res.verified_chain_records++;
        continue;
      }

      if (typeLower === 'seal') {
        if (rec.algo !== AUDIT_HASH_ALGO) {
          res.errors.push(makeIssue({
            code: ISSUE.E_UNSUPPORTED_ALGO,
            line: lineNo,
            record_index: idx,
            details: { algo: rec.algo, expected: AUDIT_HASH_ALGO },
            message: 'unsupported algo'
          }));
          break;
        }

        if (typeof rec.root_ch !== 'string' || rec.root_ch !== root_ch) {
          res.errors.push(makeIssue({
            code: ISSUE.E_ROOT_MISMATCH,
            line: lineNo,
            record_index: idx,
            details: { expected_root_ch: root_ch, actual_root_ch: rec.root_ch },
            message: 'root mismatch'
          }));
          break;
        }

        if (typeof rec.terminal_ch !== 'string' || rec.terminal_ch !== prev_ch) {
          res.errors.push(makeIssue({
            code: ISSUE.E_TERMINAL_MISMATCH,
            line: lineNo,
            record_index: idx,
            details: { expected_terminal_ch: prev_ch, actual_terminal_ch: rec.terminal_ch },
            message: 'terminal mismatch'
          }));
          break;
        }

        sealSeen = true;
        res.last_ch = prev_ch;
        last_verified_ch = prev_ch;
        continue;
      }

      // A second run line (or any other allowed but unexpected type) is invalid.
      if (typeLower === 'run') {
        res.errors.push(makeIssue({
          code: ISSUE.E_SCHEMA,
          line: lineNo,
          record_index: idx,
          message: 'unexpected run record after first line'
        }));
        break;
      }
    }
  } finally {
    if (rl?.close) rl.close();
  }

  // If we had any hard errors, invalid.
  if (res.errors.length > 0) {
    res.status = 'invalid';
    res.last_ch = last_verified_ch;
    return finalizeVerificationResult(res);
  }

  // Missing seal logic.
  if (!sealSeen) {
    if (allow_partial) {
      res.status = 'partial';
      res.last_ch = last_verified_ch;
      return finalizeVerificationResult(res);
    }

    res.errors.push(makeIssue({
      code: ISSUE.E_MISSING_SEAL_LINE,
      line: lineNo,
      record_index: res.checked_records,
      message: 'missing seal line'
    }));
    res.status = 'invalid';
    res.last_ch = last_verified_ch;
    return finalizeVerificationResult(res);
  }

  // Seal present.
  if (truncated_final_line && allow_partial) {
    res.status = 'partial';
    // last_ch already set at seal.
    return finalizeVerificationResult(res);
  }

  res.status = 'ok';
  return finalizeVerificationResult(res);
}

function resolveProfile(name) {
  if (!name || name === 'kernel-only') return KERNEL_ONLY_PROFILE;
  return KERNEL_ONLY_PROFILE;
}

function createLineReader(input) {
  let rl;

  // Path
  if (typeof input === 'string') {
    const rs = createReadStream(input, { encoding: 'utf8' });
    rl = createInterface({ input: rs, crlfDelay: Infinity });
  } else if (input && (input instanceof Uint8Array)) {
    // Buffer / Uint8Array
    const rs = Readable.from(input.toString());
    rl = createInterface({ input: rs, crlfDelay: Infinity });
  } else if (input && typeof input.pipe === 'function') {
    // Node Readable
    rl = createInterface({ input, crlfDelay: Infinity });
  } else if (input && Symbol.asyncIterator in input) {
    // AsyncIterable of strings/chunks
    const rs = Readable.from(input);
    rl = createInterface({ input: rs, crlfDelay: Infinity });
  } else {
    throw new TypeError('Unsupported input type for verifyNdjsonStream');
  }

  let cur = 0;
  return {
    async *[Symbol.asyncIterator]() {
      for await (const line of rl) {
        cur++;
        yield { line, lineNo: cur };
      }
    },
    close() {
      rl.close();
    }
  };
}
