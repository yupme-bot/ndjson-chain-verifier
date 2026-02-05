import { createHash } from 'node:crypto';

export function sha256Hex(utf8String) {
  return createHash('sha256').update(utf8String, 'utf8').digest('hex');
}
