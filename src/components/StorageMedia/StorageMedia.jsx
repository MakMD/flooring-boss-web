import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { isImageFile, resolveStorageFile } from "../../utils/storageFiles";

export default function StorageMedia({
  identifier,
  bucketName,
  alt,
  ...props
}) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    resolveStorageFile(
      supabase,
      identifier,
      bucketName,
      import.meta.env.VITE_SUPABASE_URL,
    )
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [identifier, bucketName, attempt]);

  if (failed)
    return (
      <span role="status">
        File unavailable.{" "}
        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
          Retry
        </button>
      </span>
    );
  if (!url) return <span role="status">Loading file…</span>;
  if (!isImageFile(identifier))
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {alt || "Open document"}
      </a>
    );
  return <img {...props} src={url} alt={alt} onError={() => setFailed(true)} />;
}
