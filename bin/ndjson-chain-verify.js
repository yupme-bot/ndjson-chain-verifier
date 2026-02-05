#!/usr/bin/env node

import { statSync } from 'node:fs';
import { verifyNdjsonStream, verifyZipEvidencePack } from '../src/index.js';

function usage() {
  console.log('Usage: ndjson-chain-verify <file.ndjson|pack.zip> [--quiet] [--verbose] [--json] [--allow-partial]');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('-')));
  const positional = args.filter(a => !a.startsWith('-'));

  const help = flags.has('-h') || flags.has('--help');
  const quiet = flags.has('--quiet');
  const verbose = flags.has('--verbose');
  const json = flags.has('--json');
  const allowPartial = flags.has('--allow-partial');

  // Unknown flags -> usage error
  const known = new Set(['-h', '--help', '--quiet', '--verbose', '--json', '--allow-partial']);
  for (const f of flags) {
    if (!known.has(f)) {
      return { error: `Unknown flag: ${f}` };
    }
  }

  if (help) return { help: true };
  if (positional.length !== 1) {
    return { error: 'Expected exactly one input path.' };
  }

  return { input: positional[0], quiet, verbose, json, allowPartial };
}

function formatTopLine(result) {
  if (result.status === 'PASS') return 'PASS';
  if (result.status === 'PARTIAL') return `PARTIAL: ${result.reason_code}`;
  return `FAIL: ${result.reason_code}`;
}

function formatSummaryLines(result) {
  const lines = [];
  lines.push(`run_id=${result.run_id ?? ''}`);
  lines.push(`records_total=${result.records_total} segments=${result.segments} gaps=${result.gaps}`);
  lines.push(`seal=${result.seal ? 'yes' : 'no'} algo=${result.algo ?? ''}`);
  lines.push(`root_ch=${result.root_ch ?? ''}`);
  lines.push(`terminal_ch=${result.terminal_ch ?? ''}`);
  return lines;
}

function formatVerboseLines(result) {
  const lines = [];
  if (result.zip_entry) lines.push(`zip_entry=${result.zip_entry}`);
  if (result.failure_line !== null && result.failure_line !== undefined) lines.push(`failure_line=${result.failure_line}`);
  if (result.failure_record_type) lines.push(`failure_record_type=${result.failure_record_type}`);
  if (result.missing_field) lines.push(`missing_field=${result.missing_field}`);
  if (result.snippet) lines.push(`snippet=${result.snippet}`);
  return lines;
}

function formatJson(result) {
  // Stable key order via insertion order.
  const out = {
    status: result.status,
    reason_code: result.reason_code,
    run_id: result.run_id,
    records_total: result.records_total,
    segments: result.segments,
    gaps: result.gaps,
    seal: result.seal,
    algo: result.algo,
    root_ch: result.root_ch,
    terminal_ch: result.terminal_ch,
    zip_entry: result.zip_entry,
    failure_line: result.failure_line,
    failure_record_type: result.failure_record_type,
    missing_field: result.missing_field,
    snippet: result.snippet
  };
  return JSON.stringify(out);
}

(async () => {
  const parsed = parseArgs(process.argv);

  if (parsed.help) {
    usage();
    process.exit(0);
  }

  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(2);
  }

  const { input, quiet, verbose, json, allowPartial } = parsed;

  try {
    // Basic IO validation.
    const st = statSync(input);
    if (!st.isFile()) {
      console.error('Input must be a file.');
      process.exit(2);
    }

    const result = input.toLowerCase().endsWith('.zip')
      ? await verifyZipEvidencePack(input, { allowPartial })
      : await verifyNdjsonStream(input, { allowPartial });

    if (json) {
      console.log(formatJson(result));
    } else if (quiet) {
      console.log(formatTopLine(result));
    } else {
      console.log(formatTopLine(result));
      for (const line of formatSummaryLines(result)) console.log(line);
      if (verbose && result.status !== 'PASS') {
        for (const line of formatVerboseLines(result)) console.log(line);
      }
    }

    process.exit(result.status === 'PASS' ? 0 : 1);
  } catch (err) {
    console.error((err && err.message) ? err.message : String(err));
    process.exit(2);
  }
})();
