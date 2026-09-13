import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import toast from "react-hot-toast";
import {
  FaTimes,
  FaFilePdf,
  FaFileAlt,
  FaPhone,
  FaCheck,
} from "react-icons/fa";
import styles from "./WorkerProfileModal.module.css";

const isImage = (url) => {
  return url && url.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) != null;
};

const isPdf = (url) => {
  return url && url.match(/\.(pdf)$/i) != null;
};

const WorkerProfileModal = ({ personId, personName, onClose }) => {
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState({
    has_gst: false,
    has_wcb: false,
    has_holdback: false,
  });

  const [phone, setPhone] = useState("");
  const [originalPhone, setOriginalPhone] = useState("");
  const [isSavingPhone, setIsSavingPhone] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: personData, error: personError } = await supabase
      .from("people")
      .select("user_id, has_gst, has_wcb, has_holdback, phone")
      .eq("id", personId)
      .single();

    if (personError) {
      toast.error("Помилка завантаження профілю.");
      setLoading(false);
      return;
    }

    setSettings({
      has_gst: personData.has_gst || false,
      has_wcb: personData.has_wcb || false,
      has_holdback: personData.has_holdback || false,
    });

    const phoneVal = personData.phone || "";
    setPhone(phoneVal);
    setOriginalPhone(phoneVal);

    if (personData.user_id) {
      const { data: docs } = await supabase
        .from("worker_documents")
        .select("*")
        .eq("worker_id", personData.user_id);
      setDocuments(docs || []);
    }
    setLoading(false);
  }, [personId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleSetting = async (field) => {
    const newValue = !settings[field];
    setSettings((prev) => ({ ...prev, [field]: newValue }));

    const { error } = await supabase
      .from("people")
      .update({ [field]: newValue })
      .eq("id", personId);

    if (error) {
      toast.error("Помилка збереження налаштувань.");
      setSettings((prev) => ({ ...prev, [field]: !newValue }));
    } else {
      toast.success("Налаштування оновлено!");
    }
  };

  const handleSavePhone = async () => {
    setIsSavingPhone(true);
    const { error } = await supabase
      .from("people")
      .update({ phone: phone || null })
      .eq("id", personId);

    if (error) {
      toast.error("Помилка збереження телефону.");
      setPhone(originalPhone);
    } else {
      toast.success("Номер телефону збережено!");
      setOriginalPhone(phone);
    }
    setIsSavingPhone(false);
  };

  const handleDocumentClick = useCallback((e, url) => {
    if (isImage(url)) {
      e.preventDefault();
      setSelectedImage(url);
    }
  }, []);

  const phoneChanged = phone !== originalPhone;

  return (
    <>
      <div className={styles.modalOverlay} onClick={onClose}>
        <div
          className={styles.modalContent}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.modalHeader}>
            <h2>{personName} - Profile & Settings</h2>
            <button className={styles.closeButton} onClick={onClose}>
              <FaTimes />
            </button>
          </div>

          <div className={styles.modalBody}>
            {loading ? (
              <p>Завантаження...</p>
            ) : (
              <>
                <div>
                  <h3 className={styles.sectionTitle}>Contact Information</h3>
                  <div className={styles.phoneContainer}>
                    <div className={styles.phoneInputWrapper}>
                      <FaPhone className={styles.phoneIcon} />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+14035551234"
                        className={styles.phoneInput}
                      />
                    </div>
                    {phoneChanged && (
                      <button
                        className={styles.savePhoneBtn}
                        onClick={handleSavePhone}
                        disabled={isSavingPhone}
                      >
                        {isSavingPhone ? (
                          "Saving..."
                        ) : (
                          <>
                            <FaCheck /> Save
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <p className={styles.hintText}>
                    Include country code for SMS alerts (e.g. +1 for Canada)
                  </p>
                </div>

                <div>
                  <h3 className={styles.sectionTitle}>
                    Financial Deductions & Additions
                  </h3>
                  <div className={styles.settingsGrid}>
                    <label className={styles.settingCard}>
                      <input
                        type="checkbox"
                        checked={settings.has_gst}
                        onChange={() => toggleSetting("has_gst")}
                      />
                      <span className={styles.settingLabel}>Has GST (+5%)</span>
                    </label>

                    <label className={styles.settingCard}>
                      <input
                        type="checkbox"
                        checked={settings.has_wcb}
                        onChange={() => toggleSetting("has_wcb")}
                      />
                      <span className={styles.settingLabel}>
                        Pays WCB (-3%)
                      </span>
                    </label>

                    <label className={styles.settingCard}>
                      <input
                        type="checkbox"
                        checked={settings.has_holdback}
                        onChange={() => toggleSetting("has_holdback")}
                      />
                      <span className={styles.settingLabel}>
                        Back Hold (-5%)
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className={styles.sectionTitle}>Uploaded Documents</h3>
                  {documents.length > 0 ? (
                    <div className={styles.documentsGrid}>
                      {documents.map((doc, idx) => (
                        <a
                          key={doc.id}
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.docCard}
                          onClick={(e) => handleDocumentClick(e, doc.file_url)}
                        >
                          <div className={styles.docPreview}>
                            {isImage(doc.file_url) ? (
                              <img src={doc.file_url} alt="Document preview" />
                            ) : isPdf(doc.file_url) ? (
                              <FaFilePdf
                                className={styles.docIcon}
                                style={{ color: "#d32f2f" }}
                              />
                            ) : (
                              <FaFileAlt className={styles.docIcon} />
                            )}
                          </div>
                          <div className={styles.docInfo}>
                            Document #{idx + 1}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.emptyText}>
                      Цей працівник ще не завантажив жодного документа.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {selectedImage && (
        <div
          className={styles.lightboxOverlay}
          onClick={() => setSelectedImage(null)}
        >
          <button
            className={styles.lightboxClose}
            onClick={() => setSelectedImage(null)}
          >
            <FaTimes />
          </button>
          <img
            src={selectedImage}
            alt="Expanded document view"
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

export default WorkerProfileModal;
