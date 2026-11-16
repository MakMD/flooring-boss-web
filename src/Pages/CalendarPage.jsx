// src/Pages/CalendarPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  format,
  addDays,
  subDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import {
  FaChevronLeft,
  FaChevronRight,
  FaSyncAlt,
  FaRegCalendarAlt,
  FaRegCalendar,
  FaSearch,
  FaBuilding,
  FaWrench,
} from "react-icons/fa";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import styles from "./CalendarPage.module.css";
import { calgaryToday, calendarDate, calendarDays, calendarWorkers, calendarSummary, filterCalendarEvents } from "../utils/calendarView.js";

const STORAGE_KEY = "calendar_state";
const EXPIRATION_TIME = 3 * 60 * 1000;

const CalendarPage = () => {
  const [selectedDate, setSelectedDate] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.timestamp < EXPIRATION_TIME) {
          const restored = parsed.dateKey ? calendarDate(parsed.dateKey) : new Date(parsed.selectedDate);
          if (Number.isFinite(restored.getTime())) return restored;
        }
      }
    } catch (e) {
      console.error("Помилка читання збереженої дати:", e);
    }
    return calgaryToday();
  });

  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.timestamp < EXPIRATION_TIME) {
          return parsed.viewMode === "day" ? "day" : "week";
        }
      }
    } catch {
      /* ignore */
    }
    return "week";
  });

  const [projectTab, setProjectTab] = useState("Address");

  const [allEvents, setAllEvents] = useState([]); // ЗБЕРІГАЄМО ВСІ ПОДІЇ
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBuilder, setSelectedBuilder] = useState("All");
  const [selectedStore, setSelectedStore] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");

  const [calendarMonth, setCalendarMonth] = useState(selectedDate);
  const [monthEvents, setMonthEvents] = useState([]);

  const [expandedDays, setExpandedDays] = useState({});
  const [loadError, setLoadError] = useState(false);
  const requestVersion = useRef(null);
  const weekStartsOn = 1;

  useEffect(() => {
    const stateToSave = {
      selectedDate: selectedDate.toISOString(),
      dateKey: format(selectedDate, "yyyy-MM-dd"),
      viewMode,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [selectedDate, viewMode]);

  const fetchEvents = useCallback(async () => {
    const request = Symbol("calendar-request");
    requestVersion.current = request;
    setLoading(true);
    setLoadError(false);

    let startDate, endDate;
    if (viewMode === "day") {
      startDate = format(selectedDate, "yyyy-MM-dd");
      endDate = format(selectedDate, "yyyy-MM-dd");
    } else {
      startDate = format(
        startOfWeek(selectedDate, { weekStartsOn }),
        "yyyy-MM-dd",
      );
      endDate = format(endOfWeek(selectedDate, { weekStartsOn }), "yyyy-MM-dd");
    }

    // Завантажуємо ВСІ події, без фільтрації по типу проекту, щоб порахувати бейджі
    try {
    const { data, error } = await supabase
      .from("addresses")
      .select("*, builders(name), stores(name), work_types(person_id, people(name))")
      .eq("is_deleted", false)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .order("service_time", { ascending: true, nullsFirst: false });

    if (request !== requestVersion.current) return;
    if (error) throw error;
    setAllEvents(data || []);
    } catch {
      if (request !== requestVersion.current) return;
      setAllEvents([]);
      setLoadError(true);
      toast.error("Could not fetch calendar events.");
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, [selectedDate, viewMode]);

  useEffect(() => {
    fetchEvents();
    return () => { requestVersion.current = null; };
  }, [fetchEvents]);

  useEffect(() => {
    const fetchMonthEvents = async () => {
      const start = format(startOfMonth(calendarMonth), "yyyy-MM-dd");
      const end = format(endOfMonth(calendarMonth), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("addresses")
        .select("date, status")
        .eq("is_deleted", false)
        .eq("project_type", projectTab)
        .gte("date", start)
        .lte("date", end);

      if (!error && data) {
        setMonthEvents(data);
      }
    };
    fetchMonthEvents();
  }, [calendarMonth, projectTab]);

  const getDayStatus = useCallback(
    (date) => {
      if (!monthEvents || monthEvents.length === 0) return null;

      const formattedDate = format(date, "yyyy-MM-dd");
      const jobsOnDay = monthEvents.filter((job) => job.date === formattedDate);

      if (jobsOnDay.length === 0) return null;

      const hasUnfinished = jobsOnDay.some(
        (job) => job.status !== "Ready" && job.status !== "Completed",
      );

      return hasUnfinished ? "red" : "green";
    },
    [monthEvents],
  );

  const renderDayContents = useCallback(
    (day, date) => {
      const status = getDayStatus(date);
      return (
        <div className={styles.dateCell}>
          <span>{day}</span>
          {status && (
            <div
              className={`${styles.indicator} ${
                status === "red" ? styles.indicatorRed : styles.indicatorGreen
              }`}
            />
          )}
        </div>
      );
    },
    [getDayStatus],
  );

  const handleNext = () => {
    const newDate =
      viewMode === "day" ? addDays(selectedDate, 1) : addWeeks(selectedDate, 1);
    setSelectedDate(newDate);
    setCalendarMonth(newDate);
  };

  const handlePrev = () => {
    const newDate =
      viewMode === "day" ? subDays(selectedDate, 1) : subWeeks(selectedDate, 1);
    setSelectedDate(newDate);
    setCalendarMonth(newDate);
  };

  const filteredEvents = useMemo(() => filterCalendarEvents(allEvents, {
    projectTab, searchQuery, selectedBuilder, selectedStore, selectedStatus,
  }), [allEvents, projectTab, searchQuery, selectedBuilder, selectedStore, selectedStatus]);

  const uniqueBuilders = useMemo(
    () =>
      [
        "All",
        ...new Set(
          allEvents
            .filter((e) => e.project_type === projectTab)
            .map((e) => e.builders?.name)
            .filter(Boolean),
        ),
      ].sort(),
    [allEvents, projectTab],
  );

  const uniqueStores = useMemo(
    () =>
      [
        "All",
        ...new Set(
          allEvents
            .filter((e) => e.project_type === projectTab)
            .map((e) => e.stores?.name)
            .filter(Boolean),
        ),
      ].sort(),
    [allEvents, projectTab],
  );

  const uniqueStatuses = useMemo(
    () =>
      [
        "All",
        ...new Set(
          allEvents
            .filter((e) => e.project_type === projectTab)
            .map((e) => e.status)
            .filter(Boolean),
        ),
      ].sort(),
    [allEvents, projectTab],
  );

  const dateKey = format(selectedDate, "yyyy-MM-dd");
  const datesToRender = useMemo(() => calendarDays(dateKey, viewMode), [dateKey, viewMode]);
  const summary = calendarSummary(filteredEvents);
  const todayKey = format(calgaryToday(), "yyyy-MM-dd");
  const allExpanded = datesToRender.every((key) => expandedDays[key]);
  const addressCount = allEvents.filter((event) => event.project_type === "Address").length;
  const serviceCount = allEvents.filter((event) => event.project_type === "Service").length;
  const goToCurrentWeek = () => {
    const today = calgaryToday();
    setSelectedDate(today);
    setCalendarMonth(today);
    setViewMode("week");
  };
  const headerText = viewMode === "day" ? format(selectedDate, "MMM d, yyyy")
    : `${format(calendarDate(datesToRender[0]), "MMM d, yyyy")} – ${format(calendarDate(datesToRender[6]), "MMM d, yyyy")}`;

  return <section className={styles.calendarContainer} aria-label="Calendar">
    <header className={styles.pageHeading}>
      <h1>Calendar</h1>
      <p>{viewMode === "week" ? "Weekly" : "Daily"} work overview · Calgary time</p>
    </header>
    <div className={styles.navbar}>
      <div className={styles.navGroup}>
        <button type="button" onClick={handlePrev} className={styles.iconBtn} aria-label={viewMode === "week" ? "Previous week" : "Previous day"}><FaChevronLeft /></button>
        <DatePicker selected={selectedDate} onChange={(date) => { if (date) { setSelectedDate(date); setCalendarMonth(date); } }}
          onMonthChange={setCalendarMonth} calendarStartDay={1}
          customInput={<button type="button" className={styles.datePickerBtn}>{headerText}<FaRegCalendarAlt /></button>}
          renderDayContents={renderDayContents} calendarClassName={styles.customCalendar} />
        <button type="button" onClick={handleNext} className={styles.iconBtn} aria-label={viewMode === "week" ? "Next week" : "Next day"}><FaChevronRight /></button>
        <button type="button" className={styles.textBtn} onClick={goToCurrentWeek}>Поточний тиждень</button>
        <button type="button" onClick={fetchEvents} disabled={loading} className={styles.iconBtn} aria-label="Refresh calendar"><FaSyncAlt /></button>
      </div>
      <div className={styles.viewControls}>
        <button type="button" aria-pressed={viewMode === "day"} onClick={() => setViewMode("day")} className={styles.textBtn}><FaRegCalendar /> День</button>
        <button type="button" aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")} className={styles.textBtn}><FaRegCalendarAlt /> Тиждень</button>
      </div>
    </div>
    <div className={styles.filterBar}>
      <label className={styles.searchContainer}><FaSearch /><input aria-label="Search address, builder or WO" placeholder="Шукати адресу, клієнта або WO..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
      <select aria-label="Builder filter" value={selectedBuilder} onChange={(event) => setSelectedBuilder(event.target.value)}>{uniqueBuilders.map((name) => <option key={name} value={name}>{name === "All" ? "All Builders" : name}</option>)}</select>
      <select aria-label="Store filter" value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>{uniqueStores.map((name) => <option key={name} value={name}>{name === "All" ? "All Stores" : name}</option>)}</select>
      <select aria-label="Status filter" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>{uniqueStatuses.map((name) => <option key={name} value={name}>{name === "All" ? "All Statuses" : name}</option>)}</select>
      <div className={styles.projectTabs}>
        <button type="button" aria-pressed={projectTab === "Address"} onClick={() => setProjectTab("Address")}><FaBuilding /> Адреси ({loading ? "…" : addressCount})</button>
        <button type="button" aria-pressed={projectTab === "Service"} onClick={() => setProjectTab("Service")}><FaWrench /> Сервіси ({loading ? "…" : serviceCount})</button>
      </div>
    </div>
    <div className={styles.overview}>
      <p role="status">{loading ? "Loading schedule…" : loadError ? "Schedule unavailable" : <>
        <strong>{summary.total}</strong> {viewMode === "week" ? "робіт за тиждень" : "робіт за день"}
        <span className={styles.summaryDivider}>·</span><strong>{summary.unassigned}</strong> непризначених
        <small>За поточними фільтрами · кількість проєктів</small>
      </>}</p>
      <button type="button" className={styles.expandButton} disabled={loading || loadError} aria-expanded={allExpanded}
        onClick={() => setExpandedDays(Object.fromEntries(datesToRender.map((key) => [key, !allExpanded])))}>
        {allExpanded ? "Згорнути всі дні" : "Розгорнути всі дні"}
      </button>
    </div>
    {loading ? <p className={styles.loadingText}>Loading schedule...</p> : loadError ? <div role="alert" className={styles.empty}>Не вдалося завантажити календар. <button type="button" onClick={fetchEvents}>Спробувати ще раз</button></div> :
      <div className={styles.weekRows}>{datesToRender.map((key) => <CalendarDay key={key} dateKey={key}
        events={filteredEvents.filter((event) => event.date === key)} today={key === todayKey}
        expanded={!!expandedDays[key]} onToggle={() => setExpandedDays((old) => ({ ...old, [key]: !old[key] }))} />)}</div>}
  </section>;
};

function CalendarDay({ dateKey, events, today, expanded, onToggle }) {
  const grid = useRef(null);
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const element = grid.current;
    const measure = () => {
      const tracks = getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean);
      setColumns(Math.max(1, tracks.length));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const visible = expanded ? events : events.slice(0, columns);
  const date = calendarDate(dateKey);
  return <section className={`${styles.dayRow} ${today ? styles.today : ""}`} aria-label={format(date, "EEEE, MMM d, yyyy")}>
    <header className={styles.dayLabel}>
      <h2>{format(date, "EEE d")}</h2><time dateTime={dateKey}>{format(date, "MMM d, yyyy")}</time>
      <span>{events.length} робіт</span>{today && <small>Сьогодні</small>}
    </header>
    <div className={styles.dayBody}>
      <div ref={grid} id={`calendar-${dateKey}`} className={styles.cardsGrid}>
        {visible.map((event) => {
          const workers = calendarWorkers(event);
          const status = event.status === "Ready" ? "Готово" : event.status === "Not Finished" ? "Не завершено" : "В процесі";
          return <Link key={event.id} to={`/address/${event.id}`} className={`${styles.card} ${event.status === "Ready" ? styles.ready : workers.length ? styles.assigned : styles.unassigned}`}>
            <strong className={styles.cardAddress}>{event.address || "Unknown address"}</strong>
            <span className={styles.cardMeta}>WO #{event.work_order_number || "N/A"} · {event.builders?.name || "Unknown Builder"}</span>
            <span className={styles.store}>{event.stores?.name || "Unknown Store"}{event.project_type === "Service" && ` · Service${event.service_time ? ` · ${event.service_time}` : ""}`}</span>
            {event.project_type === "Service" && event.notes && <span className={styles.notes}>{event.notes}</span>}
            <span className={styles.cardFooter}>
              <span className={styles.workers}>{workers.length ? workers.map((name, index) => <span key={index} className={styles.worker}>{name}</span>)
                : event.status !== "Ready" && <span className={styles.unassignedLabel}>Непризначено</span>}</span>
              <span title={event.status} className={`${styles.status} ${event.status === "Ready" ? styles.statusReady : event.status === "Not Finished" ? styles.statusUnfinished : styles.statusProgress}`}>{status}</span>
            </span>
          </Link>;
        })}
      </div>
      {!events.length && <p className={styles.empty}>Немає робіт за поточними фільтрами.</p>}
      {events.length > columns && <button type="button" className={styles.moreButton} aria-expanded={expanded} aria-controls={`calendar-${dateKey}`} onClick={onToggle}>
        {expanded ? "Згорнути" : `Ще ${events.length - visible.length}`}
      </button>}
    </div>
  </section>;
}

export default CalendarPage;
