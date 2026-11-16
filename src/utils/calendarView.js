import { assignmentWindow } from "./activeAssignments.js";

// DatePicker uses a local Date as a calendar-date carrier, not an instant.
export function calendarDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function calgaryToday(now = new Date()) {
  return calendarDate(assignmentWindow(now).today);
}

export function calendarDays(key, mode = "week") {
  if (mode === "day") return [key];
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(date.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function calendarWorkers(event) {
  const names = new Map();
  for (const work of event.work_types || []) {
    if (work.person_id != null) {
      const person = Array.isArray(work.people) ? work.people[0] : work.people;
      const key = String(work.person_id);
      const name = person?.name?.trim();
      if (name || !names.has(key)) names.set(key, name || "Призначено — ім’я недоступне");
    }
  }
  return [...names.values()];
}

export function calendarSummary(events) {
  return {
    total: events.length,
    // Retain the existing Ready exclusion from the assignment badge.
    unassigned: events.filter((event) => event.status !== "Ready" &&
      !(event.work_types || []).some((work) => work.person_id != null)).length,
  };
}

export function filterCalendarEvents(events, { projectTab, searchQuery, selectedBuilder, selectedStore, selectedStatus }) {
  const query = searchQuery.toLowerCase().trim();
  return events.filter((event) => event.project_type === projectTab &&
    (!query || [event.address, event.builders?.name, event.work_order_number]
      .some((value) => String(value ?? "").toLowerCase().includes(query))) &&
    (selectedBuilder === "All" || event.builders?.name === selectedBuilder) &&
    (selectedStore === "All" || event.stores?.name === selectedStore) &&
    (selectedStatus === "All" || event.status === selectedStatus));
}
