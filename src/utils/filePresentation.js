export function fileName(reference) {
  const path = /^https?:\/\//i.test(reference) ? new URL(reference).pathname : String(reference).split(/[?#]/)[0];
  const name = path.split('/').at(-1) || 'Файл';
  try { return decodeURIComponent(name); } catch { return name; }
}
export function isImageFile(reference) {
  if (!reference) return false;
  return /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(fileName(reference));
}
