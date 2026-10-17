export const SCAN_LIMITS = {
  pages: 10,
  imageBytes: 8 * 1024 ** 2,
  totalBytes: 24 * 1024 ** 2,
  sourceBytes: 24 * 1024 ** 2,
};

export function validateScanFiles(files) {
  if (!files.length || files.length > SCAN_LIMITS.pages)
    throw new Error("Select 1–10 files from a single work order.");
  let total = 0;
  for (const file of files) {
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!pdf && !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new Error(`${file.name}: use JPEG, PNG, WebP or PDF.`);
    if (
      !file.size ||
      file.size > (pdf ? SCAN_LIMITS.sourceBytes : SCAN_LIMITS.imageBytes)
    )
      throw new Error(
        `${file.name}: file is empty or too large (images: 8 MiB; PDF: 24 MiB).`,
      );
    total += file.size;
  }
  if (total > SCAN_LIMITS.sourceBytes)
    throw new Error(
      "Selected files exceed 24 MiB. Split the work order into smaller inputs.",
    );
}

const dataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(blob);
  });

export async function prepareScanDocuments(files, signal) {
  validateScanFiles(files);
  const imagesBase64 = [];
  const sourceMap = [];
  let total = 0;
  const append = async (blob, source) => {
    signal?.throwIfAborted();
    total += blob.size;
    if (blob.size > SCAN_LIMITS.imageBytes || total > SCAN_LIMITS.totalBytes)
      throw new Error(
        "Rendered pages exceed the scan size limit. Send fewer pages.",
      );
    if (imagesBase64.length >= SCAN_LIMITS.pages)
      throw new Error(
        "A scan supports up to 10 pages. No pages were silently omitted.",
      );
    imagesBase64.push(await dataUrl(blob));
    sourceMap.push({ image: imagesBase64.length, ...source });
  };
  for (const [fileIndex, file] of files.entries()) {
    signal?.throwIfAborted();
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      await append(file, { file_index: fileIndex, page: 1 });
      continue;
    }
    const pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } =
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = pdfjs.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
      stopAtErrors: true,
    });
    const abort = () => {
      void task.destroy();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const pdf = await task.promise;
      if (imagesBase64.length + pdf.numPages > SCAN_LIMITS.pages)
        throw new Error("The selected documents contain more than 10 pages.");
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        signal?.throwIfAborted();
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(3, 2800 / Math.max(base.width, base.height)),
        });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        try {
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
            background: "white",
          }).promise;
          const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.95),
          );
          if (!blob) throw new Error("Could not render PDF page.");
          await append(blob, { file_index: fileIndex, page: pageNumber });
        } finally {
          canvas.width = canvas.height = 0;
          page.cleanup();
        }
      }
    } catch (error) {
      if (error.name === "PasswordException")
        throw new Error(`${file.name}: unlock this PDF before scanning.`);
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      await task.destroy();
    }
  }
  return { imagesBase64, sourceMap };
}
