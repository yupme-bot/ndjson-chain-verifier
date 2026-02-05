import yauzl from 'yauzl';

import { ISSUE, makeIssue } from './errors.js';
import { verifyNdjsonStream } from './verify_ndjson.js';

export async function verifyZipEvidencePack(zipInput, opts = {}) {
  const mode = opts.mode === 'tolerant' ? 'tolerant' : 'strict';
  const expectedFiles = Array.isArray(opts.expectedFiles) ? opts.expectedFiles : null;

  const limits = {
    maxEntries: Number.isInteger(opts.maxEntries) ? opts.maxEntries : 500,
    maxUncompressedBytes: Number.isInteger(opts.maxUncompressedBytes) ? opts.maxUncompressedBytes : 200_000_000,
    maxCompressionRatio: typeof opts.maxCompressionRatio === 'number' ? opts.maxCompressionRatio : 200
  };

  const ndjsonPattern = opts.ndjsonPattern instanceof RegExp ? opts.ndjsonPattern : /\.ndjson$/i;

  const packRes = {
    is_authentic: false,
    mode,
    zip: {
      entriesVerified: 0,
      entriesSkipped: 0,
      limitsApplied: limits
    },
    artifacts: [],
    errors: [],
    warnings: []
  };

  let zip;
  try {
    zip = await openZip(zipInput, { lazyEntries: true });
  } catch (e) {
    packRes.errors.push(makeIssue({
      code: ISSUE.E_ZIP_OPEN,
      severity: 'error',
      line: 0,
      record_index: 0,
      message: 'failed to open zip'
    }));
    return finalizePack(packRes);
  }

  const seenNames = new Set();
  let entries = 0;
  let totalUncompressed = 0;

  const ndjsonNames = [];

  await new Promise((resolve, reject) => {
    zip.readEntry();

    zip.on('entry', (entry) => {
      entries++;
      if (entries > limits.maxEntries) {
        packRes.errors.push(makeIssue({
          code: ISSUE.E_ZIP_LIMIT,
          severity: 'error',
          line: 0,
          record_index: 0,
          details: { reason: 'maxEntries', maxEntries: limits.maxEntries },
          message: 'zip exceeds maxEntries'
        }));
        zip.close();
        return resolve();
      }

      const name = entry.fileName;
      seenNames.add(name);

      // Safety: reject absurd compression ratios.
      const comp = entry.compressedSize || 0;
      const uncomp = entry.uncompressedSize || 0;
      if (comp > 0 && uncomp / comp > limits.maxCompressionRatio) {
        packRes.errors.push(makeIssue({
          code: ISSUE.E_ZIP_LIMIT,
          severity: 'error',
          line: 0,
          record_index: 0,
          details: { reason: 'compressionRatio', name, compressedSize: comp, uncompressedSize: uncomp },
          message: 'zip entry exceeds maxCompressionRatio'
        }));
        zip.close();
        return resolve();
      }

      totalUncompressed += uncomp;
      if (totalUncompressed > limits.maxUncompressedBytes) {
        packRes.errors.push(makeIssue({
          code: ISSUE.E_ZIP_LIMIT,
          severity: 'error',
          line: 0,
          record_index: 0,
          details: { reason: 'maxUncompressedBytes', maxUncompressedBytes: limits.maxUncompressedBytes },
          message: 'zip exceeds maxUncompressedBytes'
        }));
        zip.close();
        return resolve();
      }

      // Directory
      if (/\/$/.test(name)) {
        packRes.zip.entriesSkipped++;
        zip.readEntry();
        return;
      }

      if (ndjsonPattern.test(name)) ndjsonNames.push(name);
      zip.readEntry();
    });

    zip.on('end', () => {
      zip.close();
      resolve();
    });
    zip.on('error', (err) => reject(err));
  });

  // Expected files check
  if (expectedFiles && mode === 'strict') {
    for (const req of expectedFiles) {
      if (!seenNames.has(req)) {
        packRes.errors.push(makeIssue({
          code: ISSUE.E_ZIP_EXPECTED_MISSING,
          severity: 'error',
          line: 0,
          record_index: 0,
          details: { missing: req },
          message: 'expected file missing from zip'
        }));
      }
    }
  }

  // Verify NDJSON entries
  for (const name of ndjsonNames) {
    if (packRes.errors.length > 0 && mode === 'strict') break;
    const result = await verifyZipEntryNdjson(zipInput, name, opts);
    packRes.artifacts.push({ name, result });
    packRes.zip.entriesVerified++;
    if (!result.is_authentic && mode === 'strict') {
      packRes.errors.push(makeIssue({
        code: ISSUE.E_SCHEMA,
        severity: 'error',
        line: 0,
        record_index: 0,
        details: { entry: name },
        message: 'ndjson entry failed verification'
      }));
    }
  }

  return finalizePack(packRes);
}

function finalizePack(packRes) {
  const anyArtifactFalse = packRes.artifacts.some(a => !a.result.is_authentic);
  packRes.is_authentic = packRes.errors.length === 0 && !anyArtifactFalse;
  return packRes;
}

function openZip(zipInput, options) {
  return new Promise((resolve, reject) => {
    if (typeof zipInput === 'string') {
      yauzl.open(zipInput, options, (err, zipfile) => {
        if (err) reject(err);
        else resolve(zipfile);
      });
    } else if (zipInput instanceof Uint8Array) {
      yauzl.fromBuffer(Buffer.from(zipInput), options, (err, zipfile) => {
        if (err) reject(err);
        else resolve(zipfile);
      });
    } else {
      reject(new TypeError('zipInput must be a path or Buffer/Uint8Array'));
    }
  });
}

async function verifyZipEntryNdjson(zipInput, entryName, opts) {
  const zip = await openZip(zipInput, { lazyEntries: true });

  const mode = opts.mode === 'tolerant' ? 'tolerant' : 'strict';
  const profile = opts.schemaProfile;

  return await new Promise((resolve, reject) => {
    zip.readEntry();
    zip.on('entry', (entry) => {
      if (entry.fileName !== entryName) {
        zip.readEntry();
        return;
      }

      zip.openReadStream(entry, async (err, rs) => {
        if (err) {
          zip.close();
          reject(err);
          return;
        }

        try {
          const out = await verifyNdjsonStream(rs, { ...opts, mode, schemaProfile: profile });
          zip.close();
          resolve(out);
        } catch (e) {
          zip.close();
          reject(e);
        }
      });
    });

    zip.on('end', () => {
      // If not found, treat as empty / failure.
      zip.close();
      resolve({
        is_authentic: false,
        status: 'invalid',
        is_partial: false,
        mode,
        run_id: null,
        root_ch: null,
        last_ch: null,
        checked_records: 0,
        verified_chain_records: 0,
        errors: [makeIssue({
          code: ISSUE.E_ZIP_EXPECTED_MISSING,
          severity: 'error',
          line: 0,
          record_index: 0,
          details: { missing: entryName },
          message: 'ndjson entry missing'
        })],
        warnings: [],
        stats: { byType: Object.create(null), gapsByReason: Object.create(null) }
      });
    });

    zip.on('error', (err) => {
      zip.close();
      reject(err);
    });
  });
}
