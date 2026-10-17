import styles from "./OcrReview.module.css";

export default function ImportedScanDetails({ scan }) {
  if (!scan) return null;
  return (
    <section className={styles.review} aria-label="Imported document record">
      <h3>Imported document record</h3>
      <p>
        Installation end: {scan.date_end || "Not specified"}. Imported document
        values are retained below; current work payments may have been edited
        separately.
      </p>
      <details>
        <summary>Document rows, quantities and units</summary>
        {(scan.reviewed_rows || []).map((row) => (
          <div key={row.id} className={styles.row}>
            <strong>{row.name}</strong>
            <p>
              {row.category} · {row.quantity ?? "?"} {row.unit} · Rate:{" "}
              {row.rate ?? "?"} · Amount: {row.amount ?? "?"}
            </p>
            <p>
              {row.description} {row.area}
            </p>
            {row.notes && <p style={{ whiteSpace: "pre-wrap" }}>{row.notes}</p>}
          </div>
        ))}
      </details>
      <details>
        <summary>Original instructions and scan findings</summary>
        {(scan.original?.instructions || []).map((note) => (
          <div key={note.id} className={styles.row}>
            <p>{note.original}</p>
            <p>{note.ukrainian}</p>
          </div>
        ))}
        <ul>
          {(scan.original?.issues || []).map((issue, index) => (
            <li key={index}>{issue.message}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
