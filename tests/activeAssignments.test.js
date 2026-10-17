import test from "node:test";
import assert from "node:assert/strict";
import { activeAssignments, assignmentWindow } from "../src/utils/activeAssignments.js";

const now = new Date(2026, 11, 31, 23, 30);
const task = (id, changes = {}) => ({
  id, person_id: 1, status: "Assigned", date: "2026-12-31",
  addresses: { id: 1, date: "2027-01-01", is_deleted: false },
  ...changes,
});

test("assignment window uses local calendar days and crosses year boundaries", () => {
  assert.deepEqual(assignmentWindow(now), { today: "2026-12-31", tomorrow: "2027-01-01" });
});

test("only today/tomorrow remain, using job date before project date", () => {
  const rows = [task(1), task(2, { date: null }), task(3, { date: "2026-12-30" }),
    task(4, { date: "2027-01-02" }), task(5, { date: null, addresses: { date: null } }),
    task(6, { person_id: null }), task(7, { addresses: { is_deleted: true } })];
  assert.deepEqual(activeAssignments(rows, now).map(t => t.id), [1, 2]);
});

test("worker or admin completion removes only that individual job", () => {
  const rows = [task(1, { status: "Ready" }), task(2, { status: null }), task(3, { status: "Not Finished" })];
  assert.deepEqual(activeAssignments(rows, now).map(t => t.id), [2, 3]);
  rows[1].status = "Ready";
  assert.deepEqual(activeAssignments(rows, now).map(t => t.id), [3]);
});
