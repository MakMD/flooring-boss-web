// src/Pages/WorkerPortal.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import PhotoUploader from "../components/PhotoUploader/PhotoUploader";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  FaClipboardList,
  FaUser,
  FaBell,
  FaArrowLeft,
  FaMapMarkerAlt,
  FaSearch,
  FaCheckDouble,
  FaCopy,
  FaWrench,
  FaInfoCircle,
  FaBuilding,
  FaCalendarAlt,
  FaRegCalendarAlt,
  FaSave,
  FaFileAlt,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import { MdOutlineChevronRight } from "react-icons/md";
import styles from "./WorkerPortal.module.css";
import {
  format,
  parseISO,
  differenceInHours,
  addDays,
  subDays,
} from "date-fns";

const WorkerPortal = () => {
  const { user, role, loading: authLoading } = useAuth();
  const { personId: adminViewPersonId } = useParams();
  const navigate = useNavigate();

  const isAdminView = role === "admin" && !!adminViewPersonId;

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
  const [calendarDate, setCalendarDate] = useState(new Date());

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [formData, setFormData] = useState({
    workerStatus: "Ready",
    notes: "",
    photosBefore: [],
    photosAfter: [],
  });

  const [adminNote, setAdminNote] = useState("");

  const [profile, setProfile] = useState({
    first_name: "",
    last_name: "",
    status: "pending",
  });
  const [documents, setDocuments] = useState([]);

  const canEditReport = (reportDate) => {
    if (!reportDate) return false;
    const hoursDiff = differenceInHours(new Date(), parseISO(reportDate));
    return hoursDiff < 5;
  };

  useEffect(() => {
    const resolveTarget = async () => {
      if (!role) return;

      if (isAdminView) {
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
          status,
          work_type_templates (name),
          addresses!inner (
            id,
            address,
            date,
            is_deleted,
            builder_id
          ),
          daily_reports (
            id,
            report_date,
            notes,
            photos_before,
            photos_after
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

          const latestReport =
            task.daily_reports && task.daily_reports.length > 0
              ? task.daily_reports.sort(
                  (a, b) => new Date(b.report_date) - new Date(a.report_date),
                )[0]
              : null;

          return {
            id: task.id,
            address_id: task.addresses?.id,
            address: task.addresses?.address,
            date: taskDate,
            task_name: task.work_type_templates?.name || "Невідома робота",
            notes: task.notes,
            builder_name: builder?.name || "Невідомий білдер",
            builder_instructions: builderNotes,
            status: task.status || "Assigned",
            latestReport: latestReport,
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

  const fetchNotifications = useCallback(async () => {
    if (!targetAuthId) return;

    // ТЯГНЕМО ЛИШЕ НЕПРОЧИТАНІ (НОВІ) СПОВІЩЕННЯ
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", targetAuthId)
      .eq("is_read", false)
      .order("created_at", { ascending: false });

    if (!error && data) {
      const activeAddresses = myTasks.map((t) =>
        t.address.toLowerCase().trim(),
      );

      const validNotifications = data.filter((n) => {
        const cleanMsg = (n.message || "").toLowerCase().trim();
        const cleanTitle = (n.title || "").toLowerCase().trim();

        if (!cleanMsg.includes("адресі") && !cleanTitle.includes("адресі"))
          return true;

        return activeAddresses.some(
          (addr) => cleanMsg.includes(addr) || cleanTitle.includes(addr),
        );
      });

      setNotifications(validNotifications);
      setUnreadCount(validNotifications.length);
    }
  }, [targetAuthId, myTasks]);

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
      fetchMyTasks();
      fetchWorkerDocuments();
    }
  }, [
    isTargetResolved,
    ensureProfileExists,
    fetchMyTasks,
    fetchWorkerDocuments,
  ]);

  useEffect(() => {
    if (isTargetResolved && !loading) {
      fetchNotifications();
    }
  }, [isTargetResolved, loading, fetchNotifications]);

  // ФУНКЦІЯ: АВТОМАТИЧНЕ ПРИХОВУВАННЯ СПОВІЩЕНЬ ДЛЯ ВІДКРИТОЇ РОБОТИ
  const markTaskNotificationsAsRead = async (task) => {
    if (!task || notifications.length === 0) return;

    const cleanAddr = (task.address || "").toLowerCase().trim();

    const unreadIds = notifications
      .filter((n) => {
        const cleanMsg = (n.message || "").toLowerCase().trim();
        const cleanTitle = (n.title || "").toLowerCase().trim();
        return cleanMsg.includes(cleanAddr) || cleanTitle.includes(cleanAddr);
      })
      .map((n) => n.id);

    if (unreadIds.length > 0) {
      // Видаляємо візуально миттєво
      setNotifications((prev) => prev.filter((n) => !unreadIds.includes(n.id)));
      setUnreadCount((prev) => prev - unreadIds.length);

      // Відмічаємо в базі
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", unreadIds);
    }
  };

  const markAllAsRead = async () => {
    if (!targetAuthId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", targetAuthId);
    setNotifications([]);
    setUnreadCount(0);
    toast.success("Всі сповіщення прочитані");
  };

  const handleNotificationClick = async (notification) => {
    // Прибираємо зі списку відразу
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    setUnreadCount((prev) => prev - 1);
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notification.id);

    const cleanMsg = (notification.message || "").toLowerCase().trim();
    const cleanTitle = (notification.title || "").toLowerCase().trim();

    const matchedTask = myTasks.find((task) => {
      if (!task.address) return false;
      const cleanAddr = task.address.toLowerCase().trim();
      return cleanMsg.includes(cleanAddr) || cleanTitle.includes(cleanAddr);
    });

    setActiveTab("work");

    if (matchedTask) {
      const taskDateObj = parseISO(matchedTask.date);
      setCalendarDate(taskDateObj);
      setSelectedTask(matchedTask);
      setAdminNote(matchedTask.notes || "");

      if (
        matchedTask.latestReport &&
        canEditReport(matchedTask.latestReport.report_date)
      ) {
        setFormData({
          workerStatus: matchedTask.status || "Ready",
          notes: matchedTask.latestReport.notes
            .replace(/\[Завдання: .*?\]\n?/, "")
            .replace(/\[Статус від працівника: .*?\]\n?/, ""),
          photosBefore: matchedTask.latestReport.photos_before || [],
          photosAfter: matchedTask.latestReport.photos_after || [],
        });
      } else {
        setFormData({
          workerStatus: matchedTask.status || "In Process",
          notes: "",
          photosBefore: [],
          photosAfter: [],
        });
      }

      // Чистимо інші можливі сповіщення для цієї ж адреси
      markTaskNotificationsAsRead(matchedTask);
    } else {
      setSelectedTask(null);
      toast.error("Завдання не знайдено (можливо, воно видалене)");
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
      toast.error("Помилка: не знайдено ID працівника.");
      return;
    }

    setLoading(true);
    try {
      const { error: updateWorkTypeError } = await supabase
        .from("work_types")
        .update({
          status: formData.workerStatus,
        })
        .eq("id", selectedTask.id);

      if (updateWorkTypeError) throw updateWorkTypeError;

      if (
        formData.notes ||
        formData.photosBefore.length > 0 ||
        formData.photosAfter.length > 0
      ) {
        let reportNotes = formData.notes;
        if (!reportNotes.includes("[Завдання:")) {
          reportNotes = `[Завдання: ${selectedTask.task_name}]\n[Статус від працівника: ${formData.workerStatus}]\n${formData.notes || "Оновлено статус."}`;
        } else {
          reportNotes = reportNotes.replace(
            /\[Статус від працівника: .*?\]/,
            `[Статус від працівника: ${formData.workerStatus}]`,
          );
        }

        if (
          selectedTask.latestReport &&
          canEditReport(selectedTask.latestReport.report_date)
        ) {
          const { error: reportError } = await supabase
            .from("daily_reports")
            .update({
              notes: reportNotes,
              photos_before: formData.photosBefore,
              photos_after: formData.photosAfter,
              report_date: new Date().toISOString(),
            })
            .eq("id", selectedTask.latestReport.id);
          if (reportError) throw reportError;
        } else {
          const { error: reportError } = await supabase
            .from("daily_reports")
            .insert([
              {
                worker_id: targetAuthId,
                address_id: selectedTask.address_id,
                work_type_id: selectedTask.id,
                notes: reportNotes,
                photos_before: formData.photosBefore,
                photos_after: formData.photosAfter,
                report_date: new Date().toISOString(),
              },
            ]);
          if (reportError) throw reportError;
        }
      }

      toast.success("Збережено!");
      setSelectedTask(null);
      setFormData({
        workerStatus: "Ready",
        notes: "",
        photosBefore: [],
        photosAfter: [],
      });
      fetchMyTasks();
    } catch (error) {
      toast.error("Помилка: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveAdminNote = async () => {
    if (!selectedTask || !isAdminView) return;
    try {
      const { error } = await supabase
        .from("work_types")
        .update({ notes: adminNote })
        .eq("id", selectedTask.id);

      if (error) throw error;
      toast.success("Нотатку збережено");
      fetchMyTasks();
    } catch (error) {
      toast.error("Помилка збереження: " + error.message);
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

  // ФІЛЬТРАЦІЯ ДЛЯ РОБОЧОЇ ВКЛАДКИ
  const filteredTasks = myTasks.filter((t) => {
    const matchesSearch =
      (t.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.task_name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab =
      workFilter === "active" ? t.status !== "Ready" : t.status === "Ready";

    return matchesSearch && matchesTab;
  });

  // ВІДЖЕТ КАЛЕНДАРЯ: ФІЛЬТРАЦІЯ
  const tasksForSelectedDate = useMemo(() => {
    const selectedDateString = format(calendarDate, "yyyy-MM-dd");
    return myTasks.filter((t) => t.date === selectedDateString);
  }, [myTasks, calendarDate]);

  const filteredDayTasks = useMemo(() => {
    return tasksForSelectedDate.filter((t) => {
      const matchesSearch =
        (t.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.task_name || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTab =
        workFilter === "active" ? t.status !== "Ready" : t.status === "Ready";
      return matchesSearch && matchesTab;
    });
  }, [tasksForSelectedDate, searchTerm, workFilter]);

  const activeCount = tasksForSelectedDate.filter(
    (t) => t.status !== "Ready",
  ).length;
  const completedCount = tasksForSelectedDate.filter(
    (t) => t.status === "Ready",
  ).length;

  const renderTaskCard = (task) => (
    <div
      key={task.id}
      className={styles.projectCard}
      onClick={() => {
        setSelectedTask(task);
        setAdminNote(task.notes || "");
        if (task.latestReport && canEditReport(task.latestReport.report_date)) {
          setFormData({
            workerStatus: task.status || "Ready",
            notes: task.latestReport.notes
              .replace(/\[Завдання: .*?\]\n?/, "")
              .replace(/\[Статус від працівника: .*?\]\n?/, ""),
            photosBefore: task.latestReport.photos_before || [],
            photosAfter: task.latestReport.photos_after || [],
          });
        } else {
          setFormData({
            workerStatus: task.status || "In Process",
            notes: "",
            photosBefore: [],
            photosAfter: [],
          });
        }

        // ЗНИЩИТИ СПОВІЩЕННЯ ДЛЯ ЦЬОГО ЗАВДАННЯ, ЯКЩО ВОНО БУЛО ПРОЧИТАНО РУКАМИ
        markTaskNotificationsAsRead(task);
      }}
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

  const renderCalendarDay = useCallback(
    (day, date) => {
      const formattedDate = format(date, "yyyy-MM-dd");
      const jobsOnDay = myTasks.filter((t) => t.date === formattedDate);

      let status = null;
      if (jobsOnDay.length > 0) {
        const hasUnfinished = jobsOnDay.some((job) => job.status !== "Ready");
        status = hasUnfinished ? "red" : "green";
      }

      return (
        <div className={styles.dateCell}>
          <span>{day}</span>
          {status && (
            <div
              className={`${styles.indicator} ${status === "red" ? styles.indicatorRed : styles.indicatorGreen}`}
            />
          )}
        </div>
      );
    },
    [myTasks],
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
        {isAdminView && (
          <div className={styles.adminBanner}>
            <span>👀 Режим імітації: {targetName}</span>
            <button
              onClick={() => navigate(-1)}
              className={styles.adminBannerBtn}
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
                    <div className={styles.calendarHeaderRow}>
                      <button
                        onClick={() =>
                          setCalendarDate(subDays(calendarDate, 1))
                        }
                        className={styles.iconBtn}
                      >
                        <FaChevronLeft />
                      </button>
                      <button
                        onClick={() => setCalendarDate(new Date())}
                        className={styles.todayBtn}
                      >
                        Сьогодні
                      </button>
                      <DatePicker
                        selected={calendarDate}
                        onChange={(date) => setCalendarDate(date)}
                        customInput={
                          <button className={styles.datePickerBtn}>
                            {format(calendarDate, "dd MMM yyyy")}{" "}
                            <FaRegCalendarAlt />
                          </button>
                        }
                        renderDayContents={renderCalendarDay}
                        calendarClassName={styles.customCalendar}
                      />
                      <button
                        onClick={() =>
                          setCalendarDate(addDays(calendarDate, 1))
                        }
                        className={styles.iconBtn}
                      >
                        <FaChevronRight />
                      </button>
                    </div>

                    <div className={styles.searchContainer}>
                      <FaSearch className={styles.searchIcon} />
                      <input
                        type="text"
                        placeholder="Пошук за адресою або назвою..."
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

                  <div className={styles.projectList}>
                    {loading ? (
                      <p className={styles.infoText}>Завантаження...</p>
                    ) : filteredDayTasks.length === 0 ? (
                      <div
                        className={styles.placeholderTab}
                        style={{ height: "30vh" }}
                      >
                        <FaClipboardList
                          size={40}
                          className={styles.placeholderIcon}
                        />
                        <p>Немає завдань на цю дату.</p>
                      </div>
                    ) : (
                      filteredDayTasks.map((task) => renderTaskCard(task))
                    )}
                  </div>
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

                      {isAdminView ? (
                        <div style={{ marginTop: "16px" }}>
                          <label
                            className={styles.sectionLabel}
                            style={{ color: "#b02a48" }}
                          >
                            <FaInfoCircle /> Написати нотатку працівнику:
                          </label>
                          <textarea
                            className={styles.textarea}
                            value={adminNote}
                            onChange={(e) => setAdminNote(e.target.value)}
                            style={{
                              borderColor: "#b02a48",
                              minHeight: "60px",
                            }}
                            placeholder="Нотатка буде видима працівнику (видаліть весь текст, щоб сховати)..."
                          />
                          <button
                            onClick={saveAdminNote}
                            className={styles.submitReportBtn}
                            style={{ marginTop: "8px", padding: "8px" }}
                          >
                            <FaSave /> Зберегти нотатку
                          </button>
                        </div>
                      ) : selectedTask.notes &&
                        selectedTask.notes.trim() !== "" ? (
                        <div className={styles.managerNoteBox}>
                          <div className={styles.managerNoteHeader}>
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
                      ) : null}
                    </div>
                  </div>

                  {selectedTask.latestReport &&
                  !canEditReport(selectedTask.latestReport.report_date) ? (
                    <div
                      className={styles.instructionBlock}
                      style={{
                        backgroundColor: "#f0fdf4",
                        borderColor: "#4ade80",
                      }}
                    >
                      <div
                        className={styles.instructionHeader}
                        style={{ color: "#166534" }}
                      >
                        <FaCheckDouble className={styles.instructionIcon} />
                        <h3>Звіт вже відправлено</h3>
                      </div>
                      <p style={{ fontSize: "0.9rem", color: "#166534" }}>
                        Час на редагування цього звіту вийшов. Якщо виникла
                        помилка, зверніться до менеджера.
                      </p>
                      <div
                        style={{
                          padding: "10px",
                          backgroundColor: "#fff",
                          borderRadius: "8px",
                          border: "1px solid #4ade80",
                          whiteSpace: "pre-wrap",
                          marginTop: "10px",
                          fontSize: "0.95rem",
                        }}
                      >
                        {selectedTask.latestReport.notes}
                      </div>
                    </div>
                  ) : (
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
                        {selectedTask.latestReport
                          ? "Оновити звіт"
                          : "Відправити звіт"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "profile" && (
            <div className={styles.profileTab}>
              <div className={styles.profileInfo}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      width: "60px",
                      height: "60px",
                      borderRadius: "50%",
                      backgroundColor: "#e8e6df",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.5rem",
                      color: "#b02a48",
                    }}
                  >
                    <FaUser />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
                      {profile.first_name || targetName}
                    </h2>
                    <span
                      style={{
                        color:
                          profile.status === "approved" ? "#28a745" : "#d39e00",
                        fontWeight: "bold",
                        fontSize: "0.9rem",
                      }}
                    >
                      {profile.status === "approved"
                        ? "Активний"
                        : "На перевірці"}
                    </span>
                  </div>
                </div>
              </div>

              <h3 className={styles.subTitle}>Мої документи</h3>
              <PhotoUploader
                label="Додати новий документ"
                bucketName="worker-documents"
                onUploadComplete={handleDocumentUploadComplete}
              />

              {documents.length > 0 ? (
                <div className={styles.docsGrid}>
                  {documents.map((doc, index) => (
                    <a
                      key={doc.id || index}
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.docCard}
                    >
                      <FaFileAlt className={styles.docIcon} />
                      <span>Документ #{index + 1}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p
                  className={styles.infoText}
                  style={{ padding: 0, marginTop: "12px" }}
                >
                  Документів ще немає
                </p>
              )}
            </div>
          )}

          {activeTab === "notifications" && (
            <div className={styles.notificationsTab}>
              <div className={styles.notifHeaderWrapper}>
                <h2 style={{ margin: 0 }}>Останні сповіщення</h2>
                {notifications.length > 0 && (
                  <button onClick={markAllAsRead} className={styles.markAllBtn}>
                    <FaCheckDouble /> Прочитати все
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className={styles.placeholderTab}>
                  <FaBell size={40} className={styles.placeholderIcon} />
                  <p>Немає нових сповіщень.</p>
                </div>
              ) : (
                <div className={styles.notifList}>
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={styles.notifCard}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className={styles.notifTitleRow}>
                        <span className={styles.notifTitle}>{n.title}</span>
                        <span className={styles.unreadDot}></span>
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
