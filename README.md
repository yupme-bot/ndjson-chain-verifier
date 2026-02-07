# Guardian Verifier

An offline, deterministic verifier for NDJSON audit-chain exports and frozen ZIP evidence packs.

Guardian Verifier exists so that **any party** can independently verify the *internal integrity* of an audit artifact — without trusting the producer, the runtime, or the environment in which it was created.

Scope note  
This tool verifies **structural integrity and explicit absence only**.  
It does **not** prove who produced a log, when it was created, or whether the events themselves are true.

---

## Why this exists

Most systems that produce logs also control how those logs are interpreted.

When logs cross trust boundaries — between organizations, teams, or time — this creates a problem:  
the recipient must trust both the *data* and the *story about the data*.

Guardian Verifier answers a narrower, harder question:

“Do these bytes still obey the audit-chain rules they claim to follow?”

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
- Missing data must be explicit (via GAP records)
- Large exports (100,000+ records) verify offline
- Multiple explicit GAPs in a single run verify correctly
- Verification output is stable and script-friendly

If a single byte changes, the result changes.

---

## What “explicit absence” means

Missing data is represented by GAP records **inside the chain itself**.

Absence is:
- cryptographically committed
- positionally fixed
- visible to independent verifiers

It is not inferred from failure, truncation, or heuristics.

This allows a verifier to distinguish:
- data that is present and intact
- data that is missing, with absence explicitly recorded
- artifacts that are invalid or corrupted

---

## Hashing and integrity model

Verification is based on a strict, linear hash-chain:

- Each record advances a rolling chain hash
- Canonical serialization is applied before hashing
- SHA-256 is the only accepted algorithm

Algorithm agility is intentionally not supported.

This avoids downgrade ambiguity and ensures verification results are:
- stable
- comparable
- reproducible across environments

Any other algorithm value fails verification.

---

## Verification outcomes

Guardian Verifier produces deterministic outcomes:

OK  
The entire artifact verifies and is complete.

PARTIAL  
The verified portion is intact, but the artifact is incomplete  
(e.g. missing seal, explicit GAPs, or truncated end).

INVALID  
Integrity rules were violated (tampering, reordering, corruption).

Important  
OK or PARTIAL mean *internally consistent*, not authenticated origin.

---

## What this tool does

Guardian Verifier:
- verifies hash-chained NDJSON audit logs
- verifies ZIP evidence packs containing those logs
- enforces strict ordering and schema rules
- detects tampering, truncation, and reordering
- runs entirely offline

It is intentionally conservative software.

That is the point.

---

## What this tool does not do

Guardian Verifier does not:
- capture or instrument events
- repair, reinterpret, or “fix” logs
- assert truth of the underlying system
- prove authorship or timestamps
- provide a compliance or audit solution by itself
- depend on servers, clocks, or external services

It verifies integrity and explicit absence only.

---

## When to use this

Use Guardian Verifier when:
- audit artifacts cross organizational trust boundaries
- long-term archives may have partial data loss
- you need to prove what data is present vs absent
- partial but honest evidence is better than silence

Do not use this when:
- you need real-time analytics
- complete audit trails are legally mandatory
- you need provenance, timestamps, or signatures without external systems

---

## Composition pattern

Guardian Verifier is designed to compose with other systems:

[ Log Source ]  
↓  
[ Export with explicit gaps ]  
↓  
[ Optional signing / timestamping ]  
↓  
[ Archive / Transfer ]  
↓  
[ Independent verification with Guardian Verifier ]

This tool verifies the integrity layer only.

---

## Quick start

Install and run tests:

    npm install
    npm test

Verify a known-good fixture:

    node ./bin/guardian-verify.js ./tests/fixtures/good.ndjson

Expected output:

    OK

---

## Demo: scale with explicit gaps

Large demo exports (distributed as release assets) include:

- demo-big-100k-clean.ndjson  
  A clean 100,000-record audit-chain.

- demo-big-100k-multi-gap.ndjson  
  A 100,000-record audit-chain with multiple explicit GAP records.

Verify locally:

    node ./bin/guardian-verify.js ./release-assets/demo-big-100k-clean.ndjson
    node ./bin/guardian-verify.js ./release-assets/demo-big-100k-multi-gap.ndjson

Both verify successfully.

---

## Common questions

Does this prove missing data never existed?  
No. It proves that absence is explicit and verifiable, not whether data should have existed.

Does this replace existing logging systems?  
No. It verifies exported artifacts, not live systems.

Is this a compliance solution?  
No. It is a technical component that may support compliance workflows.

---

## Specifications

- SPEC_VERIFY.md — normative verification rules  
- WHAT_PASS_MEANS.md — precise meaning of OK / PARTIAL / INVALID  
- src/verify_ndjson.js — streaming NDJSON verification  
- src/verify_zip.js — ZIP safety and entry verification  

---

## License

MIT License

Copyright (c) 2026 yupme-bot

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the “Software”), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

The Software is provided “as is”, without warranty of any kind, express or
implied, including but not limited to the warranties of merchantability,
fitness for a particular purpose and noninfringement. In no event shall the
authors or copyright holders be liable for any claim, damages or other
liability, whether in an action of contract, tort or otherwise, arising from,
out of or in connection with the Software or the use or other dealings in the
Software.
