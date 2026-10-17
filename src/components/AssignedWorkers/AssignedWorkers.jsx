import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import styles from "./AssignedWorkers.module.css";

export default function AssignedWorkers() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const rows = [];
      // Fetch every assignment, independently of project filters and pagination.
      for (let from = 0; ; from += 500) {
        const { data, error: fetchError } = await supabase
          .from("work_types")
          .select(
            "id, date, status, person_id, people(name), work_type_templates(name), addresses!inner(id, address, date, is_deleted)",
          )
          .not("person_id", "is", null)
          .or("status.is.null,status.neq.Ready")
          .eq("addresses.is_deleted", false)
          .order("id")
          .range(from, from + 499);
        if (id !== request.current) return;
        if (fetchError) throw fetchError;
        rows.push(...(data || []));
        if ((data || []).length < 500) break;
      }
      rows.sort(
        (a, b) =>
          (a.people?.name || "").localeCompare(b.people?.name || "") ||
          String(a.date || a.addresses.date || "").localeCompare(
            String(b.date || b.addresses.date || ""),
          ),
      );
      setTasks(rows);
      setError(false);
    } catch {
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
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
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      request.current += 1;
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const content = loading ? (
    <p role="status">Loading assignments…</p>
  ) : error ? (
    <p role="alert">
      Unable to load assignments. <button onClick={refresh}>Retry</button>
    </p>
  ) : tasks.length === 0 ? (
    <p>No active assignments. Completed work is removed from this list.</p>
  ) : (
    <ul className={styles.list}>
      {tasks.map((task) => (
        <li key={task.id} className={styles.task}>
          <strong>{task.people?.name || "Assigned worker"}</strong>
          <Link
            to={`/address/${task.addresses.id}`}
            onClick={() => dialog.current?.close()}
          >
            {task.addresses.address}
          </Link>
          <span>
            {task.work_type_templates?.name || "Work"} ·{" "}
            {task.status || "Assigned"}
          </span>
          {(task.date || task.addresses.date) && (
            <small>{task.date || task.addresses.date}</small>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <button
        ref={trigger}
        className={styles.openButton}
        onClick={() => {
          dialog.current.showModal();
          refresh();
        }}
      >
        Assigned workers{!loading && !error ? ` (${tasks.length})` : ""}
      </button>
      <aside className={styles.panel} aria-label="Assigned workers">
        <h2>Assigned workers</h2>
        <button onClick={refresh}>Refresh</button>
        {content}
      </aside>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="assignments-title"
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className={styles.dialogHeader}>
          <h2 id="assignments-title">Assigned workers</h2>
          <button
            autoFocus
            aria-label="Close assigned workers"
            onClick={() => dialog.current.close()}
          >
            ✕
          </button>
        </div>
        {content}
      </dialog>
    </>
  );
}
