/**
 * Deterministic JSON stringify with stable key ordering.
 * - Objects: keys sorted lexicographically.
 * - Arrays: order preserved.
 * - Numbers: JSON.stringify behavior (no normalization beyond JS).
 */
export function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(v) {
  if (v === null) return null;
  const t = typeof v;
  if (t !== 'object') return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const keys = Object.keys(v).sort();
  const out = {};
  for (const k of keys) out[k] = canonicalize(v[k]);
  return out;
}
