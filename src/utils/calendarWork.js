export function calendarWorkRows(event) {
  return (event.work_types || []).map(work => {
    const template = Array.isArray(work.work_type_templates) ? work.work_type_templates[0] : work.work_type_templates;
    const person = Array.isArray(work.people) ? work.people[0] : work.people;
    return { id: work.id, name: template?.name?.trim() || "Назва роботи недоступна",
      date: work.date || null,
      worker: work.person_id == null ? "Непризначено" : person?.name?.trim() || "Призначено — ім’я недоступне" };
  });
}
export function calendarWorkSummary(event) {
  const names = [...new Set(calendarWorkRows(event).map(work => work.name))];
  return names.slice(0, 2).join(" · ") + (names.length > 2 ? ` · ще ${names.length - 2}` : "");
}
export function calendarProjectStatus(status) {
  return ["Ready", "Completed"].includes(status) ? "Завершено" : status === "In Process" ? "В процесі" : status === "Not Finished" ? "Не завершено" : status || "Статус не вказано";
}
