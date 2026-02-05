import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep, posix } from 'node:path';

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function toPosix(p) {
  return p.split(sep).join(posix.sep);
}

function listFilesRecursive(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const full = resolve(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile()) out.push(full);
    }
  }
  return out;
}

const args = process.argv.slice(2);
let writePath = null;
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--write') {
    writePath = args[i + 1];
    i++;
  } else {
    inputs.push(args[i]);
  }
}

if (inputs.length === 0) {
  console.error('Usage: node scripts/sha256sums.mjs <dir_or_files...> [--write SHA256SUMS.txt]');
  process.exit(2);
}

const absoluteInputs = inputs.map(p => resolve(p));
const files = [];
for (const p of absoluteInputs) {
  const st = statSync(p);
  if (st.isDirectory()) {
    files.push(...listFilesRecursive(p));
  } else if (st.isFile()) {
    files.push(p);
  }
}

// Choose a stable base for relative paths: current working directory.
const base = resolve(process.cwd());

const lines = files
  .map(f => ({
    file: f,
    rel: toPosix(relative(base, f))
  }))
  .sort((a, b) => a.rel.localeCompare(b.rel))
  .map(({ file, rel }) => {
    const sum = sha256Hex(readFileSync(file));
    return `${sum}  ${rel}`;
  });

const out = lines.join('\n') + (lines.length ? '\n' : '');

if (writePath) {
  writeFileSync(writePath, out, 'utf8');
} else {
  process.stdout.write(out);
}
