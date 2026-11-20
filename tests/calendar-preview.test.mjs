import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarWorkRows, calendarWorkSummary, calendarProjectStatus} from '../src/utils/calendarWork.js';
test('Preview retains separate work dates, missing dates, names and assignments', () => {
 const event = {date:'2026-11-16',work_types:[
 {id:1,date:'2026-11-19',person_id:1,people:{name:'A'},work_type_templates:{name:'LVP'}},
 {id:2,date:null,person_id:null,work_type_templates:{name:'Stairs'}},
 {id:3,person_id:2,people:null,work_type_templates:[{name:'Prep'}]}]};
 assert.equal(calendarWorkRows(event)[0].date,'2026-11-19');
 assert.equal(calendarWorkRows(event)[1].date,null);
 assert.equal(calendarWorkRows(event)[1].worker,'Непризначено');
 assert.equal(calendarWorkRows(event)[2].worker,'Призначено — ім’я недоступне');
 assert.equal(calendarWorkSummary(event),'LVP · Stairs · ще 1');
 assert.equal(calendarWorkRows(event).length,3);
});
test('Preview does not invent work or infer completed project from completed jobs', () => {
 assert.deepEqual(calendarWorkRows({}),[]);
 assert.equal(calendarWorkSummary({}), '');
 assert.equal(calendarProjectStatus('In Process'),'В процесі');
 assert.equal(calendarProjectStatus('Ready'),'Завершено');
 assert.equal(calendarProjectStatus(null),'Статус не вказано');
});
