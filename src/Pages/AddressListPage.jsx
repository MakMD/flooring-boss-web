import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAdminLists } from "../hooks/useAdminLists";
import SkeletonLoader from "../components/SkeletonLoader/SkeletonLoader";
import EmptyState from "../components/EmptyState/EmptyState";
import {
  FaArrowLeft,
  FaPlus,
  FaEdit,
  FaCheck,
  FaTrash,
  FaMapMarkerAlt,
  FaSearch,
  FaTimes,
  FaWrench,
  FaBuilding,
} from "react-icons/fa";
import { MdOutlineChevronRight } from "react-icons/md";
import styles from "./AddressListPage.module.css";
import commonStyles from "../styles/common.module.css";
import toast from "react-hot-toast";
import {
  format,
  addDays,
  subDays,
  parseISO,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";

import OcrReview from "../components/OcrReview/OcrReview";
import ScanFilePreview from "../components/OcrReview/ScanFilePreview";
import StorageMedia from "../components/StorageMedia/StorageMedia";
import { scanFormValues, validateReviewedImport } from "../utils/ocrImport";
import { validateScanFiles } from "../utils/scanDocuments";
import { scanDocuments, uploadScanOriginals } from "../services/ocrService";
import AssignedWorkers from "../components/AssignedWorkers/AssignedWorkers";
import { useAuth } from "../contexts/AuthContext";
import {
  readProjectListState,
  writeProjectListState,
} from "../utils/projectListState";

const PAGE_SIZE = 40;

const AddProjectSchema = Yup.object().shape({
  project_type: Yup.string().required("Project type is required"),
  work_order_number: Yup.string().nullable(),
  address: Yup.string()
    .trim()
    .min(3, "Address must be at least 3 characters")
    .required("Address is required"),
  date: Yup.date().required("Date is required"),
  time: Yup.string().when("project_type", {
    is: "Service",
    then: (schema) => schema.required("Time is required for services"),
    otherwise: (schema) => schema.notRequired(),
  }),
  total_amount: Yup.number().nullable(),
  store_id: Yup.number().nullable(),
  builder_id: Yup.number().nullable(),
});

const AddressListPage = () => {
  const { user } = useAuth();
  const storageKey = `projects-view:${user.id}`;
  const [savedView] = useState(() => readProjectListState(storageKey));
  const restoring = useRef(true);
  const requestId = useRef(0);
  const scrollY = useRef(savedView.scrollY || 0);
  const [addresses, setAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [page, setPage] = useState(savedView.page || 1);
  const [hasMore, setHasMore] = useState(true);

  const [projectTab, setProjectTab] = useState(
    savedView.projectTab || "Address",
  );

  const { builders, stores, products, workTypeTemplates } = useAdminLists();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState(
    savedView.searchTerm ?? location.state?.searchTerm ?? "",
  );
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);

  const [dateFilter, setDateFilter] = useState(
    savedView.dateFilter ?? location.state?.dateFilter ?? "all",
  );
  const [statusFilter, setStatusFilter] = useState(
    savedView.statusFilter ?? location.state?.statusFilter ?? "all",
  );
  const [builderFilter, setBuilderFilter] = useState(
    savedView.builderFilter || "all",
  );
  const [storeFilter, setStoreFilter] = useState(
    savedView.storeFilter || "all",
  );
  const [productFilter, setProductFilter] = useState(
    savedView.productFilter || "all",
  );

  const [isEditing, setIsEditing] = useState(false);
  const [editedAddresses, setEditedAddresses] = useState({});
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  const [isScanning, setIsScanning] = useState(false);
  const [scanSelectionChanged, setScanSelectionChanged] = useState(false);
  const scanController = useRef(null);
  const scanCache = useRef(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      scanController.current?.abort();
    };
  }, []);
  const [selectedFilesToScan, setSelectedFilesToScan] = useState([]);

  const [duplicateWarning, setDuplicateWarning] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchAddresses = useCallback(
    async (pageNumber = 1, reset = false) => {
      const currentRequest = ++requestId.current;
      setAddressesLoading(true);
      const from = reset ? 0 : (pageNumber - 1) * PAGE_SIZE;
      const to = pageNumber * PAGE_SIZE - 1;

      let query = supabase
        .from("addresses")
        .select(
          "*, builders(name), stores(name), work_orders(*), work_types(person_id)",
          {
            count: "exact",
          },
        )
        .eq("is_deleted", false)
        .eq("project_type", projectTab)
        .order("date", { ascending: false, nullsLast: true });

      if (debouncedSearch) {
        query = query.or(
          `address.ilike.%${debouncedSearch}%,work_order_number.ilike.%${debouncedSearch}%`,
        );
      }

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (builderFilter !== "all")
        query = query.eq("builder_id", builderFilter);
      if (storeFilter !== "all") query = query.eq("store_id", storeFilter);

      if (dateFilter === "today")
        query = query.eq("date", format(new Date(), "yyyy-MM-dd"));
      else if (dateFilter === "tomorrow")
        query = query.eq("date", format(addDays(new Date(), 1), "yyyy-MM-dd"));
      else if (dateFilter === "yesterday")
        query = query.eq("date", format(subDays(new Date(), 1), "yyyy-MM-dd"));

      const { data, error, count } = await query.range(from, to);

      if (currentRequest !== requestId.current) return;
      if (error) {
        toast.error(`Error: ${error.message}`);
      } else {
        let newItems = data || [];
        if (productFilter !== "all") {
          newItems = newItems.filter(
            (item) =>
              item.work_orders &&
              item.work_orders.some(
                (wo) => wo.product_id?.toString() === productFilter,
              ),
          );
        }

        if (reset) setAddresses(newItems);
        else {
          setAddresses((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const filteredNew = newItems.filter((i) => !existingIds.has(i.id));
            return [...prev, ...filteredNew];
          });
        }

        setHasMore(
          count !== null
            ? from + (data?.length || 0) < count
            : (data?.length || 0) === PAGE_SIZE,
        );
      }
      setAddressesLoading(false);
    },
    [
      debouncedSearch,
      statusFilter,
      builderFilter,
      storeFilter,
      dateFilter,
      productFilter,
      projectTab,
    ],
  );

  useEffect(() => {
    const initialPage = restoring.current ? savedView.page || 1 : 1;
    setPage(initialPage);
    fetchAddresses(initialPage, true);
    return () => {
      requestId.current += 1;
    };
  }, [fetchAddresses, savedView]);

  useLayoutEffect(() => {
    if (addressesLoading || !restoring.current) return;
    window.scrollTo(0, scrollY.current);
    restoring.current = false;
  }, [addressesLoading, addresses]);

  useLayoutEffect(() => {
    const save = () =>
      writeProjectListState(storageKey, {
        searchTerm,
        dateFilter,
        statusFilter,
        builderFilter,
        storeFilter,
        productFilter,
        projectTab,
        page,
        scrollY: scrollY.current,
      });
    const onScroll = () => {
      if (!restoring.current) scrollY.current = window.scrollY;
      save();
    };
    save();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      save();
    };
  }, [
    storageKey,
    searchTerm,
    dateFilter,
    statusFilter,
    builderFilter,
    storeFilter,
    productFilter,
    projectTab,
    page,
  ]);

  const refetch = () => {
    setPage(1);
    fetchAddresses(1, true);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchAddresses(nextPage, false);
  };

  const toggleAddForm = () => {
    if (isScanning) return;
    if (isAddFormOpen) {
      setSelectedFilesToScan([]);
      setScanSelectionChanged(false);
      setDuplicateWarning(null);
    }
    setIsAddFormOpen(!isAddFormOpen);
  };

  const groupedAddresses = useMemo(() => {
    const todayList = [];
    const tomorrowList = [];
    const upcomingMap = {};
    const pastMap = {};

    const todayStr = format(new Date(), "yyyy-MM-dd");
    const tomorrowStr = format(addDays(new Date(), 1), "yyyy-MM-dd");

    addresses.forEach((item) => {
      if (!item.date) return;

      const itemDateStr = item.date.split("T")[0];
      const dateOnly = parseISO(itemDateStr);
      const todayDate = parseISO(todayStr);

      if (itemDateStr === todayStr) {
        todayList.push(item);
      } else if (itemDateStr === tomorrowStr) {
        tomorrowList.push(item);
      } else if (dateOnly > parseISO(tomorrowStr)) {
        const startChunk = startOfWeek(dateOnly, { weekStartsOn: 1 });
        const endChunk = endOfWeek(dateOnly, { weekStartsOn: 1 });
        const key = startChunk.getTime().toString();

        if (!upcomingMap[key]) {
          upcomingMap[key] = { start: startChunk, end: endChunk, items: [] };
        }
        upcomingMap[key].items.push(item);
      } else if (dateOnly < todayDate) {
        const startChunk = startOfWeek(dateOnly, { weekStartsOn: 1 });
        const endChunk = endOfWeek(dateOnly, { weekStartsOn: 1 });
        const key = startChunk.getTime().toString();

        if (!pastMap[key]) {
          pastMap[key] = { start: startChunk, end: endChunk, items: [] };
        }
        pastMap[key].items.push(item);
      }
    });

    const formatDate = (d) => format(d, "MMM d");

    const sortAndFormat = (map, isPast) =>
      Object.values(map)
        .sort((a, b) => (isPast ? b.start - a.start : a.start - b.start))
        .map((chunk) => ({
          label: `${formatDate(chunk.start)} - ${formatDate(chunk.end)}`,
          items: chunk.items.sort((i1, i2) => {
            const d1 = parseISO(i1.date.split("T")[0]);
            const d2 = parseISO(i2.date.split("T")[0]);
            return isPast ? d2 - d1 : d1 - d2;
          }),
        }));

    return {
      today: todayList,
      tomorrow: tomorrowList,
      upcoming: sortAndFormat(upcomingMap, false),
      past: sortAndFormat(pastMap, true),
    };
  }, [addresses]);

  const saveProjectToDatabase = async (values, setSubmitting, resetForm) => {
    if (isScanning || (values.ocr_result && scanSelectionChanged)) {
      toast.error("Finish scanning the selected documents before saving.");
      setSubmitting(false);
      return;
    }
    try {
      validateReviewedImport(values);
    } catch (error) {
      toast.error(error.message);
      setSubmitting(false);
      return;
    }
    const combinedFiles = [
      ...(values.scanned_files_array || []),
      ...(values.additional_photo_url ? [values.additional_photo_url] : []),
    ];

    const safeProjectType =
      values.project_type === "Service" ? "Service" : "Address";

    const newAddressObject = {
      work_order_number: values.work_order_number?.trim() || null,
      address: values.address.trim(),
      date: values.date,
      total_amount:
        values.total_amount === "" || values.total_amount == null
          ? null
          : Number(values.total_amount),
      store_id: values.store_id ? parseInt(values.store_id) : null,
      builder_id: values.builder_id ? parseInt(values.builder_id) : null,
      status: "In Process",
      project_type: safeProjectType,
      service_time: safeProjectType === "Service" ? values.time : null,
      original_photo_url:
        values.scanned_files_array?.[0] || values.original_photo_url || null,
      ai_translation: values.ai_translation || null,
      files: combinedFiles,
    };

    if (values.ocr_result) {
      const scan = {
        original: values.ocr_result,
        reviewed_rows: values.pending_work_types,
        reviewed: true,
        date_end: values.date_end || null,
      };
      const { error } = await supabase.rpc("import_reviewed_work_order", {
        p_project: newAddressObject,
        p_scan: scan,
        p_import_key: values.ocr_import_key,
        p_allow_duplicate: Boolean(values.allow_duplicate),
      });
      if (error) {
        toast.error(
          error.code === "PGRST202"
            ? "Scan import is not installed yet. Apply the OCR database migration before saving."
            : error.message,
        );
        setSubmitting(false);
        return;
      }
      toast.success("Reviewed project and work items saved together.");
      resetForm();
      setIsAddFormOpen(false);
      setSelectedFilesToScan([]);
      setScanSelectionChanged(false);
      setDuplicateWarning(null);
      scanCache.current = null;
      refetch();
      setSubmitting(false);
      return;
    }

    const { error: addressError } = await supabase
      .from("addresses")
      .insert([newAddressObject])
      .select()
      .single();

    if (addressError) {
      toast.error(`Error adding address: ${addressError.message}`);
      setSubmitting(false);
      return;
    }

    toast.success("Project created successfully!");

    resetForm();
    setIsAddFormOpen(false);
    setSelectedFilesToScan([]);
    setDuplicateWarning(null);
    refetch();
    setSubmitting(false);
  };

  const handleAddAddress = async (values, { setSubmitting, resetForm }) => {
    if (values.work_order_number && values.work_order_number.trim() !== "") {
      const { data: existingWo } = await supabase
        .from("addresses")
        .select("id, address, date")
        .eq("work_order_number", values.work_order_number.trim())
        .eq("is_deleted", false)
        .maybeSingle();

      if (existingWo) {
        setDuplicateWarning({
          existingId: existingWo.id,
          existingAddress: existingWo.address,
          existingDate: existingWo.date,
          valuesToSave: values,
          setSubmittingFunc: setSubmitting,
          resetFormFunc: resetForm,
        });
        setSubmitting(false);
        return;
      }
    }

    await saveProjectToDatabase(values, setSubmitting, resetForm);
  };

  const handleUpdateAddressName = async (id, newName) => {
    if (!newName || newName.trim() === "") {
      toast.error("Name cannot be empty.");
      return;
    }
    const { error } = await supabase
      .from("addresses")
      .update({ address: newName.trim() })
      .eq("id", id);
    if (!error) {
      toast.success("Address updated!");
      refetch();
    }
  };

  const handleDeleteAddress = async (id) => {
    if (!window.confirm("Are you sure you want to delete this address?"))
      return;
    const { error } = await supabase
      .from("addresses")
      .update({ is_deleted: true })
      .eq("id", id);
    if (!error) {
      toast.success("Address deleted!");
      refetch();
    }
  };

  const handleFilesSelected = (event) => {
    if (isScanning) return;
    const next = [...selectedFilesToScan, ...Array.from(event.target.files)];
    event.target.value = null;
    try {
      validateScanFiles(next);
    } catch (error) {
      toast.error(error.message);
      return;
    }
    setSelectedFilesToScan(next);
    if (scanCache.current) setScanSelectionChanged(true);
  };

  const handleRemoveFile = (index) => {
    if (!isScanning) {
      setSelectedFilesToScan((prev) => prev.filter((_, i) => i !== index));
      if (scanCache.current) setScanSelectionChanged(true);
    }
  };

  const handleRunScan = async (setValues) => {
    if (scanController.current || selectedFilesToScan.length === 0) return;
    const controller = new AbortController();
    scanController.current = controller;
    setIsScanning(true);
    const toastId = toast.loading(
      "Reading documents. Your previous result is kept until this scan succeeds.",
      { id: "work-order-scan" },
    );
    try {
      const files = [...selectedFilesToScan];
      const sameFiles =
        scanCache.current?.files.length === files.length &&
        files.every((file, i) => file === scanCache.current.files[i]);
      const result = sameFiles
        ? scanCache.current.result
        : await scanDocuments(files, controller.signal);
      if (!sameFiles) scanCache.current = { files, result, urls: null };
      const urls =
        scanCache.current.urls ||
        (await uploadScanOriginals(files, user.id, controller.signal));
      controller.signal.throwIfAborted();
      scanCache.current = { files, result, urls };
      await setValues((previous) => ({
        ...previous,
        ...scanFormValues(result, { builders, stores, workTypeTemplates }),
        original_photo_url: urls[0] || "",
        scanned_files_array: urls,
        ocr_import_key: sameFiles
          ? previous.ocr_import_key || crypto.randomUUID()
          : crypto.randomUUID(),
      }));
      setScanSelectionChanged(false);
      toast.success(
        "Scan ready. Review every finding and confirm before saving.",
        { id: toastId },
      );
    } catch (error) {
      toast.error(
        error.name === "AbortError" ? "Scan cancelled." : error.message,
        { id: toastId },
      );
    } finally {
      scanController.current = null;
      if (mounted.current) setIsScanning(false);
    }
  };

  const handleUploadAdditionalPhoto = async (event, setFieldValue) => {
    const file = event.target.files[0];
    if (!file) return;

    const toastId = toast.loading("Uploading additional photo...");
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("material-photos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const filePath = `material-photos/${fileName}`;
      setFieldValue("additional_photo_url", filePath);

      toast.success("Additional photo uploaded!", { id: toastId });
    } catch (error) {
      toast.error("Upload failed", { id: toastId });
    }
  };

  const renderStatusBadges = (item) => {
    const isAssigned =
      item.work_types && item.work_types.some((wt) => wt.person_id);

    let assignmentBadge = null;

    if (item.status !== "Ready") {
      if (!isAssigned) {
        assignmentBadge = (
          <span
            style={{
              backgroundColor: "#fef08a",
              color: "#b45309",
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            Непризначено
          </span>
        );
      } else {
        assignmentBadge = (
          <span
            style={{
              backgroundColor: "#e0e7ff",
              color: "#4338ca",
              padding: "4px 10px",
              borderRadius: "20px",
              fontSize: "0.75rem",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            Призначено
          </span>
        );
      }
    }

    let mainStatusText =
      item.status === "Ready"
        ? "Готово"
        : item.status === "Not Finished"
          ? "Не завершено"
          : "В процесі";

    return (
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {assignmentBadge}
        <span
          className={`${styles.statusBadge} ${styles[item.status?.replace(/\s+/g, "")] || ""}`}
        >
          {mainStatusText}
        </span>
      </div>
    );
  };

  const renderAddressList = (list) => (
    <div className={styles.cardsList}>
      {list.map((item) => (
        <div
          key={item.id}
          className={`${styles.card} ${isEditing ? styles.editing : ""}`}
          onClick={() =>
            !isEditing &&
            navigate(`/address/${item.id}`, {
              state: { searchTerm, dateFilter, statusFilter },
            })
          }
        >
          <div className={styles.cardContent}>
            {isEditing ? (
              <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                <input
                  type="text"
                  value={
                    editedAddresses[item.id] !== undefined
                      ? editedAddresses[item.id]
                      : item.address
                  }
                  onChange={(e) =>
                    setEditedAddresses((prev) => ({
                      ...prev,
                      [item.id]: e.target.value,
                    }))
                  }
                  onBlur={() =>
                    handleUpdateAddressName(item.id, editedAddresses[item.id])
                  }
                  onClick={(e) => e.stopPropagation()}
                  className={styles.editInput}
                />
                <button
                  className={commonStyles.buttonIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAddress(item.id);
                  }}
                >
                  <FaTrash />
                </button>
              </div>
            ) : (
              <>
                <div className={styles.cardTitle}>
                  {item.project_type === "Service" ? "Service: " : "WO #"}
                  {item.work_order_number || "N/A"} -{" "}
                  {item.builders?.name || "Unknown Builder"}
                  {item.project_type === "Service" && item.service_time
                    ? ` - ${item.service_time}`
                    : ""}
                </div>

                <div className={styles.cardAddress}>
                  <FaMapMarkerAlt className={styles.pinIcon} />
                  <span>{item.address}</span>
                </div>

                {item.project_type === "Service" && item.notes && (
                  <div className={styles.cardNotes}>{item.notes}</div>
                )}

                <div className={styles.cardBottomRow}>
                  {renderStatusBadges(item)}
                </div>
              </>
            )}
          </div>
          {!isEditing && (
            <MdOutlineChevronRight className={styles.chevronIcon} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className={styles.pageContainer}>
      <AssignedWorkers />
      <div className={styles.mobileLayout}>
        <div className={styles.header}>
          <button
            className={commonStyles.buttonSecondary}
            onClick={() => navigate("/")}
            style={{ border: "none" }}
          >
            <FaArrowLeft /> Back
          </button>
          <h1 className={styles.pageTitle}>Projects</h1>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={toggleAddForm}
              disabled={isScanning}
              className={commonStyles.buttonPrimary}
            >
              {isAddFormOpen ? <FaTimes /> : <FaPlus />}{" "}
              {isAddFormOpen ? "Close" : "New"}
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={
                isEditing
                  ? commonStyles.buttonSuccess
                  : commonStyles.buttonSecondary
              }
            >
              {isEditing ? <FaCheck /> : <FaEdit />}{" "}
              {isEditing ? "Done" : "Edit"}
            </button>
          </div>
        </div>

        <div className={styles.darkFilterPanel}>
          <div className={styles.searchContainer}>
            <FaSearch className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by address or WO..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
            <button
              onClick={() => setProjectTab("Address")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: "none",
                fontWeight: "bold",
                cursor: "pointer",
                backgroundColor:
                  projectTab === "Address"
                    ? "var(--color-primary)"
                    : "rgba(255, 255, 255, 0.1)",
                color: projectTab === "Address" ? "#fff" : "#cbd5e1",
                transition: "all 0.2s",
              }}
            >
              <FaBuilding style={{ marginRight: "6px" }} /> Адреси
            </button>
            <button
              onClick={() => setProjectTab("Service")}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: "8px",
                border: "none",
                fontWeight: "bold",
                cursor: "pointer",
                backgroundColor:
                  projectTab === "Service"
                    ? "var(--color-primary)"
                    : "rgba(255, 255, 255, 0.1)",
                color: projectTab === "Service" ? "#fff" : "#cbd5e1",
                transition: "all 0.2s",
              }}
            >
              <FaWrench style={{ marginRight: "6px" }} /> Сервіси
            </button>
          </div>

          <div className={styles.filterGrid} style={{ marginTop: "15px" }}>
            <select
              value={builderFilter}
              onChange={(e) => setBuilderFilter(e.target.value)}
              className={styles.darkSelect}
            >
              <option value="all">All Builders</option>
              {builders?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className={styles.darkSelect}
            >
              <option value="all">All Stores</option>
              {stores?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              className={styles.darkSelect}
            >
              <option value="all">All Products</option>
              {products?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={styles.darkSelect}
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="yesterday">Yesterday</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={styles.darkSelect}
            >
              <option value="all">All Statuses</option>
              <option value="In Process">In Process</option>
              <option value="Ready">Ready</option>
              <option value="Not Finished">Not Finished</option>
            </select>
          </div>
        </div>

        {duplicateWarning && (
          <div className={styles.duplicateWarningOverlay}>
            <div className={styles.duplicateWarningBox}>
              <h3 style={{ color: "#b45309", marginTop: 0 }}>
                ⚠️ Увага: Work Order вже існує!
              </h3>
              <p>В системі знайдено проект з таким самим номером WO:</p>
              <div
                style={{
                  background: "#fef3c7",
                  padding: "10px",
                  borderRadius: "6px",
                  marginBottom: "15px",
                }}
              >
                <strong>Адреса:</strong> {duplicateWarning.existingAddress}{" "}
                <br />
                <strong>Дата:</strong> {duplicateWarning.existingDate}
              </div>
              <p>Що ви хочете зробити?</p>
              <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                <button
                  className={commonStyles.buttonPrimary}
                  onClick={() => {
                    navigate(`/address/${duplicateWarning.existingId}`);
                  }}
                  style={{ flex: 1 }}
                >
                  Перейти до існуючого
                </button>
                <button
                  className={commonStyles.buttonSecondary}
                  onClick={() => {
                    saveProjectToDatabase(
                      {
                        ...duplicateWarning.valuesToSave,
                        allow_duplicate: true,
                      },
                      duplicateWarning.setSubmittingFunc,
                      duplicateWarning.resetFormFunc,
                    );
                  }}
                  style={{ flex: 1, backgroundColor: "#e2e8f0" }}
                >
                  Все одно створити новий
                </button>
              </div>
              <button
                className={commonStyles.buttonSecondary}
                onClick={() => setDuplicateWarning(null)}
                style={{ width: "100%", marginTop: "10px", border: "none" }}
              >
                Скасувати створення
              </button>
            </div>
          </div>
        )}

        {isAddFormOpen && !duplicateWarning && (
          <div className={styles.addFormSection}>
            <div className={styles.sectionHeaderForm}>Create New Project</div>
            <Formik
              initialValues={{
                project_type: "Address",
                work_order_number: "",
                store_id: "",
                builder_id: "",
                address: "",
                date: "",
                time: "",
                total_amount: "",
                ai_translation: "",
                original_photo_url: "",
                additional_photo_url: "",
                scanned_files_array: [],
                pending_work_types: [],
                ocr_result: null,
                ocr_reviewed: false,
                ocr_import_key: "",
                date_end: "",
              }}
              validationSchema={AddProjectSchema}
              onSubmit={handleAddAddress}
            >
              {({ isSubmitting, values, setFieldValue, setValues }) => (
                <Form
                  className={styles.addForm}
                  onChangeCapture={(event) => {
                    if (values.ocr_reviewed && event.target.type !== "checkbox")
                      setFieldValue("ocr_reviewed", false);
                  }}
                >
                  <fieldset
                    disabled={isScanning || isSubmitting}
                    style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                  >
                    <div className={styles.formRow}>
                      <div className={styles.inputGroup}>
                        <label>Type</label>
                        <Field
                          as="select"
                          name="project_type"
                          className={styles.formInput}
                        >
                          <option value="">Select type</option>
                          <option value="Address">Address</option>
                          <option value="Service">Service</option>
                        </Field>
                        <ErrorMessage name="project_type" component="div" className={styles.errorMessage} />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>WO Number</label>
                        <Field
                          type="text"
                          name="work_order_number"
                          placeholder="e.g. 47174-1"
                          className={styles.formInput}
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Builder</label>
                        <Field
                          as="select"
                          name="builder_id"
                          className={styles.formInput}
                        >
                          <option value="">Select Builder</option>
                          {builders?.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </Field>
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Store</label>
                        <Field
                          as="select"
                          name="store_id"
                          className={styles.formInput}
                        >
                          <option value="">Select Store</option>
                          {stores?.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Field>
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.inputGroup}>
                        <label>Address / Service Name</label>
                        <Field
                          type="text"
                          name="address"
                          placeholder="Job site address or service name"
                          className={styles.formInput}
                        />
                        <ErrorMessage
                          name="address"
                          component="div"
                          className={styles.errorMessage}
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Date</label>
                        <Field
                          type="date"
                          name="date"
                          className={styles.formInput}
                        />
                        <ErrorMessage name="date" component="div" className={styles.errorMessage} />
                      </div>
                      {values.project_type === "Service" && (
                        <div className={styles.inputGroup}>
                          <label>Time</label>
                          <Field
                            type="time"
                            name="time"
                            className={styles.formInput}
                          />
                        <ErrorMessage name="time" component="div" className={styles.errorMessage} />
                        </div>
                      )}
                    </div>

                    <div className={styles.formRow}>
                      <div
                        className={styles.inputGroup}
                        style={{ width: "100%" }}
                      >
                        <label>Total Amount</label>
                        <Field
                          type="number"
                          name="total_amount"
                          placeholder="0.00"
                          className={styles.formInput}
                          style={{ width: "100%" }}
                        />
                        <ErrorMessage name="total_amount" component="div" className={styles.errorMessage} />
                      </div>
                    </div>

                    <div
                      className={styles.inputGroup}
                      style={{ marginTop: "8px" }}
                    >
                      <label>AI Instructions / Notes</label>
                      <Field
                        as="textarea"
                        name="ai_translation"
                        placeholder="AI will put translation and instructions here..."
                        className={styles.formInput}
                        style={{ minHeight: "80px", resize: "vertical" }}
                      />
                    </div>

                    <div
                      className={styles.inputGroup}
                      style={{ marginTop: "10px" }}
                    >
                      <label>
                        Scan Documents (Select 1 or more photos as Originals)
                      </label>

                      <input
                        type="file"
                        id="multiCameraInput"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        style={{ display: "none" }}
                        onChange={handleFilesSelected}
                      />

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            document.getElementById("multiCameraInput").click()
                          }
                          className={commonStyles.buttonSecondary}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <FaPlus /> Додати фото до сканування
                        </button>

                        {selectedFilesToScan.length > 0 && (
                          <button
                            type="button"
                            disabled={isScanning}
                            onClick={() => handleRunScan(setValues)}
                            className={commonStyles.buttonPrimary}
                            style={{
                              backgroundColor: "#10b981",
                              color: "#fff",
                            }}
                          >
                            {isScanning
                              ? "Scanning..."
                              : `🚀 Запустити сканування (${selectedFilesToScan.length})`}
                          </button>
                        )}
                      </div>

                      {selectedFilesToScan.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",
                            marginTop: "10px",
                          }}
                        >
                          {selectedFilesToScan.map((file, idx) => (
                            <div
                              key={idx}
                              style={{
                                position: "relative",
                                width: "80px",
                                height: "80px",
                                border: "1px solid #ccc",
                                borderRadius: "6px",
                                overflow: "hidden",
                                background: "#f3f4f6",
                              }}
                            >
                              <ScanFilePreview file={file} />
                              <button
                                type="button"
                                onClick={() => handleRemoveFile(idx)}
                                style={{
                                  position: "absolute",
                                  top: "2px",
                                  right: "2px",
                                  background: "rgba(0,0,0,0.6)",
                                  color: "#fff",
                                  border: "none",
                                  borderRadius: "50%",
                                  width: "20px",
                                  height: "20px",
                                  fontSize: "10px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        marginTop: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      {values.scanned_files_array &&
                      values.scanned_files_array.length > 0 ? (
                        <div
                          className={styles.inputGroup}
                          style={{ width: "100%" }}
                        >
                          <label>
                            Original Scanned Documents (
                            {values.scanned_files_array.length})
                          </label>
                          <div
                            style={{
                              display: "flex",
                              gap: "10px",
                              flexWrap: "wrap",
                              marginTop: "8px",
                            }}
                          >
                            {values.scanned_files_array.map((url, idx) => (
                              <StorageMedia
                                key={idx}
                                bucketName="original-photos"
                                identifier={url}
                                alt={`Original Scanned ${idx + 1}`}
                                style={{
                                  height: "120px",
                                  width: "120px",
                                  objectFit: "cover",
                                  borderRadius: "8px",
                                  border: "1px solid var(--color-border)",
                                  backgroundColor: "#fff",
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ) : values.original_photo_url ? (
                        <div className={styles.inputGroup} style={{ flex: 1 }}>
                          <label>Original Document</label>
                          <StorageMedia
                            bucketName="original-photos"
                            identifier={values.original_photo_url}
                            alt="Scanned Document"
                            className={styles.previewImageDoc}
                          />
                        </div>
                      ) : null}
                    </div>

                    {scanSelectionChanged && values.ocr_result && (
                      <p role="status">
                        Selected files changed. Scan them before saving.
                      </p>
                    )}
                    <OcrReview templates={workTypeTemplates || []} />
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        marginTop: "16px",
                        width: "100%",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="file"
                        id="additionalPhotoInput"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) =>
                          handleUploadAdditionalPhoto(e, setFieldValue)
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          document
                            .getElementById("additionalPhotoInput")
                            .click()
                        }
                        className={commonStyles.buttonSecondary}
                        disabled={isSubmitting}
                        style={{
                          flex: 1,
                          minWidth: "120px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                      >
                        + Add Extra File
                      </button>

                      <button
                        type="submit"
                        className={commonStyles.buttonPrimary}
                        disabled={
                          isSubmitting ||
                          isScanning ||
                          Boolean(
                            values.ocr_result &&
                            (!values.ocr_reviewed || scanSelectionChanged),
                          )
                        }
                        style={{
                          flex: 2,
                          minWidth: "200px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                      >
                        <FaPlus /> Save Project
                      </button>
                    </div>
                  </fieldset>
                </Form>
              )}
            </Formik>
          </div>
        )}

        <div className={styles.content}>
          {addressesLoading && addresses.length === 0 ? (
            <div style={{ padding: "20px" }}>
              <SkeletonLoader count={5} />
            </div>
          ) : addresses.length > 0 ? (
            <div className={styles.listContainer}>
              {groupedAddresses.today.length > 0 && (
                <div className={styles.dayGroup}>
                  <div
                    className={styles.sectionHeader}
                    style={{ borderLeft: "4px solid var(--color-primary)" }}
                  >
                    Today Projects ({groupedAddresses.today.length})
                  </div>
                  {renderAddressList(groupedAddresses.today)}
                </div>
              )}
              {groupedAddresses.tomorrow.length > 0 && (
                <div className={styles.dayGroup}>
                  <div className={styles.sectionHeader}>
                    Tomorrow Projects ({groupedAddresses.tomorrow.length})
                  </div>
                  {renderAddressList(groupedAddresses.tomorrow)}
                </div>
              )}
              {groupedAddresses.upcoming.map((chunk) => (
                <div key={chunk.label} className={styles.dayGroup}>
                  <div className={styles.sectionHeader}>
                    Upcoming: {chunk.label} ({chunk.items.length})
                  </div>
                  {renderAddressList(chunk.items)}
                </div>
              ))}
              {groupedAddresses.past.map((chunk) => (
                <div key={chunk.label} className={styles.dayGroup}>
                  <div className={styles.sectionHeader}>
                    Past: {chunk.label} ({chunk.items.length})
                  </div>
                  {renderAddressList(chunk.items)}
                </div>
              ))}
              {hasMore && (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  <button
                    onClick={loadMore}
                    disabled={addressesLoading}
                    className={commonStyles.buttonSecondary}
                  >
                    {addressesLoading ? "Loading..." : "Load More Projects"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              message={`No ${projectTab.toLowerCase()}es found matching your criteria.`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default AddressListPage;
