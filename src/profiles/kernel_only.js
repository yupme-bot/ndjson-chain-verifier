import { ISSUE, makeIssue } from '../errors.js';

export const KERNEL_ONLY_PROFILE = {
  name: 'kernel-only',
  // Only Kernel v1.2 export record types are allowed by default.
  allowedTypes: ['run', 'segment', 'gap', 'seal', 'trace'],

  validateRecord(record, ctx) {
    const issues = [];
    if (record === null || typeof record !== 'object') {
      issues.push(makeIssue({
        code: ISSUE.E_SCHEMA,
        line: ctx.line,
        record_index: ctx.record_index,
        message: 'record is not an object'
      }));
      return issues;
    }

    const type = typeof record.type === 'string' ? record.type.toLowerCase() : '';

    if (!type) {
      issues.push(makeIssue({
        code: ISSUE.E_SCHEMA,
        line: ctx.line,
        record_index: ctx.record_index,
        message: 'missing type'
      }));
      return issues;
    }

    if (type === 'run') {
      if (typeof record.run_id !== 'string' || record.run_id.length === 0) {
        issues.push(makeIssue({
          code: ISSUE.E_MISSING_RUN_ID,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'missing run_id'
        }));
      }
      return issues;
    }

    if (type === 'segment') {
      const seg = record.seg;
      if (!seg || typeof seg !== 'object') {
        issues.push(makeIssue({
          code: ISSUE.E_SEGMENT_MISSING_SEG,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'missing seg object'
        }));
        return issues;
      }
      if (typeof seg.run_id !== 'string' || seg.run_id.length === 0) {
        issues.push(makeIssue({
          code: ISSUE.E_SCHEMA,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'seg.run_id must be a string'
        }));
      }
      if (typeof seg.seg_id !== 'number' || !Number.isFinite(seg.seg_id)) {
        issues.push(makeIssue({
          code: ISSUE.E_SCHEMA,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'seg.seg_id must be a number'
        }));
      }
      if (typeof seg.h !== 'string' || typeof seg.ch !== 'string') {
        issues.push(makeIssue({
          code: ISSUE.E_SEGMENT_MISSING_HASH_FIELDS,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'seg.h and seg.ch must be strings'
        }));
      }
      return issues;
    }

    if (type === 'gap') {
      if (typeof record.seg_id_start !== 'number' || typeof record.seg_id_end !== 'number') {
        issues.push(makeIssue({
          code: ISSUE.E_GAP_MISSING_RANGE,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'gap range must be numbers'
        }));
      }
      if (typeof record.reason_code !== 'number' || !Number.isInteger(record.reason_code)) {
        issues.push(makeIssue({
          code: ISSUE.E_GAP_MISSING_REASON_CODE,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'gap.reason_code must be an integer'
        }));
      }
      if (typeof record.h !== 'string' || typeof record.ch !== 'string') {
        issues.push(makeIssue({
          code: ISSUE.E_GAP_MISSING_HASH_FIELDS,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'gap.h and gap.ch must be strings'
        }));
      }
      return issues;
    }

    if (type === 'seal') {
      if (typeof record.algo !== 'string') {
        issues.push(makeIssue({
          code: ISSUE.E_SCHEMA,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'seal.algo must be a string'
        }));
      }
      if (typeof record.root_ch !== 'string' || typeof record.terminal_ch !== 'string') {
        issues.push(makeIssue({
          code: ISSUE.E_SCHEMA,
          line: ctx.line,
          record_index: ctx.record_index,
          message: 'seal.root_ch and seal.terminal_ch must be strings'
        }));
      }
      return issues;
    }

    // trace is intentionally loose.
    return issues;
  }
};
