/**
 * Canonical hash body selection for skeleton.
 *
 * IMPORTANT:
 * - Replace this logic to match the Kernel exactly.
 * - The parent hash (`p_h`) is provided separately to the hash function.
 */
export function canonicalHashBody(record) {
  if (record === null || typeof record !== 'object') return record;

  // Exclude fields that are not part of the hashed body.
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === 'h') continue;
    if (k === 'p_h') continue;
    // display-only freeform text (never hashed)
    if (k === 'reason_text') continue;
    out[k] = v;
  }
  return out;
}
