export const ASSIGNMENT_TIME_ZONE = "America/Edmonton";

const calendarDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: ASSIGNMENT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function assignmentWindow(now = new Date()) {
  const parts = Object.fromEntries(
    calendarDate.formatToParts(now).map(({ type, value }) => [type, value]),
  );

  const today = `${parts.year}-${parts.month}-${parts.day}`;

  // Наступна календарна дата без помилок переходу літнього/зимового часу.
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);

  return {
    today,
    tomorrow: next.toISOString().slice(0, 10),
  };
}

export function activeAssignments(rows, now = new Date()) {
  const { today, tomorrow } = assignmentWindow(now);

  return rows
    .filter((task) => {
      const project = task.addresses;
      const date = task.date || project?.date;

      return (
        task.person_id != null &&
        task.status !== "Ready" &&
        project &&
        project.is_deleted === false &&
        project.status !== "Ready" &&
        (date === today || date === tomorrow)
      );
    })
    .sort(
      (a, b) =>
        (a.date || a.addresses.date).localeCompare(
          b.date || b.addresses.date,
        ) ||
        (a.people?.name || "").localeCompare(b.people?.name || "") ||
        String(a.id).localeCompare(String(b.id)),
    );
}
