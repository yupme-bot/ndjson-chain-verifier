# ndjson-chain-verifier

[![CI](https://github.com/yupme-bot/ndjson-chain-verifier/actions/workflows/ci.yml/badge.svg)](https://github.com/yupme-bot/ndjson-chain-verifier/actions/workflows/ci.yml)

An **offline** verifier for deterministic **NDJSON audit-chain** exports.

This repository contains **verifier-only** code:
- ✅ Verifies hash-chained NDJSON exports offline
- ✅ Deterministic CLI output (stable, script-friendly)
- ✅ Small fixtures + a normative verification spec

It intentionally does **not** include:
- ❌ capture / instrumentation SDKs
- ❌ persistence or architecture docs
- ❌ dashboards / analytics
- ❌ “repair”, auto-fixing, or interpretation

If you have an export, this tool answers one question:
> “Do these bytes match the stated audit-chain rules?”

## Quickstart

### Using npx

```bash
npx ndjson-chain-verify ./fixtures/good.ndjson
```

### Windows note

If `ndjson-chain-verify` is “not recognized”, run it via:
- `npx ndjson-chain-verify <file.ndjson>`
- or `npm exec -- ndjson-chain-verify <file.ndjson>`


### From this repo

```bash
npm install
npm test
node scripts/verify.mjs ./fixtures/good.ndjson
```

### Fresh install smoke test (Windows CMD)

```bat
npm install
npm test
npx ndjson-chain-verify fixtures/good.ndjson
echo %ERRORLEVEL%

REM Partial behavior (only when --allow-partial is set)
npx ndjson-chain-verify fixtures/missing_seal.ndjson
npx ndjson-chain-verify --allow-partial fixtures/missing_seal.ndjson
```

## CLI contract (v0.1)

Command:

```bash
ndjson-chain-verify <file.ndjson|pack.zip>
```

Top-line statuses:
- `PASS`
- `FAIL: <REASON_CODE>`
- `PARTIAL: <REASON_CODE>` (only when `--allow-partial` is set)

Flags:
- `--quiet` prints only the top line
- `--verbose` prints first-failure context (line number + record type + snippet)
- `--json` prints a single-line JSON result (stable keys)
- `--allow-partial` enables PARTIAL outcomes

Exit codes:
- `0` PASS
- `1` FAIL or PARTIAL
- `2` usage / IO error (bad args, missing file, cannot read)

## Fixtures

Run the included fixtures:

```bash
node scripts/verify.mjs ./fixtures/gap_missing_segment.ndjson
node scripts/verify.mjs ./fixtures/gap_hash_mismatch.ndjson
node scripts/verify.mjs ./fixtures/truncated_line.ndjson
```

A small manifest is included:
- `FIXTURES_MANIFEST.json`

## Large fixtures (Releases)

This repo is meant to stay small. Large demo exports (e.g. 10k/100k records) should be distributed as **Release assets**.

Recommended workflow:
1) Download the asset(s) from Releases.
2) Verify their SHA-256 using `SHA256SUMS.txt` from the same Release.
3) Run `ndjson-chain-verify` locally.

### Maintainers: generating Release assets (not committed)

This repository includes a deterministic generator that writes large demo exports into `release-assets/` (gitignored):

```bash
node tools/generate_release_assets.mjs
```

It writes:
- `release-assets/demo-big-10k.ndjson` (PASS, clean chain)
- `release-assets/demo-big-100k-clean.ndjson` (PASS, scale)
- `release-assets/demo-big-100k-multi-gap.ndjson` (PASS, scale + 3 explicit gaps)

Verify them:

```bash
npx ndjson-chain-verify release-assets/demo-big-10k.ndjson
npx ndjson-chain-verify release-assets/demo-big-100k-clean.ndjson
npx ndjson-chain-verify release-assets/demo-big-100k-multi-gap.ndjson
```

Create deterministic checksums for Release upload:

```bash
node scripts/sha256sums.mjs release-assets/demo-big-10k.ndjson release-assets/demo-big-100k-clean.ndjson release-assets/demo-big-100k-multi-gap.ndjson --write release-assets/SHA256SUMS.txt
```

## What PASS means

See:
- `WHAT_PASS_MEANS.md`

## Verification spec

The verifier implements the rules in:
- `SPEC_VERIFY.md`

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
