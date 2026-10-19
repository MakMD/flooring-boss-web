import { supabase } from "../supabaseClient";
import { storageReference } from "./storageReference";

export async function resolveStorageUrl(value, bucket) {
  const reference = storageReference(value, bucket, new URL(supabase.supabaseUrl).origin);
  if (reference.externalUrl) return reference.externalUrl;
  const { data, error } = await supabase.storage.from(reference.bucket).createSignedUrl(reference.path, 3600);
  if (error || !data?.signedUrl) throw new Error("File unavailable: missing file or insufficient access.");
  return data.signedUrl;
}
