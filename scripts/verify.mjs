import { statSync } from 'node:fs';
import { verifyNdjsonStream, verifyZipEvidencePack } from '../src/index.js';

const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node scripts/verify.mjs <file.ndjson|pack.zip>');
  process.exit(2);
}

const input = args[0];
try {
  const st = statSync(input);
  if (!st.isFile()) {
    console.error('Input must be a file.');
    process.exit(2);
  }

  const result = input.toLowerCase().endsWith('.zip')
    ? await verifyZipEvidencePack(input, { allowPartial: false })
    : await verifyNdjsonStream(input, { allowPartial: false });

  if (result.status === 'PASS') console.log('PASS');
  else console.log(`${result.status}: ${result.reason_code}`);

  console.log(`run_id=${result.run_id ?? ''}`);
  console.log(`records_total=${result.records_total} segments=${result.segments} gaps=${result.gaps}`);
  console.log(`seal=${result.seal ? 'yes' : 'no'} algo=${result.algo ?? ''}`);
  console.log(`root_ch=${result.root_ch ?? ''}`);
  console.log(`terminal_ch=${result.terminal_ch ?? ''}`);

  process.exit(result.status === 'PASS' ? 0 : 1);
} catch (err) {
  console.error((err && err.message) ? err.message : String(err));
  process.exit(2);
}
