const localDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function assignmentWindow(now = new Date()) {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { today: localDateKey(now), tomorrow: localDateKey(tomorrow) };
}

export function activeAssignments(rows, now = new Date()) {
  const { today, tomorrow } = assignmentWindow(now);
  return rows
    .filter((task) => {
      const date = task.date || task.addresses?.date;
      return task.person_id != null && task.status !== "Ready" &&
        task.addresses && !task.addresses.is_deleted &&
        (date === today || date === tomorrow);
    })
    .sort((a, b) =>
      (a.date || a.addresses.date).localeCompare(b.date || b.addresses.date) ||
      (a.people?.name || "").localeCompare(b.people?.name || "") ||
      String(a.id).localeCompare(String(b.id)),
    );
}
