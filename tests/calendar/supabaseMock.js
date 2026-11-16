import { events, assignments } from './fixtures.mjs';
let fail = false;
export function failCalendar(value) { fail = value; }
// Read-only mock adapter. No real Supabase client, auth, Storage or network.
export const supabase = {
  from(table) {
    let rows = table === 'addresses' ? [...events] : table === 'work_types' ? [...assignments] : [];
    let selection = '';
    const query = {
      select(value) { selection = value; return query; },
      eq(field, value) { rows = rows.filter(row => field.split('.').reduce((item, key) => item?.[key], row) === value); return query; },
      gte(field, value) { rows = rows.filter(row => field.split('.').reduce((item, key) => item?.[key], row) >= value); return query; },
      lte(field, value) { rows = rows.filter(row => field.split('.').reduce((item, key) => item?.[key], row) <= value); return query; },
      order() { return query; }, not() { return query; }, or() { return query; }, range() { return query; },
      then(resolve, reject) {
        const failed = fail && selection.includes('work_types');
        return new Promise(done => setTimeout(() => done({ data: failed ? null : rows, error: failed ? new Error('Synthetic error') : null }), 30)).then(resolve, reject);
      },
    };
    return query;
  },
  channel() { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel() {},
};
