# WHAT PASS MEANS

This file explains what **PASS / AUTHENTIC ✅** means in Guardian Verifier.


---

## When the verifier prints `AUTHENTIC ✅`

It means the verifier was able to **fully validate integrity and format** for the bytes you provided.

The verifier answers one narrow question:

> **Do these bytes obey the audit-chain rules they claim to follow?**

### For an NDJSON export (`.ndjson`)

`AUTHENTIC ✅` means all of the following are true:

1) **The file is valid NDJSON in the expected structure**
   - The first non-empty line is a `type: "run"` record with a non-empty `run_id`.
   - Each subsequent non-empty line is valid JSON.

2) **Only allowed record types appear (per the verifier's schema profile)**
   - Unknown record types fail verification in strict mode.

3) **Hashing rules are satisfied**
   - The export uses the supported algorithm (SHA-256).
   - Each `segment` and `gap` record's hash fields match what the verifier recomputes from the record contents.
   - The rolling chain hash advances correctly record-by-record.

4) **Ordering rules are satisfied**
   - Records appear in the expected order (e.g., segments/gaps before the seal; no segments/gaps after traces; etc.).
   - A `seal` record is present and matches the terminal chain hash.

If a single byte changes (including whitespace inside a JSON line), the file should fail.

### For a ZIP evidence pack (`.zip`)

`AUTHENTIC ✅` means all of the following are true:

1) **The ZIP container can be opened and is within safety limits**
   - Entry count, total uncompressed size, and compression ratio are bounded.

2) **At least one `.ndjson` entry was found and verified**
   - Every `.ndjson` entry inside the ZIP is streamed and verified using the same NDJSON rules above.

3) **No strict-mode ZIP-level checks failed**
   - If the caller provides an `expectedFiles` list, missing entries fail verification.

---

## When the verifier prints `NOT AUTHENTIC ❌`

It means at least one integrity or format rule failed.

The verifier will report one or more issues (error codes + details) so the failure can be explained precisely.

---

## When the verifier prints `PARTIAL ⚠️`

This status is only possible when verification is run with an explicit "allow partial" option (library usage).

`PARTIAL ⚠️` means:
- the verifier was able to verify the chain up to a certain point (it reports `last_ch`),
- but the file ended unexpectedly (e.g., missing seal, or a truncated final line).

In other words: **verified up to `last_ch`, but not a complete export.**

---

## What `AUTHENTIC ✅` does NOT mean

A PASS is strong, but it is intentionally limited.

`AUTHENTIC ✅` does **not** claim that:

- the underlying events are "true" or "correct" in the real world
- the producer captured *everything* (except that missing persisted data must be explicit when represented)
- the producer is honest, or that intent/motivation was good
- the system was secure at runtime (it is not remote attestation)
- the verifier binary itself is trusted (you should run a trusted build)

The verifier validates **structure + integrity of the bytes you have**, not the real-world meaning of those bytes.

---

## Exit codes and machine-readable output

The CLI supports stable scripting:

- `AUTHENTIC ✅` → exit code **0**
- `PARTIAL ⚠️` → exit code **1**
- `NOT AUTHENTIC ❌` → exit code **2**
- fatal error (e.g., crash/unhandled exception) → exit code **3**

You can also write a JSON report:

```bash
node ./bin/guardian-verify.js <file.ndjson|pack.zip> --json out.json
```

---

## Recommended "low-dependency" verification

If you want to minimize supply-chain / `node_modules` risk during verification:

- Prefer the self-contained dist build:

```bash
node ./dist/guardian-verify.cjs <file.ndjson|pack.zip>
```

This is designed to work without `npm install`.
