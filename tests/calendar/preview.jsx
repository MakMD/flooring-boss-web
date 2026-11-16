import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import CalendarPage from '../../src/Pages/CalendarPage';
import AssignedWorkers from '../../src/components/AssignedWorkers/AssignedWorkers';
import { failCalendar } from './supabaseMock.js';
import '../../index.css';
export default function Preview() {
  const [dark, setDark] = useState(false);
  const [failed, setFailed] = useState(false);
  return <MemoryRouter initialEntries={['/calendar']}><div style={{ maxWidth: 1400, margin: 'auto' }}>
    <header style={{ padding: 16 }}><strong>Calendar preview · synthetic data only</strong><p>No database, Storage or AI requests.</p>
      <button onClick={() => { document.documentElement.dataset.theme = dark ? 'light' : 'dark'; setDark(!dark); }}>Toggle test theme</button>{' '}
      <button onClick={() => { failCalendar(!failed); setFailed(!failed); }}>{failed ? 'Restore mock reads' : 'Fail mock reads'}</button>
    </header>
    <main><Routes><Route path="/calendar" element={<AssignedWorkers pathname="/calendar" defaultOpen={false}><CalendarPage /></AssignedWorkers>} />
      <Route path="/address/:id" element={<><h1>Synthetic project destination</h1><Link to="/calendar">Back to calendar</Link></>} /></Routes></main><Toaster />
  </div></MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<Preview />);
