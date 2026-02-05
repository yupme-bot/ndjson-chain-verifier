import { createHash } from 'node:crypto';

export function sha256Hex(utf8String) {
  return createHash('sha256').update(utf8String, 'utf8').digest('hex');
}

/**
 * Skeleton hashing scheme:
 *   h = sha256( p_h + "\n" + canonical_body_json )
 *
 * Swap this function only if Kernel uses different formatting.
 */
export function computeRecordHash({ p_h, canonical_body_json }) {
  const parent = (p_h === null || p_h === undefined) ? '' : String(p_h);
  return sha256Hex(parent + '\n' + canonical_body_json);
}
