// src/Pages/AddressDetailsPage.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  FaArrowLeft,
  FaPlus,
  FaEdit,
  FaCheck,
  FaTrash,
  FaFileAlt,
  FaSpinner,
  FaTimes,
  FaFilePdf,
  FaCheckCircle,
  FaWrench,
  FaInfoCircle,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight,
  FaShareAlt,
} from "react-icons/fa";
import styles from "./AddressDetailsPage.module.css";
import commonStyles from "../styles/common.module.css";
import toast from "react-hot-toast";
import FileUpload from "../components/FileUpload/FileUpload";
import { useAdminLists } from "../hooks/useAdminLists";
import WorkTypesManager from "../components/WorkTypesManager/WorkTypesManager";
import MaterialsManager from "../components/MaterialsManager/MaterialsManager";

const isImage = (url) => {
  if (!url) return false;
  const cleanUrl = url.split("?")[0];
  return cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) != null;
};

const getStatusStyle = (status) => {
  if (status === "Ready")
    return { bg: "rgba(40, 167, 69, 0.15)", color: "#28a745" };
  if (status === "Not Finished")
    return { bg: "rgba(220, 53, 69, 0.15)", color: "#dc3545" };
  return { bg: "rgba(255, 193, 7, 0.15)", color: "#d39e00" };
};

const FileListItem = ({
  bucketName,
  fileIdentifier,
  onDelete,
  onImageClick,
  allImages,
}) => {
  const [signedUrl, setSignedUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getUrl = async () => {
      setIsLoading(true);
      let path = fileIdentifier;
      try {
        if (fileIdentifier.startsWith("http")) {
          const url = new URL(fileIdentifier);
          const marker = `/${bucketName}/`;
          const index = url.pathname.indexOf(marker);
          if (index !== -1) {
            path = url.pathname.substring(index + marker.length);
          } else {
            path = url.pathname.split("/").pop();
          }
        }
      } catch (e) {
        path = fileIdentifier;
      }
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(path, 3600);

      if (error) setSignedUrl(fileIdentifier);
      else setSignedUrl(data.signedUrl);

      setIsLoading(false);
    };
    getUrl();
  }, [bucketName, fileIdentifier]);

  const handleLinkClick = (e) => {
    if (!signedUrl) {
      e.preventDefault();
      toast("Generating file link, please wait...");
      return;
    }
    if (isImage(signedUrl) || isImage(fileIdentifier)) {
      e.preventDefault();
      const currentIndex = allImages.findIndex((img) => img === fileIdentifier);
      onImageClick(allImages, currentIndex !== -1 ? currentIndex : 0);
    }
  };

  const fileName = fileIdentifier.split("/").pop().split("?")[0];

  return (
    <li className={styles.fileItem}>
      <a
        href={signedUrl || fileIdentifier}
        target="_blank"
        rel="noopener noreferrer"
        className={`${styles.fileLink} ${isLoading ? styles.disabledLink : ""}`}
        onClick={handleLinkClick}
      >
        {isLoading ? <FaSpinner className={styles.spinner} /> : <FaFileAlt />}
        {fileName}
      </a>
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={() => onDelete(fileIdentifier)}
          className={commonStyles.buttonIcon}
          disabled={isLoading}
        >
          <FaTrash />
        </button>
      </div>
    </li>
  );
};

