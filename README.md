# Guardian Verifier

An **offline, deterministic verifier** for NDJSON audit-chain exports and frozen ZIP evidence packs.

Guardian Verifier exists so that **any party** can independently verify the *internal integrity* of an audit artifact — without trusting the producer, the runtime, or the environment in which it was created.

> **Scope note**  
> This tool verifies **structural integrity and explicit absence only**.  
> It does **not** prove who produced a log, when it was created, or whether the events themselves are true.

---

## Why this exists

Most systems that produce logs also control how those logs are interpreted.

When logs cross trust boundaries — between organizations, teams, or time — this creates a problem:
the recipient must trust both the *data* and the *story about the data*.

Guardian Verifier answers a narrower, harder question:

> **“Do these bytes still obey the audit-chain rules they claim to follow?”**

That question matters when:
- audit artifacts are exchanged between organizations
- evidence must stand on its own, offline
- trust in the producer is limited or disputed
- correctness must be provable, not asserted

Guardian Verifier deliberately stops there.

---

## What this tool demonstrates

Running this verifier shows that:

- A clean audit-chain verifies deterministically
- Any modification, truncation, or reordering is detected
- Missing data must be **explicit** (via GAP records)
- **Large exports (100,000+ records) verify offline**
- **Multiple explicit GAPs in a single run verify correctly**
- Verification output is stable and script-friendly

If a single byte changes, the result changes.

---

## What “explicit absence” means

Missing data is represented by **GAP records inside the chain itself**.

Absence is:
- cryptographically committed
- positionally fixed
- visible to independent verifiers

It is **not** inferred from failure, truncation, or heuristics.

This allows a verifier to distinguish:
- “this data is present and intact”
- “this data is missing, and the absence is explicit”
- “this artifact is invalid or corrupted”

---

## Hashing and integrity model

Verification is based on a **strict, linear hash-chain**:

- Each record advances a rolling chain hash
- Canonical serialization is applied before hashing
- **SHA-256 is the only accepted algorithm**

Algorithm agility is intentionally not supported.

This avoids downgrade ambiguity and ensures verification results are:
- stable
- comparable
- reproducible across environments

Any other algorithm value fails verification.

---

## Verification outcomes

Guardian Verifier produces deterministic outcomes:

- **OK**  
  The entire artifact verifies and is complete.

- **PARTIAL**  
  The verified portion is intact, but the artifact is incomplete  
  (e.g., missing seal, explicit GAPs, or truncated end).

- **INVALID**  
  Integrity rules were violated (tampering, reordering, corruption).

> **Important:**  
> “OK” or “PARTIAL” mean *internally consistent*, not authenticated origin.

---

## What this tool does

Guardian Verifier:

- Verifies hash-chained NDJSON audit logs
- Verifies ZIP evidence packs containing those logs
- Enforces strict ordering and schema rules
- Detects tampering, truncation, and reordering
- Runs entirely offline

It is intentionally conservative software.

That is the point.

---

## What this tool does not do

Guardian Verifier does **not**:

- capture or instrument events
- repair, reinterpret, or “fix” logs
- assert truth of the underlying system
- prove authorship or timestamps
- provide a compliance or audit solution by itself
- depend on servers, clocks, or external services

It verifies **integrity and explicit absence only**.

---

## When to use this

Use Guardian Verifier when:
- ✓ audit artifacts cross organizational trust boundaries
- ✓ long-term archives may have partial data loss
- ✓ you need to prove what data is present vs absent
- ✓ partial but honest evidence is better than silence

Do **not** use this when:
- ✗ you need real-time analytics
- ✗ complete audit trails are legally mandatory
- ✗ you need provenance, timestamps, or signatures without external systems

---

## Composition pattern

Guardian Verifier is designed to **compose** with other systems:

