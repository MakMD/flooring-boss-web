import { useFormikContext } from "formik";
import { OCR_CATEGORIES, OCR_UNITS } from "../../utils/ocrImport";
import styles from "./OcrReview.module.css";

export default function OcrReview({ templates }) {
  const { values, setFieldValue } = useFormikContext();
  const scan = values.ocr_result;
  if (!scan) return null;
  const rows = values.pending_work_types;
  const update = (index, changes) => {
    setFieldValue(
      "pending_work_types",
      rows.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    );
    setFieldValue("ocr_reviewed", false);
  };
  return (
    <section className={styles.review} aria-label="Review scanned document">
      <h3>Review before importing</h3>
      <p>
        Check the address, dates, amounts and instructions against the
        originals. Only selected labor rows become worker assignments. Other
        rows are preserved in the document record.
      </p>
      <p>
        Detected builder: <strong>{scan.builder_name || "Unknown"}</strong> ·
        Store: <strong>{scan.store_name || "Unknown"}</strong>. Unmatched names
        require manual selection above.
      </p>
      <p>
        Printed labor total: {scan.total_amount ?? "Not found"} · Check:{" "}
        {scan.validation?.labor_total_check || "Not checked"}
      </p>
      {scan.issues.length > 0 && (
        <div className={styles.warnings} role="status">
          <strong>Scan findings</strong>
          <ul>
            {scan.issues.map((item, index) => (
              <li key={index}>
                {item.message} <small>({item.path})</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className={styles.field}>
        Installation end date
        <input
          type="date"
          value={values.date_end || ""}
          onChange={(event) => {
            setFieldValue("date_end", event.target.value);
            setFieldValue("ocr_reviewed", false);
          }}
        />
      </label>
      {rows.map((row, index) => (
        <article className={styles.row} key={row.id}>
          <div className={styles.grid}>
            <label className={styles.field}>
              Printed name
              <input
                value={row.name}
                onChange={(event) =>
                  update(index, { name: event.target.value, template_id: "" })
                }
              />
            </label>
            <label className={styles.field}>
              Category
              <select
                value={row.category}
                onChange={(event) =>
                  update(index, {
                    category: event.target.value,
                    import_as_work: event.target.value === "labor",
                  })
                }
              >
                {OCR_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Quantity
              <input
                type="number"
                step="any"
                value={row.quantity ?? ""}
                onChange={(event) =>
                  update(index, {
                    quantity:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <label className={styles.field}>
              Unit
              <select
                value={row.unit}
                onChange={(event) =>
                  update(index, { unit: event.target.value })
                }
              >
                {OCR_UNITS.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Rate
              <input
                type="number"
                step="any"
                value={row.rate ?? ""}
                onChange={(event) =>
                  update(index, {
                    rate:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <label className={styles.field}>
              Amount
              <input
                type="number"
                step="0.01"
                value={row.amount ?? ""}
                onChange={(event) =>
                  update(index, {
                    amount:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <p>
            {row.description} {row.area && `· Area: ${row.area}`}
          </p>
          {row.category === "labor" && (
            <>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={row.import_as_work}
                  onChange={(event) =>
                    update(index, { import_as_work: event.target.checked })
                  }
                />{" "}
                Import as work (amount becomes payment amount)
              </label>
              <label className={styles.field}>
                Work type
                <select
                  value={row.template_id || ""}
                  onChange={(event) =>
                    update(index, { template_id: event.target.value })
                  }
                >
                  <option value="">Create/use exact printed name</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Instructions for this work
                <textarea
                  value={row.notes}
                  onChange={(event) =>
                    update(index, { notes: event.target.value })
                  }
                />
              </label>
            </>
          )}
          <details>
            <summary>Source evidence</summary>
            {row.sources?.map((source, i) => (
              <p key={i}>
                Image {source.image}, page {source.page ?? "?"}, line{" "}
                {source.line}: {source.raw_text}
              </p>
            ))}
          </details>
        </article>
      ))}
      {scan.instructions.length > 0 && (
        <details open>
          <summary>Original instructions and translations</summary>
          {scan.instructions.map((note) => (
            <div className={styles.row} key={note.id}>
              <p>{note.original}</p>
              <p>
                {note.ukrainian ||
                  "Translation unavailable — check the original."}
              </p>
              <small>{note.work_type || "General instructions"}</small>
            </div>
          ))}
        </details>
      )}
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={values.ocr_reviewed}
          onChange={(event) =>
            setFieldValue("ocr_reviewed", event.target.checked)
          }
        />{" "}
        I checked all scan findings, project fields, work amounts and
        instructions against the original documents.
      </label>
    </section>
  );
}
