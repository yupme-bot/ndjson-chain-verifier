import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import readline from 'node:readline';

import { REASON, isPartialCapable } from './reason_codes.js';
import { auditRootHash, canonicalSegmentBody, segmentHash, gapHash, chainHash, AUDIT_HASH_ALGO } from './audit_chain_v1_2.js';

function makeResultBase() {
  return {
    status: 'FAIL',
    reason_code: null,

    run_id: null,
    records_total: 0,
    segments: 0,
    gaps: 0,

    seal: false,
    algo: null,
    root_ch: null,
    terminal_ch: null,

    // Verbose context (first failure)
    failure_line: null,
    failure_record_type: null,
    missing_field: null,
    snippet: null,
    zip_entry: null
  };
}

function trimSnippet(line, max = 200) {
  const s = String(line).trim();
  if (s.length <= max) return s;
  return s.slice(0, max) + '...';
}

function makeFailure(res, { reason, line, recordType, missingField, snippet, zipEntry }) {
  res.status = 'FAIL';
  res.reason_code = reason;
  res.failure_line = line ?? res.failure_line;
  res.failure_record_type = recordType ?? res.failure_record_type;
  res.missing_field = missingField ?? res.missing_field;
  res.snippet = snippet ?? res.snippet;
  res.zip_entry = zipEntry ?? res.zip_entry;
  return res;
}

function finalizePartialIfAllowed(res, allowPartial) {
  if (!allowPartial) return res;
  if (res.status === 'FAIL' && isPartialCapable(res.reason_code)) {
    res.status = 'PARTIAL';
  }
  return res;
}

function streamFromInput(input) {
  if (typeof input === 'string') return createReadStream(input, { encoding: 'utf8' });
  if (Buffer.isBuffer(input)) return Readable.from(input.toString('utf8'));
  if (input && typeof input.pipe === 'function') return input;
  throw new TypeError('Unsupported input type');
}

async function peekHasMoreNonEmptyLines(lineIter) {
  for await (const l of lineIter) {
    if (String(l).trim() !== '') return true;
  }
  return false;
}

function checkOptionalV(rec) {
  if (rec && Object.prototype.hasOwnProperty.call(rec, 'v')) {
    if (rec.v !== '1.1') return false;
  }
  return true;
}

