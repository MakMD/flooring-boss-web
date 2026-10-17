/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  scanFormValues,
  matchReference,
  validateReviewedImport,
} from "../src/utils/ocrImport.js";
import { validateScanFiles, SCAN_LIMITS } from "../src/utils/scanDocuments.js";
import { buildResult } from "../supabase/functions/scan-work-order/index.ts";
import { makePage, makeRow } from "./fixtures/ocrPage.js";
const scan = () =>
  buildResult([
    {
      image: 1,
      page: makePage({
        rows: [
          makeRow(),
          makeRow({ printed_line_id: "2", category: "material", name: "LVP" }),
        ],
      }),
    },
  ]);
test("only labor defaults to assignments and linked instructions survive import", () => {
  const values = scanFormValues(scan(), {});
  assert.deepEqual(
    values.pending_work_types.map((x) => x.import_as_work),
    [true, false],
  );
  assert.match(values.pending_work_types[0].notes, /Монтувати LVP/);
  assert.equal(values.pending_work_types[0].quantity, 10);
  assert.equal(values.ocr_reviewed, false);
  assert.throws(() => validateReviewedImport(values), /confirm/);
  validateReviewedImport({ ...values, ocr_reviewed: true });
});
test("rescanning clears missing fields and preserves printed zero", () => {
  const next = {
    ...scan(),
    address: "",
    date: "",
    date_end: "",
    type: "Unknown",
    total_amount: 0,
    work_types: [],
    instructions: [],
    ai_translation: "",
  };
  const values = scanFormValues(next, {});
  assert.equal(values.address, "");
  assert.equal(values.date, "");
  assert.equal(values.project_type, "");
  assert.equal(values.total_amount, 0);
  assert.deepEqual(values.pending_work_types, []);
});
test("company matching never silently uses substrings or ambiguous matches", () => {
  assert.equal(
    matchReference([{ id: 1, name: "ABC Homes West" }], "ABC Homes"),
    "",
  );
  assert.equal(
    matchReference(
      [
        { id: 1, name: "ABC Homes" },
        { id: 2, name: "abc homes" },
      ],
      "ABC Homes",
    ),
    "",
  );
  assert.equal(
    matchReference([{ id: 1, name: "ABC Homes" }], " abc homes "),
    1,
  );
});
test("unreviewed, malformed and material-as-labor imports are blocked", () => {
  assert.throws(() => scanFormValues({ work_types: [] }, {}), /Unsupported/);
  const values = { ...scanFormValues(scan(), {}), ocr_reviewed: true };
  values.pending_work_types[1].import_as_work = true;
  assert.throws(() => validateReviewedImport(values), /Only labor/);
  values.pending_work_types[1].import_as_work = false;
  values.pending_work_types[0].amount = NaN;
  assert.throws(() => validateReviewedImport(values), /Invalid amount/);
});
test("file validation rejects oversized and unsupported files before any upload", () => {
  const jpg = { name: "photo.jpg", type: "image/jpeg", size: 1024 };
  validateScanFiles([
    jpg,
    { name: "document.pdf", type: "application/pdf", size: 2048 },
  ]);
  assert.throws(
    () =>
      validateScanFiles([
        { name: "photo.heic", type: "image/heic", size: 1024 },
      ]),
    /JPEG/,
  );
  assert.throws(
    () => validateScanFiles([{ ...jpg, size: SCAN_LIMITS.imageBytes + 1 }]),
    /too large/,
  );
  assert.throws(() => validateScanFiles(Array(11).fill(jpg)), /1–10/);
});
