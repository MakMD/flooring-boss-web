import { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { calendarWorkRows, calendarProjectStatus } from "../utils/calendarWork.js";
import styles from "../Pages/CalendarPage.module.css";

export default function CalendarPreview({ event, anchor, onClose }) {
  const dialog = useRef(null);
  const title = useId();
  useEffect(() => {
    const element = dialog.current;
    const place = () => {
      if (window.innerWidth <= 767) {
        element.style.removeProperty("left"); element.style.removeProperty("top");
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      element.style.left = `${Math.max(12, Math.min(rect.right + 8, window.innerWidth - box.width - 12))}px`;
      element.style.top = `${Math.max(12, Math.min(rect.top, window.innerHeight - box.height - 12))}px`;
    };
    element.showModal(); place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      element.close();
      if (anchor.isConnected) anchor.focus({ preventScroll: true });
    };
  }, [anchor]);
  const works = calendarWorkRows(event);
  return createPortal(<dialog ref={dialog} className={styles.previewDialog} aria-labelledby={title}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => {
      if (e.target !== e.currentTarget) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose();
    }}>
    <header className={styles.previewHeader}>
      <h2 id={title}>Швидкий перегляд</h2>
      <button type="button" autoFocus aria-label="Закрити швидкий перегляд" onClick={onClose}>×</button>
    </header>
    <div className={styles.previewContent}>
      <h3>{event.address || "Адреса не вказана"}</h3>
      <dl><dt>WO</dt><dd>{event.work_order_number || "Не вказано"}</dd>
        <dt>Статус проєкту</dt><dd>{calendarProjectStatus(event.status)}</dd>
        <dt>Дата ордера</dt><dd>{event.date || "Не вказана"}</dd></dl>
      <h3>Роботи ({works.length})</h3>
      {works.length ? <ul className={styles.previewWorks}>{works.map((work, index) => <li key={work.id ?? index}>
        <strong>{work.name}</strong><span>Дата роботи: {work.date || "Не вказана"}</span><span>Виконавець: {work.worker}</span>
      </li>)}</ul> : <p>Роботи відсутні або недоступні для перегляду.</p>}
    </div>
    <footer className={styles.previewActions}><Link to={`/address/${event.id}`}>Відкрити проєкт</Link></footer>
  </dialog>, document.body);
}
