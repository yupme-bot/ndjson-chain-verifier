export function newVerificationResult({ mode }) {
  return {
    // Convenience boolean: true only when the export is fully verified (status === "ok").
    is_authentic: false,
    // "ok" | "partial" | "invalid"
    status: 'invalid',
    // For partial files (allow_partial), verification may succeed up to last_ch.
    is_partial: false,

    mode,

    // Kernel run metadata
    run_id: null,
    root_ch: null,
    last_ch: null,

    checked_records: 0,
    verified_chain_records: 0,

    errors: [],
    warnings: [],

    stats: {
      byType: Object.create(null),
      gapsByReason: Object.create(null)
    }
  };
}

export function finalizeVerificationResult(res) {
  // status is set by the verifier. Derive booleans.
  res.is_authentic = res.status === 'ok' && res.errors.length === 0;
  res.is_partial = res.status === 'partial' && res.errors.length === 0;
  return res;
}

export function addStat(res, key, type) {
  const b = res.stats.byType;
  b[type] = (b[type] || 0) + 1;
}

export function addGapReasonStat(res, reason_code) {
  const g = res.stats.gapsByReason;
  const k = String(reason_code);
  g[k] = (g[k] || 0) + 1;
}
