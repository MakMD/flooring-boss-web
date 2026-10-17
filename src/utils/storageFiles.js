// Resolve legacy public/signed URLs and paths without losing folders or bucket names.
export function storageReference(identifier, fallbackBucket, storageOrigin) {
  if (typeof identifier !== "string" || !identifier.trim()) return null;
  if (/^https?:\/\//i.test(identifier)) {
    const url = new URL(identifier);
    if (storageOrigin && url.origin !== new URL(storageOrigin).origin)
      return null;
    const match = url.pathname.match(
      /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
    );
    return match
      ? {
          bucket: decodeURIComponent(match[1]),
          path: decodeURIComponent(match[2]),
        }
      : null;
  }
  return { bucket: fallbackBucket, path: identifier.replace(/^\/+/, "") };
}

export function isImageFile(identifier) {
  return (
    typeof identifier === "string" &&
    /\.(jpe?g|gif|png|webp|bmp|avif|svg)(?:[?#]|$)/i.test(identifier)
  );
}

export async function resolveStorageFile(
  client,
  identifier,
  fallbackBucket,
  storageOrigin,
) {
  const reference = storageReference(identifier, fallbackBucket, storageOrigin);
  if (!reference) {
    if (/^https?:\/\//i.test(identifier)) return identifier;
    throw new Error("Invalid file reference");
  }
  const { data, error } = await client.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, 3600);
  if (error || !data?.signedUrl) {
    // Public buckets may allow downloads without granting signed-URL access.
    if (
      /^https?:\/\//i.test(identifier) &&
      new URL(identifier).pathname.startsWith("/storage/v1/object/public/")
    )
      return identifier;
    throw error || new Error("File unavailable");
  }
  return data.signedUrl;
}
