import test from "node:test";
import assert from "node:assert/strict";
import { assignmentWindow, activeAssignments } from "../src/utils/activeAssignments.js";
import { storageReference } from "../src/utils/storageReference.js";

test("Edmonton calendar dates across midnight, DST and year end", () => {
  for (const [instant, today, tomorrow] of [
    ["2026-10-18T05:59:00Z", "2026-10-17", "2026-10-18"],
    ["2025-03-09T09:00:00Z", "2025-03-09", "2025-03-10"],
    ["2025-11-02T08:00:00Z", "2025-11-02", "2025-11-03"],
    ["2027-01-01T05:59:00Z", "2026-12-31", "2027-01-01"],
  ]) assert.deepEqual(assignmentWindow(new Date(instant)), { today, tomorrow });
});

test("assignment date priority and exclusions apply to individual jobs", () => {
  const now = new Date("2026-10-18T18:00:00Z");
  const task = { id: 1, person_id: 1, status: null, date: null,
    addresses: { id: 10, is_deleted: false, status: null, date: "2026-10-18" } };
  const rows = [task, { ...task, id: 2, status: "Ready" },
    { ...task, id: 3, date: "2026-10-20" }, { ...task, id: 4, person_id: null },
    { ...task, id: 5, addresses: { ...task.addresses, status: "Ready" } },
    { ...task, id: 6, addresses: { ...task.addresses, is_deleted: true } },
    { ...task, id: 7, date: "2026-10-19", addresses: { ...task.addresses, date: "2026-10-10" } },
    { ...task, id: 8, addresses: null }];
  assert.deepEqual(activeAssignments(rows, now).map(({ id }) => id), [1, 7]);
  assert.equal(rows.length, 8);
});

test("storage URLs retain bucket and nested encoded key, ignoring expired tokens", () => {
  const origin = "https://test.supabase.co";
  for (const mode of ["public", "sign", "authenticated"]) {
    assert.deepEqual(storageReference(`${origin}/storage/v1/object/${mode}/original-photos/folder/a%20b%2520%23.jpg?token=expired`, "material-photos", origin),
      { bucket: "original-photos", path: "folder/a b%20#.jpg" });
  }
  assert.deepEqual(storageReference("material-photos/folder/a%20.jpg", "original-photos", origin),
    { bucket: "material-photos", path: "folder/a%20.jpg" });
  assert.deepEqual(storageReference("folder/a b.jpg", "worker-photos", origin),
    { bucket: "worker-photos", path: "folder/a b.jpg" });
  assert.deepEqual(storageReference("https://example.com/file.jpg", "worker-photos", origin),
    { externalUrl: "https://example.com/file.jpg" });
  assert.throws(() => storageReference("javascript:alert(1)", "worker-photos", origin));
  assert.throws(() => storageReference(`${origin}/unrecognized/file.jpg`, "worker-photos", origin));
});
