#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { verifyNdjsonStream, verifyZipEvidencePack } from '../src/index.js';

function usage() {
  console.log('Usage: guardian-verify <path.ndjson|path.zip> [--json out.json]');
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(args.length === 0 ? 1 : 0);
}

const input = args[0];
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx !== -1 ? args[jsonIdx + 1] : null;

(async () => {
  let result;
  if (input.toLowerCase().endsWith('.zip')) {
    result = await verifyZipEvidencePack(input, {});
  } else {
    result = await verifyNdjsonStream(input, {});
  }

  const status = result.status || (result.is_authentic ? 'ok' : 'invalid');
  if (status === 'ok') console.log('AUTHENTIC ✅');
  else if (status === 'partial') console.log('PARTIAL ⚠️');
  else console.log('NOT AUTHENTIC ❌');

  // Compact summary
  if ('artifacts' in result) {
    console.log(`verified_entries=${result.zip.entriesVerified} artifacts=${result.artifacts.length} errors=${result.errors.length}`);
    for (const a of result.artifacts) {
      const st = a.result.status || (a.result.is_authentic ? 'ok' : 'invalid');
      console.log(`- ${a.name}: ${st} checked=${a.result.checked_records} errors=${a.result.errors.length}`);
    }
  } else {
    console.log(`checked=${result.checked_records} errors=${result.errors.length} warnings=${result.warnings.length}`);
    console.log(`run_id=${result.run_id}`);
    console.log(`root_ch=${result.root_ch}`);
    console.log(`last_ch=${result.last_ch}`);
  }

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify(result, null, 2));
    console.log(`wrote ${jsonOut}`);
  }

  const exitCode = status === 'ok' ? 0 : (status === 'partial' ? 1 : 2);
  process.exit(exitCode);
})().catch((e) => {
  console.error('fatal:', e?.stack || e);
  process.exit(3);
});
