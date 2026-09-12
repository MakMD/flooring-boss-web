// src/Pages/CalendarPage.jsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  FaMapMarkerAlt,
  FaSearch,
  FaBuilding,
  FaWrench,
} from "react-icons/fa";
import { MdOutlineChevronRight } from "react-icons/md";
import { supabase } from "../supabaseClient";
import toast from "react-hot-toast";
import styles from "./CalendarPage.module.css";

const STORAGE_KEY = "calendar_state";
const EXPIRATION_TIME = 3 * 60 * 1000;

const CalendarPage = () => {
  const [selectedDate, setSelectedDate] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.timestamp < EXPIRATION_TIME) {
          return new Date(parsed.selectedDate);
        }
      }
    } catch (e) {
      console.error("Помилка читання збереженої дати:", e);
    }
    return new Date();
  });

  const [viewMode, setViewMode] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Date.now() - parsed.timestamp < EXPIRATION_TIME) {
          return parsed.viewMode || "day";
        }
      }
    } catch (e) {
      /* ignore */
    }
    return "day";
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

  const navigate = useNavigate();
  const weekStartsOn = 1;

  useEffect(() => {
    const stateToSave = {
      selectedDate: selectedDate.toISOString(),
      viewMode,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [selectedDate, viewMode]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);

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
    const { data, error } = await supabase
      .from("addresses")
      .select("*, builders(name), stores(name), work_types(person_id)")
      .eq("is_deleted", false)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .order("service_time", { ascending: true, nullsFirst: false });

    if (error) {
      toast.error("Could not fetch calendar events.");
      console.error(error);
    } else {
      setAllEvents(data || []);
    }
    setLoading(false);
  }, [selectedDate, viewMode]);

  useEffect(() => {
    fetchEvents();
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

  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
      // Спочатку фільтруємо за активною вкладкою (Address або Service)
      if (event.project_type !== projectTab) return false;

      const query = searchQuery.toLowerCase().trim();
      const address = (event.address || "").toLowerCase();
      const builder = (event.builders?.name || "").toLowerCase();
      const wo = String(event.work_order_number || "").toLowerCase();

      const matchesSearch =
        !query ||
        address.includes(query) ||
        builder.includes(query) ||
        wo.includes(query);

      const matchesBuilder =
        selectedBuilder === "All" || event.builders?.name === selectedBuilder;
      const matchesStore =
        selectedStore === "All" || event.stores?.name === selectedStore;
      const matchesStatus =
        selectedStatus === "All" || event.status === selectedStatus;

      return matchesSearch && matchesBuilder && matchesStore && matchesStatus;
    });
  }, [
    allEvents,
    projectTab,
    searchQuery,
    selectedBuilder,
    selectedStore,
    selectedStatus,
  ]);

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

  const groupedEvents = useMemo(() => {
    return filteredEvents.reduce((acc, event) => {
      const dateKey = event.date;
      const storeName = event.stores?.name || "Unknown Store";

      if (!acc[dateKey]) acc[dateKey] = {};
      if (!acc[dateKey][storeName])
        acc[dateKey][storeName] = { services: [], jobs: [] };

      if (event.project_type === "Service") {
        acc[dateKey][storeName].services.push(event);
      } else {
        acc[dateKey][storeName].jobs.push(event);
      }
      return acc;
    }, {});
  }, [filteredEvents]);

  const datesToRender = useMemo(() => {
    return Object.keys(groupedEvents).length > 0
      ? Object.keys(groupedEvents).sort()
      : viewMode === "day"
        ? [format(selectedDate, "yyyy-MM-dd")]
        : [];
  }, [groupedEvents, viewMode, selectedDate]);

  const getHeaderText = () => {
    if (viewMode === "day") return format(selectedDate, "MM/dd/yyyy");
    const start = startOfWeek(selectedDate, { weekStartsOn });
    const end = endOfWeek(selectedDate, { weekStartsOn });
    return `${format(start, "MM/dd")} - ${format(end, "MM/dd")}`;
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
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginTop: "10px",
        }}
      >
        {assignmentBadge}
        <span
          style={{
            backgroundColor:
              item.status === "Ready"
                ? "rgba(40, 167, 69, 0.15)"
                : item.status === "Not Finished"
                  ? "rgba(220, 53, 69, 0.15)"
                  : "rgba(255, 193, 7, 0.15)",
            color:
              item.status === "Ready"
                ? "#28a745"
                : item.status === "Not Finished"
                  ? "#dc3545"
                  : "#d39e00",
            padding: "4px 10px",
            borderRadius: "20px",
            fontSize: "0.75rem",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          {mainStatusText}
        </span>
      </div>
    );
  };

  // === ПІДРАХУНОК ЛІЧИЛЬНИКІВ ===
  const addressCount = allEvents.filter(
    (e) => e.project_type === "Address",
  ).length;
  const serviceCount = allEvents.filter(
    (e) => e.project_type === "Service",
  ).length;

  return (
    <div className={styles.calendarContainer}>
      <div className={styles.mobileLayout}>
        <div className={styles.navbar}>
          <div className={styles.navTopRow}>
            <div className={styles.navGroup}>
              <button onClick={handlePrev} className={styles.iconBtn}>
                <FaChevronLeft size={14} />
              </button>

              <DatePicker
                selected={selectedDate}
                onChange={(date) => {
                  setSelectedDate(date);
                  setCalendarMonth(date);
                }}
                onMonthChange={(date) => setCalendarMonth(date)}
                customInput={
                  <button className={styles.datePickerBtn}>
                    {getHeaderText()}
                    <FaRegCalendarAlt
                      size={16}
                      style={{ marginLeft: "8px", color: "#666" }}
                    />
                  </button>
                }
                renderDayContents={renderDayContents}
                calendarClassName={styles.customCalendar}
              />

              <button onClick={handleNext} className={styles.iconBtn}>
                <FaChevronRight size={14} />
              </button>
              <button onClick={fetchEvents} className={styles.iconBtn}>
                <FaSyncAlt size={14} />
              </button>

              <button
                onClick={() => setViewMode("day")}
                className={`${styles.iconBtn} ${viewMode === "day" ? styles.activeViewBtn : ""}`}
                title="Day View"
              >
                <FaRegCalendar size={16} />
              </button>
              <button
                onClick={() => setViewMode("week")}
                className={`${styles.iconBtn} ${viewMode === "week" ? styles.activeViewBtn : ""}`}
                title="Week View"
              >
                <FaRegCalendarAlt size={16} />
              </button>
            </div>
          </div>

          <div className={styles.searchContainer}>
            <FaSearch className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Шукати адресу, клієнта або WO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          {/* Вкладки (Адреси / Сервіси) з Лічильниками */}
          <div style={{ display: "flex", gap: "10px", width: "100%" }}>
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
                    ? "#cfa85c"
                    : "rgba(255, 255, 255, 0.1)",
                color: projectTab === "Address" ? "#2c2c2c" : "#cbd5e1",
                transition: "all 0.2s",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FaBuilding /> Адреси
              {addressCount > 0 && (
                <span
                  style={{
                    backgroundColor: "rgba(255,255,255,0.2)",
                    color: projectTab === "Address" ? "#1a1a1a" : "#fff",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "0.8rem",
                    marginLeft: "4px",
                  }}
                >
                  {addressCount}
                </span>
              )}
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
                    ? "#cfa85c"
                    : "rgba(255, 255, 255, 0.1)",
                color: projectTab === "Service" ? "#2c2c2c" : "#cbd5e1",
                transition: "all 0.2s",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <FaWrench /> Сервіси
              {serviceCount > 0 && (
                <span
                  style={{
                    backgroundColor: "#ef4444", // Червоний бейдж для сервісів
                    color: "#fff",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontSize: "0.8rem",
                    marginLeft: "4px",
                  }}
                >
                  {serviceCount}
                </span>
              )}
            </button>
          </div>

          <div className={styles.filtersContainer}>
            <select
              value={selectedBuilder}
              onChange={(e) => setSelectedBuilder(e.target.value)}
              className={styles.filterSelect}
            >
              {uniqueBuilders.map((b) => (
                <option key={b} value={b}>
                  {b === "All" ? "All Builders" : b}
                </option>
              ))}
            </select>

            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className={styles.filterSelect}
            >
              {uniqueStores.map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "All Stores" : s}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className={styles.filterSelect}
            >
              {uniqueStatuses.map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "All Statuses" : s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <p className={styles.loadingText}>Loading schedule...</p>
          ) : datesToRender.length === 0 ? (
            <div className={styles.noEvents}>
              {searchQuery ||
              selectedBuilder !== "All" ||
              selectedStore !== "All" ||
              selectedStatus !== "All"
                ? "Нічого не знайдено за вашими фільтрами."
                : `No ${projectTab.toLowerCase()}es for this period.`}
            </div>
          ) : (
            <div className={styles.listContainer}>
              {datesToRender.map((dateKey) => {
                const storesData = groupedEvents[dateKey] || {};
                const displayDate = format(
                  new Date(dateKey + "T00:00:00"),
                  "EEEE, dd MMM yyyy",
                );

                const storeNames = Object.keys(storesData).sort();

                return (
                  <div key={dateKey} className={styles.dayGroup}>
                    <div className={styles.dateMainHeader}>{displayDate}</div>

                    {storeNames.length === 0 ? (
                      <div className={styles.noEvents}>
                        No projects for {displayDate}.
                      </div>
                    ) : (
                      storeNames.map((storeName) => {
                        const dayData = storesData[storeName];
                        return (
                          <div key={storeName} className={styles.storeSection}>
                            {dayData.services.length > 0 && (
                              <div className={styles.section}>
                                <div className={styles.sectionHeader}>
                                  {storeName} - Services (
                                  {dayData.services.length})
                                </div>
                                <div className={styles.cardsList}>
                                  {dayData.services.map((event) => (
                                    <div
                                      key={event.id}
                                      className={styles.card}
                                      onClick={() =>
                                        navigate(`/address/${event.id}`)
                                      }
                                    >
                                      <div className={styles.cardContent}>
                                        <div className={styles.cardTitle}>
                                          Service:{" "}
                                          {event.work_order_number || "N/A"} -{" "}
                                          {event.builders?.name ||
                                            "Unknown Builder"}
                                          {event.service_time
                                            ? ` - ${event.service_time}`
                                            : ""}
                                        </div>
                                        <div className={styles.cardAddress}>
                                          <FaMapMarkerAlt
                                            className={styles.pinIcon}
                                          />
                                          <span>{event.address}</span>
                                        </div>
                                        {event.notes && (
                                          <div className={styles.cardNotes}>
                                            {event.notes}
                                          </div>
                                        )}
                                        {renderStatusBadges(event)}
                                      </div>
                                      <MdOutlineChevronRight
                                        className={styles.chevronIcon}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {dayData.jobs.length > 0 && (
                              <div className={styles.section}>
                                <div className={styles.sectionHeader}>
                                  {storeName} - Jobs ({dayData.jobs.length})
                                </div>
                                <div className={styles.cardsList}>
                                  {dayData.jobs.map((event) => (
                                    <div
                                      key={event.id}
                                      className={styles.card}
                                      onClick={() =>
                                        navigate(`/address/${event.id}`)
                                      }
                                    >
                                      <div className={styles.cardContent}>
                                        <div className={styles.cardTitle}>
                                          WO #:{" "}
                                          {event.work_order_number || "N/A"} -{" "}
                                          {event.builders?.name ||
                                            "Unknown Builder"}
                                        </div>
                                        <div className={styles.cardAddress}>
                                          <FaMapMarkerAlt
                                            className={styles.pinIcon}
                                          />
                                          <span>{event.address}</span>
                                        </div>
                                        {renderStatusBadges(event)}
                                      </div>
                                      <MdOutlineChevronRight
                                        className={styles.chevronIcon}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarPage;