const AddressDetailsPage = () => {
  const { addressId } = useParams();
  const navigate = useNavigate();

  const [addressData, setAddressData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  const [newSqFtNote, setNewSqFtNote] = useState("");
  const [editedData, setEditedData] = useState({
    address: "",
    sq_ft_notes: [],
    total_amount: "",
    date: "",
    status: "",
    builder_id: "",
    store_id: "",
    ai_translation: "",
    work_order_number: "",
  });

  const [reports, setReports] = useState([]);
  const [expandedReports, setExpandedReports] = useState({});

  const [lightboxImages, setLightboxImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const [zoomScale, setZoomScale] = useState(1);
  const [imgPosition, setImgPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { builders, stores, loading: listsLoading } = useAdminLists();

  const BUCKET_NAME = "material-photos";

  const fetchData = useCallback(async () => {
    if (!addressId) return;

    const [addrRes, reportsRes] = await Promise.all([
      supabase
        .from("addresses")
        .select("*, builders(name), stores(name)")
        .eq("id", addressId)
        .single(),
      supabase
        .from("daily_reports")
        .select(`*, work_types (id, status, work_type_templates (name))`)
        .eq("address_id", addressId)
        .order("created_at", { ascending: false }),
    ]);

    if (addrRes.error) {
      toast.error("Could not load address data.");
      navigate("/addresses");
      return;
    }

    setAddressData(addrRes.data);
    setEditedData({
      address: addrRes.data.address || "",
      sq_ft_notes: addrRes.data.sq_ft_notes || [],
      total_amount: addrRes.data.total_amount || "",
      date: addrRes.data.date || "",
      status: addrRes.data.status || "In Process",
      builder_id: addrRes.data.builder_id || "",
      store_id: addrRes.data.store_id || "",
      ai_translation: addrRes.data.ai_translation || "",
      work_order_number: addrRes.data.work_order_number || "",
    });

    if (reportsRes.error) {
      console.error("Помилка завантаження звітів:", reportsRes.error);
    } else if (reportsRes.data && reportsRes.data.length > 0) {
      const workerIds = [
        ...new Set(reportsRes.data.map((r) => r.worker_id).filter(Boolean)),
      ];

      if (workerIds.length > 0) {
        const { data: peopleData } = await supabase
          .from("people")
          .select("id, user_id, name")
          .in("user_id", workerIds);

        const reportsWithProfiles = reportsRes.data.map((report) => {
          const person = peopleData?.find(
            (p) =>
              p.user_id === report.worker_id && !p.name.includes("Працівник"),
          );
          const fallbackPerson = peopleData?.find(
            (p) => p.user_id === report.worker_id,
          );

          return {
            ...report,
            profiles: {
              first_name: person
                ? person.name
                : fallbackPerson
                  ? fallbackPerson.name
                  : "Невідомий працівник",
              last_name: "",
            },
          };
        });

        setReports(reportsWithProfiles);

        const initialExpandedState = {};
        reportsRes.data.forEach((r) => {
          initialExpandedState[r.id] = false;
        });
        setExpandedReports(initialExpandedState);
      } else {
        setReports(reportsRes.data);
      }
    } else {
      setReports([]);
    }
  }, [addressId, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openLightbox = (imagesArray, startIndex = 0) => {
    setLightboxImages(imagesArray);
    setCurrentImageIndex(startIndex);
    setZoomScale(1);
    setImgPosition({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setLightboxImages([]);
    setZoomScale(1);
    setImgPosition({ x: 0, y: 0 });
  };

  const showNextImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % lightboxImages.length);
    setZoomScale(1);
    setImgPosition({ x: 0, y: 0 });
  };

  const showPrevImage = (e) => {
    e.stopPropagation();
    setCurrentImageIndex(
      (prev) => (prev - 1 + lightboxImages.length) % lightboxImages.length,
    );
    setZoomScale(1);
    setImgPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = 1.1;
    let newScale =
      e.deltaY < 0 ? zoomScale * zoomFactor : zoomScale / zoomFactor;
    newScale = Math.max(1, Math.min(newScale, 5));
    setZoomScale(newScale);
    if (newScale === 1) {
      setImgPosition({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = (e) => {
    if (zoomScale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - imgPosition.x,
        y: e.clientY - imgPosition.y,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setImgPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const toggleReportExpansion = (reportId) => {
    setExpandedReports((prev) => ({
      ...prev,
      [reportId]: !prev[reportId],
    }));
  };

  const updateAddress = async (updates) => {
    const { data, error } = await supabase
      .from("addresses")
      .update(updates)
      .eq("id", addressId)
      .select("*, builders(name), stores(name)")
      .single();
    if (error) {
      toast.error(error.message || "Failed to save changes.");
      return null;
    }
    setAddressData(data);
    return data;
  };

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    setEditedData((prev) => ({ ...prev, status: newStatus }));
    const updated = await updateAddress({ status: newStatus });
    if (updated) {
      toast.success(`Project status updated to ${newStatus}`);
    } else {
      setEditedData((prev) => ({ ...prev, status: addressData?.status }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditedData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveChanges = async () => {
    const updates = {
      address: editedData.address.trim(),
      total_amount: editedData.total_amount
        ? parseFloat(editedData.total_amount)
        : null,
      date: editedData.date || null,
      status: editedData.status,
      builder_id: editedData.builder_id || null,
      store_id: editedData.store_id || null,
      ai_translation: editedData.ai_translation,
      work_order_number: editedData.work_order_number || null,
    };
    const updated = await updateAddress(updates);
    if (updated) {
      setIsEditing(false);
      toast.success("Project Details saved!");
    }
  };

  const handleAddSqFtNote = async () => {
    if (newSqFtNote.trim() === "") return;
    const updatedNotes = [...editedData.sq_ft_notes, newSqFtNote.trim()];
    const updated = await updateAddress({ sq_ft_notes: updatedNotes });
    if (updated) {
      setEditedData((prev) => ({ ...prev, sq_ft_notes: updatedNotes }));
      setNewSqFtNote("");
      toast.success("Note added!");
    }
  };

  const handleDeleteSqFtNote = async (index) => {
    if (!window.confirm("Are you sure?")) return;
    const updatedNotes = editedData.sq_ft_notes.filter((_, i) => i !== index);
    const updated = await updateAddress({ sq_ft_notes: updatedNotes });
    if (updated) {
      setEditedData((prev) => ({ ...prev, sq_ft_notes: updatedNotes }));
      toast.success("Note deleted!");
    }
  };

  const handleFileUploaded = async (filePath) => {
    const updatedFiles = [...(addressData.files || []), filePath];
    const updated = await updateAddress({ files: updatedFiles });
    if (updated) toast.success("File uploaded successfully!");
  };

  const handleFileDelete = async (fileIdentifier) => {
    if (!window.confirm("Are you sure you want to delete this file?")) return;
    let path = fileIdentifier;
    try {
      const url = new URL(fileIdentifier);
      path = url.pathname.substring(
        url.pathname.indexOf(BUCKET_NAME) + BUCKET_NAME.length + 1,
      );
    } catch (e) {}
    const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
    if (error) {
      toast.error("Failed to delete file.");
      return;
    }
    const updatedFiles = addressData.files.filter(
      (id) => id !== fileIdentifier,
    );
    const updated = await updateAddress({ files: updatedFiles });
    if (updated) toast.success("File deleted successfully!");
  };

  const handleApproveReport = async (e, report) => {
    e.stopPropagation();
    if (!report.work_type_id) {
      toast.error("Помилка: не знайдено ID завдання для цього звіту.");
      return;
    }
    try {
      const { error: updateError } = await supabase
        .from("work_types")
        .update({ status: "Ready" })
        .eq("id", report.work_type_id);
      if (updateError) throw updateError;
      toast.success("Роботу підтверджено!");
      fetchData();
    } catch (error) {
      toast.error("Помилка підтвердження: " + error.message);
    }
  };

  if (!addressData) return <p>Loading...</p>;

  const statusStyle = getStatusStyle(editedData.status);

  const originalPhotos = [
    addressData.original_photo_url,
    ...(addressData.files || []).filter(
      (f) => f && f.includes("original-photos"),
    ),
  ].filter(Boolean);
  const uniqueOriginals = [...new Set(originalPhotos)];
  const standardFiles = (addressData.files || []).filter(
    (f) => f && !f.includes("original-photos"),
  );

  return (
    <div className={styles.pageContainer}>
      <div className={styles.mobileLayout}>
        {/* === LIGHTBOX З КНОПКОЮ SHARE === */}
        {lightboxImages.length > 0 && (
          <div
            className={styles.lightbox}
            onClick={closeLightbox}
            onWheel={handleWheel}
          >
            <div
              style={{
                position: "absolute",
                top: "20px",
                right: "20px",
                display: "flex",
                gap: "16px",
                zIndex: 100000,
              }}
            >
              {/* КНОПКА SHARE */}
              <button
                style={{
                  background: "rgba(0,0,0,0.5)",
                  border: "none",
                  color: "white",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const url = lightboxImages[currentImageIndex];
                  if (navigator.share) {
                    navigator
                      .share({
                        title: "Worker Photo",
                        url: url,
                      })
                      .catch((err) => console.log("Share failed:", err));
                  } else {
                    toast.error("Share feature not supported on this browser.");
                  }
                }}
                title="Відправити фото у WhatsApp/Telegram"
              >
                <FaShareAlt />
              </button>
              {/* КНОПКА ЗАКРИТТЯ */}
              <button
                className={styles.closeLightbox}
                style={{ position: "static" }}
                onClick={closeLightbox}
              >
                <FaTimes />
              </button>
            </div>

            {lightboxImages.length > 1 && (
              <button className={styles.navBtnLeft} onClick={showPrevImage}>
                <FaChevronLeft />
              </button>
            )}

            <img
              src={lightboxImages[currentImageIndex]}
              alt="Fullscreen view"
              style={{
                transform: `scale(${zoomScale}) translate(${imgPosition.x / zoomScale}px, ${imgPosition.y / zoomScale}px)`,
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={(e) => e.stopPropagation()}
            />

            {lightboxImages.length > 1 && (
              <button className={styles.navBtnRight} onClick={showNextImage}>
                <FaChevronRight />
              </button>
            )}

            {lightboxImages.length > 1 && (
              <div className={styles.counter}>
                {currentImageIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        )}

        <div className={styles.header}>
          <button
            className={commonStyles.buttonSecondary}
            onClick={() => navigate(-1)}
            style={{ border: "none" }}
          >
            <FaArrowLeft /> Back
          </button>
          {isEditing ? (
            <input
              type="text"
              name="address"
              value={editedData.address}
              onChange={handleInputChange}
              className={styles.titleInput}
            />
          ) : (
            <h1 className={styles.pageTitle}>{addressData.address}</h1>
          )}
          <button
            className={commonStyles.buttonPrimary}
            onClick={() =>
              isEditing ? handleSaveChanges() : setIsEditing(true)
            }
          >
            {isEditing ? <FaCheck /> : <FaEdit />} {isEditing ? "Save" : "Edit"}
          </button>
        </div>

        <div className={styles.detailsGrid}>
          <div className={styles.gridColumn}>
            <div className={styles.detailCard}>
              <h3>General Project Details</h3>
              <div className={styles.cardContentWrapper}>
                <div className={styles.detailItem}>
                  <label>Status</label>
                  <div className={styles.statusCell}>
                    <select
                      name="status"
                      value={editedData.status}
                      onChange={handleStatusChange}
                      className={styles.editInput}
                      style={{
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                        fontWeight: "bold",
                        cursor: "pointer",
                        border: "none",
                        outline: "none",
                        padding: "8px 14px",
                      }}
                    >
                      <option value="In Process">In Process</option>
                      <option value="Ready">Ready</option>
                      <option value="Not Finished">Not Finished</option>
                    </select>
                  </div>
                </div>

                <div className={styles.detailItem}>
                  <label>Work Order #</label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="work_order_number"
                      value={editedData.work_order_number}
                      onChange={handleInputChange}
                      className={styles.editInput}
                      placeholder="e.g. WO-12345"
                    />
                  ) : (
                    <p>{addressData.work_order_number || "N/A"}</p>
                  )}
                </div>

                <div className={styles.detailItem}>
                  <label>Client (Builder)</label>
                  {isEditing ? (
                    <select
                      name="builder_id"
                      value={editedData.builder_id}
                      onChange={handleInputChange}
                      className={styles.editInput}
                      disabled={listsLoading}
                    >
                      <option value="">Select a builder</option>
                      {builders?.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p>{addressData.builders?.name || "N/A"}</p>
                  )}
                </div>
                <div className={styles.detailItem}>
                  <label>Store</label>
                  {isEditing ? (
                    <select
                      name="store_id"
                      value={editedData.store_id}
                      onChange={handleInputChange}
                      className={styles.editInput}
                      disabled={listsLoading}
                    >
                      <option value="">Select a store</option>
                      {stores?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p>{addressData.stores?.name || "N/A"}</p>
                  )}
                </div>
                <div className={styles.detailItem}>
                  <label>Project Date</label>
                  {isEditing ? (
                    <input
                      type="date"
                      name="date"
                      value={editedData.date}
                      onChange={handleInputChange}
                      className={styles.editInput}
                    />
                  ) : (
                    <p>{addressData.date || "N/A"}</p>
                  )}
                </div>
                <div
                  className={styles.detailItem}
                  style={{
                    gridColumn: "1 / -1",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: "8px",
                  }}
                >
                  <label style={{ fontSize: "1.1rem" }}>Total Amount</label>
                  {isEditing ? (
                    <input
                      type="number"
                      name="total_amount"
                      value={editedData.total_amount}
                      onChange={handleInputChange}
                      className={styles.editInput}
                      style={{
                        textAlign: "right",
                        fontSize: "1.2rem",
                        padding: "12px",
                        width: "100%",
                      }}
                    />
                  ) : (
                    <p
                      style={{
                        textAlign: "right",
                        fontSize: "1.5rem",
                        fontWeight: "bold",
                        width: "100%",
                      }}
                    >
                      {addressData.total_amount
                        ? `$${addressData.total_amount.toFixed(2)}`
                        : "N/A"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {(uniqueOriginals.length > 0 ||
              addressData.ai_translation ||
              isEditing) && (
              <div className={styles.detailCard}>
                <h3>Scanned Document & AI Notes</h3>
                <div className={styles.cardContentWrapper}>
                  {uniqueOriginals.length > 0 && (
                    <div
                      className={styles.detailItem}
                      style={{ gridTemplateColumns: "1fr", gap: "8px" }}
                    >
                      <label>
                        Original Documents ({uniqueOriginals.length})
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginTop: "4px",
                        }}
                      >
                        {uniqueOriginals.map((url, idx) => (
                          <div key={idx} style={{ position: "relative" }}>
                            {isImage(url) ? (
                              <img
                                src={url}
                                alt={`Scanned Document ${idx + 1}`}
                                className={styles.originalPhoto}
                                onClick={() =>
                                  openLightbox(
                                    uniqueOriginals.filter(isImage),
                                    uniqueOriginals
                                      .filter(isImage)
                                      .indexOf(url),
                                  )
                                }
                              />
                            ) : (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.pdfLinkBox}
                              >
                                <FaFilePdf size={30} color="#dc3545" />
                                <span>View PDF {idx + 1}</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    className={styles.detailItem}
                    style={{ gridTemplateColumns: "1fr", gap: "8px" }}
                  >
                    <label>AI Instructions / Translation</label>
                    {isEditing ? (
                      <textarea
                        name="ai_translation"
                        value={editedData.ai_translation}
                        onChange={handleInputChange}
                        className={styles.editInput}
                        style={{ minHeight: "120px", resize: "vertical" }}
                        placeholder="AI translation will appear here..."
                      />
                    ) : (
                      <div className={styles.aiNotesBox}>
                        {addressData.ai_translation ? (
                          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                            {addressData.ai_translation}
                          </p>
                        ) : (
                          <span className={styles.noItemsMessage}>
                            No AI instructions available.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.gridColumn}>
            <div className={styles.detailCard}>
              <h3>Worker Daily Reports</h3>
              <div className={styles.cardContentWrapper}>
                {reports.length > 0 ? (
                  <div className={styles.reportsList}>
                    {reports.map((report) => {
                      const isExpanded = !!expandedReports[report.id];
                      return (
                        <div
                          key={report.id}
                          className={styles.reportCard}
                          style={{
                            cursor: "pointer",
                            transition: "all 0.2s",
                            backgroundColor: isExpanded
                              ? "var(--color-surface)"
                              : "var(--color-background)",
                          }}
                          onClick={() => toggleReportExpansion(report.id)}
                        >
                          <div
                            className={styles.reportHeader}
                            style={{
                              borderBottom: isExpanded
                                ? "1px solid var(--color-border)"
                                : "none",
                              paddingBottom: isExpanded ? "12px" : "0",
                              marginBottom: isExpanded ? "12px" : "0",
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                }}
                              >
                                <strong>
                                  {report.profiles?.first_name}{" "}
                                  {report.profiles?.last_name || ""}
                                </strong>
                                <span
                                  style={{
                                    color: "var(--color-text-secondary)",
                                    fontSize: "0.8rem",
                                    paddingTop: "2px",
                                  }}
                                >
                                  {isExpanded ? (
                                    <FaChevronUp />
                                  ) : (
                                    <FaChevronDown />
                                  )}
                                </span>
                              </div>

                              <div style={{ marginTop: "4px" }}>
                                {(() => {
                                  let taskName = null;
                                  if (
                                    report.work_types?.work_type_templates?.name
                                  ) {
                                    taskName =
                                      report.work_types.work_type_templates
                                        .name;
                                  } else if (
                                    report.notes &&
                                    report.notes.includes("[Завдання: ")
                                  ) {
                                    const match = report.notes.match(
                                      /\[Завдання:\s*(.*?)\]/,
                                    );
                                    if (match && match[1]) taskName = match[1];
                                  }

                                  if (taskName) {
                                    return (
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          backgroundColor:
                                            "rgba(13, 110, 253, 0.1)",
                                          color: "var(--color-primary)",
                                          padding: "4px 8px",
                                          borderRadius: "6px",
                                          fontSize: "0.8rem",
                                          fontWeight: "600",
                                          marginTop: "6px",
                                        }}
                                      >
                                        <FaWrench size={10} /> Виконано:{" "}
                                        {taskName}
                                      </span>
                                    );
                                  }

                                  return (
                                    <span
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        backgroundColor:
                                          "rgba(108, 117, 125, 0.1)",
                                        color: "#6c757d",
                                        padding: "4px 8px",
                                        borderRadius: "6px",
                                        fontSize: "0.8rem",
                                        fontWeight: "600",
                                        marginTop: "6px",
                                      }}
                                    >
                                      <FaInfoCircle size={10} /> General Project
                                      Report
                                    </span>
                                  );
                                })()}
                              </div>

                              <div
                                style={{
                                  fontSize: "0.85rem",
                                  color: "var(--color-text-secondary)",
                                  marginTop: "8px",
                                }}
                              >
                                {new Date(report.report_date).toLocaleString()}
                              </div>
                            </div>

                            <div onClick={(e) => e.stopPropagation()}>
                              {report.work_types?.status === "Ready" ? (
                                <span
                                  style={{
                                    color: "#10b981",
                                    fontSize: "0.95rem",
                                    fontWeight: "bold",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <FaCheckCircle /> Approved
                                </span>
                              ) : (
                                <button
                                  className={commonStyles.buttonSuccess}
                                  style={{
                                    padding: "6px 12px",
                                    fontSize: "0.85rem",
                                  }}
                                  onClick={(e) =>
                                    handleApproveReport(e, report)
                                  }
                                  title="Approve this specific work"
                                >
                                  <FaCheckCircle /> Approve
                                </button>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{ marginTop: "12px" }}
                            >
                              {report.notes && (
                                <div className={styles.reportNotes}>
                                  <p
                                    style={{
                                      margin: 0,
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {report.notes
                                      .replace(/\[Завдання:\s*.*?\]\n?/g, "")
                                      .replace(
                                        /\[Статус від працівника:\s*.*?\]\n?/g,
                                        "",
                                      )}
                                  </p>
                                </div>
                              )}

                              {report.photos_before?.length > 0 && (
                                <div className={styles.photoSection}>
                                  <span className={styles.photoSectionTitle}>
                                    Photos Before:
                                  </span>
                                  <div className={styles.photoGrid}>
                                    {report.photos_before.map((url, i) => (
                                      <img
                                        key={`before-${i}`}
                                        src={url}
                                        alt="Before"
                                        className={styles.thumbnail}
                                        onClick={() =>
                                          openLightbox(report.photos_before, i)
                                        }
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {report.photos_after?.length > 0 && (
                                <div className={styles.photoSection}>
                                  <span className={styles.photoSectionTitle}>
                                    Photos After:
                                  </span>
                                  <div className={styles.photoGrid}>
                                    {report.photos_after.map((url, i) => (
                                      <img
                                        key={`after-${i}`}
                                        src={url}
                                        alt="After"
                                        className={styles.thumbnail}
                                        onClick={() =>
                                          openLightbox(report.photos_after, i)
                                        }
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.noItemsMessage}>
                    No reports submitted by workers yet.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.detailCard}>
              <h3>Square Feet Notes</h3>
              <div className={styles.cardContentWrapper}>
                <div className={styles.addNoteForm}>
                  <input
                    type="text"
                    value={newSqFtNote}
                    onChange={(e) => setNewSqFtNote(e.target.value)}
                    placeholder="Add a sq ft note..."
                    className={styles.noteInput}
                  />
                  <button
                    onClick={handleAddSqFtNote}
                    className={styles.addButton}
                  >
                    <FaPlus />
                  </button>
                </div>
                {editedData.sq_ft_notes.length > 0 ? (
                  <ul className={styles.notesList}>
                    {editedData.sq_ft_notes.map((note, index) => (
                      <li key={index} className={styles.noteItem}>
                        <span>{note}</span>
                        <button
                          onClick={() => handleDeleteSqFtNote(index)}
                          className={commonStyles.buttonIcon}
                        >
                          <FaTrash />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.noItemsMessage}>No notes yet.</p>
                )}
              </div>
            </div>

            <div className={styles.detailCard}>
              <h3>Files & Photos</h3>
              <div className={styles.cardContentWrapper}>
                <FileUpload
                  bucketName={BUCKET_NAME}
                  onUploadSuccess={handleFileUploaded}
                />
                {standardFiles.length > 0 ? (
                  <ul className={styles.fileList}>
                    {standardFiles.map((id) => (
                      <FileListItem
                        key={id}
                        bucketName={BUCKET_NAME}
                        fileIdentifier={id}
                        onDelete={handleFileDelete}
                        onImageClick={openLightbox}
                        allImages={standardFiles.filter(isImage)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className={styles.noItemsMessage}>
                    No files uploaded yet.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.detailCard}>
              <h3>Materials</h3>
              <div className={styles.cardContentWrapper}>
                <MaterialsManager addressId={addressId} />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.fullWidthSection}>
          <div className={styles.detailCard}>
            <h3>Work Types & Payments</h3>
            <div className={styles.cardContentWrapper}>
              <WorkTypesManager
                addressId={addressId}
                addressData={addressData}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddressDetailsPage;
