# Kernel Auditor (Verifier SDK) — Internal Mini-Spec v0.2

## Purpose
Build a read-only **Verification SDK** (“Auditor”) that can independently validate the integrity of **Kernel v1.2 audit-chain exports**.

It must answer, programmatically:

> “Is this NDJSON export / frozen evidence ZIP authentic and untampered?”

The Auditor is **non-authoritative**. It never fixes, guesses, or repairs.

## Non-negotiables
1. **Deterministic verification** — same input bytes → same result, same issue ordering.
2. **Strict by default** — any chain break, malformed record, unknown record type, or hash mismatch → fail.
3. **No silent tolerance** — problems are typed issues.
4. **Stream-first** — verify NDJSON without loading the whole file by default.
5. **Stable error codes** — machine-consumable and versionable.

## Inputs
### NDJSON (core)
- Newline-delimited JSON records.
- Verified from a stream (Node Readable) or AsyncIterable.

### Frozen evidence ZIP (pack)
- ZIP contains one or more NDJSON exports + supporting metadata.
- Auditor enforces ZIP safety limits, optional expected file presence, then verifies NDJSON entries.

## Kernel v1.2 export format (records)
### 1) `{"type":"run", "run_id":"..."}`
- Must be the **first non-empty line**.

### 2) Chain-linked records (in order)
- `segment` records: `{"type":"segment", "seg": { ... , "h":"...", "ch":"..." }}`
- `gap` records: `{"type":"gap", "seg_id_start":n, "seg_id_end":n, "reason_code":1|2, "h":"...", "ch":"...", "reason_text"?:"..."}`

### 3) Optional `seal`
- `{"type":"seal", "algo":"sha256", "root_ch":"...", "terminal_ch":"..."}`
- If present, it must be the **final non-trace** record.

### 4) Optional `trace`
- `{"type":"trace", ...}`
- May appear after the chain section.
- Once a `trace` is seen, **no segments/gaps/seal may follow**.

## Core invariants
### Hashing primitives (must match Kernel)
All hashes are SHA-256 (hex), over **stableStringify** of domain-separated arrays:

- `root_ch = sha256( stableStringify(["audit_root_v1.2", run_id]) )`
- `segment_h = sha256( stableStringify(["segment_h_v1.2", canonicalSegmentBody(seg_without_hashes)]) )`
- `gap_h = sha256( stableStringify(["gap_h_v1.2", {seg_id_start, seg_id_end, reason_code}]) )`
- `ch = sha256( stableStringify(["link_v1.2", prev_ch, h]) )`

`canonicalSegmentBody` includes only stable fields:
`{ run_id, seg_id, start_ts, end_ts, count, sealed, events }`

### Chain invariants
Starting state:
- `prev_ch = root_ch`

For each `segment` / `gap` record in file order:
1. Recompute `h` and ensure it equals the stored `h`.
2. Recompute `ch = link(prev_ch, h)` and ensure it equals the stored `ch`.
3. Update `prev_ch = ch`.

### GAP semantics
- GAP is first-class.
- `reason_code` is stable and hashed.
- `reason_text` (if present) is display-only and **not hashed**.
- Allowed reason codes (locked for v1.2 strict verification):
  - `1 = missing_segment`
  - `2 = worker_failure`

### Seal semantics (strict)
If a `seal` is present:
- `algo` must be `"sha256"`
- `root_ch` must match the computed `root_ch`
- `terminal_ch` must equal the verifier’s current `prev_ch`

Default policy: **require seal** for authenticity.

### Partial-file policy (opt-in)
Option: `allow_partial: true`
- If the final line is truncated/unparseable, accept it **only if it is the last non-empty line**.
- If the export is missing a seal, return a **partial** result (chain verified up to `last_ch`).

Partial results are *not* “AUTHENTIC” by default; they are “PARTIAL”.

## API surface (minimal)
### Library
- `verifyNdjsonStream(input, opts) -> VerificationResult`
- `verifyZipEvidencePack(zipInput, opts) -> PackVerificationResult`

Options (baseline):
- `mode: "strict" | "tolerant"` (default strict)
- `allow_partial: boolean` (default false)
- `maxErrors` (default 50)
- `schemaProfile` (default `kernel-only`)
- ZIP limits (entries, bytes, ratio)

### CLI wrapper
- `guardian-verify <path-to-zip-or-ndjson>`
- Prints AUTHENTIC / PARTIAL / NOT AUTHENTIC and basic chain info.

## Outputs
### VerificationResult
- `status: "ok" | "partial" | "invalid"`
- `is_authentic` (true iff status=="ok")
- `is_partial` (true iff status=="partial")
- `run_id`, `root_ch`, `last_ch`
- `checked_records`, `verified_chain_records`
- `errors[]`, `warnings[]` (typed)
- `stats` (byType, gapsByReason)

## Strict vs tolerant
Strict fails on:
- malformed JSON
- missing required fields
- unknown record `type`
- unknown GAP reason_code
- any hash mismatch
- any chain mismatch
- record ordering violations (segment/gap/seal after trace; non-trace after seal)
- ZIP safety violations

Tolerant may downgrade *some* schema issues to warnings, but never:
- hash mismatches / chain mismatches
- ZIP safety failures

## Security
- ZIP bomb defenses: max entries, max bytes, max compression ratio.
- Cap max line length.
- Never execute embedded content.

## Test plan (must-have)
- Happy Kernel-format NDJSON verifies `status==ok`.
- Field tamper → segment/gap hash mismatch.
- Chain tamper → chain mismatch.
- Unknown record type → fails in strict.
- Unknown GAP reason_code → fails even if hash would otherwise match.
- `trace` encountered then `gap/segment/seal` → fails.
- ZIP happy pack verifies.
- ZIP missing expected file fails in strict.
- ZIP limits trigger safety failure.
