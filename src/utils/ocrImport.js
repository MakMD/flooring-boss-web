export const OCR_SCHEMA_VERSION = "4.0";
export const OCR_CATEGORIES = [
  "labor",
  "material",
  "accessory",
  "miscellaneous",
  "unknown",
];
export const OCR_UNITS = [
  "SF",
  "LF",
  "EA",
  "HR",
  "PC",
  "FT",
  "SY",
  "M2",
  "M",
  "BOX",
  "SET",
  "UNKNOWN",
];

const normalizedName = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
// Only a unique exact match may select a database record automatically.
export function matchReference(items, name) {
  const matches = items.filter(
    (item) => normalizedName(item.name) === normalizedName(name),
  );
  return name && matches.length === 1 ? matches[0].id : "";
}

export function validateOcrResult(result) {
  if (
    !result ||
    result.schema_version !== OCR_SCHEMA_VERSION ||
    !Array.isArray(result.work_types) ||
    !Array.isArray(result.instructions) ||
    !Array.isArray(result.issues) ||
    typeof result.needs_review !== "boolean"
  ) {
    throw new Error(
      "Unsupported scan response. Update the scan-work-order function before scanning.",
    );
  }
  for (const field of [
    "type",
    "work_order_number",
    "address",
    "builder_name",
    "store_name",
    "date",
    "date_end",
    "ai_translation",
  ]) {
    if (typeof result[field] !== "string")
      throw new Error(`Invalid scan field: ${field}.`);
  }
  if (
    result.total_amount !== null &&
    (typeof result.total_amount !== "number" ||
      !Number.isFinite(result.total_amount))
  )
    throw new Error("Invalid scan total.");
  if (
    result.instructions.some(
      (note) =>
        !note ||
        typeof note.id !== "string" ||
        typeof note.original !== "string" ||
        typeof note.ukrainian !== "string",
    ) ||
    result.issues.some(
      (item) =>
        !item ||
        typeof item.message !== "string" ||
        typeof item.path !== "string",
    )
  )
    throw new Error("Invalid scan instructions or findings.");
  if (
    result.work_types.length > 2500 ||
    new Set(result.work_types.map((row) => row.id)).size !==
      result.work_types.length
  )
    throw new Error("Invalid or duplicate scan rows.");
  for (const row of result.work_types) {
    if (
      typeof row.id !== "string" ||
      typeof row.name !== "string" ||
      !OCR_CATEGORIES.includes(row.category) ||
      !OCR_UNITS.includes(row.unit)
    )
      throw new Error("Invalid scan row.");
    for (const field of ["quantity", "rate", "amount"]) {
      if (
        row[field] !== null &&
        (typeof row[field] !== "number" ||
          !Number.isFinite(row[field]) ||
          Math.abs(row[field]) > 1e9)
      )
        throw new Error("Invalid scan number.");
    }
  }
  return result;
}

export function rowNotes(result, rowId) {
  const row = result.work_types.find((item) => item.id === rowId);
  const instructions = result.instructions
    .filter((note) => note.work_type_id === rowId)
    .map((note) =>
      note.ukrainian
        ? `${note.ukrainian}\nOriginal: ${note.original}`
        : note.original,
    )
    .join("\n\n");
  return [
    row?.description && `Description: ${row.description}`,
    row?.area && `Area: ${row.area}`,
    instructions,
  ].filter(Boolean).join("\n\n");
}

export function scanFormValues(result, lists) {
  validateOcrResult(result);
  return {
    project_type: ["Address", "Service"].includes(result.type)
      ? result.type
      : "",
    work_order_number: result.work_order_number || "",
    address: result.address || "",
    date: result.date || "",
    date_end: result.date_end || "",
    time: "",
    total_amount: result.total_amount ?? "",
    builder_id: matchReference(lists.builders || [], result.builder_name),
    store_id: matchReference(lists.stores || [], result.store_name),
    ai_translation: result.ai_translation || "",
    ocr_result: result,
    ocr_reviewed: false,
    pending_work_types: result.work_types.map((row) => ({
      ...row,
      template_id: matchReference(lists.workTypeTemplates || [], row.name),
      import_as_work: row.category === "labor",
      notes: rowNotes(result, row.id),
    })),
  };
}

export function validateReviewedImport(values) {
  if (!values.ocr_result) return;
  validateOcrResult(values.ocr_result);
  if (!values.ocr_reviewed)
    throw new Error("Review the scan and confirm it before saving.");
  if (!["Address", "Service"].includes(values.project_type))
    throw new Error("Select a project type.");
  if (values.date_end && values.date_end < values.date)
    throw new Error("End date cannot be before start date.");
  const printedTotal =
    values.total_amount === "" ? null : Number(values.total_amount);
  if (
    printedTotal !== null &&
    (!Number.isFinite(printedTotal) || Math.abs(printedTotal) > 1e9)
  )
    throw new Error("Invalid project amount.");
  for (const row of values.pending_work_types) {
    if (!OCR_CATEGORIES.includes(row.category))
      throw new Error("Select a category for each row.");
    if (row.import_as_work && row.category !== "labor")
      throw new Error("Only labor rows can be assigned as work.");
    if (row.import_as_work && !row.name.trim())
      throw new Error("Every imported work item needs a name.");
    for (const field of ["quantity", "rate", "amount"]) {
      if (
        row[field] !== null &&
        row[field] !== "" &&
        (!Number.isFinite(Number(row[field])) ||
          Math.abs(Number(row[field])) > 1e9)
      )
        throw new Error(`Invalid ${field} for ${row.name}.`);
    }
  }
}
