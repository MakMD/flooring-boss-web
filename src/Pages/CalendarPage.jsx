// src/Pages/CalendarPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { AssignedWorkersContext } from "../components/AssignedWorkers/AssignedWorkersContext";
import { needsMaterialPickup } from "../utils/servicePickup.js";
import CalendarPreview from "../components/CalendarPreview.jsx";
import { calendarWorkSummary, calendarProjectStatus } from "../utils/calendarWork.js";
import { uk } from "date-fns/locale";
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
  FaEye,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef(null);
  const searchToggle = useRef(null);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  const container = useRef(null);

  useEffect(() => {
    const header = document.querySelector("main")?.previousElementSibling;
    if (!header) return;
    const toolbar = container.current?.firstElementChild;
    const measure = () => {
      container.current?.style.setProperty("--calendar-header-height", `${header.getBoundingClientRect().height}px`);
      if (container.current && toolbar) {
        const top = container.current.getBoundingClientRect().top + window.scrollY + toolbar.getBoundingClientRect().height;
        container.current.style.setProperty("--calendar-content-top", `${top}px`);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    if (toolbar) observer.observe(toolbar);
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
      .select("*, builders(name), stores(name), work_types(id, date, status, person_id, people(name), work_type_templates(name))")
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
  const firstDay = calendarDate(datesToRender[0]);
  const lastDay = calendarDate(datesToRender.at(-1));
  const headerText = viewMode === "day" ? format(selectedDate, "d MMMM yyyy", { locale: uk })
    : `${format(firstDay, format(firstDay, "yyyy-MM") === format(lastDay, "yyyy-MM") ? "d" : "d MMMM", { locale: uk })}–${format(lastDay, "d MMMM yyyy", { locale: uk })}`;

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
      </div><div className={styles.dateExtras}>
        <button type="button" className={styles.textBtn} onClick={goToCurrentWeek}>Поточний тиждень</button>
        <button type="button" onClick={fetchEvents} disabled={loading} className={styles.iconBtn} aria-label="Refresh calendar"><FaSyncAlt /></button>
      </div>
      <div className={styles.summaryBadges} role="status" title="Кількість проєктів за поточними фільтрами">
        {loading ? "Завантаження…" : loadError ? "Календар недоступний" : <>
          <span>{summary.total} проєктів</span>
          <span className={styles.summaryUnassigned}>{summary.unassigned} непризначених</span>
        </>}
      </div>
      <div className={styles.viewControls}>
        <button type="button" aria-pressed={viewMode === "day"} onClick={() => setViewMode("day")} className={styles.textBtn}><FaRegCalendar /> День</button>
        <button type="button" aria-pressed={viewMode === "week"} onClick={() => setViewMode("week")} className={styles.textBtn}><FaRegCalendarAlt /> Тиждень</button>
      </div>
    <div className={`${styles.filterBar} ${filtersOpen ? styles.mobileFiltersOpen : ""}`}>
      <button ref={searchToggle} type="button" className={styles.searchToggle} aria-label="Пошук" aria-expanded={searchOpen} aria-controls="calendar-search" onClick={() => { setSearchOpen(value => !value); setFiltersOpen(false); }}><FaSearch /><span>Пошук</span>{searchQuery && <span title={searchQuery} aria-label={`Пошук застосовано: ${searchQuery}`} className={styles.searchActive}>●</span>}</button>
      <label id="calendar-search" className={`${styles.searchContainer} ${searchOpen ? styles.searchOpen : ""}`}><FaSearch /><input ref={searchInput} onKeyDown={(event) => { if (event.key === "Escape") { setSearchOpen(false); searchToggle.current?.focus(); } }} aria-label="Search address, builder or WO" placeholder="Шукати адресу, клієнта або WO..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></label>
      <button type="button" className={styles.expandButton} aria-pressed={onlyUnassigned} onClick={() => setOnlyUnassigned(value => !value)}>Лише непризначені</button>
      <button type="button" className={`${styles.expandButton} ${styles.filterToggle}`} aria-expanded={filtersOpen} aria-controls="calendar-filters" onClick={() => { setFiltersOpen(value => !value); setSearchOpen(false); }}>Фільтри ({activeFilters})</button>
      <div className={styles.workersControl}>{assignedWorkersButton}</div>
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
    </div>
    {loading ? <p className={styles.loadingText}>Loading schedule...</p> : loadError ? <div role="alert" className={styles.empty}>Не вдалося завантажити календар. <button type="button" onClick={fetchEvents}>Спробувати ще раз</button></div> :
      <div className={`${styles.weekRows} ${viewMode === "week" ? styles.fillWeek : ""}`}>{datesToRender.map((key) => <CalendarDay key={key} dateKey={key}
        events={filteredEvents.filter((event) => event.date === key)} today={key === todayKey} />)}</div>}
  </section>;
};

const MOBILE_CAROUSEL = "(max-width: 767px)";

function CalendarDay({ dateKey, events, today }) {
  const grid = useRef(null);
  const [preview, setPreview] = useState(null);
  const [position, setPosition] = useState({ first: 0, last: 0, current: 1, back: false, next: false });
  const eventIds = events.map(event => event.id).join(",");
  useEffect(() => {
    const element = grid.current;
    const measure = () => {
      const mobile = window.matchMedia(MOBILE_CAROUSEL).matches;
      const current = mobile ? Math.round(element.scrollLeft / Math.max(1, element.clientWidth)) + 1 : 1;
      const bounds = element.getBoundingClientRect();
      const visible = [...element.children].map((child, index) => ({ bounds: child.getBoundingClientRect(), index }))
        .filter(child => child.bounds.right > bounds.left + 2 && child.bounds.left < bounds.right - 2);
      setPosition({ first: visible.length ? visible[0].index + 1 : 0,
        last: visible.length ? visible.at(-1).index + 1 : 0,
        current,
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
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    if (window.matchMedia(MOBILE_CAROUSEL).matches) {
      const current = Math.round(element.scrollLeft / element.clientWidth);
      const target = Math.max(0, Math.min(element.children.length - 1, current + direction));
      element.scrollTo({ left: target * element.clientWidth, behavior });
      return;
    }
    element.scrollBy({ left: direction * element.clientWidth, behavior });
  };
  const date = calendarDate(dateKey);
  return <section className={`${styles.dayRow} ${today ? styles.today : ""}`} aria-label={format(date, "EEEE, MMM d, yyyy")}>
    <header className={styles.dayLabel}>
      <h2><time dateTime={dateKey}>{format(date, "EEEEEE, d", { locale: uk })}</time></h2>
      <span>{events.length} проєктів · {calendarSummary(events).unassigned} непризначених</span>{today && <small>Сьогодні</small>}
      {events.length > 0 && <div className={`${styles.scrollControls} ${!position.back && !position.next ? styles.allVisible : ""}`}>
        <button type="button" aria-label={`Попередні проєкти ${dateKey}`} aria-controls={`calendar-${dateKey}`} disabled={!position.back} onClick={() => scrollCards(-1)}><FaChevronLeft /></button>
        <span className={styles.desktopCardRange} aria-live="polite" aria-atomic="true">{position.first}–{position.last} / {events.length}</span>
        <span className={styles.mobileCardPosition} aria-live="polite" aria-atomic="true">{position.current} / {events.length}</span>
        <button type="button" aria-label={`Наступні проєкти ${dateKey}`} aria-controls={`calendar-${dateKey}`} disabled={!position.next} onClick={() => scrollCards(1)}><FaChevronRight /></button>
      </div>}
    </header>
    <div className={`${styles.dayBody} ${position.next ? styles.hasMoreCards : ""}`}>
      <div ref={grid} id={`calendar-${dateKey}`} className={`${styles.cardsGrid} ${!position.back && !position.next ? styles.allVisible : ""}`} tabIndex={events.length ? 0 : undefined}
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
          const status = calendarProjectStatus(event.status);
          return <article key={event.id} className={`${styles.card} ${ready ? styles.ready : event.status === "In Process" ? styles.inProgress : ""}`}><Link className={styles.cardLink} title={event.address} to={`/address/${event.id}`}>
            <strong className={styles.cardAddress}>{address.street}</strong>
            {address.city && <span className={styles.city}>{address.city}</span>}
            <span className={styles.cardMeta}>WO #{event.work_order_number || "N/A"} · {event.builders?.name || "Unknown Builder"}</span>
            <span className={styles.store}>{event.stores?.name || "Unknown Store"}{event.project_type === "Service" && ` · Service${event.service_time ? ` · ${event.service_time}` : ""}`}</span>
            {event.project_type === "Service" && event.notes && <span className={styles.notes}>{event.notes}</span>}
            {calendarWorkSummary(event) && <span className={styles.workSummary}>{calendarWorkSummary(event)}</span>}
            <span className={styles.cardFooter}>
              {needsMaterialPickup(event) && <span className={`${styles.status} ${styles.pickupLabel}`}>Забрати матеріал</span>}
              <span className={styles.workers}>{workers.length ? workers.map((name, index) => <span key={index} className={styles.worker}><FaUser aria-hidden="true" /> {name}</span>)
                : calendarUnassigned(event) && <span className={styles.unassignedLabel}>Непризначено</span>}</span>
              <span title={event.status} className={`${styles.status} ${ready ? styles.statusReady : event.status === "Not Finished" ? styles.statusUnfinished : styles.statusProgress}`}>{ready && <FaCheck aria-hidden="true" />} {status}</span>
            </span>
          </Link><button type="button" className={styles.previewButton} aria-label="Швидкий перегляд" title="Швидкий перегляд"
            onClick={e => setPreview({ event, anchor: e.currentTarget })}><FaEye aria-hidden="true" /></button></article>;
        })}
      </div>
      {position.next && <button type="button" className={styles.edgeNext} aria-label={`Гортати далі ${dateKey}`} onClick={() => scrollCards(1)}><FaChevronRight /></button>}
      {preview && <CalendarPreview event={preview.event} anchor={preview.anchor} onClose={() => setPreview(null)} />}
      {!events.length && <p className={styles.empty}>Немає проєктів за поточними фільтрами.</p>}
    </div>
  </section>;
}

export default CalendarPage;
