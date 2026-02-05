# SPEC_VERIFY.md (v0.1)

This document is the **normative** verification specification for deterministic NDJSON audit-chain exports.

The verifier is **offline-only** and **read-only**:
- It never records, captures, repairs, interprets, or “fixes” anything.
- It only checks integrity and ordering.

## 1) Canonicalization

### stableStringify(x)
Canonical JSON serialization is:
- **Objects:** deep-sort keys lexicographically at every level.
- **Arrays:** preserve array order.
- Then serialize with **JSON.stringify**.

## 2) Hash primitive

Let:

- `H(x) = sha256( utf8( stableStringify(x) ) )`

All hashes are lowercase hex SHA-256.

## 3) Domain-separated hashes

### Root

- `root_ch = H(["audit_root_v1.2", run_id])`

### Segment

For a segment record, define `SEG_BODY` as the exact object:

```
{
  run_id,
  seg_id,
  start_ts,
  end_ts,
  count,
  sealed,
  events
}
```

Exclude any stored hash fields (`h`, `ch`) from `SEG_BODY`.

- `expected_h = H(["segment_h_v1.2", SEG_BODY])`

### Gap

For a gap record, define the hashed body as:

```
{ seg_id_start, seg_id_end, reason_code }
```

`reason_text` is **display-only** and is **not hashed**.

- `expected_h = H(["gap_h_v1.2", {seg_id_start, seg_id_end, reason_code}])`

### Chain link

- `ch_next = H(["link_v1.2", prev_ch, expected_h])`

## 4) Record types

NDJSON is newline-delimited JSON objects.

Record `type` values:

- `run`
- `segment`
- `gap`
- `seal`
- `trace`

### `v` field

Any record may include `v`.

- If present, it **must** equal the string `"1.1"`.
- `v` is ignored for hashing.

### Run record

The first non-empty record **must** be:

- `{"type":"run", "run_id":"..."}`

The run record is not hashed. It only supplies `run_id`.

### Segment record

A segment record is:

- `{"type":"segment", "seg": {...}}`

The `seg` object must contain the `SEG_BODY` fields plus stored hashes:

- `seg.h` (stored segment hash)
- `seg.ch` (stored chain hash)

The verifier recomputes `expected_h` from `SEG_BODY` and compares it to `seg.h`.
Then it recomputes `ch_next` and compares it to `seg.ch`.

### Gap record

A gap record is:

- `{"type":"gap", "seg_id_start":..., "seg_id_end":..., "reason_code":..., "h":"...", "ch":"...", "reason_text"?:"..."}`

The verifier recomputes `expected_h` from `{seg_id_start, seg_id_end, reason_code}` and compares it to `h`.
Then it recomputes `ch_next` and compares it to `ch`.

### Seal record

A seal record is:

- `{"type":"seal", "algo":"sha256", "root_ch":"...", "terminal_ch":"..."}`

Seal validation:

- `algo` must be `"sha256"`
- `root_ch` must equal the computed `root_ch`
- `terminal_ch` must equal the verifier’s current `prev_ch`

### Trace record

- `{"type":"trace", ...}`

Trace records do **not** affect the chain.

Ordering rule:

- If any `trace` record is seen, **no** `segment`, `gap`, or `seal` records may appear after it.

## 5) Default PASS policy

Default verification **requires** a valid `seal`.

Without a seal, the result is `MISSING_SEAL`.

## 6) Partial policy (opt-in)

Partial outcomes are only possible when `--allow-partial` is set.

`PARTIAL` is allowed only for:

- `MISSING_SEAL` (no seal record present)
- `TRUNCATED_LAST_LINE` (the **final** non-empty line is not valid JSON)

All other problems are `FAIL`.
