import test from "node:test";
import assert from "node:assert/strict";
import { activeAssignments, assignmentWindow } from "../src/utils/activeAssignments.js";

const now = new Date("2026-10-18T04:30:00Z"); // October 17 in Calgary.
const task = (id, changes = {}) => ({
  id, person_id: 1, status: "Assigned", date: "2026-10-17",
  addresses: { id: 1, date: "2026-10-18", status: "In Process", is_deleted: false },
  ...changes,
});

test("uses Calgary's date even when UTC is already tomorrow", () => {
  assert.deepEqual(assignmentWindow(now), { today: "2026-10-17", tomorrow: "2026-10-18" });
});

test("calendar window handles year rollover and both DST transitions", () => {
  for (const [instant, today, tomorrow] of [
    ["2027-01-01T06:30:00Z", "2026-12-31", "2027-01-01"],
    ["2026-03-08T07:30:00Z", "2026-03-08", "2026-03-09"],
    ["2026-11-02T06:30:00Z", "2026-11-01", "2026-11-02"],
  ]) assert.deepEqual(assignmentWindow(new Date(instant)), { today, tomorrow });
});

test("job date takes priority; undated jobs use project date", () => {
  const rows = [task(1), task(2, { date: null }), task(3, { date: "2026-10-16" }),
    task(4, { date: "2026-10-19" }), task(5, { date: null, addresses: { date: null } }),
    task(6, { person_id: null }), task(7, { addresses: { is_deleted: true } })];
  assert.deepEqual(activeAssignments(rows, now).map(t => t.id), [1, 2]);
});

test("completion by either actor removes only that job; Ready project hides all its jobs", () => {
  const rows = [task(1, { status: "Ready" }), task(2, { status: null }), task(3, { status: "Not Finished" })];
  assert.deepEqual(activeAssignments(rows, now).map(t => t.id), [2, 3]);
  rows[1].status = "Ready";
  assert.deepEqual(activeAssignments(rows, now).map(t => t.id), [3]);
  rows[2].addresses.status = "Ready";
  assert.deepEqual(activeAssignments(rows, now), []);
});
