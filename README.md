# Guardian Verifier

An **offline, deterministic verifier** for NDJSON audit-chain exports and frozen ZIP evidence packs.

Guardian Verifier exists so that **any party** can independently verify the integrity of an audit log — without trusting the producer, the runtime, or the environment in which it was created.

This repository demonstrates the **verification half** of the Guardian family.

---

## Why this exists

Most systems that produce logs also control how those logs are interpreted.

Guardian Verifier answers a narrower, harder question:

> **“Do these bytes still obey the audit-chain rules they claim to follow?”**

That question matters when:
- audit logs are exchanged between organizations
- evidence must stand on its own, offline
- trust in the producer is limited or disputed
- correctness must be provable, not asserted

Guardian Verifier is intentionally focused on that boundary — nothing more, nothing less.

---

## What this demo shows

Running this verifier demonstrates that:

- A clean audit log verifies deterministically
- Any modification, truncation, or reordering is detected
- Missing data must be explicit (via GAP records)
- **Large exports (100,000+ records) verify offline**
- **Multiple explicit GAP records in a single run still verify correctly**
- Verification output is stable and script-friendly

The included large demo case verifies a **100,000-record audit log with multiple intentional gaps**, showing that integrity is preserved even when data is missing — without heuristics, retries, or repair.

If a single byte changes, the result changes.

---

## Hashing and integrity model

Verification is based on a **strict, explicit hash-chain**:

- Each record advances a rolling chain hash
- Canonical serialization is applied before hashing
- **SHA-256 is the only accepted algorithm**

Algorithm agility is intentionally not supported.  
Any other algorithm value fails verification.

This design avoids downgrade risk and ensures verification results are stable and comparable across environments.

---

## What this tool does

- Verifies hash-chained NDJSON audit logs
- Verifies ZIP evidence packs containing those logs
- Enforces strict ordering and schema rules
- Produces deterministic PASS / FAIL results
- Runs entirely offline

This is deliberately conservative software.

That is the point.

---

## What this tool does not do

Guardian Verifier does **not**:

- capture or instrument events
- repair, reinterpret, or “fix” logs
- assert truth or correctness of the underlying system
- depend on servers, clocks, or external services

It verifies structure and integrity only.

---

## Quick start

```bash
npm install
npm test
```

Verify a known-good fixture:

```bash
node ./bin/guardian-verify.js ./tests/fixtures/good.ndjson
```

Expected output:

```
AUTHENTIC
```

---

## Demo: scale with explicit gaps

Large demo exports (distributed as Release assets) include:

- `demo-big-100k-clean.ndjson`  
  A clean 100,000-record audit chain.

- `demo-big-100k-multi-gap.ndjson`  
  A 100,000-record audit chain containing multiple explicit GAP records.

Verify them locally:

```bash
node ./bin/guardian-verify.js ./release-assets/demo-big-100k-clean.ndjson
node ./bin/guardian-verify.js ./release-assets/demo-big-100k-multi-gap.ndjson
```

Both verify successfully.

This demonstrates that:
- gaps are first-class, explicit records
- missing data does not cause silent truncation
- verification remains deterministic at scale

---

## Where this fits

Guardian Verifier is a **correctness showcase** for the Guardian family.

Guardian systems are designed so that:
- producers emit deterministic, auditable records
- auditors can verify those records independently
- verification does not require access to the original system

This repository demonstrates that verification model directly.

---

## Specifications

- `SPEC_VERIFY.md` — normative verification rules
- `WHAT_PASS_MEANS.md` — the precise meaning of PASS
- `src/verify_ndjson.js` — streaming NDJSON verification
- `src/verify_zip.js` — ZIP safety and entry verification

---

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
