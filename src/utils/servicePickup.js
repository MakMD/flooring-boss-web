export const PICKUP_FIELD = "material_pickup_required";

export function needsMaterialPickup(project) {
  return project.project_type === "Service" && project[PICKUP_FIELD] === true;
}

export async function pickupFieldsForCreate(client, values) {
  if (!needsMaterialPickup(values)) return {};
  // Read no rows. Refuse to silently lose the flag on an older database.
  const { error } = await client.from("addresses").select(PICKUP_FIELD).limit(0);
  if (error) throw new Error("Не вдалося перевірити збереження позначки «Забрати матеріал». Потрібна доступна колонка addresses.material_pickup_required. Сервіс не створено.");
  return { [PICKUP_FIELD]: true };
}
