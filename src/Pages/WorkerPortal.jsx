// src/Pages/WorkerPortal.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";
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
import { format, isToday, isTomorrow, parseISO } from "date-fns";

const WorkerPortal = () => {
  const { user, role, loading: authLoading } = useAuth();
  const userId = user?.id;

  const [activeTab, setActiveTab] = useState("work");
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

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

  const ensureProfileExists = useCallback(async () => {
    if (!userId) return;
    try {
      let { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        const newProfile = {
          id: userId,
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
      setProfile(data);
    } catch (error) {
      console.error("Помилка ініціалізації профілю:", error.message);
      toast.error("Не вдалося завантажити дані профілю.");
    } finally {
      setIsInitialized(true);
    }
  }, [userId]);

  useEffect(() => {
    if (userId && role === "worker" && !isInitialized) {
      ensureProfileExists();
    }
  }, [userId, role, isInitialized, ensureProfileExists]);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    }
  }, [userId]);

  const fetchMyTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: personRecords, error: personError } = await supabase
        .from("people")
        .select("id, name")
        .eq("user_id", userId);

      if (personError) throw personError;

      if (!personRecords || personRecords.length === 0) {
        setMyTasks([]);
        return;
      }

      const validPerson =
        personRecords.find((p) => p.name && !p.name.includes("Працівник")) ||
        personRecords[0];
      const workerId = validPerson.id;

      const { data: tasks, error: tasksError } = await supabase
        .from("work_types")
        .select(
          `
          id,
          person_id,
          payment_amount,
          notes,
          date,
          work_type_templates (name),
          addresses!inner (
            id,
            address,
            date,
            status,
            is_deleted,
            ai_translation,
            work_order_number,
            builder_id
          )
        `,
        )
        .eq("person_id", workerId)
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
            payment_amount: task.payment_amount,
            notes: task.notes,
            builder_name: builder?.name || "Невідомий білдер",
            builder_instructions: builderNotes,
            ai_translation: task.addresses?.ai_translation,
            status: task.addresses?.status || "Assigned",
          };
        })
        .filter((task) => {
          // === ЖОРСТКИЙ ФІЛЬТР: ТІЛЬКИ ВІД СЬОГОДНІ ===
          if (!task.date) return false; // Приховуємо роботи без дати взагалі

          // Безпечний парсинг дати без зсуву часових поясів (YYYY-MM-DD)
          const parts = task.date.split("-");
          if (parts.length !== 3) return false;

          const taskDate = new Date(parts[0], parts[1] - 1, parts[2]);
          taskDate.setHours(0, 0, 0, 0);

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Повертаємо лише ті, що заплановані на сьогодні або в майбутньому
          // (Старі завдання більше ніколи не з'являться ні в активних, ні в завершених)
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
  }, [userId]);

  const fetchWorkerDocuments = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from("worker_documents")
        .select("*")
        .eq("worker_id", userId);
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Помилка завантаження документів:", error.message);
    }
  }, [userId]);

  useEffect(() => {
    if (isInitialized) {
      fetchNotifications();
      fetchMyTasks();
      fetchWorkerDocuments();
    }
  }, [isInitialized, fetchNotifications, fetchMyTasks, fetchWorkerDocuments]);

  const markNotificationAsRead = async (id) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId);
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
    if (!urls || urls.length === 0) return;
    try {
      setLoading(true);
      const newDocs = urls.map((url) => ({ worker_id: userId, file_url: url }));
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
    setLoading(true);
    try {
      const finalNotes = `[Завдання: ${selectedTask.task_name}]\n[Статус від працівника: ${formData.workerStatus}]\n${formData.notes ? formData.notes : "Без додаткових коментарів."}`;

      const { error: reportError } = await supabase
        .from("daily_reports")
        .insert([
          {
            worker_id: userId,
            address_id: selectedTask.address_id,
            work_type_id: selectedTask.id,
            notes: finalNotes,
            photos_before: formData.photosBefore,
            photos_after: formData.photosAfter,
            report_date: new Date().toISOString(),
          },
        ]);

      if (reportError) throw reportError;

      const { error: updateWorkTypeError } = await supabase
        .from("work_types")
        .update({
          notes: formData.notes ? formData.notes : selectedTask.notes,
        })
        .eq("id", selectedTask.id);

      if (updateWorkTypeError) {
        console.error(
          "Помилка оновлення work_types:",
          updateWorkTypeError.message,
        );
      }

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

  const extractRelevantInstruction = (fullText, taskName) => {
    if (!fullText) return null;
    let textToParse = fullText;
    const managerNoteToken = "⚠️ Примітки від менеджера:";
    if (fullText.includes(managerNoteToken)) {
      const idx = fullText.indexOf(managerNoteToken);
      textToParse = fullText.substring(0, idx);
    }
    const blocks = textToParse.split("📍 Зона:").filter(Boolean);
    for (const block of blocks) {
      const cleanBlock = ("📍 Зона:" + block).trim();
      if (cleanBlock.toLowerCase().includes(taskName.toLowerCase())) {
        return cleanBlock;
      }
    }
    return textToParse.trim();
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
      if (!task.date) return; // Відсіяні ще вище, але для безпеки

      const taskDate = parseISO(task.date);
      const tDate = new Date(taskDate);
      tDate.setHours(0, 0, 0, 0);
      const dateValue = tDate.getTime();

      let groupKey, groupTitle, category;

      // Оскільки минулих вже немає, у нас є тільки 3 варіанти: Сьогодні, Завтра, Майбутні
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
      // Сортуємо хронологічно
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
  if (role === "admin") return <Navigate to="/addresses" replace />;
  if (!isInitialized)
    return (
      <div className={styles.loadingScreen}>Завантаження даних кабінету...</div>
    );

  return (
    <div className={styles.portalWrapper}>
      <div className={styles.portalContainer}>
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

                  {selectedTask.ai_translation && (
                    <div
                      className={styles.instructionBlock}
                      style={{
                        backgroundColor: "#fef3c7",
                        borderColor: "#fde68a",
                      }}
                    >
                      <div
                        className={styles.instructionHeader}
                        style={{ color: "#d97706" }}
                      >
                        <FaInfoCircle className={styles.instructionIcon} />
                        <h3>Інструкція з ворк-ордера:</h3>
                      </div>
                      <div
                        style={{
                          padding: "10px",
                          backgroundColor: "#fff",
                          borderRadius: "8px",
                          border: "1px solid #fde68a",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {extractRelevantInstruction(
                          selectedTask.ai_translation,
                          selectedTask.task_name,
                        )}
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
                        padding: "10px",
                        backgroundColor: "#fff",
                        borderRadius: "8px",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "1.1rem",
                          color: "var(--color-primary)",
                        }}
                      >
                        {selectedTask.task_name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.95rem",
                          color: "#555",
                          marginTop: "8px",
                        }}
                      >
                        Оплата за це завдання: $
                        {parseFloat(selectedTask.payment_amount || 0).toFixed(
                          2,
                        )}
                      </div>
                      {selectedTask.notes && (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "10px",
                            backgroundColor: "rgba(176, 42, 72, 0.05)",
                            borderRadius: "6px",
                            fontSize: "0.9rem",
                            color: "#444",
                          }}
                        >
                          <strong>📝 Примітка до завдання:</strong>{" "}
                          {selectedTask.notes}
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
                  <strong>Ім'я:</strong> {profile.first_name}{" "}
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
