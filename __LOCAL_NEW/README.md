# Guardian Verifier Skeleton (Kernel Auditor)

A separate, standalone skeleton repo for verifying:
- Kernel v1.2 audit-chain **NDJSON** exports
- frozen **ZIP evidence packs** containing those NDJSON files

This is **not** the Kernel. It is the independent “Auditor” side.

## Quick start
```bash
npm install
npm test

# verify a ndjson file
node ./bin/guardian-verify.js ./tests/fixtures/good.ndjson
```

## Key files
- `src/verify_ndjson.js` — streaming v1.2 chain verifier
- `src/audit_chain_v1_2.js` — v1.2 hashing + domain separators + canonical bodies
- `src/verify_zip.js` — ZIP safety + NDJSON entry verification
- `INTERNAL_SPEC.md` — implementation mini-spec

## Notes
**Strictest default:** in strict mode the verifier **fails on any unknown record `type`**.
This is intentional: the Auditor should reject unexpected line types rather than silently ignoring them.

Default allowlist (Kernel v1.2): `run`, `segment`, `gap`, `seal`, `trace`.
You can override programmatically via `verifyNdjsonStream(input, { allowedTypes: [...] })`.
