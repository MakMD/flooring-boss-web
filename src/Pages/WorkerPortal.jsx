// src/Pages/WorkerPortal.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PhotoUploader from "../components/PhotoUploader/PhotoUploader";
import {
  FaClipboardList,
  FaUser,
  FaBell,
  FaArrowLeft,
  FaMapMarkerAlt,
  FaSearch,
  FaCheckDouble,
  FaCopy,
  FaChevronDown,
  FaChevronRight,
  FaWrench,
  FaInfoCircle,
  FaBuilding,
  FaCalendarAlt,
} from "react-icons/fa";
import { MdOutlineChevronRight } from "react-icons/md";
import styles from "./WorkerPortal.module.css";
import { format, parseISO } from "date-fns";

const WorkerPortal = () => {
  const { user, role, loading: authLoading } = useAuth();
  const { personId: adminViewPersonId } = useParams();
  const navigate = useNavigate();

  // === ПЕРЕВІРКА РЕЖИМУ АДМІНА ===
  const isAdminView = role === "admin" && !!adminViewPersonId;

  // Динамічні ідентифікатори (або авторизований працівник, або працівник, якого переглядає адмін)
  const [targetPersonId, setTargetPersonId] = useState(null);
  const [targetAuthId, setTargetAuthId] = useState(null);
  const [targetName, setTargetName] = useState("");
  const [isTargetResolved, setIsTargetResolved] = useState(false);

  const [activeTab, setActiveTab] = useState("work");
  const [loading, setLoading] = useState(false);

  const [myTasks, setMyTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [workFilter, setWorkFilter] = useState("active");
  const [expandedGroups, setExpandedGroups] = useState({});

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [formData, setFormData] = useState({
    workerStatus: "Ready",
    notes: "",
    photosBefore: [],
    photosAfter: [],
  });

  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    status: "pending",
  });
  const [documents, setDocuments] = useState([]);

  // 1. РОЗПІЗНАВАННЯ КОРИСТУВАЧА (АДМІН ЧИ ПРАЦІВНИК)
  useEffect(() => {
    const resolveTarget = async () => {
      if (!role) return;

      if (isAdminView) {
        // Адмін переглядає чужий кабінет
        const { data, error } = await supabase
          .from("people")
          .select("id, user_id, name")
          .eq("id", adminViewPersonId)
          .single();

        if (!error && data) {
          setTargetPersonId(data.id);
          setTargetAuthId(data.user_id);
          setTargetName(data.name);
        } else {
          toast.error("Працівника не знайдено в базі");
        }
      } else if (role === "worker") {
        // Звичайний вхід працівника
        if (!user?.id) return;
        const { data, error } = await supabase
          .from("people")
          .select("id, name, user_id")
          .eq("user_id", user.id);

        if (!error && data && data.length > 0) {
          const validPerson =
            data.find((p) => p.name && !p.name.includes("Працівник")) ||
            data[0];
          setTargetPersonId(validPerson.id);
          setTargetAuthId(user.id);
          setTargetName(validPerson.name);
        } else {
          setTargetAuthId(user.id);
        }
      }
      setIsTargetResolved(true);
    };

    resolveTarget();
  }, [role, isAdminView, adminViewPersonId, user]);

  const ensureProfileExists = useCallback(async () => {
    if (!targetAuthId) return;
    try {
      let { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", targetAuthId)
        .maybeSingle();

      if (error) throw error;

      if (!data && role === "worker") {
        const newProfile = {
          id: targetAuthId,
          first_name: "Працівник",
          last_name: "",
          role: "worker",
        };
        const { error: insertError } = await supabase
          .from("profiles")
          .insert([newProfile]);
        if (insertError) throw insertError;
        data = newProfile;
      }
      if (data) setProfile(data);
    } catch (error) {
      console.error("Помилка профілю:", error.message);
    }
  }, [targetAuthId, role]);

  const fetchNotifications = useCallback(async () => {
    if (!targetAuthId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", targetAuthId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    }
  }, [targetAuthId]);

  const fetchMyTasks = useCallback(async () => {
    if (!targetPersonId) {
      setMyTasks([]);
      return;
    }
    setLoading(true);
    try {
      const { data: tasks, error: tasksError } = await supabase
        .from("work_types")
        .select(
          `
          id,
          person_id,
          notes,
          date,
          work_type_templates (name),
          addresses!inner (
            id,
            address,
            date,
            status,
            is_deleted,
            work_order_number,
            builder_id
          )
        `,
        )
        .eq("person_id", targetPersonId)
        .eq("addresses.is_deleted", false);

      if (tasksError) throw tasksError;
      if (!tasks || tasks.length === 0) {
        setMyTasks([]);
        return;
      }

      const { data: buildersData } = await supabase
        .from("builders")
        .select("*");

      const formattedTasks = tasks
        .map((task) => {
          const builder = buildersData?.find(
            (b) => b.id === task.addresses?.builder_id,
          );
          const builderNotes =
            builder?.notes ||
            builder?.instructions ||
            builder?.description ||
            null;
          const taskDate = task.date || task.addresses?.date;

          return {
            id: task.id,
            address_id: task.addresses?.id,
            address: task.addresses?.address,
            date: taskDate,
            work_order_number: task.addresses?.work_order_number,
            task_name: task.work_type_templates?.name || "Невідома робота",
            notes: task.notes,
            builder_name: builder?.name || "Невідомий білдер",
            builder_instructions: builderNotes,
            status: task.addresses?.status || "Assigned",
          };
        })
        .filter((task) => {
          if (!task.date) return false;
          const parts = task.date.split("-");
          if (parts.length !== 3) return false;

          const taskDate = new Date(parts[0], parts[1] - 1, parts[2]);
          taskDate.setHours(0, 0, 0, 0);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          return taskDate.getTime() >= today.getTime();
        });

      formattedTasks.sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
      });

      setMyTasks(formattedTasks);
    } catch (error) {
      console.error("Помилка завантаження завдань:", error.message);
      toast.error("Помилка завантаження робіт.");
    } finally {
      setLoading(false);
    }
  }, [targetPersonId]);

  const fetchWorkerDocuments = useCallback(async () => {
    if (!targetAuthId) return;
    try {
      const { data, error } = await supabase
        .from("worker_documents")
        .select("*")
        .eq("worker_id", targetAuthId);
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Помилка завантаження документів:", error.message);
    }
  }, [targetAuthId]);

  useEffect(() => {
    if (isTargetResolved) {
      ensureProfileExists();
      fetchNotifications();
      fetchMyTasks();
      fetchWorkerDocuments();
    }
  }, [
    isTargetResolved,
    ensureProfileExists,
    fetchNotifications,
    fetchMyTasks,
    fetchWorkerDocuments,
  ]);

  const markNotificationAsRead = async (id) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    if (!targetAuthId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", targetAuthId);
    fetchNotifications();
    toast.success("Всі сповіщення прочитані");
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markNotificationAsRead(notification.id);
    }
    const cleanMsg = (notification.message || "").toLowerCase().trim();
    const cleanTitle = (notification.title || "").toLowerCase().trim();

    const matchedTask = myTasks.find((task) => {
      if (!task.address) return false;
      const cleanAddr = task.address.toLowerCase().trim();
      return cleanMsg.includes(cleanAddr) || cleanTitle.includes(cleanAddr);
    });

    setActiveTab("work");

    if (matchedTask) {
      setSelectedTask(matchedTask);
    } else {
      setSelectedTask(null);
      toast.error("Завдання не знайдено (можливо, воно старе і приховане)");
    }
  };

  const handleDocumentUploadComplete = async (urls) => {
    if (!urls || urls.length === 0 || !targetAuthId) return;
    try {
      setLoading(true);
      const newDocs = urls.map((url) => ({
        worker_id: targetAuthId,
        file_url: url,
      }));
      const { error } = await supabase.from("worker_documents").insert(newDocs);
      if (error) throw error;
      toast.success("Документи успішно завантажено!");
      fetchWorkerDocuments();
    } catch (error) {
      toast.error("Помилка збереження: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAddress = (address) => {
    if (!address) return;
    navigator.clipboard
      .writeText(address)
      .then(() => toast.success("Адресу скопійовано!"))
      .catch(() => toast.error("Помилка копіювання адреси"));
  };

  const handleWorkSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!targetAuthId) {
      toast.error(
        "У цього працівника ще немає акаунта (user_id). Неможливо відправити звіт.",
      );
      return;
    }

    setLoading(true);
    try {
      const finalNotes = `[Завдання: ${selectedTask.task_name}]\n[Статус від працівника: ${formData.workerStatus}]\n${formData.notes ? formData.notes : "Без додаткових коментарів."}`;

      const { error: reportError } = await supabase
        .from("daily_reports")
        .insert([
          {
            worker_id: targetAuthId,
            address_id: selectedTask.address_id,
            work_type_id: selectedTask.id,
            notes: finalNotes,
            photos_before: formData.photosBefore,
            photos_after: formData.photosAfter,
            report_date: new Date().toISOString(),
          },
        ]);

      if (reportError) throw reportError;

      await supabase
        .from("work_types")
        .update({ notes: formData.notes ? formData.notes : selectedTask.notes })
        .eq("id", selectedTask.id);

      toast.success("Звіт успішно надіслано на перевірку!");
      setSelectedTask(null);
      setFormData({
        workerStatus: "Ready",
        notes: "",
        photosBefore: [],
        photosAfter: [],
      });
      fetchMyTasks();
    } catch (error) {
      toast.error("Помилка відправки: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case "work":
        return selectedTask ? "Деталі завдання" : "Мої завдання";
      case "profile":
        return "Мій профіль";
      case "notifications":
        return "Сповіщення";
      default:
        return "Flooring Boss";
    }
  };

  const toggleGroup = (groupName, defaultState = false) => {
    setExpandedGroups((prev) => {
      const currentState =
        prev[groupName] !== undefined ? prev[groupName] : defaultState;
      return { ...prev, [groupName]: !currentState };
    });
  };

  const filteredTasks = myTasks.filter((t) => {
    const matchesSearch =
      (t.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.task_name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab =
      workFilter === "active" ? t.status !== "Ready" : t.status === "Ready";
    return matchesSearch && matchesTab;
  });

  const groupedTasks = useMemo(() => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    filteredTasks.forEach((task) => {
      if (!task.date) return;

      const taskDate = parseISO(task.date);
      const tDate = new Date(taskDate);
      tDate.setHours(0, 0, 0, 0);
      const dateValue = tDate.getTime();

      let groupKey, groupTitle, category;

      if (dateValue === today.getTime()) {
        groupKey = "today";
        groupTitle = `🔥 Сьогодні (${format(taskDate, "dd MMM")})`;
        category = 1;
      } else if (dateValue === tomorrow.getTime()) {
        groupKey = "tomorrow";
        groupTitle = `📅 Завтра (${format(taskDate, "dd MMM")})`;
        category = 2;
      } else {
        groupKey = task.date;
        groupTitle = `⏳ Майбутні: ${format(taskDate, "dd MMM yyyy")}`;
        category = 3;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          title: groupTitle,
          tasks: [],
          category: category,
          dateValue: dateValue,
        };
      }
      groups[groupKey].tasks.push(task);
    });

    Object.values(groups).forEach((group) => {
      group.tasks.sort(
        (a, b) =>
          new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
      );
    });

    return Object.entries(groups)
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        if (a.category !== b.category) return a.category - b.category;
        return a.dateValue - b.dateValue;
      });
  }, [filteredTasks]);

  const activeCount = myTasks.filter((t) => t.status !== "Ready").length;
  const completedCount = myTasks.filter((t) => t.status === "Ready").length;

  const renderTaskCard = (task) => (
    <div
      key={task.id}
      className={styles.projectCard}
      onClick={() => setSelectedTask(task)}
    >
      <div className={styles.cardHeader}>
        <div className={styles.taskTitleGroup}>
          <div className={styles.taskIconWrapper}>
            <FaWrench />
          </div>
          <h3 className={styles.taskTitle}>{task.task_name}</h3>
        </div>
        <span
          className={`${styles.statusBadge} ${styles[task.status?.replace(/\s+/g, "")] || ""}`}
        >
          {task.status}
        </span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.infoRow}>
          <FaMapMarkerAlt className={`${styles.infoIcon} ${styles.iconRed}`} />
          <span>{task.address}</span>
        </div>
        <div className={styles.infoRow}>
          <FaCalendarAlt className={styles.infoIcon} />
          <span>{task.date || "Не вказано"}</span>
        </div>
        <div className={styles.infoRow}>
          <FaBuilding className={styles.infoIcon} />
          <span>{task.builder_name}</span>
        </div>
      </div>

      <MdOutlineChevronRight className={styles.chevronIcon} />
    </div>
  );

  if (authLoading || !role)
    return (
      <div className={styles.loadingScreen}>Отримання прав доступу...</div>
    );
  if (role === "admin" && !isAdminView)
    return <Navigate to="/addresses" replace />;
  if (!isTargetResolved)
    return (
      <div className={styles.loadingScreen}>Завантаження даних кабінету...</div>
    );

  return (
    <div className={styles.portalWrapper}>
      <div className={styles.portalContainer}>
        {/* === ПЛАШКА РЕЖИМУ АДМІНА === */}
        {isAdminView && (
          <div
            style={{
              backgroundColor: "#b02a48",
              color: "white",
              padding: "10px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: "600",
              fontSize: "0.95rem",
            }}
          >
            <span>👀 Режим імітації: {targetName}</span>
            <button
              onClick={() => navigate(-1)}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: "white",
                padding: "6px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Вийти
            </button>
          </div>
        )}

        <div className={styles.topHeader}>
          <h1 className={styles.pageTitle}>{getPageTitle()}</h1>
        </div>

        <div className={styles.contentArea}>
          {activeTab === "work" && (
            <div className={styles.workTab}>
              {!selectedTask ? (
                <>
                  <div className={styles.topControls}>
                    <div className={styles.searchContainer}>
                      <FaSearch className={styles.searchIcon} />
                      <input
                        type="text"
                        placeholder="Пошук за адресою або назвою роботи..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                      />
                    </div>
                    <div className={styles.filterTabs}>
                      <button
                        className={`${styles.filterTab} ${workFilter === "active" ? styles.activeFilterTab : ""}`}
                        onClick={() => setWorkFilter("active")}
                      >
                        В роботі ({activeCount})
                      </button>
                      <button
                        className={`${styles.filterTab} ${workFilter === "completed" ? styles.activeFilterTab : ""}`}
                        onClick={() => setWorkFilter("completed")}
                      >
                        Завершені ({completedCount})
                      </button>
                    </div>
                  </div>

                  {loading ? (
                    <p className={styles.infoText}>Завантаження...</p>
                  ) : filteredTasks.length === 0 ? (
                    <p className={styles.infoText}>
                      Немає завдань у цій категорії.
                    </p>
                  ) : (
                    <div className={styles.projectList}>
                      {groupedTasks.map((group) => {
                        const defaultExpanded =
                          group.category === 1 ||
                          group.category === 2 ||
                          group.category === 3;
                        const isExpanded =
                          expandedGroups[group.key] !== undefined
                            ? expandedGroups[group.key]
                            : defaultExpanded;

                        return (
                          <div key={group.key} className={styles.dateGroup}>
                            <div
                              className={styles.groupAccordionHeader}
                              onClick={() =>
                                toggleGroup(group.key, defaultExpanded)
                              }
                            >
                              <span>
                                {group.title} ({group.tasks.length})
                              </span>
                              {isExpanded ? (
                                <FaChevronDown
                                  className={styles.accordionIcon}
                                />
                              ) : (
                                <FaChevronRight
                                  className={styles.accordionIcon}
                                />
                              )}
                            </div>
                            {isExpanded && (
                              <div className={styles.groupAccordionContent}>
                                {group.tasks.map((task) =>
                                  renderTaskCard(task),
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.projectDetail}>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className={styles.backButton}
                  >
                    <FaArrowLeft /> Назад до списку
                  </button>

                  <div className={styles.detailHeader}>
                    <div className={styles.titleRow}>
                      <h2 className={styles.detailTitle}>
                        {selectedTask.address}
                      </h2>
                      <button
                        type="button"
                        className={styles.copyButton}
                        onClick={() => handleCopyAddress(selectedTask.address)}
                        title="Скопіювати адресу"
                      >
                        <FaCopy />
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "16px",
                        color: "#666",
                        fontSize: "0.95rem",
                        marginTop: "12px",
                      }}
                    >
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <FaCalendarAlt />{" "}
                        <strong>{selectedTask.date || "Не вказано"}</strong>
                      </span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <FaBuilding />{" "}
                        <strong>{selectedTask.builder_name}</strong>
                      </span>
                    </div>
                  </div>

                  {selectedTask.builder_instructions && (
                    <div
                      className={styles.instructionBlock}
                      style={{
                        backgroundColor: "#e0f2fe",
                        borderColor: "#38bdf8",
                      }}
                    >
                      <div
                        className={styles.instructionHeader}
                        style={{ color: "#0284c7" }}
                      >
                        <FaBuilding className={styles.instructionIcon} />
                        <h3>Інструкція від Білдера:</h3>
                      </div>
                      <div
                        style={{
                          padding: "10px",
                          backgroundColor: "#fff",
                          borderRadius: "8px",
                          border: "1px solid #38bdf8",
                          whiteSpace: "pre-wrap",
                          fontSize: "0.95rem",
                        }}
                      >
                        {selectedTask.builder_instructions}
                      </div>
                    </div>
                  )}

                  <div className={styles.instructionBlock}>
                    <div className={styles.instructionHeader}>
                      <FaWrench className={styles.instructionIcon} />
                      <h3>Ваше завдання:</h3>
                    </div>
                    <div
                      style={{
                        padding: "16px",
                        backgroundColor: "#fff",
                        borderRadius: "8px",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "1.2rem",
                          color: "var(--color-primary)",
                        }}
                      >
                        {selectedTask.task_name}
                      </div>

                      {selectedTask.notes && (
                        <div
                          style={{
                            marginTop: "16px",
                            padding: "12px",
                            backgroundColor: "#fff9fa",
                            borderLeft: "4px solid #b02a48",
                            borderRadius: "0 6px 6px 0",
                            fontSize: "0.95rem",
                            color: "#333",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          }}
                        >
                          <div
                            style={{
                              color: "#b02a48",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              fontWeight: "bold",
                              marginBottom: "4px",
                            }}
                          >
                            <FaInfoCircle /> Нотатка від менеджера:
                          </div>
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              lineHeight: "1.5",
                            }}
                          >
                            {selectedTask.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <form
                    onSubmit={handleWorkSubmit}
                    className={styles.reportForm}
                  >
                    <div className={styles.formGroup}>
                      <label className={styles.sectionLabel}>
                        Статус цього завдання
                      </label>
                      <select
                        className={styles.statusSelect}
                        value={formData.workerStatus}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            workerStatus: e.target.value,
                          })
                        }
                      >
                        <option value="Ready">Ready (Готово повністю)</option>
                        <option value="In Process">
                          In Process (В процесі виконання)
                        </option>
                        <option value="Not Finished">
                          Not Finished (Не завершено)
                        </option>
                      </select>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.sectionLabel}>
                        Нотатки до звіту (опціонально)
                      </label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) =>
                          setFormData({ ...formData, notes: e.target.value })
                        }
                        placeholder="Опишіть виконану роботу або проблеми..."
                        className={styles.textarea}
                      />
                    </div>

                    <div className={styles.photoUploaders}>
                      <PhotoUploader
                        label="Фото ДО (опціонально)"
                        bucketName="worker-photos"
                        onUploadComplete={(urls) =>
                          setFormData({ ...formData, photosBefore: urls })
                        }
                      />
                      <PhotoUploader
                        label="Фото ПІСЛЯ (рекомендується)"
                        bucketName="worker-photos"
                        onUploadComplete={(urls) =>
                          setFormData({ ...formData, photosAfter: urls })
                        }
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className={styles.submitReportBtn}
                    >
                      {loading ? "Відправка..." : "Зберегти звіт"}
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          {activeTab === "profile" && (
            <div className={styles.profileTab}>
              <div className={styles.profileInfo}>
                <p>
                  <strong>Ім'я:</strong> {profile.first_name || targetName}{" "}
                  {profile.last_name}
                </p>
                <p>
                  <strong>Статус:</strong>{" "}
                  {profile.status === "approved"
                    ? "Затверджено"
                    : "На перевірці"}
                </p>
              </div>
              <h3 className={styles.subTitle}>Мої документи</h3>
              <PhotoUploader
                label="Завантажити документ (ID, Сертифікати)"
                bucketName="worker-documents"
                onUploadComplete={handleDocumentUploadComplete}
              />
              {documents.length > 0 && (
                <ul className={styles.documentList}>
                  {documents.map((doc, index) => (
                    <li key={doc.id || index}>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Переглянути документ #{index + 1}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === "notifications" && (
            <div className={styles.notificationsTab}>
              <div className={styles.notifHeaderWrapper}>
                <h2 style={{ margin: 0 }}>Сповіщення</h2>
                {notifications.length > 0 && (
                  <button onClick={markAllAsRead} className={styles.markAllBtn}>
                    <FaCheckDouble /> Прочитати все
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className={styles.placeholderTab}>
                  <FaBell size={40} className={styles.placeholderIcon} />
                  <p>Немає нових повідомлень.</p>
                </div>
              ) : (
                <div className={styles.notifList}>
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`${styles.notifCard} ${!n.is_read ? styles.notifUnread : ""}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className={styles.notifTitleRow}>
                        <span className={styles.notifTitle}>{n.title}</span>
                        {!n.is_read && (
                          <span className={styles.unreadDot}></span>
                        )}
                      </div>
                      <p className={styles.notifMessage}>{n.message}</p>
                      <span className={styles.notifDate}>
                        {new Date(n.created_at).toLocaleString("uk-UA", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.bottomNav}>
          <button
            className={`${styles.navItem} ${activeTab === "work" ? styles.activeNav : ""}`}
            onClick={() => {
              setActiveTab("work");
              setSelectedTask(null);
            }}
          >
            <FaClipboardList size={20} />
            <span>Робота</span>
          </button>
          <button
            className={`${styles.navItem} ${activeTab === "profile" ? styles.activeNav : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            <FaUser size={20} />
            <span>Профіль</span>
          </button>
          <button
            className={`${styles.navItem} ${activeTab === "notifications" ? styles.activeNav : ""}`}
            onClick={() => setActiveTab("notifications")}
            style={{ position: "relative" }}
          >
            <FaBell size={20} />
            <span>Сповіщення</span>
            {unreadCount > 0 && (
              <span className={styles.badge}>{unreadCount}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkerPortal;
