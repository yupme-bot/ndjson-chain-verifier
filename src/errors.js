export const ISSUE = Object.freeze({
  // Parsing / structure
  E_EMPTY_EXPORT: 'E_EMPTY_EXPORT',
  E_RUN_LINE_PARSE: 'E_RUN_LINE_PARSE',
  E_MISSING_RUN_LINE: 'E_MISSING_RUN_LINE',
  E_MISSING_RUN_ID: 'E_MISSING_RUN_ID',
  E_JSON_PARSE: 'E_JSON_PARSE',
  E_LINE_TOO_LONG: 'E_LINE_TOO_LONG',
  E_SCHEMA: 'E_SCHEMA',
  E_UNKNOWN_TYPE: 'E_UNKNOWN_TYPE',

  // Kernel v1.2 audit-chain verification
  E_SEGMENT_AFTER_TRACE: 'E_SEGMENT_AFTER_TRACE',
  E_AFTER_SEAL_NON_TRACE: 'E_AFTER_SEAL_NON_TRACE',

  E_SEGMENT_MISSING_SEG: 'E_SEGMENT_MISSING_SEG',
  E_SEGMENT_MISSING_HASH_FIELDS: 'E_SEGMENT_MISSING_HASH_FIELDS',
  E_SEGMENT_HASH_MISMATCH: 'E_SEGMENT_HASH_MISMATCH',

  E_GAP_MISSING_RANGE: 'E_GAP_MISSING_RANGE',
  E_GAP_MISSING_REASON_CODE: 'E_GAP_MISSING_REASON_CODE',
  E_GAP_MISSING_HASH_FIELDS: 'E_GAP_MISSING_HASH_FIELDS',
  E_GAP_HASH_MISMATCH: 'E_GAP_HASH_MISMATCH',
  E_GAP_REASON_UNKNOWN: 'E_GAP_REASON_UNKNOWN',

  E_CHAIN_HASH_MISMATCH: 'E_CHAIN_HASH_MISMATCH',

  E_UNSUPPORTED_ALGO: 'E_UNSUPPORTED_ALGO',
  E_ROOT_MISMATCH: 'E_ROOT_MISMATCH',
  E_TERMINAL_MISMATCH: 'E_TERMINAL_MISMATCH',
  E_MISSING_SEAL_LINE: 'E_MISSING_SEAL_LINE',

  // Legacy / future (kept for compatibility with earlier skeleton drafts)
  E_ORDERING: 'E_ORDERING',
  E_PARENT_MISMATCH: 'E_PARENT_MISMATCH',
  E_HASH_MISMATCH: 'E_HASH_MISMATCH',

  // ZIP
  E_ZIP_OPEN: 'E_ZIP_OPEN',
  E_ZIP_LIMIT: 'E_ZIP_LIMIT',
  E_ZIP_EXPECTED_MISSING: 'E_ZIP_EXPECTED_MISSING'
});

export function makeIssue({
  code,
  severity = 'error',
  line,
  record_index,
  h,
  details,
  message
}) {
  return {
    code,
    severity,
    line,
    record_index,
    ...(h !== undefined ? { h } : {}),
    ...(details !== undefined ? { details } : {}),
    ...(message !== undefined ? { message } : {})
  };
}
