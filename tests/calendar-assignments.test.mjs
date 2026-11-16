import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarAssignments } from '../src/utils/activeAssignments.js';

const task = (id, date, extra = {}) => ({ id, date: '2026-12-01', person_id: 1, status: 'In Process',
  addresses: {id: 1, date, status: 'In Process', is_deleted: false}, ...extra });
test('Calendar uses order dates inclusively regardless of work date', () => {
  const rows = [task(1,'2026-11-16'),task(2,'2026-11-22'),task(3,'2026-11-23'),task(4,null),task(5,'2026-11-15')];
  assert.deepEqual(calendarAssignments(rows,'2026-11-16','2026-11-22').map(t=>t.id),[1,2]);
  assert.deepEqual(calendarAssignments(rows,'2026-11-22','2026-11-22').map(t=>t.id),[2]);
  assert.deepEqual(calendarAssignments(rows,'2026-12-01','2026-12-01'),[]);
  assert.equal(calendarAssignments([task(7,'2026-11-16',{date:null})],'2026-11-16','2026-11-16').length,1);
});
test('Completed by worker or admin, deleted, unassigned and completed projects are excluded', () => {
  const rows = [task(1,'2026-11-16'),task(2,'2026-11-16',{status:'Ready'}),task(3,'2026-11-16',{status:'Completed'}),
    task(4,'2026-11-16',{person_id:null}),task(5,'2026-11-16',{addresses:{date:'2026-11-16',is_deleted:true}}),
    task(6,'2026-11-16',{addresses:{date:'2026-11-16',is_deleted:false,status:'Ready'}})];
  assert.deepEqual(calendarAssignments(rows,'2026-11-16','2026-11-22').map(t=>t.id),[1]);
});
