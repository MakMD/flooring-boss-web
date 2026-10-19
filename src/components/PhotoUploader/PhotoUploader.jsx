import { StorageImage, StorageLink } from "../StorageMedia";
import { useState } from "react";
import { supabase } from "../../supabaseClient";
import { FaCamera, FaSpinner } from "react-icons/fa";
import imageCompression from "browser-image-compression";
import styles from "./PhotoUploader.module.css";

const PhotoUploader = ({
  label,
  onUploadComplete,
  bucketName = "worker-documents",
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState([]);

  const uploadFiles = async (event) => {
    try {
      setUploading(true);
      const files = Array.from(event.target.files);

      // --- ОПТИМІЗАЦІЯ: ПАРАЛЕЛЬНЕ СТИСНЕННЯ ТА ЗАВАНТАЖЕННЯ ---
      const uploadPromises = files.map(async (file) => {
        const options = {
          maxSizeMB: 2.5,
          maxWidthOrHeight: 2560,
          useWebWorker: true,
          initialQuality: 0.85,
        };

        let fileToUpload = file;
        try {
          fileToUpload = await imageCompression(file, options);
        } catch (compressionError) {
          console.error(
            "Помилка стиснення, використовується оригінал:",
            compressionError,
          );
        }

        const fileExt = fileToUpload.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(fileName, fileToUpload);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);

        return data.publicUrl;
      });

      // Чекаємо, поки ВСІ файли завантажаться одночасно
      const urls = await Promise.all(uploadPromises);

      const newUrls = [...uploadedUrls, ...urls];
      setUploadedUrls(newUrls);
      onUploadComplete(newUrls);
    } catch (error) {
      console.error("Помилка завантаження файлу:", error.message);
      alert("Не вдалося завантажити файл: " + error.message);
    } finally {
      setUploading(false);
      // Очищаємо інпут, щоб подія onChange спрацювала знову для тих самих файлів
      if (event.target) event.target.value = null;
    }
  };

  const removePhoto = (indexToRemove) => {
    const newUrls = uploadedUrls.filter((_, index) => index !== indexToRemove);
    setUploadedUrls(newUrls);
    onUploadComplete(newUrls);
  };

  return (
    <div className={styles.container}>
      <label className={styles.label}>{label}</label>

      <input
        type="file"
        multiple
        accept="image/*, application/pdf"
        onChange={uploadFiles}
        disabled={uploading}
        className={styles.hiddenInput}
        id={`upload-${label}`}
      />

      <label htmlFor={`upload-${label}`} className={styles.uploadButton}>
        {uploading ? (
          <FaSpinner className="spin" size={20} />
        ) : (
          <FaCamera size={20} />
        )}
        {uploading ? "Завантаження..." : "Зробити фото / Обрати"}
      </label>

      {uploadedUrls.length > 0 && (
        <div className={styles.previewContainer}>
          {uploadedUrls.map((url, index) => (
            <div key={index} className={styles.previewWrapper}>
              {/\.pdf(?:\?|$)/i.test(url)
                ? <StorageLink bucket={bucketName} href={url} target="_blank" rel="noopener noreferrer">View PDF</StorageLink>
                : <StorageImage bucket={bucketName} src={url} alt="preview" className={styles.previewImage} />}
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className={styles.deleteButton}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PhotoUploader;
