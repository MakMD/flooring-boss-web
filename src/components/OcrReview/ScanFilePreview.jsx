import { useEffect, useState } from "react";

export default function ScanFilePreview({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name))
    return (
      <span title={file.name}>
        PDF
        <br />
        {file.name}
      </span>
    );
  return (
    <img
      src={url || undefined}
      alt={file.name}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}
