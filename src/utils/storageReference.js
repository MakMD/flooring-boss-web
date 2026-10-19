const buckets = new Set(["original-photos", "material-photos", "worker-photos", "worker-documents"]);

// Decode URL paths once; raw object keys must retain literal percent characters.
export function storageReference(value, fallbackBucket, origin) {
  if (typeof value !== "string" || !value) throw new Error("Missing file reference");
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.origin !== origin) return { externalUrl: url.href };
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!match) throw new Error("Unrecognized storage URL");
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) throw new Error("Unsupported file URL");
  const slash = value.indexOf("/");
  if (slash > 0 && buckets.has(value.slice(0, slash))) {
    return { bucket: value.slice(0, slash), path: value.slice(slash + 1) };
  }
  if (!fallbackBucket) throw new Error("Missing storage bucket");
  return { bucket: fallbackBucket, path: value };
}
