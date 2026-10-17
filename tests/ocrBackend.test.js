/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResult,
  normalizeNumber,
  normalizeUnit,
  parseInstallDates,
  moneyCents,
  translationProblems,
  prepareImages,
  verificationDifferences,
  PAGE_SCHEMA,
  validateSchema,
  handler,
} from "../supabase/functions/scan-work-order/index.ts";
import { makePage, makeRow } from "./fixtures/ocrPage.js";

const result = (pages) =>
  buildResult(pages.map((page, i) => ({ image: i + 1, page })));
test("schema rejects extra fields and invalid numeric types", () => {
  validateSchema(makePage(), PAGE_SCHEMA);
  assert.throws(() =>
    validateSchema({ ...makePage(), surprise: true }, PAGE_SCHEMA),
  );
  assert.throws(() =>
    validateSchema(makePage({ page_number: "1" }), PAGE_SCHEMA),
  );
});
test("numbers, units and money retain zero and reject ambiguous inputs", () => {
  assert.equal(normalizeNumber("0"), 0);
  assert.equal(normalizeNumber("CAD $1,234.50"), 1234.5);
  assert.equal(normalizeNumber("1,20"), null);
  assert.equal(normalizeNumber(true), null);
  assert.equal(normalizeNumber("(12.50)"), -12.5);
  assert.equal(moneyCents(1.005), 101n);
  assert.equal(moneyCents(-1.005), -101n);
  assert.equal(normalizeUnit("SQ FT"), "SF");
  assert.equal(normalizeUnit("PC"), "PC");
});
test("dates do not invent a year or confuse written and printed dates", () => {
  assert.deepEqual(
    parseInstallDates("10/17/26 to 10/19/26", "MDY", "install_field"),
    { start: "2026-10-17", end: "2026-10-19" },
  );
  for (const value of ["02/30/2026", "10/17", "10/20/26 to 10/17/26"])
    assert.equal(parseInstallDates(value, "MDY", "install_field").start, "");
  assert.equal(parseInstallDates("10/17/26", "MDY", "handwritten").start, "");
});
test("materials and labor stay distinct and totals use labor only", () => {
  const r = result([
    makePage({
      rows: [
        makeRow(),
        makeRow({ printed_line_id: "2", name: "LVP", category: "material" }),
      ],
    }),
  ]);
  assert.equal(r.work_types.length, 2);
  assert.equal(r.validation.calculated_labor_total, 20);
  assert.equal(r.validation.labor_total_check, "matched");
  assert.equal(r.instructions[0].work_type_id, r.work_types[0].id);
});
test("conflicting orders fail, unidentified continuation pages require review", () => {
  assert.throws(
    () => result([makePage(), makePage({ order_number: "OTHER" })]),
    { code: "MULTIPLE_ORDERS" },
  );
  assert.throws(
    () => result([makePage(), makePage({ address: "Different address" })]),
    { code: "HEADER_CONFLICT" },
  );
  const r = result([
    makePage({ page_count: 2 }),
    makePage({
      page_count: 2,
      page_number: 2,
      order_number: "",
      rows: [],
      instructions: [],
    }),
  ]);
  assert.ok(r.needs_review);
  assert.ok(r.issues.some((i) => i.code === "UNCONFIRMED_PAGE_IDENTITY"));
  assert.equal(r.validation.labor_total_check, "not_checkable");
});
test("duplicate photos of a physical row do not double totals; conflicts stay visible", () => {
  assert.equal(result([makePage(), makePage()]).work_types.length, 1);
  const r = result([
    makePage(),
    makePage({
      rows: [makeRow({ amount_raw: "21.00", raw_text: "10 SF 2.00 21.00" })],
    }),
  ]);
  assert.equal(r.work_types.length, 2);
  assert.ok(r.issues.some((i) => i.code === "ROW_CONFLICT"));
});
test("translation checks preserve negation and normalize thousands separators", () => {
  assert.ok(
    translationProblems(
      "Do not install LVP.",
      "Монтувати LVP, панелі недалеко.",
    ).some((p) => p.code === "TRANSLATION_NEGATION"),
  );
  assert.deepEqual(
    translationProblems("Do not install LVP.", "Не монтувати LVP."),
    [],
  );
  assert.deepEqual(
    translationProblems("Install 1,000 SF of LVP.", "Монтувати 1000 SF LVP."),
    [],
  );
  assert.ok(
    translationProblems(
      "Install 100 SF of LVP.",
      "Монтувати 1000 SF LVP.",
    ).some((p) => p.code === "TRANSLATION_NUMBERS"),
  );
});
test("verification ignores harmless evidence formatting but catches changed facts", () => {
  assert.deepEqual(
    verificationDifferences(
      makePage(),
      makePage({
        rows: [
          makeRow({
            raw_text: "different whitespace evidence",
            rate_raw: "2",
            amount_raw: "20",
          }),
        ],
      }),
    ),
    [],
  );
  assert.ok(
    verificationDifferences(
      makePage(),
      makePage({ rows: [makeRow({ amount_raw: "200" })] }),
    ).includes("rows"),
  );
});
test("input validation rejects raw PDFs, too many images and MIME spoofing", async () => {
  await assert.rejects(prepareImages({ imagesBase64: [btoa("%PDF-test")] }), {
    code: "IMAGE_MIME_MISMATCH",
  });
  await assert.rejects(prepareImages({ imagesBase64: Array(11).fill("abc") }), {
    code: "IMAGE_COUNT",
  });
  await assert.rejects(
    prepareImages({
      imagesBase64: ["data:image/png;base64," + btoa("\xff\xd8\xffx")],
    }),
    { code: "IMAGE_MIME_MISMATCH" },
  );
  const images = await prepareImages({
    imagesBase64: [btoa("\xff\xd8\xffx"), btoa("\xff\xd8\xffx")],
  });
  assert.equal(images.length, 1);
});

test("handler enforces admin access and budget before spending on OpenAI", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  const env = {
    OPENAI_API_KEY: "fixture",
    SUPABASE_URL: "https://fixture.test",
    SUPABASE_ANON_KEY: "fixture",
    OCR_TEST_MODE: "true",
    OCR_VERIFY_UNCERTAIN: "false",
  };
  globalThis.Deno = { env: { get: (key) => env[key] } };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalDeno === undefined) delete globalThis.Deno;
    else globalThis.Deno = originalDeno;
  });
  let role = "worker",
    budget = false,
    modelCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/v1/user"))
      return Response.json({ id: "test-user" });
    if (url.includes("/profiles?")) return Response.json([{ role }]);
    if (url.endsWith("/consume_ocr_budget")) return Response.json(budget);
    if (url.includes("api.openai.com")) {
      modelCalls++;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(makePage()) },
          },
        ],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const request = () =>
    new Request("https://fixture.test/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer fixture",
      },
      body: JSON.stringify({ imagesBase64: [btoa("\xff\xd8\xffx")] }),
    });
  assert.equal((await handler(request())).status, 403);
  role = "admin";
  assert.equal((await handler(request())).status, 429);
  assert.equal(modelCalls, 0);
  budget = true;
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).schema_version, "4.0");
  assert.equal(modelCalls, 1);
});
