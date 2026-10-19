import { useEffect, useState } from "react";
import { resolveStorageUrl } from "../utils/storageUrl";

function useStorageUrl(source, bucket) {
  const [state, setState] = useState({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({});
    const refresh = () => resolveStorageUrl(source, bucket).then(
      (url) => { if (active) setState({ url }); },
      () => { if (active) setState({ error: true }); },
    );
    refresh();
    const timer = setInterval(refresh, 50 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [source, bucket, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1), fail: () => setState({ error: true }) };
}

export function StorageImage({ src, bucket, alt, ...props }) {
  const { url, error, retry, fail } = useStorageUrl(src, bucket);
  if (error) return <button type="button" onClick={retry}>File unavailable — retry</button>;
  if (!url) return <span role="status">Loading image…</span>;
  return <img {...props} src={url} alt={alt} onError={fail} />;
}

export function StorageLink({ href, bucket, children, ...props }) {
  const { url, error, retry } = useStorageUrl(href, bucket);
  if (error) return <button type="button" onClick={retry}>File unavailable — retry</button>;
  if (!url) return <span role="status">Loading file…</span>;
  return <a {...props} href={url}>{children}</a>;
}
