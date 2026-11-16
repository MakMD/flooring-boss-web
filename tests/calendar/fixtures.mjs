import { calgaryToday, calendarDays } from '../../src/utils/calendarView.js';
const today = calgaryToday();
const key = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const days = calendarDays(key);
export const events = [12, 1, 0, 10, 2, 0, 1].flatMap((count, day) => Array.from({ length: count }, (_, index) => ({
  id: `fixture-${day}-${index}`, date: days[day], is_deleted: false, project_type: 'Address',
  address: index === 0 ? '100 Example Avenue, Building A, Unit 123 — a deliberately long synthetic address for mobile layout verification' : `${100 + index} Example Avenue`,
  work_order_number: `TEST-${day}-${index}`, builders: { name: index % 2 ? 'Example Builder B' : 'Example Builder A' },
  stores: { name: index % 2 ? 'Example Store B' : 'Example Store A' },
  status: index === 2 ? 'Ready' : index === 3 ? 'Not Finished' : 'In Process',
  work_types: index === 0 ? [{ person_id: 1, people: { name: 'Test Installer One' } }, { person_id: 1, people: { name: 'Test Installer One' } }, { person_id: 2, people: { name: 'Test Installer Two' } }] : [],
}))).concat([{ id: 'fixture-service', date: days[1], is_deleted: false, project_type: 'Service', address: '200 Service Example Avenue', work_order_number: 'SERVICE-1', builders: { name: 'Example Builder A' }, stores: { name: 'Example Store A' }, status: 'In Process', service_time: '09:30', notes: 'Synthetic service note, retained in the calendar.', work_types: [] }]);
