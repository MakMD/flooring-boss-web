import { useCallback, useEffect, useRef, useState } from "react";
import { FaUsers, FaSyncAlt, FaTimes, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { activeAssignments, calendarAssignments, assignmentWindow } from "../../utils/activeAssignments";
import styles from "./AssignedWorkers.module.css";
import { AssignedWorkersContext } from "./AssignedWorkersContext";

export default function AssignedWorkers({ children, defaultOpen = false, pathname }) {
  const calendarDrawer = pathname?.replace(/\/$/, "") === "/calendar";
  const [period, setPeriod] = useState(null);
  const start = calendarDrawer ? period?.start : null;
  const end = calendarDrawer ? period?.end : null;
  const [desktop, setDesktop] = useState(() => window.matchMedia("(min-width: 1101px)").matches);
  const [expanded, setExpanded] = useState(defaultOpen);
  const [refreshing, setRefreshing] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const closeButton = useRef(null);
  const request = useRef(0);
  const inFlight = useRef(false);
  const pendingRefresh = useRef(false);
  const refresh = useCallback(async () => {
    if (calendarDrawer && (!start || !end)) return;
    if (inFlight.current) { pendingRefresh.current = true; return; }
    inFlight.current = true;
    const id = ++request.current;
    setRefreshing(true);
    try {
      const rows = [];
      const { today, tomorrow } = assignmentWindow();
      // Include undated jobs for the project-date fallback; filter the effective date below.
      for (let from = 0; ; from += 500) {
        let query = supabase
          .from("work_types")
          .select(
            "id, date, status, person_id, people(name), work_type_templates(name), addresses!inner(id, address, date, status, is_deleted)",
          )
          .not("person_id", "is", null);
        query = calendarDrawer ? query.gte("addresses.date", start).lte("addresses.date", end)
          : query.or(`and(date.gte.${today},date.lte.${tomorrow}),date.is.null`);
        const { data, error: fetchError } = await query
          .or("status.is.null,status.neq.Ready")
          .eq("addresses.is_deleted", false)
          .order("id")
          .range(from, from + 499);
        if (id !== request.current) return;
        if (fetchError) throw fetchError;
        rows.push(...(data || []));
        if ((data || []).length < 500) break;
      }
      setTasks(calendarDrawer ? calendarAssignments(rows, start, end) : activeAssignments(rows));
      setError(false);
    } catch {
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) {
        inFlight.current = false;
        setLoading(false);
        setRefreshing(false);
        if (pendingRefresh.current) {
          pendingRefresh.current = false;
          refresh();
        }
      }
    }
  }, [calendarDrawer, start, end]);

  useEffect(() => {
    setExpanded(defaultOpen);
    dialog.current?.close();
  }, [pathname, defaultOpen]);

  useEffect(() => {
    const channel = supabase
      .channel("active-worker-assignments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_types" },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "addresses" },
        refresh,
      )
      .subscribe();
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    // Also refresh when Realtime is not enabled for these tables.
    const timer = window.setInterval(onVisible, 60000);
    window.addEventListener("focus", onVisible);
    window.addEventListener("assignments:refresh", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      request.current += 1;
      inFlight.current = false;
      pendingRefresh.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("assignments:refresh", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    setLoading(true);
    setTasks([]);
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1101px)");
    const onChange = () => {
      if (!calendarDrawer) dialog.current?.close();
      setDesktop(media.matches);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [calendarDrawer]);

  const { today, tomorrow } = assignmentWindow();
  const activeTasks = calendarDrawer ? calendarAssignments(tasks, start, end) : activeAssignments(tasks);
  const periodLabel = start ? (start === end ? start : `${start} – ${end}`) : "…";
  const groups = calendarDrawer
    ? [...new Set(activeTasks.map(task => task.addresses.date))].map(date => ({ date, label: date }))
    : [{ date: today, label: "Today" }, { date: tomorrow, label: "Tomorrow" }];
  const content = loading ? (
    <p className={styles.message} role="status">Loading assignments…</p>
  ) : error ? (
    <div className={styles.message} role="alert">
      <p>Unable to load assignments.</p>
      <button className={styles.textButton} onClick={refresh}>Try again</button>
    </div>
  ) : activeTasks.length === 0 ? (
    <p className={styles.message}>{calendarDrawer ? "Немає активних призначень за вибраний період." : "No active assignments for today or tomorrow."}</p>
  ) : (
    <div className={styles.groups}>
      {groups.map(({ date, label }) => {
        const dayTasks = activeTasks.filter((task) => (calendarDrawer ? task.addresses.date : task.date || task.addresses.date) === date);
        if (!dayTasks.length) return null;
        return (
          <section key={date} aria-label={`${label} assignments`}>
            <h3 className={styles.dayHeading}>
              <span>{label} <span className={styles.dayCount}>{dayTasks.length}</span></span>
              <time dateTime={date}>{date.slice(5)}</time>
            </h3>
            <ul className={styles.list}>
              {dayTasks.map((task) => (
                <li key={task.id} className={styles.task}>
                  <strong>{task.people?.name || "Assigned worker"}</strong>
                  <Link to={`/address/${task.addresses.id}`} onClick={() => dialog.current?.close()}>
                    {task.addresses.address}
                  </Link>
                  <span className={styles.workName}>{task.work_type_templates?.name || "Work"}</span>
                  <span className={styles.status}>{task.status || "Assigned"}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );

  const refreshButton = (
    <button className={styles.iconButton} onClick={refresh} disabled={refreshing}
      aria-label="Refresh assignments" title="Refresh assignments">
      <FaSyncAlt aria-hidden="true" className={refreshing ? styles.spinning : undefined} />
    </button>
  );

  const inlinePanel = desktop && !calendarDrawer;
  const triggerButton = <button ref={trigger} className={styles.toggleButton}
          aria-expanded={inlinePanel ? expanded : undefined}
          aria-controls={inlinePanel ? "assignments-panel" : "assignments-dialog"}
          aria-haspopup={inlinePanel ? undefined : "dialog"}
          onClick={() => {
            if (inlinePanel) setExpanded((value) => !value);
            else {
              dialog.current?.showModal();
              if (calendarDrawer) closeButton.current?.focus();
            }
            if (!inlinePanel || !expanded) refresh();
          }}>
          <FaUsers aria-hidden="true" />
          <span>Assigned workers</span>
          {!loading && !error && <span className={styles.count}>{activeTasks.length} {calendarDrawer ? "активних призначень" : activeTasks.length === 1 ? "job" : "jobs"}</span>}
          {inlinePanel && (expanded ? <FaChevronLeft aria-hidden="true" /> : <FaChevronRight aria-hidden="true" />)}
        </button>;

  return (
    <AssignedWorkersContext.Provider value={calendarDrawer ? { button: triggerButton, setPeriod } : null}>
    <div className={`${styles.shell} ${inlinePanel && expanded ? styles.expanded : ""}`}>
      {!calendarDrawer && <div className={styles.toolbar}>
        {triggerButton}
        <span className={styles.period}>Today &amp; tomorrow · Calgary</span>
      </div>}

      {inlinePanel && expanded && (
        <aside id="assignments-panel" className={styles.panel} aria-label="Assigned workers"
          onKeyDown={(event) => {
            if (event.key === "Escape") { setExpanded(false); trigger.current?.focus(); }
          }}>
          <div className={styles.panelHeader}>
            <h2><FaUsers aria-hidden="true" /> Assigned workers</h2>
            {refreshButton}
            <button className={styles.iconButton} aria-label="Collapse assignments" onClick={() => {
              setExpanded(false);
              trigger.current?.focus();
            }}><FaTimes aria-hidden="true" /></button>
          </div>
          <p className={styles.caption}>Active jobs · Calgary time</p>
          {content}
        </aside>
      )}
      <div className={styles.page}>{children}</div>

      {!inlinePanel && <dialog id="assignments-dialog" ref={dialog} className={`${styles.dialog} ${calendarDrawer ? styles.calendarDrawer : ""}`}
        aria-labelledby="assignments-title" onClose={() => trigger.current?.focus()}
        onKeyDown={(event) => {
          if (!calendarDrawer || event.key !== "Tab") return;
          const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
          const index = controls.indexOf(document.activeElement);
          if (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0)) {
            event.preventDefault();
            (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
          }
        }}
        onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
        <div className={styles.panelHeader}>
          <h2 id="assignments-title"><FaUsers aria-hidden="true" /> Assigned workers</h2>
          {refreshButton}
          <button ref={closeButton} autoFocus className={styles.iconButton} aria-label="Close assigned workers"
            onClick={() => dialog.current.close()}><FaTimes aria-hidden="true" /></button>
        </div>
        <p className={styles.caption}>{calendarDrawer ? `${periodLabel} · Calgary · за датою ворк-ордера` : "Today & tomorrow · Calgary time"}</p>
        {content}
      </dialog>}
    </div>
    </AssignedWorkersContext.Provider>
  );
}
