# WHAT_PASS_MEANS

A `PASS` result means:

- The file is valid NDJSON (every required line parses as JSON).
- The audit-chain hashes recompute exactly under `SPEC_VERIFY.md`.
- Chain ordering is internally consistent (each link matches the prior link).
- Any explicit gaps included in the export are integrity-checked and included in the chain.
- The seal (when present) matches the computed `root_ch` and `terminal_ch`.

A `PASS` result does **not** mean:

- The events are “true” in the real world.
- The capture process was correct or complete beyond what the export explicitly contains.
- Missing data was impossible — it only proves missing data was either not present or was explicitly represented (e.g. via GAP records).
- Any legal conclusion, policy interpretation, intent, or fault.

This tool is a **verifier**, not a recorder and not a judge.
