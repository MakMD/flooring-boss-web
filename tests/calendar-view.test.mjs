import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, calgaryToday, calendarWorkers, calendarSummary, calendarAddress, filterCalendarEvents } from '../src/utils/calendarView.js';
const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
test('Address presentation preserves units and ambiguous tails', () => {
  assert.deepEqual(calendarAddress('Unit 10, 7381 May Common NW, Edmonton AB'), {street:'Unit 10, 7381 May Common NW',city:'Edmonton AB'});
  assert.deepEqual(calendarAddress('150 CASHMAN CRESCENT SW #108, BLACKMUD CREEK, EDMONTON AB'), {street:'150 CASHMAN CRESCENT SW #108, BLACKMUD CREEK',city:'EDMONTON AB'});
  for (const address of ['267 linden loop', '12 Example, Unknown Town', '12 Edmonton Trail NW']) assert.equal(calendarAddress(address).street, address);
});
test('Unassigned filter agrees with summary and excludes completed projects', () => {
  const rows = ['In Process','Ready','Completed','Not Finished'].map((status,id) => ({id,status,project_type:'Address'}));
  rows.push({id:4,status:'In Process',project_type:'Address',work_types:[{person_id:8}]});
  const filtered = filterCalendarEvents(rows, {projectTab:'Address',searchQuery:'',selectedBuilder:'All',selectedStore:'All',selectedStatus:'All',onlyUnassigned:true});
  assert.deepEqual(filtered.map(row=>row.id),[0,3]);
  assert.equal(calendarSummary(rows).unassigned, filtered.length);
});
test('Calgary today across midnight, DST and year boundaries', () => {
  for (const [instant, expected] of [
    // Historical DST boundaries are stable across newer IANA timezone databases.
    ['2025-11-16T06:59:59Z', '2025-11-15'], ['2025-11-16T07:00:00Z', '2025-11-16'],
    ['2025-03-09T08:59:59Z', '2025-03-09'], ['2025-03-09T09:00:00Z', '2025-03-09'],
    ['2025-11-02T07:59:59Z', '2025-11-02'], ['2025-11-02T08:00:00Z', '2025-11-02'],
    ['2027-01-01T05:59:00Z', '2026-12-31'],
  ]) assert.equal(key(calgaryToday(new Date(instant))), expected);
});
test('Monday through Sunday, including empty days and cross-year weeks', () => {
  assert.deepEqual(calendarDays('2026-11-22'), ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']);
  assert.deepEqual(calendarDays('2027-01-01'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(calendarDays('2026-03-08')[6], '2026-03-08');
  assert.deepEqual(calendarDays('2026-11-16', 'day'), ['2026-11-16']);
});
test('Workers deduplicate by person ID, preserve different people with identical names and missing-name assignments', () => {
  const event = { work_types: [{ person_id: 1, people: { name: 'Test One' } }, { person_id: 1, people: { name: 'Test One' } }, { person_id: 2, people: { name: 'Test One' } }, { person_id: 3, people: null }, { person_id: null }] };
  assert.deepEqual(calendarWorkers(event), ['Test One', 'Test One', 'Призначено — ім’я недоступне']);
});
test('Summary counts all projects, not visible cards or worker rows; retains Ready exclusion', () => {
  const rows = Array.from({ length: 12 }, (_, id) => ({ id, status: 'In Process', work_types: [] }));
  rows[0].status = 'Ready'; rows[1].work_types = [{ person_id: 7 }, { person_id: 8 }];
  assert.deepEqual(calendarSummary(rows), { total: 12, unassigned: 10 });
  assert.deepEqual(calendarSummary([]), { total: 0, unassigned: 0 });
});
test('Existing project-type, address/builder/WO search and combined filters are preserved', () => {
  const events = [
    { id: 1, project_type: 'Address', address: 'Long Example Avenue', work_order_number: 123, builders: { name: 'Example Builder' }, stores: { name: 'Store A' }, status: 'Ready' },
    { id: 2, project_type: 'Service', address: 'Long Example Avenue', work_order_number: 124, builders: { name: 'Example Builder' }, stores: { name: 'Store A' }, status: 'In Process' },
  ];
  const filters = { projectTab: 'Address', searchQuery: '', selectedBuilder: 'All', selectedStore: 'All', selectedStatus: 'All' };
  for (const searchQuery of ['EXAMPLE AVENUE', ' example builder ', '123']) assert.deepEqual(filterCalendarEvents(events, { ...filters, searchQuery }).map(e => e.id), [1]);
  assert.equal(filterCalendarEvents(events, { ...filters, selectedStatus: 'In Process' }).length, 0);
  assert.equal(filterCalendarEvents(events, { ...filters, selectedStore: 'Other' }).length, 0);
  assert.equal(filterCalendarEvents(events, { ...filters, selectedBuilder: 'Other' }).length, 0);
  assert.deepEqual(filterCalendarEvents(events, { ...filters, projectTab: 'Service' }).map(e => e.id), [2]);
});
