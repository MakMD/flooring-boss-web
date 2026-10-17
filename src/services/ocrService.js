import { supabase } from "../supabaseClient";
import { prepareScanDocuments } from "../utils/scanDocuments";
import { validateOcrResult } from "../utils/ocrImport";

export async function scanDocuments(files, signal) {
  const { imagesBase64, sourceMap } = await prepareScanDocuments(files, signal);
  signal?.throwIfAborted();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Your session expired. Sign in again.");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-work-order`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ imagesBase64 }),
      signal,
    },
  );
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.error)
    throw new Error(result?.error || `Scan failed (${response.status}).`);
  validateOcrResult(result);
  return { ...result, source_map: sourceMap };
}

export async function uploadScanOriginals(files, userId, signal) {
  const uploaded = [];
  try {
    for (const file of files) {
      signal?.throwIfAborted();
      const extension =
        file.type === "application/pdf"
          ? "pdf"
          : file.name.split(".").pop().toLowerCase();
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage
        .from("original-photos")
        .upload(path, file);
      if (error) throw new Error(`Could not save original: ${error.message}`);
      uploaded.push(path);
    }
    signal?.throwIfAborted();
    return uploaded.map(
      (path) =>
        supabase.storage.from("original-photos").getPublicUrl(path).data
          .publicUrl,
    );
  } catch (error) {
    if (uploaded.length)
      await supabase.storage.from("original-photos").remove(uploaded);
    throw error;
  }
}
