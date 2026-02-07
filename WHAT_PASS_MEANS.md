# WHAT PASS MEANS

This document explains what **OK**, **PARTIAL**, and **INVALID** mean when reported by Guardian Verifier.

Guardian Verifier answers one narrow question only:

“Do these bytes obey the audit-chain rules they claim to follow?”

Nothing more.

---

## When the verifier reports `OK`

`OK` means the verifier was able to **fully validate structure and integrity** for the bytes you provided.

It means the artifact is:
- internally consistent
- complete
- untampered

### For an NDJSON export (.ndjson)

`OK` means all of the following are true:

1) **The file is valid NDJSON in the expected structure**
   - The first non-empty line is a `type: "run"` record with a non-empty `run_id`.
   - Each subsequent non-empty line is valid JSON.

2) **Only allowed record types appear**
   - All records conform to the verifier’s schema profile.
   - Unknown or disallowed record types fail verification.

3) **Hashing rules are satisfied**
   - The supported algorithm (SHA-256) is used.
   - Each `segment` and `gap` record’s hash fields match what the verifier recomputes from record contents.
   - The rolling chain hash advances correctly for every record.

4) **Ordering rules are satisfied**
   - Records appear in the required order.
   - No records appear where they are not permitted.
   - A terminal `seal` record is present and matches the final chain hash.

If a single byte changes — including whitespace inside a JSON line — verification should fail.

---

### For a ZIP evidence pack (.zip)

`OK` means all of the following are true:

1) **The ZIP container is safe to process**
   - Entry count, total uncompressed size, and compression ratio are within bounds.

2) **At least one NDJSON entry was found and verified**
   - Every `.ndjson` entry inside the ZIP is streamed and verified using the same NDJSON rules.

3) **All strict ZIP-level expectations are met**
   - If an expected file list is provided, missing entries cause failure.

---

## When the verifier reports `PARTIAL`

`PARTIAL` is only possible when verification is explicitly run in **allow-partial** mode (library usage or advanced CLI usage).

`PARTIAL` means:
- the verifier successfully validated the chain **up to a specific point**
- integrity is proven **up to that point**
- the artifact is **incomplete**

Common reasons include:
- missing terminal seal
- truncated final line
- explicit GAP records indicating known missing data

In this case, the verifier reports:
- the last verified chain hash (`last_ch`)
- the extent of what was successfully verified

Interpretation:

“Everything up to `last_ch` is intact and untampered.  
Nothing beyond that point is claimed.”

---

## When the verifier reports `INVALID`

`INVALID` means at least one integrity or format rule was violated.

Examples include:
- hash mismatches
- record reordering
- missing required records in strict mode
- corrupted or malformed JSON
- unsupported algorithms

The verifier reports error codes and details so failures can be explained precisely.

---

## What `OK` does NOT mean

A successful verification is strong — but intentionally limited.

`OK` does **not** claim that:
- the underlying events are true or correct
- the producer captured all possible events
- the producer is honest or trustworthy
- the system was secure at runtime
- the artifact proves authorship or timestamps
- the verifier binary itself is trusted

Guardian Verifier validates **structure and integrity of the bytes you have**, not their real-world meaning.

---

## Exit codes and automation

The CLI provides stable exit codes for scripting:

- `OK` → exit code 0
- `PARTIAL` → exit code 1
- `INVALID` → exit code 2
- fatal error (crash or unhandled exception) → exit code 3

Machine-readable JSON output can also be generated:

    node ./bin/guardian-verify.js <file.ndjson|pack.zip> --json out.json

---

## Recommended low-dependency verification

To minimize supply-chain risk during verification:

- Prefer the self-contained distribution build:

    node ./dist/guardian-verify.cjs <file.ndjson|pack.zip>

This build is designed to run without `npm install` and without resolving external dependencies.

---

## Summary

- `OK` means complete and internally consistent
- `PARTIAL` means verifiable up to a known boundary
- `INVALID` means integrity rules were violated

Guardian Verifier is strict by design.

Silence is not success.  
Explicit results are.
