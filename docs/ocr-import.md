# Reviewed work-order import

## Deployment order

1. Back up the database and apply `supabase/migrations/20261017195000_reviewed_ocr_import.sql` in a Supabase staging project first. It adds nullable scan/import metadata to existing tables, an import RPC, and a private usage counter. It does not rewrite existing projects. Verify the RPC against the actual table types, constraints, grants and RLS policies; the SQL tests use a representative schema, not a production database dump.
2. Deploy `scan-work-order` with its existing OpenAI and Supabase secrets. The function now requires a signed-in **admin**, including when `OCR_ALLOWED_USER_ID` is set. It calls the usage RPC before contacting OpenAI. Missing migration fails closed with a clear error.
3. Deploy the frontend. Existing manual project creation stays on its existing path. Scanned projects use the reviewed import RPC; do not deploy the frontend without step 1.
4. Verify a real work order in staging: original image/PDF access, warnings, linked instructions, material versus labor classification, project save, and worker assignments. Confirm an unauthorized worker cannot scan/import. Merge/release after these checks.

The default model remains `gpt-4o-2024-08-06`; this change does not claim improved model accuracy from synthetic tests. Optional `OCR_MODEL` and `OCR_VERIFICATION_MODEL` overrides must support vision, Chat Completions, temperature and strict JSON Schema. Validate model-specific parameters and a labeled real-document test set before changing these values. An agreement on a second read is not proof of correctness.

## Input and review behavior

- JPEG, PNG, WebP and PDF; maximum 10 rendered pages, 8 MiB per image and 24 MiB total images/source files. PDF.js is lazy-loaded and rasterizes every PDF page at up to 2800 pixels on the longer side. Oversized/password-protected files fail explicitly; pages are never silently dropped.
- Original files upload only after extraction succeeds. Partial upload failures attempt to remove newly uploaded originals. If a user abandons a successful draft, originals remain for a future storage-retention cleanup; no existing files are automatically deleted.
- The response is version-checked before it enters the form. A successful new scan replaces all scan-controlled fields, including missing values and zero amounts. A failed scan keeps the prior result; changing selected files blocks saving the old result until scanning succeeds.
- A completed result is reused for the same File objects in the same open form. An upload retry reuses extraction. This is a per-form cache, not a persistent shared cache.
- The reviewer sees original warnings, sources, original instructions and translations. Unknown project types stay unknown until selected. Only a unique exact normalized company/template match is selected automatically.
- Only checked labor rows become `work_types`. Material/accessory rows stay in `addresses.ai_scan.reviewed_rows` for reference; they are **not** automatically added to `address_materials` or inventory. Linking them to a material catalog requires separate explicit mapping.
- Work amounts preserve the prior application's meaning (`payment_amount`); the review screen labels this explicitly. Quantities, units, rates, descriptions, areas and sources are retained in JSON metadata and never used as fallback payment amounts.
- Instructions physically linked to a labor row, its description and area populate that work item's editable notes. The worker portal also displays the complete project instructions with a reminder to check which job each instruction applies to. All other instructions remain in the project translation and complete imported document record, including material-linked notes.
- `ai_scan` stores the original response, reviewed rows, end date, reviewer/time, model/prompt metadata and source-file mapping. `work_types.ai_source` keeps the imported row snapshot; later payment edits do not rewrite historical scan evidence.

## Reliability and access

`import_reviewed_work_order` is security-invoker and respects existing table RLS. It checks the admin role, review confirmation and accepted row categories. A single transaction saves project, templates and assignments. Any error rolls everything back. A user-scoped UUID import key makes retrying the same submission idempotent. Advisory locks serialize matching OCR imports/template names; existing manual creation paths do not participate in those locks, so the RPC does not promise a global unique work-order constraint.

`consume_ocr_budget` is a security-definer function with a fixed empty search path and an explicit admin check. Its table is not directly accessible to browser roles. The default budget is 100 page-read reservations per user per UTC clock hour, including one reserved optional verification page per scan. A 429/5xx retry can add one further model call per read. Failed/aborted scans still consume reservations, and verification reservations are not refunded. The counter limits this OCR feature; it is not an account-wide OpenAI dollar cap.

Explicitly conflicting order numbers/headers still reject the batch. A continuation page without an order number is retained only with mandatory review and an uncheckable-total warning. Translation checks now recognize standalone negation and normalize thousands separators, but remain heuristics. Re-read comparison normalizes numeric formatting and excludes raw-text whitespace while preserving meaningful differences. First-read facts are never silently replaced.

## Validation

Use Node 24 (tests import the TypeScript Edge Function using Node's native type stripping):

```sh
npm ci
npm test
npm run build
```

Unit/handler/database tests cover schema validation, dates, decimal math, row identities, totals, instruction links, negation, MIME validation, admin checks, budget rejection, UI import mapping, RPC atomicity, idempotency, zero amounts and access restrictions. SQL executes in PGlite against a representative RLS-enabled schema.

Local Chromium smoke checks used mocked Supabase responses, without production credentials or paid OpenAI calls. They covered two-page PDF rasterization, review gating, retrying a failed save, preserving instructions, excluding materials from assignments, replacing stale results, zero totals, cache reuse, mobile rendering, project scroll restoration and the earlier photo/assignment fixes.

## Measuring real accuracy

Build a labeled set of actual Floor Show/TouchTone work orders, including poor images, multi-page PDFs, duplicate views, services and stair work. Keep a held-out set. Compare exact order/address/date matches, labor/material separation, quantity/unit/amount accuracy, instruction completeness, critical negation/responsibility preservation, review frequency, latency and cost. Add every confirmed failure as a regression case. Only promote a new model or prompt if these measurements improve without worsening critical fields. A successful build or passing mocked tests cannot establish OCR accuracy.
