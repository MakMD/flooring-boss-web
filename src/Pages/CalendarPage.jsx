// src/Pages/CalendarPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { AssignedWorkersContext } from "../components/AssignedWorkers/AssignedWorkersContext";
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
  FaUser,
  FaCheck,
} from "react-icons/fa";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import styles from "./CalendarPage.module.css";
import { calgaryToday, calendarDate, calendarDays, calendarWorkers, calendarSummary, calendarAddress, calendarUnassigned, filterCalendarEvents } from "../utils/calendarView.js";

const STORAGE_KEY = "calendar_state";
const EXPIRATION_TIME = 3 * 60 * 1000;

const CalendarPage = () => {
  const assignments = useContext(AssignedWorkersContext);
  const assignedWorkersButton = assignments?.button;
  const setAssignmentPeriod = assignments?.setPeriod;
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
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const container = useRef(null);

  useEffect(() => {
    const header = document.querySelector("main")?.previousElementSibling;
    if (!header) return;
    const measure = () => container.current?.style.setProperty("--calendar-header-height", `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    measure();
    return () => observer.disconnect();
  }, []);

  const [calendarMonth, setCalendarMonth] = useState(selectedDate);
  const [monthEvents, setMonthEvents] = useState([]);

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
    projectTab, searchQuery, selectedBuilder, selectedStore, selectedStatus, onlyUnassigned,
  }), [allEvents, projectTab, searchQuery, selectedBuilder, selectedStore, selectedStatus, onlyUnassigned]);

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
  useEffect(() => {
    setAssignmentPeriod?.({ start: datesToRender[0], end: datesToRender.at(-1) });
  }, [datesToRender, setAssignmentPeriod]);
  const summary = calendarSummary(filteredEvents);
  const todayKey = format(calgaryToday(), "yyyy-MM-dd");
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

  const activeFilters = [selectedBuilder, selectedStore, selectedStatus].filter(value => value !== "All").length;
  return <section ref={container} className={styles.calendarContainer} aria-label="Calendar">
    <div className={styles.stickyControls}>
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
      <div className={styles.summaryBadges} role="status" title="Кількість проєктів за поточними фільтрами">
        {loading ? "Завантаження…" : loadError ? "Календар недоступний" : <>
          <span>{summary.total} проєктів · {viewMode === "week" ? "тиждень" : "день"}</span>
          <span className={styles.summaryUnassigned}>{summary.unassigned} непризначених</span>
        </>}
      </div>
      <div className={styles.viewControls}>
        {assignedWorkersButton}
        <button type="button" aria-pressed={viewMode === "day"} onClick={() => setViewMode("day")} className={styles.textBtn}><FaRegCalendar /> День</button>
        <button type="button" aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")} className={styles.textBtn}><FaRegCalendarAlt /> Тиждень</button>
      </div>
    </div>
    <div className={styles.filterBar}>
      <label className={styles.searchContainer}><FaSearch /><input aria-label="Search address, builder or WO" placeholder="Шукати адресу, клієнта або WO..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
      <button type="button" className={styles.expandButton} aria-pressed={onlyUnassigned} onClick={() => setOnlyUnassigned(value => !value)}>Лише непризначені</button>
      <button type="button" className={`${styles.expandButton} ${styles.filterToggle}`} aria-expanded={filtersOpen} aria-controls="calendar-filters" onClick={() => setFiltersOpen(value => !value)}>Фільтри ({activeFilters})</button>
      <div id="calendar-filters" className={`${styles.extraFilters} ${filtersOpen ? styles.filtersOpen : ""}`}>
      <select aria-label="Builder filter" value={selectedBuilder} onChange={(event) => setSelectedBuilder(event.target.value)}>{uniqueBuilders.map((name) => <option key={name} value={name}>{name === "All" ? "All Builders" : name}</option>)}</select>
      <select aria-label="Store filter" value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>{uniqueStores.map((name) => <option key={name} value={name}>{name === "All" ? "All Stores" : name}</option>)}</select>
      <select aria-label="Status filter" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>{uniqueStatuses.map((name) => <option key={name} value={name}>{name === "All" ? "All Statuses" : name}</option>)}</select>
      </div>
      <div className={styles.projectTabs}>
        <button type="button" aria-pressed={projectTab === "Address"} onClick={() => setProjectTab("Address")}><FaBuilding /> Адреси ({loading ? "…" : addressCount})</button>
        <button type="button" aria-pressed={projectTab === "Service"} onClick={() => setProjectTab("Service")}><FaWrench /> Сервіси ({loading ? "…" : serviceCount})</button>
      </div>
    </div>
    </div>
    {loading ? <p className={styles.loadingText}>Loading schedule...</p> : loadError ? <div role="alert" className={styles.empty}>Не вдалося завантажити календар. <button type="button" onClick={fetchEvents}>Спробувати ще раз</button></div> :
      <div className={styles.weekRows}>{datesToRender.map((key) => <CalendarDay key={key} dateKey={key}
        events={filteredEvents.filter((event) => event.date === key)} today={key === todayKey} />)}</div>}
  </section>;
};

function CalendarDay({ dateKey, events, today }) {
  const grid = useRef(null);
  const [position, setPosition] = useState({ first: 0, last: 0, back: false, next: false });
  const eventIds = events.map(event => event.id).join(",");
  useEffect(() => {
    const element = grid.current;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const visible = [...element.children].map((child, index) => ({ bounds: child.getBoundingClientRect(), index }))
        .filter(child => child.bounds.right > bounds.left + 2 && child.bounds.left < bounds.right - 2);
      setPosition({ first: visible.length ? visible[0].index + 1 : 0,
        last: visible.length ? visible.at(-1).index + 1 : 0,
        back: element.scrollLeft > 4,
        next: element.scrollLeft + element.clientWidth < element.scrollWidth - 4 });
    };
    element.scrollLeft = 0;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { observer.disconnect(); element.removeEventListener("scroll", measure); };
  }, [eventIds]);
  const scrollCards = (direction) => {
    const element = grid.current;
    element.scrollBy({ left: direction * element.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const date = calendarDate(dateKey);
  return <section className={`${styles.dayRow} ${today ? styles.today : ""}`} aria-label={format(date, "EEEE, MMM d, yyyy")}>
    <header className={styles.dayLabel}>
      <h2>{format(date, "EEE d")}</h2><time dateTime={dateKey}>{format(date, "MMM d, yyyy")}</time>
      <span>{events.length} проєктів · {calendarSummary(events).unassigned} непризначених</span>{today && <small>Сьогодні</small>}
      {events.length > 0 && <div className={styles.scrollControls}>
        <button type="button" aria-label={`Попередні проєкти ${dateKey}`} aria-controls={`calendar-${dateKey}`} disabled={!position.back} onClick={() => scrollCards(-1)}><FaChevronLeft /></button>
        <span aria-live="polite" aria-atomic="true">{position.first}–{position.last} / {events.length}</span>
        <button type="button" aria-label={`Наступні проєкти ${dateKey}`} aria-controls={`calendar-${dateKey}`} disabled={!position.next} onClick={() => scrollCards(1)}><FaChevronRight /></button>
      </div>}
    </header>
    <div className={styles.dayBody}>
      <div ref={grid} id={`calendar-${dateKey}`} className={styles.cardsGrid} tabIndex={events.length ? 0 : undefined}
        role="region" aria-label={`Проєкти ${dateKey}`} onKeyDown={(event) => {
          if (event.target === event.currentTarget && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault(); scrollCards(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}>
        {events.map((event) => {
          const workers = calendarWorkers(event);
          // Only the address/project status marks the whole card complete.
          const ready = ["Ready", "Completed"].includes(event.status);
          const address = calendarAddress(event.address);
          const status = ready ? "Завершено" : event.status === "Not Finished" ? "Не завершено" : "В процесі";
          return <Link key={event.id} title={event.address} to={`/address/${event.id}`} className={`${styles.card} ${ready ? styles.ready : event.status === "In Process" ? styles.inProgress : ""}`}>
            <strong className={styles.cardAddress}>{address.street}</strong>
            {address.city && <span className={styles.city}>{address.city}</span>}
            <span className={styles.cardMeta}>WO #{event.work_order_number || "N/A"} · {event.builders?.name || "Unknown Builder"}</span>
            <span className={styles.store}>{event.stores?.name || "Unknown Store"}{event.project_type === "Service" && ` · Service${event.service_time ? ` · ${event.service_time}` : ""}`}</span>
            {event.project_type === "Service" && event.notes && <span className={styles.notes}>{event.notes}</span>}
            <span className={styles.cardFooter}>
              <span className={styles.workers}>{workers.length ? workers.map((name, index) => <span key={index} className={styles.worker}><FaUser aria-hidden="true" /> {name}</span>)
                : calendarUnassigned(event) && <span className={styles.unassignedLabel}>Непризначено</span>}</span>
              <span title={event.status} className={`${styles.status} ${ready ? styles.statusReady : event.status === "Not Finished" ? styles.statusUnfinished : styles.statusProgress}`}>{ready && <FaCheck aria-hidden="true" />} {status}</span>
            </span>
          </Link>;
        })}
      </div>
      {!events.length && <p className={styles.empty}>Немає проєктів за поточними фільтрами.</p>}
    </div>
  </section>;
}

export default CalendarPage;
