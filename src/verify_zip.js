import { listZipEntries, readZipEntryBytes } from './zip_reader.js';
import { verifyNdjsonStream } from './verify_ndjson.js';

function isNdjsonName(name) {
  const n = name.toLowerCase();
  return n.endsWith('.ndjson') || n.endsWith('.jsonl');
}

export async function verifyZipEvidencePack(zipPath, options = {}) {
  const allowPartial = !!options.allowPartial;
  const maxEntryBytes = typeof options.maxEntryBytes === 'number' ? options.maxEntryBytes : (200 * 1024 * 1024);

  const zip = listZipEntries(zipPath);
  const ndjsonEntries = zip.entries
    .filter((e) => !e.name.endsWith('/') && isNdjsonName(e.name))
    .map((e) => e.name)
    .sort();

  if (ndjsonEntries.length === 0) {
    throw new Error('No .ndjson files found in ZIP.');
  }
  if (ndjsonEntries.length > 1) {
    throw new Error('ZIP contains multiple .ndjson files; extract and verify them individually.');
  }

  const name = ndjsonEntries[0];
  const entry = zip.entries.find((e) => e.name === name);
  const bytes = readZipEntryBytes(zip, entry, maxEntryBytes);

  const res = await verifyNdjsonStream(bytes, { allowPartial });
  res.zip_entry = name;
  return res;
}
