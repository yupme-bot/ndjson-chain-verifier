# Guardian Verifier Skeleton — Dev Notes

This repo is a **skeleton** for the Kernel Auditor / Verification SDK.

Goals:
- Verify hash-chained NDJSON deterministically.
- Verify frozen ZIP evidence packs safely.
- Provide a small, boring API + CLI.

## Quick start
```bash
npm install
npm test
```

## Try the CLI
```bash
node ./bin/guardian-verify.js ./tests/fixtures/good.ndjson
```

## Where to implement Kernel parity
The only area intended to be swapped to match the Kernel exactly is:
- `src/canonical_hash.js` (canonical body selection)
- `src/hash.js` (hash input formatting if Kernel differs)

Keep everything else (streaming, errors, ZIP guards) stable.

## Determinism rules
- No timestamps, no randomness.
- Stable issue ordering.
- Stable JSON canonicalization (sorted keys) for hashing.

## Fixtures
- `tests/fixtures/good.ndjson` is generated to match this skeleton's hashing scheme.
- Replace fixtures with real Kernel exports once parity code is plugged in.


## Package lock
This skeleton intentionally does not ship with a `package-lock.json`.
Some environments embed private registry URLs into lockfiles; keeping the lockfile out avoids accidental auth failures.
Run `npm install` to generate a local lockfile for your environment.