export async function verifyNdjsonStream(input, options = {}) {
  const allowPartial = !!options.allowPartial;
  const zipEntry = options.zipEntry ?? null;

  const res = makeResultBase();
  if (zipEntry) res.zip_entry = zipEntry;

  const stream = streamFromInput(input);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const iter = rl[Symbol.asyncIterator]();

  let lineNo = 0;
  let seenAny = false;

  let run_id = null;
  let root_ch = null;
  let prev_ch = null;

  let seenTrace = false;
  let seenSeal = false;

  while (true) {
    const { value: line, done } = await iter.next();
    if (done) break;
    lineNo++;

    const raw = String(line);
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    seenAny = true;

    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      const hasMore = await peekHasMoreNonEmptyLines(iter);
      // Consume done; close readline.
      rl.close();

      if (hasMore) {
        return makeFailure(res, {
          reason: REASON.BAD_JSON,
          line: lineNo,
          recordType: null,
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      // Final non-empty line is truncated/invalid.
      makeFailure(res, {
        reason: REASON.TRUNCATED_LAST_LINE,
        line: lineNo,
        recordType: null,
        missingField: null,
        snippet: trimSnippet(trimmed),
        zipEntry
      });
      return finalizePartialIfAllowed(res, allowPartial);
    }

    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      rl.close();
      return makeFailure(res, {
        reason: REASON.MISSING_FIELD,
        line: lineNo,
        recordType: null,
        missingField: 'record',
        snippet: trimSnippet(trimmed),
        zipEntry
      });
    }

    if (!checkOptionalV(rec)) {
      rl.close();
      return makeFailure(res, {
        reason: REASON.UNSUPPORTED_VERSION,
        line: lineNo,
        recordType: rec.type ?? null,
        missingField: 'v',
        snippet: trimSnippet(trimmed),
        zipEntry
      });
    }

    const type = rec.type;
    if (typeof type !== 'string') {
      rl.close();
      // If this is the first record, treat as missing run.
      const reason = run_id === null ? REASON.MISSING_RUN : REASON.MISSING_FIELD;
      return makeFailure(res, {
        reason,
        line: lineNo,
        recordType: null,
        missingField: 'type',
        snippet: trimSnippet(trimmed),
        zipEntry
      });
    }

    // First record must be run.
    if (run_id === null) {
      if (type !== 'run') {
        rl.close();
        return makeFailure(res, {
          reason: REASON.MISSING_RUN,
          line: lineNo,
          recordType: type,
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }
      if (typeof rec.run_id !== 'string' || rec.run_id.length === 0) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.MISSING_FIELD,
          line: lineNo,
          recordType: 'run',
          missingField: 'run_id',
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }
      run_id = rec.run_id;
      res.run_id = run_id;
      root_ch = auditRootHash(run_id);
      prev_ch = root_ch;
      res.root_ch = root_ch;
      res.records_total++;
      continue;
    }

    // Ordering: once a trace is seen, no segment/gap/seal may follow.
    if (seenTrace && (type === 'segment' || type === 'gap' || type === 'seal')) {
      rl.close();
      return makeFailure(res, {
        reason: REASON.SEGMENT_AFTER_TRACE,
        line: lineNo,
        recordType: type,
        missingField: null,
        snippet: trimSnippet(trimmed),
        zipEntry
      });
    }

    if (seenSeal && (type === 'segment' || type === 'gap' || type === 'seal')) {
      rl.close();
      // Seal is supposed to bind terminal_ch; any further chain records contradict that.
      return makeFailure(res, {
        reason: REASON.TERMINAL_MISMATCH,
        line: lineNo,
        recordType: type,
        missingField: null,
        snippet: trimSnippet(trimmed),
        zipEntry
      });
    }

    if (type === 'trace') {
      seenTrace = true;
      res.records_total++;
      continue;
    }

    if (type === 'segment') {
      const seg = rec.seg;
      if (!seg || typeof seg !== 'object' || Array.isArray(seg)) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.MISSING_FIELD,
          line: lineNo,
          recordType: 'segment',
          missingField: 'seg',
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      // Required segment body fields
      const required = ['run_id', 'seg_id', 'start_ts', 'end_ts', 'count', 'sealed', 'events', 'h', 'ch'];
      for (const f of required) {
        if (!Object.prototype.hasOwnProperty.call(seg, f)) {
          rl.close();
          return makeFailure(res, {
            reason: REASON.MISSING_FIELD,
            line: lineNo,
            recordType: 'segment',
            missingField: `seg.${f}`,
            snippet: trimSnippet(trimmed),
            zipEntry
          });
        }
      }

      if (seg.run_id !== run_id) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.MISSING_FIELD,
          line: lineNo,
          recordType: 'segment',
          missingField: 'seg.run_id',
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      const segBody = canonicalSegmentBody(seg);
      const expected_h = segmentHash(segBody);
      if (seg.h !== expected_h) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.SEGMENT_HASH_MISMATCH,
          line: lineNo,
          recordType: 'segment',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      const expected_ch = chainHash(prev_ch, expected_h);
      if (seg.ch !== expected_ch) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.CHAIN_MISMATCH,
          line: lineNo,
          recordType: 'segment',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      prev_ch = expected_ch;
      res.segments++;
      res.records_total++;
      continue;
    }

    if (type === 'gap') {
      const required = ['seg_id_start', 'seg_id_end', 'reason_code', 'h', 'ch'];
      for (const f of required) {
        if (!Object.prototype.hasOwnProperty.call(rec, f)) {
          rl.close();
          return makeFailure(res, {
            reason: REASON.MISSING_FIELD,
            line: lineNo,
            recordType: 'gap',
            missingField: f,
            snippet: trimSnippet(trimmed),
            zipEntry
          });
        }
      }

      // Basic schema checks (keep strict but simple)
      if (typeof rec.reason_code !== 'number' || !Number.isInteger(rec.reason_code)) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.MISSING_FIELD,
          line: lineNo,
          recordType: 'gap',
          missingField: 'reason_code',
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      const expected_h = gapHash({
        seg_id_start: rec.seg_id_start,
        seg_id_end: rec.seg_id_end,
        reason_code: rec.reason_code
      });

      if (rec.h !== expected_h) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.GAP_HASH_MISMATCH,
          line: lineNo,
          recordType: 'gap',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      const expected_ch = chainHash(prev_ch, expected_h);
      if (rec.ch !== expected_ch) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.CHAIN_MISMATCH,
          line: lineNo,
          recordType: 'gap',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      prev_ch = expected_ch;
      res.gaps++;
      res.records_total++;
      continue;
    }

    if (type === 'seal') {
      const required = ['algo', 'root_ch', 'terminal_ch'];
      for (const f of required) {
        if (!Object.prototype.hasOwnProperty.call(rec, f)) {
          rl.close();
          return makeFailure(res, {
            reason: REASON.MISSING_FIELD,
            line: lineNo,
            recordType: 'seal',
            missingField: f,
            snippet: trimSnippet(trimmed),
            zipEntry
          });
        }
      }

      const algo = rec.algo;
      res.algo = algo;
      if (algo !== AUDIT_HASH_ALGO) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.UNSUPPORTED_ALGO,
          line: lineNo,
          recordType: 'seal',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      if (rec.root_ch !== root_ch) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.ROOT_MISMATCH,
          line: lineNo,
          recordType: 'seal',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      if (rec.terminal_ch !== prev_ch) {
        rl.close();
        return makeFailure(res, {
          reason: REASON.TERMINAL_MISMATCH,
          line: lineNo,
          recordType: 'seal',
          missingField: null,
          snippet: trimSnippet(trimmed),
          zipEntry
        });
      }

      seenSeal = true;
      res.seal = true;
      res.terminal_ch = rec.terminal_ch;
      res.records_total++;
      continue;
    }

    // Unknown record type
    rl.close();
    return makeFailure(res, {
      reason: REASON.BAD_RECORD_TYPE,
      line: lineNo,
      recordType: type,
      missingField: null,
      snippet: trimSnippet(trimmed),
      zipEntry
    });
  }

  rl.close();

  if (!seenAny) {
    return makeFailure(res, {
      reason: REASON.EMPTY_FILE,
      line: null,
      recordType: null,
      missingField: null,
      snippet: null,
      zipEntry
    });
  }

  // No failures encountered. Decide PASS vs missing seal.
  if (!seenSeal) {
    makeFailure(res, {
      reason: REASON.MISSING_SEAL,
      line: null,
      recordType: null,
      missingField: null,
      snippet: null,
      zipEntry
    });
    return finalizePartialIfAllowed(res, allowPartial);
  }

  res.status = 'PASS';
  res.reason_code = null;
  return res;
}
